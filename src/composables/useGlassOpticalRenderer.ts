import { nextTick, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import type {
  BufferGeometry,
  Color,
  IUniform,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector4,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three'
import {
  canUseGlassWallpaperTexture,
  GLASS_OPTICAL_MAX_SURFACES_DESKTOP,
  GLASS_OPTICAL_MAX_SURFACES_MOBILE,
  GLASS_OPTICAL_STRENGTH_DEFAULT,
  getGlassCoverScale,
  getGlassMaterialResponse,
  getGlassOpticalBufferSize,
  getGlassOpticalDecay,
  getGlassOpticalDeformationStrengthScale,
  getGlassOpticalFlowStrengthScale,
  getGlassOpticalMaxRefractionPixels,
  getGlassOpticalMotionExpansion,
  getGlassOpticalMotionEnergy,
  getGlassOpticalReflectionStrengthScale,
  getGlassOpticalRenderProfile,
  getGlassOpticalTransmissionStrength,
  getGlassScrollBufferSize,
  getGlassOpticalTranslationStrengthScale,
  getGlassOpticalSurfaceTransitionWeights,
  getGlassOpticalWakeDirection,
  getGlassWallpaperTransitionProgress,
  normalizeGlassOpticalRect,
  reconcileGlassOpticalSurfaceSlots,
  selectGlassOpticalRects,
  type GlassCornerRadii,
  type GlassOpticalQuality,
  type GlassOpticalRect,
  type GlassOpticalSurfaceCandidate,
  type GlassOpticalSurfaceMode,
  type GlassOpticalSurfaceSlot,
} from '@/utils/glassOptics'
import type { ThemeCustomizerGlassAppearance, ThemeCustomizerGlassDynamicsMode } from '@/composables/useThemeCustomizer'
import {
  createGlassRippleDynamics,
  type GlassRippleDynamics,
  type GlassRippleQuality,
} from '@/rendering/glass/glassRippleDynamics'
import {
  createGlassFluidDynamics,
  GLASS_FLUID_FRAGMENT_SETUP,
  GLASS_FLUID_FRAGMENT_SURFACE_OPTICS,
  GLASS_FLUID_FRAGMENT_SURFACE_REFRACTION,
  GLASS_FLUID_FRAGMENT_SURFACE_SHAPE,
  GLASS_FLUID_FRAGMENT_TRAIL_AND_FIELD,
  type GlassFluidDynamics,
} from '@/rendering/glass/glassFluidDynamics'
import type { PagePresentationMotionReader } from '@/composables/usePagePresentationMotion'
import { APP_ACTIVITY_SUSPEND_DELAY_MS } from '@/utils/appActivityLifecycle'
import {
  analyzeGlassWallpaperTone,
  DEFAULT_GLASS_WALLPAPER_TONE_PROFILE,
  loadGlassWallpaperTone,
  takeGlassWallpaperDecodedSource,
  type GlassWallpaperToneProfile,
} from '@/utils/glassWallpaperTone'

export type GlassRendererState = 'fallback' | 'loading' | 'ready'
export type GlassPresentationSpace = 'fixed' | 'scroll'
type ThreeModule = typeof import('three')

export interface GlassOpticalInteractionSource {
  /** 按呈现空间订阅共享输入；同一事件只会交给一个空间。 */
  subscribe(space: GlassPresentationSpace, listener: (event: PointerEvent | TouchEvent) => void): () => void
}

export interface PreparedWallpaperSource {
  /** 已完成 CPU 侧缩放的共享像素源；每个 WebGL context 仍独立创建纹理。 */
  image: HTMLCanvasElement | HTMLImageElement
  /** 共享像素源高度。 */
  height: number
  /** 与共享像素源同时计算的壁纸亮度 profile。 */
  toneProfile: GlassWallpaperToneProfile
  /** 共享像素源宽度。 */
  width: number
}

/** fixed 与 scroll context 共用的有界 CPU 壁纸准备缓存。 */
export interface GlassWallpaperSourceCache {
  /** 相同键共享进行中或已完成的准备结果，并将缓存限制在三个壁纸槽。 */
  get(key: string, prepare: () => Promise<PreparedWallpaperSource>): Promise<PreparedWallpaperSource>
}

function recordGlassRendererTiming(space: GlassPresentationSpace, stage: string) {
  const timingWindow = window as typeof window & {
    __glassPerformanceProbeEnabled?: boolean
    __glassRendererTimings?: Array<{ space: GlassPresentationSpace; stage: string; time: number }>
  }
  if (!import.meta.env.DEV || !timingWindow.__glassPerformanceProbeEnabled) return

  timingWindow.__glassRendererTimings ??= []
  timingWindow.__glassRendererTimings.push({ space, stage, time: performance.now() })
}

/** 复用 canvas context 前复位 Three.js 的 3D 占位纹理不接受的像素解包状态。 */
export function prepareGlassWebGLContext(canvas: HTMLCanvasElement) {
  if (typeof WebGL2RenderingContext === 'undefined') return null

  const context = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: true,
    failIfMajorPerformanceCaveat: false,
    powerPreference: 'high-performance',
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    stencil: false,
  })
  if (!context || context.isContextLost()) return null

  context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, false)
  context.pixelStorei(context.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  return context
}

/** 为同一个光学层实例创建 CPU 壁纸源缓存，GPU 纹理仍由各 context 独立管理。 */
export function createGlassWallpaperSourceCache(): GlassWallpaperSourceCache {
  const entries = new Map<string, Promise<PreparedWallpaperSource>>()

  return {
    get(key, prepare) {
      const cached = entries.get(key)
      if (cached) {
        entries.delete(key)
        entries.set(key, cached)

        return cached
      }

      const source = prepare()
      entries.set(key, source)
      while (entries.size > 3) {
        const oldestKey = entries.keys().next().value
        if (oldestKey) entries.delete(oldestKey)
      }
      void source.catch(() => {
        if (entries.get(key) === source) entries.delete(key)
      })

      return source
    },
  }
}

/** 同步组件状态和根节点属性，确保 CSS 回退与 renderer 生命周期一致。 */
export function setGlassRendererState(state: Ref<GlassRendererState>, value: GlassRendererState) {
  state.value = value
  document.documentElement.dataset.glassRendererState = value
}

/** 为有界的多个呈现 context 建立唯一的全局指针与触摸事件源。 */
export function useGlassOpticalInteractionSource(
  active: MaybeRefOrGetter<boolean> = true,
): GlassOpticalInteractionSource {
  const listeners: Record<GlassPresentationSpace, Set<(event: PointerEvent | TouchEvent) => void>> = {
    fixed: new Set(),
    scroll: new Set(),
  }
  const touchOwners = new Map<number, GlassPresentationSpace>()

  const resolvePointOwner = (clientX: number, clientY: number): GlassPresentationSpace | null => {
    // Overlay 只能通过 backdrop-filter 采样已合成的下层 UI；壁纸 renderer 不接管其表面或输入。
    if (document.querySelector('.v-overlay--active')) return null

    const loginCard = document.querySelector<HTMLElement>('.login-card')
    if (loginCard) {
      const rect = loginCard.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        // 登录卡片与文档弹性滚动共用 scroll-space，输入必须落到同一呈现 context。
        return document.querySelector('.login-root') ? 'scroll' : 'fixed'
      }
    }

    const fixedSurface = document.querySelectorAll<HTMLElement>(
      '.agent-assistant-panel, .layout-navbar, .layout-vertical-nav',
    )
    for (const surface of fixedSurface) {
      const rect = surface.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return 'fixed'
    }

    return 'scroll'
  }

  const resolveTouchOwner = (event: TouchEvent) => {
    const changedTouch = event.changedTouches.item(0)
    if (!changedTouch) return null
    if (event.type === 'touchstart') {
      const owner = resolvePointOwner(changedTouch.clientX, changedTouch.clientY)
      if (owner) touchOwners.set(changedTouch.identifier, owner)
      return owner
    }

    return touchOwners.get(changedTouch.identifier) ?? null
  }

  const isTouchInteractionEvent = (event: PointerEvent | TouchEvent): event is TouchEvent =>
    event.type.startsWith('touch')

  const dispatch = (event: PointerEvent | TouchEvent) => {
    if (!toValue(active)) {
      if (isTouchInteractionEvent(event) && (event.type === 'touchend' || event.type === 'touchcancel')) {
        for (const touch of Array.from(event.changedTouches)) touchOwners.delete(touch.identifier)
      }
      return
    }

    const owner = isTouchInteractionEvent(event)
      ? resolveTouchOwner(event)
      : resolvePointOwner(event.clientX, event.clientY)
    if (!owner) return

    for (const listener of listeners[owner]) listener(event)
    if (isTouchInteractionEvent(event) && (event.type === 'touchend' || event.type === 'touchcancel')) {
      for (const touch of Array.from(event.changedTouches)) touchOwners.delete(touch.identifier)
    }
  }

  let listening = false

  function attachGlobalListeners() {
    if (listening) return

    listening = true
    window.addEventListener('pointermove', dispatch, { passive: true })
    window.addEventListener('touchstart', dispatch, { passive: true })
    window.addEventListener('touchmove', dispatch, { passive: true })
    window.addEventListener('touchend', dispatch, { passive: true })
    window.addEventListener('touchcancel', dispatch, { passive: true })
  }

  function detachGlobalListeners() {
    if (!listening) return

    listening = false
    touchOwners.clear()
    window.removeEventListener('pointermove', dispatch)
    window.removeEventListener('touchstart', dispatch)
    window.removeEventListener('touchmove', dispatch)
    window.removeEventListener('touchend', dispatch)
    window.removeEventListener('touchcancel', dispatch)
  }

  watch(
    () => toValue(active),
    enabled => {
      if (enabled) attachGlobalListeners()
      else detachGlobalListeners()
    },
    { flush: 'sync', immediate: true },
  )

  onScopeDispose(() => {
    listeners.fixed.clear()
    listeners.scroll.clear()
    detachGlobalListeners()
  })

  return {
    subscribe(space, listener) {
      listeners[space].add(listener)

      return () => listeners[space].delete(listener)
    },
  }
}

interface GlassRendererUniforms extends Record<string, IUniform> {
  uAppearance: IUniform<number>
  uBackgroundVisibility: IUniform<number>
  uCoverScale: IUniform<Vector2>
  uDeformationStrength: IUniform<number>
  uDynamicsOnly: IUniform<number>
  uDynamicsMode: IUniform<number>
  uFlowTexture: IUniform<Texture | null>
  uFlowStrength: IUniform<number>
  uHasWallpaperTexture: IUniform<number>
  uHasFlowTexture: IUniform<number>
  uHasFrostedTexture: IUniform<number>
  uInteractionRadii: IUniform<Vector4[]>
  uInteractionRectCount: IUniform<number>
  uInteractionRects: IUniform<Vector4[]>
  uMotion: IUniform<number>
  uMotionExpansion: IUniform<number>
  uMaxRefractionPixels: IUniform<number>
  uPointer: IUniform<Vector2>
  uPointerVelocity: IUniform<Vector2>
  uPresentationSize: IUniform<Vector2>
  uPreviousCoverScale: IUniform<Vector2>
  uPreviousWallpaperExposure: IUniform<number>
  uQuality: IUniform<number>
  uReflectionStrength: IUniform<number>
  uRippleDeformationStrength: IUniform<number>
  uRippleTexelSize: IUniform<Vector2>
  uRippleTexture: IUniform<Texture | null>
  uHasRippleTexture: IUniform<number>
  uRadii: IUniform<Vector4[]>
  uRectCount: IUniform<number>
  uRects: IUniform<Vector4[]>
  uSurfaceWeights: IUniform<number[]>
  uSurfaceDynamics: IUniform<number[]>
  uPreviousTexture: IUniform<Texture | null>
  uPreviousFrostedTexture: IUniform<Texture | null>
  uTexture: IUniform<Texture | null>
  uFrostedTexture: IUniform<Texture | null>
  uTextureMix: IUniform<number>
  uWallpaperExposure: IUniform<number>
  uTintColor: IUniform<Color>
  uFrostDetailLevel: IUniform<number>
  uSurfaceDensity: IUniform<number>
  uTintDensity: IUniform<number>
  uTransmissionStrength: IUniform<number>
  uTranslationStrength: IUniform<number>
  uTrail: IUniform<Vector4[]>
  uTrailCount: IUniform<number>
  uVisibleViewportSize: IUniform<Vector2>
  uScrollOffset: IUniform<Vector2>
  uWakeDirection: IUniform<Vector2>
}

interface GlassRendererResources {
  camera: OrthographicCamera
  geometry: BufferGeometry
  material: ShaderMaterial
  mesh: Mesh
  renderer: WebGLRenderer
  scene: Scene
  uniforms: GlassRendererUniforms
}

interface GlassFrostPrefilterResources {
  material: ShaderMaterial
  mesh: Mesh
  scene: Scene
  uniforms: {
    uDirection: IUniform<Vector2>
    uTexture: IUniform<Texture | null>
    uTextureSize: IUniform<Vector2>
  }
}

interface UseGlassOpticalRendererOptions {
  active: MaybeRefOrGetter<boolean>
  appearance: MaybeRefOrGetter<ThemeCustomizerGlassAppearance>
  canvas: Ref<HTMLCanvasElement | null>
  deformationStrength?: MaybeRefOrGetter<number>
  /** 是否启用交互形变、尾迹和 temporal flow；静态材质不受影响。 */
  dynamicsActive?: MaybeRefOrGetter<boolean>
  /** 当前互斥动态策略；运行时降级由 dynamicsActive 统一门控。 */
  dynamicsMode?: MaybeRefOrGetter<ThemeCustomizerGlassDynamicsMode>
  flowStrength?: MaybeRefOrGetter<number>
  interactionSource?: GlassOpticalInteractionSource
  /** 旧调用方的单一动态强度仅作为三个独立维度的兼容回退。 */
  motionStrength?: MaybeRefOrGetter<number>
  /** scroll-space 页面表面与 DOM 共用的短时呈现状态；fixed-space 不参与路由入场。 */
  pageMotion?: PagePresentationMotionReader
  quality: MaybeRefOrGetter<GlassOpticalQuality>
  reflectionStrength?: MaybeRefOrGetter<number>
  previousWallpaperUrl?: MaybeRefOrGetter<string>
  /** 下一张壁纸可在提交切换前完成解码和 GPU 上传。 */
  pendingWallpaperUrl?: MaybeRefOrGetter<string>
  /** 父层壁纸事务版本，用于隔离相同 URL 的取消、迟到回执和后续请求。 */
  pendingWallpaperRevision?: MaybeRefOrGetter<number>
  transparencyStrength?: MaybeRefOrGetter<number>
  routeKey: MaybeRefOrGetter<string>
  syncDocumentState?: boolean
  surfaceSpace?: GlassPresentationSpace
  tintColor: MaybeRefOrGetter<string>
  transitionDuration?: MaybeRefOrGetter<number>
  transitionStartedAt?: MaybeRefOrGetter<number>
  /** 玻璃内部壁纸采样的透射亮度。 */
  transmissionStrength?: MaybeRefOrGetter<number>
  translationStrength?: MaybeRefOrGetter<number>
  wallpaperUrl: MaybeRefOrGetter<string>
  /** 同一光学层的 fixed 与 scroll context 共享 CPU 侧壁纸准备结果。 */
  wallpaperSourceCache?: GlassWallpaperSourceCache
}

type GlassOpticalSurfaceDescriptor = GlassOpticalSurfaceCandidate<HTMLElement> & {
  mode: GlassOpticalSurfaceMode
}

interface GlassInteractionClipDescriptor extends GlassOpticalSurfaceDescriptor {
  /** 拥有该局部裁剪的顶层材质面。 */
  owner: HTMLElement
}

interface PreparedWallpaperTexture {
  /** 单次预滤后的低分辨率壁纸；中间 RenderTarget 不跨准备阶段保留。 */
  frostedTarget: WebGLRenderTarget | null
  /** 是否包含可采样的真实壁纸，而非程序化回退纹理。 */
  hasWallpaperTexture: boolean
  /** 纹理像素高度。 */
  height: number
  /** 已完成当前 WebGL context 上传的纹理。 */
  texture: Texture
  /** 纹理自身的稳健整体曝光；双纹理过渡期间不可与另一张壁纸共用。 */
  toneProfile: GlassWallpaperToneProfile
  /** 资源创建时的材质、质量和纹理来源能力键。 */
  preparationKey: string
  /** 纹理像素宽度。 */
  width: number
}

const SURFACE_SELECTORS = [
  { rank: 1, selector: '.agent-assistant-panel', space: 'fixed' },
  { rank: 1, selector: '.login-card', space: 'fixed' },
  { rank: 2, selector: '.layout-vertical-nav', space: 'fixed' },
  { rank: 2, selector: '.layout-navbar', space: 'fixed' },
  {
    rank: 3,
    selector: '.dashboard-grid-item-content > .dashboard-grid-auto-size > .dashboard-grid-content-measure > .v-card',
    space: 'scroll',
  },
  {
    rank: 3,
    selector:
      '.dashboard-grid-item-content > .dashboard-grid-auto-size > .dashboard-grid-content-measure > :first-child > .v-card',
    space: 'scroll',
  },
  { rank: 3, selector: '[data-glass-optical-surface]', space: 'scroll' },
  // 推荐、订阅、媒体详情与设置页共用该交互卡片契约，不按业务路由维护 renderer 白名单。
  { rank: 4, selector: '.app-hover-lift-card', space: 'scroll' },
  // 顶层业务卡片共享玻璃表面语义；嵌套卡片由表面收集阶段折叠，避免按页面维护白名单。
  { rank: 5, selector: '.layout-page-content .v-card', space: 'scroll' },
] as const
const SURFACE_SELECTOR_QUERY = SURFACE_SELECTORS.map(({ selector }) => selector).join(',')
const INTERACTION_CLIP_SELECTOR = '.app-hover-lift-card'
const OPTICAL_BOUNDARY_SELECTOR = '[data-glass-optical-boundary]'
const OPTICAL_EXCLUSION_SELECTOR = '[data-glass-optical-mode="excluded"]'
const INTERACTION_CLIP_OVERSCAN_PX = 96

/** 排除合同覆盖整个子树；后代不能用 dynamic 声明重新加入 renderer。 */
function isGlassOpticalElementExcluded(element: Element) {
  return Boolean(element.closest(OPTICAL_EXCLUSION_SELECTOR))
}

/** overlay 与显式排除子树都不参与壁纸光学表面或交互裁剪。 */
function isGlassOpticalElementEligible(element: Element) {
  return !element.closest('.v-overlay') && !isGlassOpticalElementExcluded(element)
}

/** 登录卡片随文档弹性合成，其余固定表面继续使用 viewport 坐标。 */
function getSurfacePresentationSpace(
  selector: (typeof SURFACE_SELECTORS)[number]['selector'],
  defaultSpace: GlassPresentationSpace,
) {
  return selector === '.login-card' && document.querySelector('.login-root') ? 'scroll' : defaultSpace
}

/** 判断新增或移除的 DOM 子树是否会改变光学表面集合。 */
export function containsGlassOpticalSurface(node: Node) {
  if (!(node instanceof Element)) return false
  if (node.matches(SURFACE_SELECTOR_QUERY) && isGlassOpticalElementEligible(node)) return true

  return Array.from(node.querySelectorAll(SURFACE_SELECTOR_QUERY)).some(isGlassOpticalElementEligible)
}

/** 判断 DOM 子树是否包含会约束父表面动态输出的交互裁剪。 */
function containsGlassInteractionClip(node: Node) {
  if (!(node instanceof Element)) return false

  return node.matches(INTERACTION_CLIP_SELECTOR) || Boolean(node.querySelector(INTERACTION_CLIP_SELECTOR))
}

const VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FROST_PREFILTER_FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D uTexture;
uniform vec2 uDirection;
uniform vec2 uTextureSize;
varying vec2 vUv;

void main() {
  vec2 texel = uDirection / max(uTextureSize, vec2(1.0));
  vec3 color =
    texture2D(uTexture, vUv).rgb * 0.227027 +
    texture2D(uTexture, vUv + texel * 1.384615).rgb * 0.316216 +
    texture2D(uTexture, vUv - texel * 1.384615).rgb * 0.316216 +
    texture2D(uTexture, vUv + texel * 3.230769).rgb * 0.070270 +
    texture2D(uTexture, vUv - texel * 3.230769).rgb * 0.070270;
  gl_FragColor = vec4(color, 1.0);
}
`

const FROST_PREFILTER_SCALE = 0.125
const WALLPAPER_SOURCE_LIMIT_BALANCED = 1536
const WALLPAPER_SOURCE_LIMIT_HIGH = 2048

/**
 * 返回 GPU 壁纸 bundle 的稳定能力键。
 * 透明与色调共享普通纹理能力，磨砂、质量和实际纹理来源会改变资源形态。
 */
export function getGlassWallpaperPreparationKey(
  appearance: ThemeCustomizerGlassAppearance,
  quality: GlassOpticalQuality,
  routeKey: string,
  url: string,
  locationHref = window.location.href,
) {
  const profile = getGlassOpticalRenderProfile(quality, routeKey)
  const textureSource =
    profile.textureSource === 'auto'
      ? canUseGlassWallpaperTexture(url, locationHref)
        ? 'wallpaper'
        : 'procedural'
      : profile.textureSource
  const materialTexture = appearance === 'frosted' ? 'frosted' : 'plain'

  return `${materialTexture}:${quality}:${profile.textureLimit}:${textureSource}`
}

const FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D uPreviousTexture;
uniform sampler2D uTexture;
uniform sampler2D uPreviousFrostedTexture;
uniform sampler2D uFrostedTexture;
uniform sampler2D uFlowTexture;
uniform vec2 uCoverScale;
uniform vec2 uPreviousCoverScale;
uniform vec2 uPresentationSize;
uniform vec2 uScrollOffset;
uniform vec2 uVisibleViewportSize;
uniform float uDeformationStrength;
uniform float uDynamicsOnly;
uniform float uDynamicsMode;
uniform float uFlowStrength;
uniform float uHasWallpaperTexture;
uniform float uHasFlowTexture;
uniform float uHasFrostedTexture;
uniform float uHasRippleTexture;
uniform vec4 uInteractionRadii[8];
uniform vec4 uInteractionRects[8];
uniform int uInteractionRectCount;
uniform float uMotion;
uniform float uMotionExpansion;
uniform float uMaxRefractionPixels;
uniform vec2 uPointer;
uniform vec2 uPointerVelocity;
uniform vec2 uWakeDirection;
uniform float uQuality;
uniform float uReflectionStrength;
uniform float uRippleDeformationStrength;
uniform vec2 uRippleTexelSize;
uniform sampler2D uRippleTexture;
uniform vec4 uRects[8];
uniform vec4 uRadii[8];
uniform float uSurfaceWeights[8];
uniform float uSurfaceDynamics[8];
uniform int uRectCount;
uniform float uAppearance;
uniform float uBackgroundVisibility;
uniform vec3 uTintColor;
uniform float uFrostDetailLevel;
uniform float uSurfaceDensity;
uniform float uTintDensity;
uniform float uTransmissionStrength;
uniform float uTranslationStrength;
uniform float uTextureMix;
uniform float uPreviousWallpaperExposure;
uniform float uWallpaperExposure;
uniform vec4 uTrail[4];
uniform int uTrailCount;
varying vec2 vUv;

float cornerRadius(vec2 centered, vec4 radii) {
  if (centered.x >= 0.0) return centered.y >= 0.0 ? radii.y : radii.z;

  return centered.y >= 0.0 ? radii.x : radii.w;
}

float roundedRectMask(vec2 local, vec2 rectSize, vec4 radii) {
  vec2 localPixels = (local - 0.5) * rectSize;
  float radius = cornerRadius(localPixels, radii);
  float safeRadius = min(max(radius, 0.0), min(rectSize.x, rectSize.y) * 0.5);
  vec2 centered = abs(localPixels) - (rectSize * 0.5 - vec2(safeRadius));
  float distanceToEdge = length(max(centered, 0.0)) + min(max(centered.x, centered.y), 0.0) - safeRadius;
  return 1.0 - smoothstep(0.0, 1.5, distanceToEdge);
}

vec2 coverUv(vec2 uv) {
  vec2 documentPixels = vec2(uv.x, 1.0 - uv.y) * uPresentationSize;
  vec2 viewportPixels = documentPixels - uScrollOffset;
  vec2 viewportUv = vec2(
    viewportPixels.x / max(uVisibleViewportSize.x, 1.0),
    1.0 - viewportPixels.y / max(uVisibleViewportSize.y, 1.0)
  );

  return vec2(0.5) + (viewportUv - vec2(0.5)) * uCoverScale;
}

vec2 rippleFieldUv(vec2 uv) {
  vec2 documentPixels = vec2(uv.x, 1.0 - uv.y) * uPresentationSize;
  vec2 viewportPixels = documentPixels - uScrollOffset;

  return vec2(
    viewportPixels.x / max(uVisibleViewportSize.x, 1.0),
    1.0 - viewportPixels.y / max(uVisibleViewportSize.y, 1.0)
  );
}

vec3 sampleRippleState(vec2 uv) {
  if (uHasRippleTexture < 0.5) return vec3(0.0);

  vec4 encoded = texture2D(uRippleTexture, uv);
  if (encoded.b < (1.0 / 255.0)) return vec3(0.0);

  return vec3(encoded.r * 2.0 - 1.0, encoded.g * 2.0 - 1.0, encoded.b);
}

vec3 compressWallpaperLuminance(vec3 color, float wallpaperExposure) {
  vec3 exposed = max(color * wallpaperExposure, vec3(0.0));
  float sourceLuminance = dot(exposed, vec3(0.2126, 0.7152, 0.0722));
  if (sourceLuminance <= 0.0001) return exposed;

  float shadowLift = (1.0 - smoothstep(0.06, 0.5, sourceLuminance)) * 0.22;
  float highlightCompression = smoothstep(0.72, 0.98, sourceLuminance) * 0.08;
  float compressedLuminance =
    sourceLuminance * (1.0 + shadowLift) * (1.0 - highlightCompression);

  return clamp(exposed * (compressedLuminance / sourceLuminance), 0.0, 1.0);
}

vec3 toneMapWallpaper(vec3 color, vec2 uv, float wallpaperExposure) {
  float tinted = step(0.5, uAppearance) * (1.0 - step(1.5, uAppearance));
  float frosted = step(1.5, uAppearance);
  float exposure = mix(0.86, 0.85, tinted);
  exposure = mix(exposure, 0.82, frosted);
  float saturation = mix(0.82, 0.95, tinted);
  saturation = mix(saturation, 0.9, frosted);
  float contrast = mix(1.02, 1.0, frosted);
  vec3 normalized = compressWallpaperLuminance(color, wallpaperExposure);
  float luminance = dot(normalized, vec3(0.2126, 0.7152, 0.0722));
  vec3 mapped = mix(vec3(luminance), normalized, saturation);
  mapped = clamp((mapped - vec3(0.5)) * contrast + vec3(0.5), 0.0, 1.0) * exposure;

  float top = 1.0 - uv.y;
  float linearStart = mix(0.1, 0.24, frosted);
  float linearEnd = mix(mix(0.3, 0.32, tinted), 0.48, frosted);
  float linearAbsorption = mix(linearStart, linearEnd, top);
  vec2 radialDelta = (uv - vec2(0.5, 0.82)) / vec2(0.78, 1.0);
  float radialAbsorption = smoothstep(0.24, 0.92, length(radialDelta)) * mix(0.12, 0.14, tinted);
  radialAbsorption *= 1.0 - frosted;
  vec3 absorbed = mapped * (1.0 - linearAbsorption) * (1.0 - radialAbsorption);
  float transmissionResponse =
    pow(clamp(uTransmissionStrength, 0.0, 1.0), mix(0.9, 0.78, uQuality));
  float referenceLiftProgress = smoothstep(0.7, 1.0, uTransmissionStrength);
  float highTransmissionProgress =
    clamp((uTransmissionStrength - 1.0) / 0.3, 0.0, 1.0);
  float transmissionMaterialScale = mix(1.0, 0.9, tinted);
  float frostedTransparencyProgress =
    smoothstep(0.6, 0.96, uBackgroundVisibility);
  float frostedTransmissionScale = mix(0.42, 0.72, frostedTransparencyProgress);
  transmissionMaterialScale = mix(transmissionMaterialScale, frostedTransmissionScale, frosted);
  float highlightProtection = smoothstep(0.68, 0.92, luminance);
  vec3 transmissionReference = normalized;
  float referenceLift =
    transmissionMaterialScale *
    (
      referenceLiftProgress * mix(0.18, 0.25, uQuality) +
      highTransmissionProgress * mix(0.1, 0.16, uQuality)
    );
  transmissionReference *= 1.0 + referenceLift * (1.0 - highlightProtection * 0.72);
  transmissionReference = min(transmissionReference, vec3(0.96));
  vec3 protectedHighlightReference = min(normalized, vec3(0.96));
  transmissionReference = mix(
    transmissionReference,
    protectedHighlightReference,
    highlightProtection * 0.78
  );
  float transmissionMix = min(
    transmissionResponse *
      transmissionMaterialScale *
      mix(0.58, 0.84, uQuality),
    0.84
  );

  return mix(absorbed, transmissionReference, transmissionMix);
}

vec3 sampleWallpaper(vec2 uv) {
  vec2 viewportUv = vec2(0.5) + (uv - vec2(0.5)) / max(uCoverScale, vec2(0.0001));
  vec2 previousUv = vec2(0.5) + (viewportUv - vec2(0.5)) * uPreviousCoverScale;
  vec3 previous;
  vec3 current;
  if (uAppearance > 1.5 && uHasFrostedTexture > 0.5) {
    float frostLod = (1.0 - uFrostDetailLevel) * 6.0;
    // 低分辨率预滤已经扩大了每个 texel 的原图 footprint，LOD 只追加当前纹理内的低通层级。
    float frostGradientScale = exp2(frostLod);
    previous = texture2DGradEXT(
      uPreviousFrostedTexture,
      previousUv,
      dFdx(previousUv) * frostGradientScale,
      dFdy(previousUv) * frostGradientScale
    ).rgb;
    current = texture2DGradEXT(
      uFrostedTexture,
      uv,
      dFdx(uv) * frostGradientScale,
      dFdy(uv) * frostGradientScale
    ).rgb;
  } else {
    previous = texture2D(uPreviousTexture, previousUv).rgb;
    current = texture2D(uTexture, uv).rgb;
  }

  if (uTextureMix <= 0.001) {
    return toneMapWallpaper(previous, viewportUv, uPreviousWallpaperExposure);
  }
  if (uTextureMix >= 0.999) {
    return toneMapWallpaper(current, viewportUv, uWallpaperExposure);
  }

  vec3 previousTone = toneMapWallpaper(previous, viewportUv, uPreviousWallpaperExposure);
  vec3 currentTone = toneMapWallpaper(current, viewportUv, uWallpaperExposure);

  return mix(previousTone, currentTone, uTextureMix);
}

vec3 sampleChromatic(vec2 uv, float separation) {
  return vec3(
    sampleWallpaper(uv + vec2(separation, 0.0)).r,
    sampleWallpaper(uv).g,
    sampleWallpaper(uv - vec2(separation, 0.0)).b
  );
}

vec3 sampleBalancedDiffuse(vec2 uv, vec2 axis, float radius) {
  vec2 firstOffset = axis * radius;
  vec2 secondOffset = vec2(-axis.y, axis.x) * radius;

  return (
    sampleWallpaper(uv) * 0.28 +
    sampleWallpaper(uv + firstOffset) * 0.18 +
    sampleWallpaper(uv - firstOffset) * 0.18 +
    sampleWallpaper(uv + secondOffset) * 0.18 +
    sampleWallpaper(uv - secondOffset) * 0.18
  );
}

vec3 sampleHighQualityDiffuse(vec2 uv, vec2 axis, float radius) {
  vec2 firstOffset = axis * radius;
  vec2 secondOffset = vec2(-axis.y, axis.x) * radius;
  vec2 firstDiagonal = normalize(firstOffset + secondOffset) * radius * 1.15;
  vec2 secondDiagonal = normalize(firstOffset - secondOffset) * radius * 1.15;

  return (
    sampleWallpaper(uv) * 0.2 +
    sampleWallpaper(uv + firstOffset) * 0.12 +
    sampleWallpaper(uv - firstOffset) * 0.12 +
    sampleWallpaper(uv + secondOffset) * 0.12 +
    sampleWallpaper(uv - secondOffset) * 0.12 +
    sampleWallpaper(uv + firstDiagonal) * 0.08 +
    sampleWallpaper(uv - firstDiagonal) * 0.08 +
    sampleWallpaper(uv + secondDiagonal) * 0.08 +
    sampleWallpaper(uv - secondDiagonal) * 0.08
  );
}

float getContentProtection(vec2 sourceUv) {
  if (uQuality < 0.5 || uHasWallpaperTexture < 0.5 || uAppearance > 1.5) return 1.0;

  vec2 sourceTexel = max(uCoverScale, vec2(0.0001)) / max(uVisibleViewportSize, vec2(1.0));
  vec3 horizontalStart = sampleWallpaper(sourceUv - vec2(sourceTexel.x * 2.5, 0.0));
  vec3 horizontalEnd = sampleWallpaper(sourceUv + vec2(sourceTexel.x * 2.5, 0.0));
  vec3 verticalStart = sampleWallpaper(sourceUv - vec2(0.0, sourceTexel.y * 2.5));
  vec3 verticalEnd = sampleWallpaper(sourceUv + vec2(0.0, sourceTexel.y * 2.5));
  float contentGradient = max(length(horizontalEnd - horizontalStart), length(verticalEnd - verticalStart));

  return mix(1.0, 0.44, smoothstep(0.07, 0.34, contentGradient));
}

vec2 softLimitDynamicRefraction(vec2 refraction) {
  vec2 presentation = max(uPresentationSize, vec2(1.0));
  vec2 refractionPixels = refraction * presentation;
  float limit = max(0.5, uMaxRefractionPixels);
  float limitScale = limit / sqrt(limit * limit + dot(refractionPixels, refractionPixels));

  return refractionPixels * limitScale / presentation;
}

void main() {
  float mask = 0.0;
  float edge = 0.0;
  float caustic = 0.0;
  float directionalReflection = 0.0;
  float topPrism = 0.0;
  float backlightAbsorption = 0.0;
  float materialEnergy = 0.0;
  float sharedMotionPresence = 0.0;
  float dynamicMask = 0.0;
  vec2 staticRefraction = vec2(0.0);
  vec2 dynamicRefraction = vec2(0.0);
${GLASS_FLUID_FRAGMENT_SETUP}
  float interactionMask = uInteractionRectCount > 0 ? 0.0 : 1.0;
  for (int interactionIndex = 0; interactionIndex < 8; interactionIndex++) {
    if (interactionIndex >= uInteractionRectCount) break;

    vec4 interactionRect = uInteractionRects[interactionIndex];
    vec2 interactionLocal = (vUv - interactionRect.xy) / max(interactionRect.zw, vec2(0.0001));
    interactionMask = max(
      interactionMask,
      roundedRectMask(
        interactionLocal,
        interactionRect.zw * uPresentationSize,
        uInteractionRadii[interactionIndex]
      )
    );
  }

${GLASS_FLUID_FRAGMENT_TRAIL_AND_FIELD}
  float rippleMode = step(0.5, uDynamicsMode) * (1.0 - step(1.5, uDynamicsMode));
  vec3 rippleState = vec3(0.0);
  vec2 rippleGradient = vec2(0.0);
  if (rippleMode > 0.5 && uHasRippleTexture > 0.5) {
    vec2 rippleUv = rippleFieldUv(vUv);
    rippleState = sampleRippleState(rippleUv);
    float rippleLeft = sampleRippleState(rippleUv - vec2(uRippleTexelSize.x, 0.0)).x;
    float rippleRight = sampleRippleState(rippleUv + vec2(uRippleTexelSize.x, 0.0)).x;
    float rippleBottom = sampleRippleState(rippleUv - vec2(0.0, uRippleTexelSize.y)).x;
    float rippleTop = sampleRippleState(rippleUv + vec2(0.0, uRippleTexelSize.y)).x;
    rippleGradient = vec2(rippleRight - rippleLeft, rippleTop - rippleBottom) * 0.5;
  }
  float rippleGradientLength = length(rippleGradient);
  float rippleGradientEnergy = smoothstep(0.003, 0.08, rippleGradientLength);
  // 半浮点高度场保留连续波前；真实梯度直接决定方向和幅度，不放大量化噪声。
  vec2 rippleRefraction =
    rippleGradient * mix(230.0, 335.0, uQuality) * uRippleDeformationStrength;
  rippleRefraction /= max(uPresentationSize, vec2(1.0));
  float frosted = step(1.5, uAppearance);
  float rippleAppearanceScale = uAppearance > 1.5 ? 1.25 : (uAppearance > 0.5 ? 0.86 : 0.72);
  rippleRefraction *= rippleAppearanceScale;

  for (int i = 0; i < 8; i++) {
    if (i >= uRectCount) break;

    vec4 rect = uRects[i];
    float surfaceDynamic = uSurfaceDynamics[i];
    vec2 local = (vUv - rect.xy) / rect.zw;
    float rectMask = roundedRectMask(local, rect.zw * uPresentationSize, uRadii[i]) * uSurfaceWeights[i];
    if (rectMask <= 0.0) continue;

    float sideDistance = min(local.x, 1.0 - local.x);
    float nonBottomDistance = min(sideDistance, 1.0 - local.y);
    float edgeResponse = 1.0 - smoothstep(0.0, 0.16, nonBottomDistance);
    vec2 lens = local - vec2(0.5);
    vec2 lightDirection = normalize(vec2(-0.68, 0.74));
    float lightCoordinate = dot(lens, lightDirection);
    float broadLight =
      exp(-pow((lightCoordinate - 0.08) * 2.25, 2.0)) *
      (0.42 + edgeResponse * 0.58);
    float topEdge = 1.0 - smoothstep(0.0, 0.11, 1.0 - local.y);
    float rightEdge = 1.0 - smoothstep(0.0, 0.14, 1.0 - local.x);
    float bottomEdge = 1.0 - smoothstep(0.0, 0.14, local.y);
    float litResponse = clamp(0.5 + lightCoordinate * 1.15, 0.0, 1.0);
    float localDirectionalReflection = broadLight * mix(0.34, 1.0, litResponse) * rectMask;
    float localTopPrism = topEdge * mix(0.38, 1.0, 1.0 - local.x) * rectMask;
    float localBacklightAbsorption = max(rightEdge * 0.72, bottomEdge * 0.46) * rectMask;
${GLASS_FLUID_FRAGMENT_SURFACE_SHAPE}
    float staticLens = 0.00008 + edgeResponse * mix(0.00045, 0.00072, uQuality);
${GLASS_FLUID_FRAGMENT_SURFACE_OPTICS}
    staticRefraction += lens * staticLens * mix(1.0, 0.72, frosted) * rectMask * surfaceDynamic;
${GLASS_FLUID_FRAGMENT_SURFACE_REFRACTION}
    dynamicRefraction += rippleRefraction * rippleMode * rectMask * surfaceDynamic * interactionMask;
    edge = max(edge, edgeResponse * rectMask * surfaceDynamic);
    caustic = max(caustic, localCaustic);
    caustic = max(
      caustic,
      rippleGradientEnergy * rippleState.z * rippleMode * rectMask * surfaceDynamic * interactionMask
    );
    directionalReflection = max(directionalReflection, localDirectionalReflection);
    topPrism = max(topPrism, localTopPrism);
    backlightAbsorption = max(backlightAbsorption, localBacklightAbsorption);
    materialEnergy = max(materialEnergy, liquidEnergy * rectMask * surfaceDynamic * interactionMask);
    materialEnergy = max(
      materialEnergy,
      rippleState.z * rippleMode * rectMask * surfaceDynamic * interactionMask
    );
    sharedMotionPresence = max(
      sharedMotionPresence,
      sharedWaveEnergy * rectMask * surfaceDynamic * interactionMask
    );
    dynamicMask = max(dynamicMask, rectMask * surfaceDynamic * interactionMask);
    mask = max(mask, rectMask);
  }

  if (mask <= 0.0) discard;

  float contentProtection = getContentProtection(coverUv(vUv + staticRefraction));
  dynamicRefraction *= contentProtection;
  // 高光足迹与壁纸位移强度独立校准，收紧反馈范围不能同步削弱三项动态参数。
  dynamicRefraction *= 1.2;
  dynamicRefraction = softLimitDynamicRefraction(dynamicRefraction);
  vec2 refraction = staticRefraction + dynamicRefraction;
  vec2 sourceUv = coverUv(vUv + refraction);
  float separation = edge * mix(0.00024, 0.00055, uQuality) * mix(1.0, 0.58, frosted);
  float usesPrefilteredFrost = frosted * uHasFrostedTexture;
  vec3 refracted = usesPrefilteredFrost > 0.5
    ? sampleWallpaper(sourceUv)
    : sampleChromatic(sourceUv, separation);
  float detailSeparation = separation * mix(1.45, 2.35, uQuality);
  vec3 detailed = usesPrefilteredFrost > 0.5
    ? refracted
    : sampleChromatic(sourceUv, detailSeparation);
  refracted = mix(refracted, detailed, mix(0.06, 0.16, uQuality) * (1.0 - frosted));
  vec2 diffusionAxis = length(refraction) > 0.00001 ? normalize(refraction) : wakePerpendicular;
  float diffusionRadius =
    mix(0.0022, 0.0038, uQuality) *
    (
      0.82 +
      materialEnergy * mix(0.28, 0.76, uMotionExpansion) +
      flowSurfaceDetail * dynamicMask * 0.38
    );
  float frostedDensity = frosted * (1.0 - uFrostDetailLevel);
  diffusionRadius *= 1.0 + frostedDensity * mix(1.15, 1.55, uQuality);
  vec3 diffused;
  if (usesPrefilteredFrost > 0.5) {
    diffused = refracted;
  } else if (uQuality > 0.5) {
    diffused = sampleHighQualityDiffuse(sourceUv, diffusionAxis, diffusionRadius);
  } else {
    diffused = sampleBalancedDiffuse(sourceUv, diffusionAxis, diffusionRadius);
  }
  refracted = mix(refracted, diffused, frosted);
  float refractedLuminance = dot(refracted, vec3(0.2126, 0.7152, 0.0722));
  float tinted = step(0.5, uAppearance) * (1.0 - step(1.5, uAppearance));
  float transmissionOffset = min(uTransmissionStrength - 1.0, 0.0);
  if (transmissionOffset < 0.0) {
    float dimming = mix(0.14, 0.18, uQuality) * mix(1.0, 0.65, frosted);
    refracted *= 1.0 + transmissionOffset * dimming;
  }
  refractedLuminance = dot(refracted, vec3(0.2126, 0.7152, 0.0722));
  float highlightBudget = mix(1.0, 0.34, smoothstep(0.48, 0.9, refractedLuminance));
  float frostedBrightCompression = smoothstep(0.58, 0.94, refractedLuminance) * frosted;
  refracted *= 1.0 - frostedBrightCompression * mix(0.16, 0.22, uQuality);
  vec3 frostedContrast = clamp((refracted - vec3(0.5)) * 1.16 + vec3(0.5), 0.0, 1.0);
  refracted = mix(
    refracted,
    frostedContrast,
    frosted * materialEnergy * mix(0.24, 0.58, uMotionExpansion)
  );
  vec3 highlight = vec3(0.84, 0.92, 1.0);
  float edgeHighlightMix = 0.12;
  float causticHighlightMix = 0.075;
  float liquidPresence = clamp(materialEnergy, 0.0, 1.0);
  float clearVisibilityProgress = clamp((uBackgroundVisibility - 0.18) / 0.78, 0.0, 1.0);
  float clearBaseAlpha = mix(0.08, 0.34, clearVisibilityProgress);
  float materialAlpha = clearBaseAlpha * mix(1.0, 2.5, liquidPresence);
  float proceduralEdgeAlpha = 0.14;
  float proceduralCausticAlpha = 0.075;

  if (uAppearance > 1.5) {
    highlight = vec3(0.94, 0.97, 1.0);
    edgeHighlightMix = 0.15;
    causticHighlightMix = 0.042;
    float frostedBaseAlpha = mix(0.46, 0.88, uSurfaceDensity);
    materialAlpha = frostedBaseAlpha * mix(0.9, 1.0, liquidPresence);
    proceduralEdgeAlpha = 0.16;
    proceduralCausticAlpha = 0.045;
  } else if (uAppearance > 0.5) {
    highlight = mix(vec3(1.0), uTintColor, mix(0.28, 0.72, uTintDensity));
    edgeHighlightMix = 0.17;
    causticHighlightMix = 0.085;
    float tintedVisibilityProgress = clamp((uBackgroundVisibility - 0.08) / 0.84, 0.0, 1.0);
    float tintedBaseAlpha = mix(0.16, 0.5, tintedVisibilityProgress);
    materialAlpha = tintedBaseAlpha * mix(1.0, 1.8, liquidPresence);
  }

  if (uHasWallpaperTexture < 0.5) {
    float proceduralReflection =
      (directionalReflection * 0.42 + topPrism * 0.66 + caustic * 0.72) *
      uReflectionStrength;
    vec3 proceduralHighlight = highlight * proceduralReflection;
    float proceduralAlpha =
      mask *
      (
        directionalReflection * proceduralEdgeAlpha +
        topPrism * proceduralEdgeAlpha * 0.76 +
        caustic * proceduralCausticAlpha
      ) *
      uReflectionStrength;
    gl_FragColor = vec4(proceduralHighlight, proceduralAlpha);
    return;
  }

  float reflectionMix =
    clamp(
      (directionalReflection * edgeHighlightMix + topPrism * edgeHighlightMix * 0.82) *
        uReflectionStrength *
        highlightBudget,
      0.0,
      0.36
    );
  float absorption =
    clamp(backlightAbsorption * mix(0.035, 0.075, frosted) * uReflectionStrength, 0.0, 0.14);
  refracted *= 1.0 - absorption;
  refracted = mix(refracted, highlight, reflectionMix);
  refracted += highlight * caustic * causticHighlightMix * uReflectionStrength * highlightBudget;

  if (uDynamicsOnly > 0.5) {
    float dynamicsPresence = max(materialEnergy, sharedMotionPresence * 0.36);
    float dynamicsAlpha =
      clamp(dynamicsPresence * mix(0.5, 0.72, uQuality) * mix(1.0, 1.12, frosted), 0.0, 0.82);
    gl_FragColor = vec4(refracted, dynamicsAlpha);
    return;
  }

  gl_FragColor = vec4(
    refracted,
    clamp(
      mask *
        (
          materialAlpha +
          (
            directionalReflection * 0.065 +
            topPrism * 0.05 +
            caustic * mix(0.028, 0.04, uQuality)
          ) *
            uReflectionStrength *
            highlightBudget
        ),
      0.0,
      0.94
    )
  );
}
`

const SCROLL_STABLE_TAIL_FRAMES = 2
const PRESENTATION_RESIZE_SAMPLE_MS = 80
const PRESENTATION_RESIZE_REQUIRED_SAMPLES = 2
const SURFACE_STABILITY_MAX_FRAMES = 6
const SURFACE_STABILITY_REQUIRED_FRAMES = 2
const SURFACE_TRANSITION_DURATION_MS = 96
const SURFACE_TRANSFORM_TRACKING_MAX_MS = 1000

/** 按 shader 协议读取视觉表面的四角圆角。 */
function readBorderRadii(element: HTMLElement) {
  const style = getComputedStyle(element)
  const parseRadius = (value: string) => {
    const radius = Number.parseFloat(value)

    return Number.isFinite(radius) ? radius : 0
  }

  return [
    parseRadius(style.borderTopLeftRadius),
    parseRadius(style.borderTopRightRadius),
    parseRadius(style.borderBottomRightRadius),
    parseRadius(style.borderBottomLeftRadius),
  ] as const
}

/** 判断元素是否在布局和视口中实际可见。 */
function isVisibleSurface(element: HTMLElement, bounds: DOMRect) {
  const style = getComputedStyle(element)

  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number.parseFloat(style.opacity || '1') > 0 &&
    bounds.width >= 24 &&
    bounds.height >= 24
  )
}

/** 从最近的组件边界读取模式；未声明的现有表面保持完整动态行为。 */
export function resolveGlassOpticalSurfaceMode(element: HTMLElement): GlassOpticalSurfaceMode {
  const value = element.closest<HTMLElement>('[data-glass-optical-mode]')?.dataset.glassOpticalMode

  return value === 'static-material' ? 'static-material' : 'dynamic'
}

/** 读取全部可见视觉表面，并保留 DOM 元素作为 renderer 生命周期内的稳定身份。 */
function collectGlassOpticalSurfaceDescriptors(
  viewportWidth: number,
  viewportHeight: number,
  appearance: ThemeCustomizerGlassAppearance,
  surfaceSpace: GlassPresentationSpace | 'all' = 'all',
  includeOutsideViewport = false,
  collectedElements?: HTMLElement[],
) {
  const candidates: Array<GlassOpticalSurfaceDescriptor & { visibleArea: number }> = []
  const seen = new Set<HTMLElement>()

  for (const { rank, selector, space } of SURFACE_SELECTORS) {
    const resolvedSpace = getSurfacePresentationSpace(selector, space)
    if (surfaceSpace !== 'all' && resolvedSpace !== surfaceSpace) continue
    // 移动端透明顶栏只使用稳定的 CSS 表面，避免滚动重扫时再次叠加壁纸折射。
    if (viewportWidth <= 600 && appearance === 'clear' && selector === '.layout-navbar') continue

    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (seen.has(element)) continue
      seen.add(element)
      if (!isGlassOpticalElementEligible(element)) continue
      collectedElements?.push(element)

      const bounds = element.getBoundingClientRect()
      if (!isVisibleSurface(element, bounds)) continue

      const left = Math.max(0, bounds.left)
      const top = Math.max(0, bounds.top)
      const right = Math.min(viewportWidth, bounds.right)
      const bottom = Math.min(viewportHeight, bounds.bottom)
      const visibleHeight = Math.max(0, bottom - top)
      const visibleWidth = Math.max(0, right - left)
      if (!includeOutsideViewport && (visibleWidth < 24 || visibleHeight < 24)) continue
      const coordinateOffsetX = resolvedSpace === 'scroll' ? window.scrollX : 0
      const coordinateOffsetY = resolvedSpace === 'scroll' ? window.scrollY : 0

      candidates.push({
        key: element,
        mode: resolveGlassOpticalSurfaceMode(element),
        rect: {
          height: bounds.height,
          radii: [...readBorderRadii(element)] as GlassCornerRadii,
          rank: rank + candidates.length * 0.001,
          width: bounds.width,
          x: bounds.left + coordinateOffsetX,
          y: bounds.top + coordinateOffsetY,
        },
        visibleArea: visibleWidth * visibleHeight,
      })
    }
  }

  const selected: GlassOpticalSurfaceDescriptor[] = []
  for (const candidate of candidates.sort((left, right) => {
    // 祖先材质面必须先建立；后续子卡才能折叠为局部交互裁剪，而不是额外占用 shader slot。
    if (left.key !== right.key) {
      if (left.key.contains(right.key)) return -1
      if (right.key.contains(left.key)) return 1
    }

    return left.rect.rank - right.rect.rank || left.visibleArea - right.visibleArea
  })) {
    const { rect } = candidate
    const nested = selected.some(
      parent =>
        parent.mode === candidate.mode &&
        rect.x >= parent.rect.x &&
        rect.y >= parent.rect.y &&
        rect.x + rect.width <= parent.rect.x + parent.rect.width &&
        rect.y + rect.height <= parent.rect.y + parent.rect.height,
    )
    if (!nested) selected.push({ key: candidate.key, mode: candidate.mode, rect })
  }

  return selected
}

/** 从已测量的 presentation 坐标中选择当前视口可见表面，不触发 DOM 布局读取。 */
function selectVisibleGlassOpticalSurfaceDescriptors(
  surfaces: GlassOpticalSurfaceDescriptor[],
  viewportWidth: number,
  viewportHeight: number,
  surfaceSpace: GlassPresentationSpace,
) {
  const viewportX = surfaceSpace === 'scroll' ? window.scrollX : 0
  const viewportY = surfaceSpace === 'scroll' ? window.scrollY : 0

  return surfaces.filter(({ rect }) => {
    const visibleWidth = Math.min(viewportX + viewportWidth, rect.x + rect.width) - Math.max(viewportX, rect.x)
    const visibleHeight = Math.min(viewportY + viewportHeight, rect.y + rect.height) - Math.max(viewportY, rect.y)

    return visibleWidth >= 24 && visibleHeight >= 24
  })
}

/** 将活动界面中的高价值材质面集中转换为 renderer 矩形预算。 */
export function collectGlassOpticalRects(
  viewportWidth: number,
  viewportHeight: number,
  appearance: ThemeCustomizerGlassAppearance,
  interactionPoint?: { x: number; y: number },
  surfaceSpace: GlassPresentationSpace | 'all' = 'all',
) {
  const candidates = collectGlassOpticalSurfaceDescriptors(viewportWidth, viewportHeight, appearance, surfaceSpace)

  return selectGlassOpticalRects(
    candidates.map(candidate => candidate.rect),
    viewportWidth,
    viewportHeight,
    viewportWidth <= 600,
    interactionPoint,
  )
}

/** 将材质语义映射为稳定 shader 协议，质量档不参与该映射。 */
function getGlassAppearanceUniformValue(appearance: ThemeCustomizerGlassAppearance) {
  if (appearance === 'tinted') return 1
  if (appearance === 'frosted') return 2

  return 0
}

/** 管理玻璃主题唯一 renderer、事件驱动帧调度与完整 GPU 资源释放。 */
export function useGlassOpticalRenderer(options: UseGlassOpticalRendererOptions) {
  const state = ref<GlassRendererState>('loading')
  const renderedFrames = ref(0)
  const activeWallpaperUrl = ref('')
  const activeWallpaperRevision = ref(0)
  const activeWallpaperPreparationKey = ref('')
  const preparedWallpaperUrl = ref('')
  const preparedWallpaperRevision = ref(0)
  const preparedWallpaperPreparationKey = ref('')
  const failedWallpaperUrl = ref('')
  const failedWallpaperRevision = ref(0)
  const failedWallpaperPreparationKey = ref('')
  let three: ThreeModule | null = null
  let resources: GlassRendererResources | null = null
  let fluidDynamics: GlassFluidDynamics | null = null
  let rippleResources: GlassRippleDynamics | null = null
  let frostPrefilterResources: GlassFrostPrefilterResources | null = null
  let activeTexture: Texture | null = null
  let activeFrostedTarget: WebGLRenderTarget | null = null
  let activeTextureHeight = 1
  let activeTextureWidth = 1
  let activeHasWallpaperTexture = false
  let activeWallpaperExposure = DEFAULT_GLASS_WALLPAPER_TONE_PROFILE.exposure
  let previousTexture: Texture | null = null
  let previousFrostedTarget: WebGLRenderTarget | null = null
  let previousTextureHeight = 1
  let previousTextureWidth = 1
  let previousWallpaperExposure = DEFAULT_GLASS_WALLPAPER_TONE_PROFILE.exposure
  let wallpaperTransitionStartedAt = 0
  let wallpaperActivationRollback: {
    activatedRevision: number
    activatedUrl: string
    previousHasWallpaperTexture: boolean
    previousPreparationKey: string
    previousRevision: number
    previousUrl: string
  } | null = null
  let loadVersion = 0
  let prepareVersion = 0
  let preparedWallpaper: PreparedWallpaperTexture | null = null
  let animationFrame: number | null = null
  let wallpaperTransitionFrame: number | null = null
  let backgroundDisposeTimer: number | null = null
  let presentationBufferHeight = 1
  let presentationBufferWidth = 1
  let surfaceUpdateFrame: number | null = null
  let surfaceStabilityFrame: number | null = null
  let surfaceStabilityPass = 0
  let surfaceStableFrameCount = 0
  let lastSurfaceGeometrySignature = ''
  let lastInteractionAt = 0
  let lastInteractionFrameAt = 0
  let lastPointerAt = 0
  let lastTrailAt = Number.NEGATIVE_INFINITY
  let lastPointerX = window.innerWidth * 0.5
  let lastPointerY = window.innerHeight * 0.5
  let suppressNextPointerVelocity = false
  let pointerTargetX = 0.5
  let pointerTargetY = 0.5
  let pointerPositionX = 0.5
  let pointerPositionY = 0.5
  let activeTouchIdentifier: number | null = null
  let pendingFlowInjection = 0
  let interactionAnimating = false
  let presentationResizeCandidate = ''
  let presentationResizeStableSamples = 0
  let presentationResizeTimer: number | null = null
  let scrollAnimationFrame: number | null = null
  let scrollDirty = false
  let scrollPresentationRestoreTimer: number | null = null
  let scrollWallpaperSamplingSuppressed = false
  let scrollFrameCommitted = false
  let scrollGeometryRefreshPending = false
  let scrollLateGeometryCommitted = false
  let scrollSurfaceStabilityPending = false
  let scrollStableFrameCount = 0
  let lastRenderedScrollX = window.scrollX
  let lastRenderedScrollY = window.scrollY
  let unsubscribeInteractionSource: (() => void) | null = null
  let interactionEventsAttached = false
  let contextEventCanvas: HTMLCanvasElement | null = null
  let contextRecoveryCanvas: HTMLCanvasElement | null = null
  let resizeObserver: ResizeObserver | null = null
  let surfaceMutationObserver: MutationObserver | null = null
  let observedSurfaces: HTMLElement[] = []
  let surfaceRegistry: GlassOpticalSurfaceDescriptor[] = []
  let availableSurfaces: GlassOpticalSurfaceDescriptor[] = []
  let surfaceSlots: GlassOpticalSurfaceSlot<HTMLElement>[] = []
  let interactionClips: GlassInteractionClipDescriptor[] = []
  let interactionClipRegistry: GlassInteractionClipDescriptor[] = []
  let interactionClipConstrainedOwners = new Set<HTMLElement>()
  let interactionClipMembershipDirty = true
  let activeSurface: HTMLElement | null = null
  let activeInteractionClip: HTMLElement | null = null
  let outgoingSurface: HTMLElement | null = null
  let surfaceTransitionStartedAt = 0
  let surfaceTransformFrame: number | null = null
  let surfaceTransformTrackingDeadline = 0
  const transformingSurfaces = new Set<HTMLElement>()
  let pagePresentationGeometryReady = true
  let pagePresentationMotionEpoch: number | null = null
  let wakeDirection = { x: 0, y: -1 }
  let contextRecoveryPending = false
  let resumePromise: Promise<void> | null = null
  let resumeVersion = 0
  let dynamicsGeneration = 0
  const presentationSpace = options.surfaceSpace ?? 'fixed'
  const usesDynamicsOnly = () =>
    presentationSpace === 'scroll' || (presentationSpace === 'fixed' && toValue(options.appearance) === 'frosted')
  const wallpaperSourceCache = options.wallpaperSourceCache ?? createGlassWallpaperSourceCache()

  /** 滚动期间由原生 backdrop 接管壁纸；稳定态恢复完整纹理折射与流体反馈。 */
  function syncWallpaperSamplingMode() {
    if (!resources) return

    resources.uniforms.uHasWallpaperTexture.value =
      activeHasWallpaperTexture && !(presentationSpace === 'scroll' && scrollWallpaperSamplingSuppressed) ? 1 : 0
  }

  function clearScrollPresentationRestoreTimer() {
    if (scrollPresentationRestoreTimer === null) return

    window.clearTimeout(scrollPresentationRestoreTimer)
    scrollPresentationRestoreTimer = null
  }

  function finishNativeScrollPresentation(timestamp = performance.now()) {
    clearScrollPresentationRestoreTimer()
    if (presentationSpace !== 'scroll' || !scrollWallpaperSamplingSuppressed) return

    scrollWallpaperSamplingSuppressed = false
    syncWallpaperSamplingMode()
    renderFrame(timestamp, false)
    document.documentElement.removeAttribute('data-glass-scroll-presentation')
  }

  function beginNativeScrollPresentation() {
    if (presentationSpace !== 'scroll' || !resources) return

    clearScrollPresentationRestoreTimer()
    scrollPresentationRestoreTimer = window.setTimeout(() => finishNativeScrollPresentation(), 180)
    if (scrollWallpaperSamplingSuppressed) return

    if (hasRippleCapability() && rippleResources) {
      interactionAnimating = false
      cancelScheduledFrame()
      rippleResources.reset()
      resources.uniforms.uRippleTexture.value = rippleResources.texture
      resources.uniforms.uHasRippleTexture.value = 0
      resetInteractionState()
    }
    scrollWallpaperSamplingSuppressed = true
    syncWallpaperSamplingMode()
    document.documentElement.dataset.glassScrollPresentation = 'native'
    renderFrame(performance.now(), false)
  }

  /** 找到本次输入实际可能推动的最近滚动容器。 */
  function resolveScrollIntentTarget(event: Event): Element | null {
    const documentScroller = document.scrollingElement ?? document.documentElement
    const eventTarget = event.target
    if (!(eventTarget instanceof Element)) return documentScroller
    if (eventTarget.closest('.v-overlay')) return null

    const wheel = event instanceof WheelEvent ? event : null
    for (
      let candidate: Element | null = eventTarget;
      candidate && candidate !== document.body;
      candidate = candidate.parentElement
    ) {
      const style = getComputedStyle(candidate)
      const canScrollY =
        /(auto|overlay|scroll)/.test(style.overflowY) &&
        candidate.scrollHeight > candidate.clientHeight &&
        (!wheel ||
          (wheel.deltaY < 0 && candidate.scrollTop > 0) ||
          (wheel.deltaY > 0 && candidate.scrollTop + candidate.clientHeight < candidate.scrollHeight))
      const canScrollX =
        /(auto|overlay|scroll)/.test(style.overflowX) &&
        candidate.scrollWidth > candidate.clientWidth &&
        (!wheel ||
          (wheel.deltaX < 0 && candidate.scrollLeft > 0) ||
          (wheel.deltaX > 0 && candidate.scrollLeft + candidate.clientWidth < candidate.scrollWidth))
      if (canScrollX || canScrollY) return candidate
    }

    return documentScroller
  }

  /** 只有会移动文档或已管理玻璃表面的滚动才需要切换 scroll 材质路径。 */
  function isRelevantScrollTarget(target: EventTarget | null) {
    if (!(target instanceof Element) || target === document.documentElement || target === document.body) return true

    return observedSurfaces.some(surface => target.contains(surface))
  }

  function handleScrollIntent(event: Event) {
    if (event instanceof WheelEvent && event.deltaX === 0 && event.deltaY === 0) return
    if (event instanceof KeyboardEvent) {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName))
      ) {
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp', ' '].includes(event.key)) return
    }

    const scrollTarget = resolveScrollIntentTarget(event)
    if (!scrollTarget || !isRelevantScrollTarget(scrollTarget)) return
    beginNativeScrollPresentation()
  }

  function updateRendererState(value: GlassRendererState) {
    if (options.syncDocumentState === false) {
      state.value = value
      return
    }

    setGlassRendererState(state, value)
  }

  /** 只在 presentation 提交点读取 DOM 尺寸，避免渲染帧反复触发布局计算。 */
  function measurePresentationSize() {
    if (presentationSpace === 'fixed') {
      return { height: window.innerHeight, width: window.innerWidth }
    }

    const root = options.canvas.value?.parentElement

    return {
      height: Math.max(window.innerHeight, root?.scrollHeight ?? 0, document.documentElement.scrollHeight),
      width: Math.max(window.innerWidth, root?.scrollWidth ?? 0, document.documentElement.scrollWidth),
    }
  }

  /** 帧内逻辑复用最近一次已提交尺寸；ResizeObserver 与 motion 事务负责刷新该值。 */
  function getCommittedPresentationSize() {
    const committed = resources?.uniforms.uPresentationSize.value

    return committed
      ? { height: committed.y, width: committed.x }
      : { height: window.innerHeight, width: window.innerWidth }
  }

  function getPresentationPoint(clientX: number, clientY: number) {
    if (presentationSpace === 'fixed') return { x: clientX, y: clientY }

    return { x: clientX + window.scrollX, y: clientY + window.scrollY }
  }

  /** 将当前 DOM 边界转换为 renderer 使用的 fixed 或 scroll presentation 坐标。 */
  function getElementPresentationRect(element: HTMLElement): GlassOpticalRect {
    const bounds = element.getBoundingClientRect()
    const coordinateOffsetX = presentationSpace === 'scroll' ? window.scrollX : 0
    const coordinateOffsetY = presentationSpace === 'scroll' ? window.scrollY : 0

    return {
      height: bounds.height,
      radii: [...readBorderRadii(element)] as GlassCornerRadii,
      rank: 0,
      width: bounds.width,
      x: bounds.left + coordinateOffsetX,
      y: bounds.top + coordinateOffsetY,
    }
  }

  /** scroll 呈现层必须跟随页面异步撑高，即使页面内没有可发现的光学表面。 */
  function observeResizeTargets(reset = true) {
    if (reset) resizeObserver?.disconnect()
    if (presentationSpace === 'scroll') {
      const presentationRoot = options.canvas.value?.parentElement
      if (presentationRoot) resizeObserver?.observe(presentationRoot)
    }
    for (const element of observedSurfaces) resizeObserver?.observe(element)
  }

  function cancelScheduledFrame() {
    if (animationFrame === null) return

    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }

  function cancelScrollFrame() {
    if (scrollAnimationFrame !== null) cancelAnimationFrame(scrollAnimationFrame)
    scrollAnimationFrame = null
    scrollDirty = false
    scrollFrameCommitted = false
    scrollGeometryRefreshPending = false
    scrollLateGeometryCommitted = false
    scrollSurfaceStabilityPending = false
    scrollStableFrameCount = 0
    clearScrollPresentationRestoreTimer()
  }

  function cancelWallpaperTransitionFrame() {
    if (wallpaperTransitionFrame === null) return

    cancelAnimationFrame(wallpaperTransitionFrame)
    wallpaperTransitionFrame = null
  }

  function cancelSurfaceTransformFrame() {
    if (surfaceTransformFrame !== null) cancelAnimationFrame(surfaceTransformFrame)
    surfaceTransformFrame = null
    surfaceTransformTrackingDeadline = 0
    transformingSurfaces.clear()
  }

  function clearBackgroundDisposeTimer() {
    if (backgroundDisposeTimer === null) return

    window.clearTimeout(backgroundDisposeTimer)
    backgroundDisposeTimer = null
  }

  /** 源纹理与磨砂预滤目标共享同一壁纸生命周期，必须成对释放。 */
  function disposeWallpaperResources(texture: Texture | null, frostedTarget: WebGLRenderTarget | null) {
    texture?.dispose()
    frostedTarget?.dispose()
  }

  /** 释放已完成过渡的旧纹理，并让两个采样槽继续指向同一稳定壁纸。 */
  function finishWallpaperTransition() {
    if (!resources || !activeTexture) return

    if (previousTexture && previousTexture !== activeTexture) {
      disposeWallpaperResources(previousTexture, previousFrostedTarget)
    }
    previousTexture = null
    previousFrostedTarget = null
    previousTextureHeight = activeTextureHeight
    previousTextureWidth = activeTextureWidth
    previousWallpaperExposure = activeWallpaperExposure
    resources.uniforms.uPreviousTexture.value = activeTexture
    resources.uniforms.uPreviousFrostedTexture.value = activeFrostedTarget?.texture ?? activeTexture
    resources.uniforms.uPreviousCoverScale.value.copy(resources.uniforms.uCoverScale.value)
    resources.uniforms.uPreviousWallpaperExposure.value = activeWallpaperExposure
    resources.uniforms.uTextureMix.value = 1
    wallpaperTransitionStartedAt = 0
    wallpaperActivationRollback = null
    cancelWallpaperTransitionFrame()
  }

  /** 使用外层壁纸的 CSS ease 时钟推进双纹理，不创建常驻动画帧。 */
  function updateWallpaperTransition(timestamp: number) {
    if (!resources || !previousTexture) return false

    const duration = toValue(options.transitionDuration ?? 0)
    const progress = getGlassWallpaperTransitionProgress(timestamp - wallpaperTransitionStartedAt, duration)
    resources.uniforms.uTextureMix.value = progress
    if (progress >= 1) {
      finishWallpaperTransition()
      return false
    }

    return true
  }

  function renderWallpaperTransitionFrame(timestamp: number) {
    wallpaperTransitionFrame = null
    if (document.visibilityState === 'hidden') return

    renderFrame(timestamp)
    if (previousTexture && wallpaperTransitionFrame === null) {
      wallpaperTransitionFrame = requestAnimationFrame(renderWallpaperTransitionFrame)
    }
  }

  function scheduleWallpaperTransition() {
    if (wallpaperTransitionFrame !== null || !previousTexture || document.visibilityState === 'hidden') return

    wallpaperTransitionFrame = requestAnimationFrame(renderWallpaperTransitionFrame)
  }

  /** 释放壁纸准备阶段复用的预滤 shader；活动低通纹理由各自 RenderTarget 单独持有。 */
  function disposeFrostPrefilterResources() {
    if (!frostPrefilterResources) return

    frostPrefilterResources.material.dispose()
    frostPrefilterResources = null
  }

  /** 为当前 WebGL context 创建一次性低分辨率壁纸预滤管线。 */
  function getFrostPrefilterResources() {
    if (frostPrefilterResources) return frostPrefilterResources
    if (!resources || !three) return null

    const uniforms = {
      uDirection: { value: new three.Vector2(1, 0) },
      uTexture: { value: null },
      uTextureSize: { value: new three.Vector2(1, 1) },
    }
    const material = new three.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      fragmentShader: FROST_PREFILTER_FRAGMENT_SHADER,
      uniforms,
      vertexShader: VERTEX_SHADER,
    })
    const scene = new three.Scene()
    const mesh = new three.Mesh(resources.geometry, material)
    mesh.frustumCulled = false
    scene.add(mesh)
    frostPrefilterResources = { material, mesh, scene, uniforms }

    return frostPrefilterResources
  }

  /** 壁纸上传时执行两次 separable blur，常态只保留既定分辨率的低通 RenderTarget。 */
  async function createFrostedWallpaperTarget(texture: Texture, width: number, height: number, targetLongEdge: number) {
    if (!resources || !three) return null

    const ownerResources = resources
    const prefilter = getFrostPrefilterResources()
    if (!prefilter) return null

    const targetScale = Math.min(1, targetLongEdge / Math.max(width, height))
    const targetWidth = Math.max(1, Math.round(width * targetScale))
    const targetHeight = Math.max(1, Math.round(height * targetScale))
    const createTarget = (generateMipmaps = false) =>
      new three!.WebGLRenderTarget(targetWidth, targetHeight, {
        depthBuffer: false,
        generateMipmaps,
        magFilter: three!.LinearFilter,
        minFilter: generateMipmaps ? three!.LinearMipmapLinearFilter : three!.LinearFilter,
        stencilBuffer: false,
      })
    const intermediateTarget = createTarget()
    const outputTarget = createTarget(true)
    const previousTarget = ownerResources.renderer.getRenderTarget()

    try {
      ownerResources.renderer.initTexture(texture)
      await ownerResources.renderer.compileAsync(prefilter.scene, ownerResources.camera)
      if (resources !== ownerResources) {
        outputTarget.dispose()
        return null
      }

      prefilter.uniforms.uDirection.value.set(1, 0)
      prefilter.uniforms.uTexture.value = texture
      prefilter.uniforms.uTextureSize.value.set(width, height)
      ownerResources.renderer.setRenderTarget(intermediateTarget)
      ownerResources.renderer.render(prefilter.scene, ownerResources.camera)

      prefilter.uniforms.uDirection.value.set(0, 1)
      prefilter.uniforms.uTexture.value = intermediateTarget.texture
      // 两轴都按原图像素定义核半径；低分辨率 target 只负责存储，不放大纵向采样步长。
      prefilter.uniforms.uTextureSize.value.set(width, height)
      ownerResources.renderer.setRenderTarget(outputTarget)
      ownerResources.renderer.render(prefilter.scene, ownerResources.camera)

      return outputTarget
    } catch (error) {
      outputTarget.dispose()
      throw error
    } finally {
      if (resources === ownerResources) ownerResources.renderer.setRenderTarget(previousTarget)
      intermediateTarget.dispose()
    }
  }

  /** 释放仅由高质量档使用的短时液态位移场。 */
  function disposeFluidDynamics() {
    if (!fluidDynamics) return

    fluidDynamics.dispose()
    fluidDynamics = null
    if (resources) {
      resources.uniforms.uFlowTexture.value = null
      resources.uniforms.uHasFlowTexture.value = 0
    }
  }

  /** 释放只由水漾模式持有的时序场，并断开主材质纹理。 */
  function disposeRippleResources() {
    dynamicsGeneration += 1
    rippleResources?.dispose()
    rippleResources = null
    if (!resources) return

    resources.uniforms.uRippleTexture.value = null
    resources.uniforms.uHasRippleTexture.value = 0
    resources.uniforms.uRippleTexelSize.value.set(1, 1)
  }

  /** 根据当前质量档创建或释放共享 renderer 内的液态位移场。 */
  function syncFluidDynamics() {
    if (!resources || !three) return

    const profile = getRenderProfile()
    if (!hasFluidCapability() || !profile.flowField) {
      disposeFluidDynamics()
      return
    }
    if (fluidDynamics) return

    fluidDynamics = createGlassFluidDynamics({
      camera: resources.camera,
      geometry: resources.geometry,
      pointer: resources.uniforms.uPointer.value,
      renderer: resources.renderer,
      three,
      velocity: resources.uniforms.uPointerVelocity.value,
    })
    resources.uniforms.uHasFlowTexture.value = 1
  }

  /** 只在水漾被选中时为当前 context 编译并分配独占 ping-pong 场。 */
  async function syncRippleResources() {
    if (!resources || !three) return
    if (!hasRippleCapability()) {
      disposeRippleResources()
      return
    }
    if (rippleResources) return

    const ownerResources = resources
    const generation = ++dynamicsGeneration
    const quality: GlassRippleQuality = toValue(options.quality) === 'high' ? 'high' : 'balanced'
    let ripple: GlassRippleDynamics
    try {
      ripple = await createGlassRippleDynamics({
        camera: ownerResources.camera,
        geometry: ownerResources.geometry,
        quality,
        renderer: ownerResources.renderer,
        three,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      })
    } catch (error) {
      if (generation !== dynamicsGeneration || resources !== ownerResources || !hasRippleCapability()) return
      throw error
    }
    if (generation !== dynamicsGeneration || resources !== ownerResources || !hasRippleCapability()) {
      ripple.dispose()
      return
    }

    rippleResources = ripple
    ripple.setParameters(
      toValue(options.translationStrength ?? getLegacyDynamicStrength()),
      toValue(options.flowStrength ?? getLegacyDynamicStrength()),
    )
    ownerResources.uniforms.uRippleTexture.value = ripple.texture
    ownerResources.uniforms.uRippleTexelSize.value.copy(ripple.texelSize)
    ownerResources.uniforms.uHasRippleTexture.value = ripple.texture ? 1 : 0
  }

  /** 模式切换时同步释放旧策略、清空输入历史并在资源就绪后恢复订阅。 */
  async function syncDynamicsMode() {
    if (!resources) return

    interactionAnimating = false
    activeTouchIdentifier = null
    cancelScheduledFrame()
    removeInteractionEvents()
    resetInteractionState()
    lastPointerAt = 0
    lastPointerX = window.innerWidth * 0.5
    lastPointerY = window.innerHeight * 0.5
    suppressNextPointerVelocity = true
    wakeDirection = { x: 0, y: -1 }

    const mode = getDynamicsMode()
    resources.uniforms.uDynamicsMode.value = getDynamicsModeUniformValue()
    resources.uniforms.uTranslationStrength.value = mode === 'fluid' ? getTranslationStrengthScale() : 0
    resources.uniforms.uDeformationStrength.value = mode === 'fluid' ? getDeformationStrengthScale() : 0
    resources.uniforms.uFlowStrength.value = mode === 'fluid' ? getFlowStrengthScale() : 0
    resources.uniforms.uMotionExpansion.value = mode === 'fluid' ? getMotionExpansion() : 0
    resources.uniforms.uMaxRefractionPixels.value = getMaxRefractionPixels()
    resources.uniforms.uRippleDeformationStrength.value =
      mode === 'ripple'
        ? Math.min(1, Math.max(0, toValue(options.deformationStrength ?? getLegacyDynamicStrength()) / 100))
        : 0
    resources.uniforms.uTrailCount.value = mode === 'fluid' ? getRenderProfile().trailCount : 0

    if (mode === 'fluid') {
      disposeRippleResources()
      syncFluidDynamics()
    } else if (mode === 'ripple') {
      disposeFluidDynamics()
      await syncRippleResources()
    } else {
      disposeFluidDynamics()
      disposeRippleResources()
    }

    if (!resources || getDynamicsMode() !== mode) return

    if (mode !== 'off') setupInteractionEvents()
    resizeRenderer()
    scheduleFrame()
  }

  function renderFrame(timestamp = performance.now(), advanceFlow = true) {
    if (!resources || !toValue(options.active) || document.visibilityState === 'hidden') return

    updateWallpaperTransition(timestamp)
    if (fluidDynamics && advanceFlow) {
      resources.uniforms.uFlowTexture.value = fluidDynamics.step()
    }
    if (presentationSpace === 'scroll') {
      const { height: presentationHeight } = getCommittedPresentationSize()
      const scaleY = presentationBufferHeight / Math.max(presentationHeight, 1)
      const scissorY = Math.max(0, Math.floor((presentationHeight - window.scrollY - window.innerHeight) * scaleY))
      const scissorHeight = Math.min(presentationBufferHeight - scissorY, Math.ceil(window.innerHeight * scaleY) + 2)
      resources.renderer.setScissorTest(true)
      resources.renderer.setScissor(0, scissorY, presentationBufferWidth, scissorHeight)
      resources.renderer.clear()
    } else {
      resources.renderer.setScissorTest(false)
    }
    resources.renderer.render(resources.scene, resources.camera)
    renderedFrames.value += 1
  }

  function renderScheduledFrame(timestamp: number) {
    animationFrame = null
    renderFrame(timestamp)
  }

  function scheduleFrame() {
    if (animationFrame !== null || !resources) return

    animationFrame = requestAnimationFrame(renderScheduledFrame)
  }

  /** 将稳定槽位及其短时交叉权重写入固定长度的 shader 协议。 */
  function writeSurfaceUniforms(timestamp = performance.now()) {
    if (!resources) return

    if (outgoingSurface && timestamp - surfaceTransitionStartedAt >= SURFACE_TRANSITION_DURATION_MS) {
      outgoingSurface = null
      surfaceSlots = surfaceSlots
        .filter(slot => slot.role !== 'outgoing')
        .map(slot => ({
          ...slot,
          role: slot.key === activeSurface ? ('active' as const) : ('stable' as const),
        }))
    }

    const presentation = getCommittedPresentationSize()
    const normalizedInteractionClips = interactionClips.map(clip =>
      normalizeGlassOpticalRect(clip.rect, presentation.width, presentation.height),
    )
    const uniformInteractionRects = resources.uniforms.uInteractionRects.value
    const uniformInteractionRadii = resources.uniforms.uInteractionRadii.value
    for (let index = 0; index < 8; index += 1) {
      const clip = normalizedInteractionClips[index]
      const rect = clip?.rect ?? [0, 0, 0, 0]
      const radii = clip?.radii ?? [0, 0, 0, 0]
      uniformInteractionRects[index].set(rect[0], rect[1], rect[2], rect[3])
      uniformInteractionRadii[index].set(radii[0], radii[1], radii[2], radii[3])
    }
    resources.uniforms.uInteractionRectCount.value = normalizedInteractionClips.length
    const normalized = surfaceSlots.map(slot =>
      normalizeGlassOpticalRect(slot.rect, presentation.width, presentation.height),
    )
    const uniformRects = resources.uniforms.uRects.value
    const uniformRadii = resources.uniforms.uRadii.value
    const uniformWeights = resources.uniforms.uSurfaceWeights.value
    const uniformDynamics = resources.uniforms.uSurfaceDynamics.value
    const ownersWithVisibleInteractionClips = new Set(interactionClips.map(clip => clip.owner))
    const transitionWeights = outgoingSurface
      ? getGlassOpticalSurfaceTransitionWeights(timestamp - surfaceTransitionStartedAt, SURFACE_TRANSITION_DURATION_MS)
      : { incoming: 1, outgoing: 0 }
    const pageMotionOpacity =
      presentationSpace === 'scroll' && toValue(options.appearance) !== 'frosted'
        ? Math.min(1, Math.max(0, toValue(options.pageMotion?.opacity ?? 1)))
        : 1
    const pagePresentationWeight = pagePresentationGeometryReady ? pageMotionOpacity : 0

    for (let index = 0; index < 8; index += 1) {
      const surface = normalized[index]
      const slot = surfaceSlots[index]
      const rect = surface?.rect ?? [0, 0, 0, 0]
      const radii = surface?.radii ?? [0, 0, 0, 0]
      uniformRects[index].set(rect[0], rect[1], rect[2], rect[3])
      uniformRadii[index].set(radii[0], radii[1], radii[2], radii[3])
      const surfaceWeight =
        slot?.role === 'outgoing'
          ? transitionWeights.outgoing
          : slot?.role === 'active'
            ? transitionWeights.incoming
            : slot
              ? 1
              : 0
      uniformWeights[index] = surfaceWeight * pagePresentationWeight
      const nestedInteractionAvailable =
        !slot || !interactionClipConstrainedOwners.has(slot.key) || ownersWithVisibleInteractionClips.has(slot.key)
      uniformDynamics[index] = slot?.mode === 'static-material' || !nestedInteractionAvailable ? 0 : 1
    }

    resources.uniforms.uRectCount.value = normalized.length
  }

  /**
   * 材质父表面可折叠多个交互卡片；共享动态场只在最终输出时按真实卡片边界裁剪。
   * 活动卡优先占用固定预算，其余可见卡片继续消费同一时序场。
   */
  function refreshInteractionClipRegistry() {
    const seen = new Set<HTMLElement>()
    const candidates: GlassInteractionClipDescriptor[] = []
    const constrainedOwners = new Set<HTMLElement>()
    const append = (
      element: HTMLElement,
      owner: HTMLElement,
      mode: GlassOpticalSurfaceMode,
      committedRect?: GlassOpticalRect,
    ) => {
      if (
        seen.has(element) ||
        !element.isConnected ||
        !isGlassOpticalElementEligible(element) ||
        resolveGlassOpticalSurfaceMode(element) !== mode
      ) {
        return
      }

      const rect = committedRect ?? getElementPresentationRect(element)

      seen.add(element)
      candidates.push({ key: element, mode, owner, rect })
    }

    for (const surface of surfaceRegistry) {
      const mode = surface.mode ?? 'dynamic'
      if (mode === 'static-material') continue

      // 显式 optical boundary 自身定义完整材质边界；嵌套交互卡只承载其内部内容。
      if (surface.key.matches(OPTICAL_BOUNDARY_SELECTOR)) {
        append(surface.key, surface.key, mode, surface.rect)
        continue
      }

      const surfaceIsClip = surface.key.matches(INTERACTION_CLIP_SELECTOR)
      if (surfaceIsClip) append(surface.key, surface.key, mode, surface.rect)
      const nestedClips = [...surface.key.querySelectorAll<HTMLElement>(INTERACTION_CLIP_SELECTOR)]
      if (nestedClips.length > 0) {
        constrainedOwners.add(surface.key)
        nestedClips.forEach(clip => append(clip, surface.key, mode))
      } else if (!surfaceIsClip) {
        append(surface.key, surface.key, mode, surface.rect)
      }
    }

    interactionClipRegistry = candidates
    interactionClipConstrainedOwners = constrainedOwners
    interactionClipMembershipDirty = false
  }

  /** 稳定帧复用成员集合；顶层 clip 直接复用 surface collector 已提交的矩形。 */
  function refreshInteractionClipGeometry() {
    const committedSurfaces = new Map(surfaceRegistry.map(surface => [surface.key, surface]))
    interactionClipRegistry = interactionClipRegistry.flatMap(clip => {
      if (
        !clip.key.isConnected ||
        !clip.owner.isConnected ||
        !isGlassOpticalElementEligible(clip.key) ||
        !isGlassOpticalElementEligible(clip.owner) ||
        resolveGlassOpticalSurfaceMode(clip.key) !== clip.mode ||
        !committedSurfaces.has(clip.owner)
      ) {
        return []
      }

      const rect = committedSurfaces.get(clip.key)?.rect ?? getElementPresentationRect(clip.key)
      return [{ ...clip, rect }]
    })
  }

  function isInteractionClipRenderable(rect: GlassOpticalRect) {
    return rect.width >= 24 && rect.height >= 24
  }

  function updateInteractionClips() {
    const slotKeys = new Set(surfaceSlots.map(slot => slot.key))
    const viewportX = presentationSpace === 'scroll' ? window.scrollX : 0
    const viewportY = presentationSpace === 'scroll' ? window.scrollY : 0
    const interactionPoint = getPresentationPoint(lastPointerX, lastPointerY)
    const candidates = interactionClipRegistry
      .filter(candidate => slotKeys.has(candidate.owner))
      .map(candidate => {
        const { rect } = candidate
        const visibleWidth = Math.min(viewportX + window.innerWidth, rect.x + rect.width) - Math.max(viewportX, rect.x)
        const visibleHeight =
          Math.min(viewportY + window.innerHeight, rect.y + rect.height) - Math.max(viewportY, rect.y)
        const inOverscan =
          rect.x + rect.width >= viewportX - INTERACTION_CLIP_OVERSCAN_PX &&
          rect.x <= viewportX + window.innerWidth + INTERACTION_CLIP_OVERSCAN_PX &&
          rect.y + rect.height >= viewportY - INTERACTION_CLIP_OVERSCAN_PX &&
          rect.y <= viewportY + window.innerHeight + INTERACTION_CLIP_OVERSCAN_PX
        const distance = Math.hypot(
          rect.x + rect.width * 0.5 - interactionPoint.x,
          rect.y + rect.height * 0.5 - interactionPoint.y,
        )

        return {
          candidate,
          distance,
          visible: visibleWidth >= 24 && visibleHeight >= 24,
          inOverscan,
        }
      })
      .filter(
        entry =>
          isInteractionClipRenderable(entry.candidate.rect) &&
          (entry.candidate.key === activeInteractionClip || entry.inOverscan),
      )
      .sort((left, right) => {
        const leftActive = left.candidate.key === activeInteractionClip
        const rightActive = right.candidate.key === activeInteractionClip
        if (leftActive !== rightActive) return leftActive ? -1 : 1
        if (left.visible !== right.visible) return left.visible ? -1 : 1

        return left.distance - right.distance
      })
      .map(entry => entry.candidate)

    const maxCount = window.innerWidth <= 600 ? GLASS_OPTICAL_MAX_SURFACES_MOBILE : GLASS_OPTICAL_MAX_SURFACES_DESKTOP
    interactionClips = candidates.slice(0, maxCount)
  }

  /** 从缓存的 document-space 几何选择当前可见表面并提交 shader slot。 */
  function updateVisibleSurfaceUniforms(timestamp: number) {
    const viewportWidth = window.innerWidth
    availableSurfaces = selectVisibleGlassOpticalSurfaceDescriptors(
      surfaceRegistry,
      viewportWidth,
      window.innerHeight,
      presentationSpace,
    )
    const availableKeys = new Set(availableSurfaces.map(surface => surface.key))
    if (activeSurface && !availableKeys.has(activeSurface)) {
      activeSurface = null
      activeInteractionClip = null
    }
    if (outgoingSurface && !availableKeys.has(outgoingSurface)) outgoingSurface = null
    const interactionClipKeys = new Set(interactionClipRegistry.map(clip => clip.key))
    if (activeInteractionClip && !interactionClipKeys.has(activeInteractionClip)) activeInteractionClip = null
    const maxCount = viewportWidth <= 600 ? GLASS_OPTICAL_MAX_SURFACES_MOBILE : GLASS_OPTICAL_MAX_SURFACES_DESKTOP
    surfaceSlots = reconcileGlassOpticalSurfaceSlots(
      surfaceSlots,
      availableSurfaces,
      maxCount,
      activeSurface ?? undefined,
      outgoingSurface ?? undefined,
    )
    updateInteractionClips()
    writeSurfaceUniforms(timestamp)
  }

  function updateSurfaceUniforms(timestamp = performance.now(), scheduleRender = true) {
    if (!resources) return

    const viewportWidth = window.innerWidth
    const nextObservedSurfaces: HTMLElement[] = []
    surfaceRegistry = collectGlassOpticalSurfaceDescriptors(
      viewportWidth,
      window.innerHeight,
      toValue(options.appearance),
      presentationSpace,
      true,
      nextObservedSurfaces,
    )
    if (interactionClipMembershipDirty) refreshInteractionClipRegistry()
    else refreshInteractionClipGeometry()
    updateVisibleSurfaceUniforms(timestamp)

    const observedSurfacesChanged =
      nextObservedSurfaces.length !== observedSurfaces.length ||
      nextObservedSurfaces.some((element, index) => element !== observedSurfaces[index])

    if (observedSurfacesChanged) {
      observedSurfaces = nextObservedSurfaces
      observeResizeTargets()
    }
    if (scheduleRender) scheduleFrame()
  }

  /**
   * 滚动事务内的几何失效共用一个稳定尾帧。
   * 虚拟列表若在当前滚动帧提交后才挂载节点，必须在本次绘制前同步新蒙版。
   */
  function queueScrollGeometryRefresh(stabilize: boolean) {
    if (presentationSpace !== 'scroll' || scrollAnimationFrame === null || !resources) return false

    scrollSurfaceStabilityPending ||= stabilize
    scrollStableFrameCount = 0
    if (!scrollFrameCommitted) {
      scrollGeometryRefreshPending = true
      return true
    }
    if (scrollLateGeometryCommitted) return true

    scrollLateGeometryCommitted = true
    scrollGeometryRefreshPending = false
    const timestamp = performance.now()
    updateSurfaceUniforms(timestamp, false)
    renderFrame(timestamp, false)
    return true
  }

  function scheduleSurfaceUpdate() {
    if (queueScrollGeometryRefresh(false)) return
    if (surfaceUpdateFrame !== null || !resources) return

    surfaceUpdateFrame = requestAnimationFrame(timestamp => {
      surfaceUpdateFrame = null
      updateSurfaceUniforms(timestamp, false)
      // 表面失效必须在同一有界帧内清除旧像素，不能等待下一次指针或壁纸事件。
      renderFrame(timestamp, false)
    })
  }

  /** DOM 重排后连续采样少量帧，避免把虚拟列表的中间几何误认为最终表面。 */
  function scheduleSurfaceStabilityUpdate(motionEpoch?: number) {
    if (motionEpoch !== undefined) pagePresentationMotionEpoch = motionEpoch
    if (queueScrollGeometryRefresh(true)) return
    surfaceStabilityPass = 0
    surfaceStableFrameCount = 0
    lastSurfaceGeometrySignature = ''
    if (surfaceStabilityFrame !== null || !resources) return

    const sample = (timestamp: number) => {
      surfaceStabilityFrame = null
      if (!resources || !toValue(options.active) || document.visibilityState === 'hidden') return

      updateSurfaceUniforms(timestamp, false)
      const signature = surfaceSlots
        .map(slot => {
          const { height, width, x, y } = slot.rect
          return `${x.toFixed(2)},${y.toFixed(2)},${width.toFixed(2)},${height.toFixed(2)}`
        })
        .join('|')
      surfaceStableFrameCount = signature === lastSurfaceGeometrySignature ? surfaceStableFrameCount + 1 : 0
      lastSurfaceGeometrySignature = signature
      surfaceStabilityPass += 1
      // DOM 删除和虚拟列表重排只刷新合成几何，不推进已有液态流场。
      renderFrame(timestamp, false)

      if (
        surfaceStableFrameCount < SURFACE_STABILITY_REQUIRED_FRAMES &&
        surfaceStabilityPass < SURFACE_STABILITY_MAX_FRAMES
      ) {
        surfaceStabilityFrame = requestAnimationFrame(sample)
      } else if (!pagePresentationGeometryReady) {
        pagePresentationGeometryReady = true
        writeSurfaceUniforms(timestamp)
        renderFrame(timestamp, false)
        const acknowledgedEpoch = pagePresentationMotionEpoch
        pagePresentationMotionEpoch = null
        if (acknowledgedEpoch !== null) {
          options.pageMotion?.acknowledgeGeometryReady(acknowledgedEpoch, timestamp)
        }
      }
    }

    surfaceStabilityFrame = requestAnimationFrame(sample)
  }

  /**
   * 页面根的 scrollHeight 可能在 content box 稳定后继续收敛。
   * 连续两个 80ms 样本一致才允许覆盖已提交的 presentation 首帧。
   */
  function schedulePresentationResizeUpdate() {
    if (presentationResizeTimer !== null) window.clearTimeout(presentationResizeTimer)
    presentationResizeCandidate = ''
    presentationResizeStableSamples = 0

    const sample = () => {
      presentationResizeTimer = null
      if (!resources) return

      const presentation = measurePresentationSize()
      const candidate = `${window.innerWidth},${window.innerHeight},${presentation.width},${presentation.height}`
      presentationResizeStableSamples =
        candidate === presentationResizeCandidate ? presentationResizeStableSamples + 1 : 1
      presentationResizeCandidate = candidate
      if (presentationResizeStableSamples >= PRESENTATION_RESIZE_REQUIRED_SAMPLES) {
        resizeRenderer()
        presentationResizeCandidate = ''
        presentationResizeStableSamples = 0
        return
      }

      presentationResizeTimer = window.setTimeout(sample, PRESENTATION_RESIZE_SAMPLE_MS)
    }

    presentationResizeTimer = window.setTimeout(sample, PRESENTATION_RESIZE_SAMPLE_MS)
  }

  /** 共享页面 motion 活跃时，页面几何变化必须在浏览器绘制前完成一次完整 presentation 提交。 */
  function commitActivePagePresentation(timestamp = performance.now()) {
    if (!resources || presentationSpace !== 'scroll' || !toValue(options.pageMotion?.active ?? false)) return false

    if (presentationResizeTimer !== null) window.clearTimeout(presentationResizeTimer)
    presentationResizeTimer = null
    presentationResizeCandidate = ''
    presentationResizeStableSamples = 0
    resizeRenderer()
    updateSurfaceUniforms(timestamp, false)
    renderFrame(timestamp, false)

    return true
  }

  /** 普通表面尺寸即时更新；页面根尺寸在稳定后覆盖 presentation。 */
  function handleSurfaceResize(entries: ResizeObserverEntry[]) {
    if (!resources) return

    const presentationRoot = presentationSpace === 'scroll' ? options.canvas.value?.parentElement : null
    const presentationChanged = presentationRoot && entries.some(entry => entry.target === presentationRoot)
    if (presentationChanged && commitActivePagePresentation()) return
    if (presentationChanged) schedulePresentationResizeUpdate()
    if (!entries.some(entry => entry.target !== presentationRoot)) return
    if (queueScrollGeometryRefresh(false)) return

    const timestamp = performance.now()
    updateSurfaceUniforms(timestamp, false)
    renderFrame(timestamp, false)
  }

  /** CSS transform 不改变布局尺寸，过渡期间用有界帧同步真实几何并清除旧蒙版。 */
  function scheduleSurfaceTransformFrame() {
    if (queueScrollGeometryRefresh(false)) return
    if (surfaceTransformFrame !== null || !resources) return

    surfaceTransformFrame = requestAnimationFrame(timestamp => {
      surfaceTransformFrame = null
      if (!resources || !toValue(options.active) || document.visibilityState === 'hidden') {
        cancelSurfaceTransformFrame()
        return
      }

      updateSurfaceUniforms(timestamp, false)
      renderFrame(timestamp, false)
      if (transformingSurfaces.size > 0 && timestamp < surfaceTransformTrackingDeadline) {
        scheduleSurfaceTransformFrame()
      } else {
        transformingSurfaces.clear()
        scheduleSurfaceStabilityUpdate()
      }
    })
  }

  function resolveTransitionSurface(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return null

    const surface = target.matches(SURFACE_SELECTOR_QUERY)
      ? target
      : target.closest<HTMLElement>(SURFACE_SELECTOR_QUERY)
    if (!surface || !isGlassOpticalElementEligible(surface)) return null

    return SURFACE_SELECTORS.some(
      ({ selector, space }) =>
        surface.matches(selector) && getSurfacePresentationSpace(selector, space) === presentationSpace,
    )
      ? surface
      : null
  }

  function handleSurfaceTransitionRun(event: TransitionEvent) {
    if (event.propertyName !== 'transform') return

    const surface = resolveTransitionSurface(event.target)
    if (!surface) return

    transformingSurfaces.add(surface)
    surfaceTransformTrackingDeadline = performance.now() + SURFACE_TRANSFORM_TRACKING_MAX_MS
    scheduleSurfaceTransformFrame()
  }

  function handleSurfaceTransitionEnd(event: TransitionEvent) {
    if (event.propertyName !== 'transform') return

    const surface = resolveTransitionSurface(event.target)
    if (!surface) return

    transformingSurfaces.delete(surface)
    if (transformingSurfaces.size === 0) scheduleSurfaceStabilityUpdate()
  }

  function syncCoverScale(viewportWidth = window.innerWidth, viewportHeight = window.innerHeight) {
    if (!resources) return

    const cover = getGlassCoverScale(viewportWidth, viewportHeight, activeTextureWidth, activeTextureHeight)
    const previousCover = getGlassCoverScale(viewportWidth, viewportHeight, previousTextureWidth, previousTextureHeight)
    resources.uniforms.uCoverScale.value.set(cover.x, cover.y)
    resources.uniforms.uPreviousCoverScale.value.set(previousCover.x, previousCover.y)
  }

  function getRenderProfile(routeKey = toValue(options.routeKey)) {
    return getGlassOpticalRenderProfile(toValue(options.quality), routeKey)
  }

  function getWallpaperPreparationKey(url: string) {
    return getGlassWallpaperPreparationKey(
      toValue(options.appearance),
      toValue(options.quality),
      toValue(options.routeKey),
      url,
    )
  }

  /** 清理当前 context 的 prepared bundle，但不改变活动或上一张纹理。 */
  function releasePreparedWallpaper() {
    if (preparedWallpaper) {
      disposeWallpaperResources(preparedWallpaper.texture, preparedWallpaper.frostedTarget)
    }
    preparedWallpaper = null
    preparedWallpaperUrl.value = ''
    preparedWallpaperRevision.value = 0
    preparedWallpaperPreparationKey.value = ''
  }

  /** 清除上一笔准备失败身份，避免旧错误取消后续 revision。 */
  function clearPreparedWallpaperFailure() {
    failedWallpaperUrl.value = ''
    failedWallpaperRevision.value = 0
    failedWallpaperPreparationKey.value = ''
  }

  /** 使所有进行中的准备任务失效，迟到结果只能释放自身资源。 */
  function invalidatePreparedWallpaper() {
    prepareVersion += 1
    releasePreparedWallpaper()
    clearPreparedWallpaperFailure()
  }

  function preparePendingWallpaper() {
    const url = toValue(options.pendingWallpaperUrl ?? '')
    const revision = toValue(options.pendingWallpaperRevision ?? 0)
    if (url && revision > 0) void prepareWallpaper(url, revision)
  }

  function getLegacyDynamicStrength() {
    return toValue(options.motionStrength ?? GLASS_OPTICAL_STRENGTH_DEFAULT)
  }

  function getDynamicsMode(): ThemeCustomizerGlassDynamicsMode {
    if (!toValue(options.dynamicsActive ?? true)) return 'off'

    return toValue(options.dynamicsMode ?? 'fluid')
  }

  function hasDynamicCapability() {
    return getDynamicsMode() !== 'off'
  }

  function hasFluidCapability() {
    return getDynamicsMode() === 'fluid'
  }

  function hasRippleCapability() {
    return getDynamicsMode() === 'ripple'
  }

  function getDynamicsModeUniformValue() {
    const mode = getDynamicsMode()

    return mode === 'fluid' ? 0 : mode === 'ripple' ? 1 : 2
  }

  function getTranslationStrengthScale() {
    if (!hasFluidCapability()) return 0

    return getGlassOpticalTranslationStrengthScale(toValue(options.translationStrength ?? getLegacyDynamicStrength()))
  }

  function getDeformationStrengthScale() {
    if (!hasFluidCapability()) return 0

    return getGlassOpticalDeformationStrengthScale(toValue(options.deformationStrength ?? getLegacyDynamicStrength()))
  }

  function getFlowStrengthScale() {
    if (!hasFluidCapability()) return 0

    return getGlassOpticalFlowStrengthScale(toValue(options.flowStrength ?? getLegacyDynamicStrength()))
  }

  function getMotionExpansion() {
    if (!hasFluidCapability()) return 0

    return getGlassOpticalMotionExpansion(toValue(options.flowStrength ?? getLegacyDynamicStrength()))
  }

  function getMaxRefractionPixels() {
    if (!hasDynamicCapability()) return 0

    if (hasRippleCapability()) {
      const deformation = Math.min(
        1,
        Math.max(0, toValue(options.deformationStrength ?? getLegacyDynamicStrength()) / 100),
      )

      return (toValue(options.quality) === 'high' ? 40 : 28) * deformation
    }

    return getGlassOpticalMaxRefractionPixels(
      getRenderProfile().maxRefractionPixels,
      toValue(options.deformationStrength ?? getLegacyDynamicStrength()),
    )
  }

  function getReflectionStrengthScale() {
    return getGlassOpticalReflectionStrengthScale(toValue(options.reflectionStrength ?? GLASS_OPTICAL_STRENGTH_DEFAULT))
  }

  function getMaterialResponse() {
    return getGlassMaterialResponse(
      toValue(options.appearance),
      toValue(options.transparencyStrength ?? GLASS_OPTICAL_STRENGTH_DEFAULT),
    )
  }

  function resizeRenderer() {
    if (!resources) return

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const presentation = measurePresentationSize()
    const profile = getRenderProfile()
    const buffer =
      presentationSpace === 'scroll'
        ? getGlassScrollBufferSize(
            presentation.width,
            presentation.height,
            profile.bufferQuality,
            window.devicePixelRatio,
          )
        : getGlassOpticalBufferSize(
            viewportWidth,
            viewportHeight,
            viewportWidth <= 600,
            profile.bufferQuality,
            window.devicePixelRatio,
          )
    const bufferChanged = presentationBufferWidth !== buffer.width || presentationBufferHeight !== buffer.height
    const presentationChanged =
      resources.uniforms.uPresentationSize.value.x !== presentation.width ||
      resources.uniforms.uPresentationSize.value.y !== presentation.height
    presentationBufferHeight = buffer.height
    presentationBufferWidth = buffer.width
    if (bufferChanged) resources.renderer.setSize(buffer.width, buffer.height, false)
    resources.uniforms.uVisibleViewportSize.value.set(viewportWidth, viewportHeight)
    resources.uniforms.uPresentationSize.value.set(presentation.width, presentation.height)
    resources.uniforms.uScrollOffset.value.set(
      presentationSpace === 'scroll' ? window.scrollX : 0,
      presentationSpace === 'scroll' ? window.scrollY : 0,
    )
    fluidDynamics?.resize(buffer.width, buffer.height, viewportWidth, viewportHeight)
    if (rippleResources) {
      rippleResources.resize(viewportWidth, viewportHeight)
      resources.uniforms.uRippleTexture.value = rippleResources.texture
      resources.uniforms.uRippleTexelSize.value.copy(rippleResources.texelSize)
      resources.uniforms.uHasRippleTexture.value = rippleResources.texture ? 1 : 0
    }
    syncCoverScale(viewportWidth, viewportHeight)
    updateSurfaceUniforms(performance.now(), false)
    // buffer 重分配或归一化呈现尺寸变化都必须在当前绘制周期提交稳定画面。
    if (bufferChanged || presentationChanged) renderFrame(performance.now(), false)
    else scheduleSurfaceUpdate()
  }

  function profileRequiresTextureReload(
    previousProfile: ReturnType<typeof getGlassOpticalRenderProfile>,
    nextProfile: ReturnType<typeof getGlassOpticalRenderProfile>,
  ) {
    const wallpaperUrl = toValue(options.wallpaperUrl)
    const resolveTextureSource = (profile: ReturnType<typeof getGlassOpticalRenderProfile>) =>
      profile.textureSource === 'auto'
        ? canUseGlassWallpaperTexture(wallpaperUrl, window.location.href)
          ? 'wallpaper'
          : 'procedural'
        : profile.textureSource

    return (
      previousProfile.textureLimit !== nextProfile.textureLimit ||
      resolveTextureSource(previousProfile) !== resolveTextureSource(nextProfile)
    )
  }

  function rectContainsPoint(rect: GlassOpticalRect, x: number, y: number) {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
  }

  /** 折叠的交互卡片不占用材质槽，但动态反馈仍应限制在其真实圆角边界内。 */
  function findInteractionTarget(x: number, y: number) {
    if (availableSurfaces.length === 0) updateSurfaceUniforms()

    const surface = availableSurfaces.find(
      candidate => isGlassOpticalElementEligible(candidate.key) && rectContainsPoint(candidate.rect, x, y),
    )
    if (!surface) return null

    const matchingClips = interactionClipRegistry
      .filter(
        candidate =>
          candidate.owner === surface.key &&
          isGlassOpticalElementEligible(candidate.key) &&
          isInteractionClipRenderable(candidate.rect) &&
          rectContainsPoint(candidate.rect, x, y),
      )
      .sort((left, right) => left.rect.width * left.rect.height - right.rect.width * right.rect.height)

    return {
      clip: matchingClips[0]?.key ?? surface.key,
      surface,
    }
  }

  /**
   * 跨表面移动只交接活动身份，不重排其余槽位或让轨迹穿过卡片间隙。
   * 已在预算内的表面保持完整权重；只有预算外表面进入时才让被替换表面单调淡出。
   */
  function activateInteractionSurface(surface: HTMLElement, timestamp: number, reducedMotion: boolean) {
    if (activeSurface === surface) {
      return false
    }

    const surfaceAlreadyHasSlot = surfaceSlots.some(slot => slot.key === surface)
    outgoingSurface = reducedMotion || surfaceAlreadyHasSlot ? null : activeSurface
    activeSurface = surface
    surfaceTransitionStartedAt = timestamp
    const maxCount = window.innerWidth <= 600 ? GLASS_OPTICAL_MAX_SURFACES_MOBILE : GLASS_OPTICAL_MAX_SURFACES_DESKTOP
    surfaceSlots = reconcileGlassOpticalSurfaceSlots(
      surfaceSlots,
      availableSurfaces,
      maxCount,
      activeSurface,
      outgoingSurface ?? undefined,
    )
    updateInteractionClips()
    writeSurfaceUniforms(timestamp)

    return true
  }

  /** 指针位置只在真实输入事件内推进，停止后由能量衰减负责收敛。 */
  function updatePointerTarget(x: number, y: number, response: number) {
    if (!resources) return

    pointerTargetX = x
    pointerTargetY = y
    const clampedResponse = Math.min(1, Math.max(0, response))
    pointerPositionX += (pointerTargetX - pointerPositionX) * clampedResponse
    pointerPositionY += (pointerTargetY - pointerPositionY) * clampedResponse
    resources.uniforms.uPointer.value.set(pointerPositionX, pointerPositionY)
  }

  function snapPointer(x: number, y: number) {
    pointerTargetX = x
    pointerTargetY = y
    pointerPositionX = x
    pointerPositionY = y
    resources?.uniforms.uPointer.value.set(x, y)
  }

  /** 快速输入在单次事件内补齐视口路径，避免事件稀疏时只留下孤立触点。 */
  function updateTrail(
    x: number,
    y: number,
    timestamp: number,
    previousNormalizedX: number,
    previousNormalizedY: number,
  ) {
    if (!resources) return

    const presentation = getCommittedPresentationSize()
    const normalizedX = x / Math.max(presentation.width, 1)
    const normalizedY = 1 - y / Math.max(presentation.height, 1)
    const distance = Math.hypot(normalizedX - previousNormalizedX, normalizedY - previousNormalizedY)
    if (timestamp - lastTrailAt < 36 && distance < 0.012) return

    const trail = resources.uniforms.uTrail.value
    const interpolatedSamples = Math.min(getRenderProfile().trailCount, Math.max(1, Math.ceil(distance / 0.045)))
    if (interpolatedSamples > 1) {
      for (let index = 0; index < trail.length; index += 1) {
        if (index >= interpolatedSamples) {
          trail[index].z = 0
          continue
        }

        const progress = index / (interpolatedSamples - 1)
        trail[index].set(
          normalizedX + (previousNormalizedX - normalizedX) * progress,
          normalizedY + (previousNormalizedY - normalizedY) * progress,
          1 - progress * 0.28,
          0,
        )
      }
      lastTrailAt = timestamp
      return
    }

    for (let index = trail.length - 1; index > 0; index -= 1) {
      trail[index].copy(trail[index - 1])
      trail[index].z *= 0.74
    }
    trail[0].set(normalizedX, normalizedY, 1, 0)
    lastTrailAt = timestamp
  }

  /** 清除短时交互能量，确保静止帧不保留时序流场或输入方向。 */
  function resetInteractionState() {
    pendingFlowInjection = 0
    lastInteractionFrameAt = 0
    lastTrailAt = Number.NEGATIVE_INFINITY
    activeInteractionClip = null
    interactionClips = []
    if (!resources) return

    snapPointer(pointerTargetX, pointerTargetY)
    resources.uniforms.uInteractionRectCount.value = 0
    resources.uniforms.uMotion.value = 0
    resources.uniforms.uPointerVelocity.value.set(0, 0)
    for (const trail of resources.uniforms.uTrail.value) trail.z = 0
    fluidDynamics?.clearInput()
  }

  function renderInteractionFrame(timestamp: number) {
    if (!resources || !toValue(options.active) || document.visibilityState === 'hidden') {
      animationFrame = null
      interactionAnimating = false
      return
    }

    if (hasRippleCapability()) {
      writeSurfaceUniforms(timestamp)
      const keepAnimating = advanceRipple(timestamp)
      renderFrame(timestamp, false)
      if (!keepAnimating) {
        resetInteractionState()
        interactionAnimating = false
        return
      }

      animationFrame = requestAnimationFrame(renderInteractionFrame)
      return
    }
    if (!hasFluidCapability()) {
      resetInteractionState()
      renderFrame(timestamp, false)
      interactionAnimating = false
      return
    }

    const profile = getRenderProfile()
    const elapsed = Math.max(0, timestamp - lastInteractionAt)
    const flowScale = getFlowStrengthScale()
    const durationScale = Math.max(0.35, 0.55 + flowScale * 0.45)
    const motionDuration = profile.motionDuration * durationScale
    const motionHalfLife = profile.motionHalfLife * durationScale
    const motion = getGlassOpticalMotionEnergy(elapsed, motionDuration, motionHalfLife)
    writeSurfaceUniforms(timestamp)
    if (motion <= 0) {
      resetInteractionState()
      renderFrame()
      interactionAnimating = false
      return
    }

    const delta = lastInteractionFrameAt > 0 ? Math.min(64, Math.max(0, timestamp - lastInteractionFrameAt)) : 16.67
    lastInteractionFrameAt = timestamp
    // 收敛期只衰减能量；输入方向保留到最终清场，避免低能量归一化时发生方向跳变。
    resources.uniforms.uMotion.value = motion
    fluidDynamics?.setFrameParameters(getGlassOpticalDecay(profile.flowHalfLife, delta), pendingFlowInjection)
    pendingFlowInjection = 0
    renderFrame()
    fluidDynamics?.finishFrame()
    animationFrame = requestAnimationFrame(renderInteractionFrame)
  }

  /** 推进并重新绑定当前 ripple 场，确保 deadline 清场与主材质纹理状态原子提交。 */
  function advanceRipple(timestamp: number) {
    if (!resources || !rippleResources || !hasRippleCapability()) return false

    const keepAnimating = rippleResources.step(timestamp)
    resources.uniforms.uRippleTexture.value = rippleResources.texture
    resources.uniforms.uRippleTexelSize.value.copy(rippleResources.texelSize)
    resources.uniforms.uHasRippleTexture.value = rippleResources.texture ? 1 : 0

    return keepAnimating
  }

  function startInteractionAnimation() {
    if (interactionAnimating) return

    cancelScheduledFrame()
    interactionAnimating = true
    lastInteractionFrameAt = 0
    animationFrame = requestAnimationFrame(renderInteractionFrame)
  }

  /** 将鼠标、触摸或滚动输入转换为共享液态状态。 */
  function applyInteraction(
    clientX: number,
    clientY: number,
    timestamp: number,
    velocityOverride?: { x: number; y: number },
    target?: EventTarget | null,
  ) {
    if (
      !hasDynamicCapability() ||
      (hasRippleCapability() && presentationSpace === 'scroll' && scrollWallpaperSamplingSuppressed)
    ) {
      return
    }
    if (target instanceof Element && isGlassOpticalElementExcluded(target)) return

    const viewportWidth = Math.max(window.innerWidth, 1)
    const viewportHeight = Math.max(window.innerHeight, 1)
    const presentation = getCommittedPresentationSize()
    const point = getPresentationPoint(clientX, clientY)
    const previousPoint = getPresentationPoint(lastPointerX, lastPointerY)
    const elapsed = Math.max(8, timestamp - lastPointerAt)
    const previousNormalizedX = previousPoint.x / Math.max(presentation.width, 1)
    const previousNormalizedY = 1 - previousPoint.y / Math.max(presentation.height, 1)
    const suppressVelocity = suppressNextPointerVelocity && velocityOverride === undefined
    const velocityX =
      velocityOverride?.x ??
      (suppressVelocity ? 0 : ((clientX - lastPointerX) / viewportWidth) * Math.min(2, 16.67 / elapsed))
    const velocityY =
      velocityOverride?.y ??
      (suppressVelocity ? 0 : (-(clientY - lastPointerY) / viewportHeight) * Math.min(2, 16.67 / elapsed))
    const velocityLength = Math.hypot(velocityX, velocityY)
    const velocityScale = velocityLength > 0.09 ? 0.09 / velocityLength : 1
    const interactionTarget = findInteractionTarget(point.x, point.y)
    lastPointerX = clientX
    lastPointerY = clientY
    lastPointerAt = timestamp
    suppressNextPointerVelocity = false
    if (!resources || !interactionTarget || interactionTarget.surface.mode === 'static-material') return

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const interactionClipChanged = activeInteractionClip !== interactionTarget.clip
    activeInteractionClip = interactionTarget.clip
    const surfaceChanged = activateInteractionSurface(interactionTarget.surface.key, timestamp, reducedMotion)
    if (interactionClipChanged && !surfaceChanged) {
      updateInteractionClips()
      writeSurfaceUniforms(timestamp)
    }
    const scaledVelocity = { x: velocityX * velocityScale, y: velocityY * velocityScale }
    if (hasRippleCapability()) {
      if (reducedMotion || !rippleResources) {
        resetInteractionState()
        scheduleFrame()
        return
      }

      rippleResources.inject({
        direction: scaledVelocity,
        point: {
          x: clientX / viewportWidth,
          y: 1 - clientY / viewportHeight,
        },
        speed: Math.min(1, velocityLength / 0.09),
        timestamp,
      })
      resources.uniforms.uMotion.value = 0
      resources.uniforms.uPointerVelocity.value.set(0, 0)
      resources.uniforms.uTrailCount.value = 0
      lastInteractionAt = timestamp
      startInteractionAnimation()
      return
    }

    const startsInteraction = !interactionAnimating
    const hasTrailAnchor = Number.isFinite(lastTrailAt)
    const normalizedX = point.x / Math.max(presentation.width, 1)
    const normalizedY = 1 - point.y / Math.max(presentation.height, 1)
    if (startsInteraction && !hasTrailAnchor) {
      snapPointer(normalizedX, normalizedY)
      updateTrail(point.x, point.y, timestamp, normalizedX, normalizedY)
    } else {
      updateTrail(point.x, point.y, timestamp, previousNormalizedX, previousNormalizedY)
      const profile = getRenderProfile()
      const directTouchResponse =
        window.innerWidth <= 600 || matchMedia('(pointer: coarse)').matches || activeTouchIdentifier !== null
      updatePointerTarget(normalizedX, normalizedY, directTouchResponse ? 1 : profile.pointerImmediateResponse)
    }
    wakeDirection = getGlassOpticalWakeDirection(
      wakeDirection,
      scaledVelocity,
      Math.hypot(scaledVelocity.x, scaledVelocity.y),
      startsInteraction,
    )
    resources.uniforms.uPointerVelocity.value.set(scaledVelocity.x, scaledVelocity.y)
    resources.uniforms.uWakeDirection.value.set(wakeDirection.x, wakeDirection.y)
    resources.uniforms.uTrailCount.value = getRenderProfile().trailCount
    lastInteractionAt = timestamp

    if (reducedMotion) {
      resetInteractionState()
      scheduleFrame()
      return
    }

    resources.uniforms.uMotion.value = 1
    if (getFlowStrengthScale() <= 0) {
      interactionAnimating = false
      cancelScheduledFrame()
      pendingFlowInjection = 0
      for (const trail of resources.uniforms.uTrail.value) trail.z = 0
      fluidDynamics?.clearInput()
      scheduleFrame()
      return
    }

    pendingFlowInjection = Math.max(pendingFlowInjection, Math.min(1, velocityLength * 18))
    startInteractionAnimation()
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerType === 'touch') return

    applyInteraction(event.clientX, event.clientY, event.timeStamp || performance.now(), undefined, event.target)
  }

  function findTouch(touches: TouchList, identifier: number | null) {
    for (let index = 0; index < touches.length; index += 1) {
      const touch = touches.item(index)
      if (touch && (identifier === null || touch.identifier === identifier)) return touch
    }

    return null
  }

  /** 被动跟踪真实触点；不阻止页面滚动，也不恢复按压放大语义。 */
  function handleTouchStart(event: TouchEvent) {
    if (activeTouchIdentifier !== null) return
    if (event.target instanceof Element && isGlassOpticalElementExcluded(event.target)) return

    const touch = findTouch(event.changedTouches, null)
    if (!touch) return

    const timestamp = event.timeStamp || performance.now()
    activeTouchIdentifier = touch.identifier
    lastPointerX = touch.clientX
    lastPointerY = touch.clientY
    lastPointerAt = timestamp
    const point = getPresentationPoint(touch.clientX, touch.clientY)
    const presentation = getCommittedPresentationSize()
    const interactionTarget = findInteractionTarget(point.x, point.y)
    if (resources && interactionTarget?.surface.mode === 'dynamic') {
      activeInteractionClip = interactionTarget.clip
      activateInteractionSurface(
        interactionTarget.surface.key,
        timestamp,
        matchMedia('(prefers-reduced-motion: reduce)').matches,
      )
      snapPointer(point.x / Math.max(presentation.width, 1), 1 - point.y / Math.max(presentation.height, 1))
      updateTrail(
        point.x,
        point.y,
        timestamp,
        point.x / Math.max(presentation.width, 1),
        1 - point.y / Math.max(presentation.height, 1),
      )
      scheduleFrame()
    }
  }

  function handleTouchMove(event: TouchEvent) {
    const touch = findTouch(event.touches, activeTouchIdentifier)
    if (!touch) return

    const timestamp = event.timeStamp || performance.now()
    applyInteraction(touch.clientX, touch.clientY, timestamp, undefined, event.target)
  }

  function handleTouchEnd(event: TouchEvent) {
    if (!findTouch(event.changedTouches, activeTouchIdentifier)) return

    activeTouchIdentifier = null
  }

  function handleInteractionEvent(event: PointerEvent | TouchEvent) {
    if (!hasDynamicCapability()) return

    if (event.type === 'pointermove') {
      handlePointerMove(event as PointerEvent)
      return
    }
    if (event.type === 'touchstart') {
      handleTouchStart(event as TouchEvent)
      return
    }
    if (event.type === 'touchmove') {
      handleTouchMove(event as TouchEvent)
      return
    }

    handleTouchEnd(event as TouchEvent)
  }

  /** 文档滚动只更新采样坐标和缓存可见性；嵌套滚动仍在首帧刷新受影响的表面几何。 */
  function renderScrollFrame(timestamp: number) {
    scrollAnimationFrame = null
    scrollFrameCommitted = false
    scrollLateGeometryCommitted = false
    if (
      presentationSpace !== 'scroll' ||
      !resources ||
      !toValue(options.active) ||
      document.visibilityState === 'hidden'
    ) {
      scrollDirty = false
      scrollStableFrameCount = 0
      return
    }

    const receivedScrollEvent = scrollDirty
    scrollDirty = false
    const scrollX = window.scrollX
    const scrollY = window.scrollY
    const coordinatesChanged = scrollX !== lastRenderedScrollX || scrollY !== lastRenderedScrollY
    lastRenderedScrollX = scrollX
    lastRenderedScrollY = scrollY
    resources.uniforms.uScrollOffset.value.set(scrollX, scrollY)
    if (scrollGeometryRefreshPending) {
      scrollGeometryRefreshPending = false
      updateSurfaceUniforms(timestamp, false)
    } else if (receivedScrollEvent || coordinatesChanged) {
      updateVisibleSurfaceUniforms(timestamp)
    }

    scrollStableFrameCount = receivedScrollEvent || coordinatesChanged ? 0 : scrollStableFrameCount + 1
    if (!interactionAnimating) renderFrame(timestamp, false)
    scrollFrameCommitted = true
    if (transformingSurfaces.size > 0) {
      if (timestamp < surfaceTransformTrackingDeadline) {
        scrollGeometryRefreshPending = true
        scrollStableFrameCount = 0
      } else {
        transformingSurfaces.clear()
        scrollSurfaceStabilityPending = true
      }
    }

    if (scrollStableFrameCount < SCROLL_STABLE_TAIL_FRAMES) {
      scrollAnimationFrame = requestAnimationFrame(renderScrollFrame)
    } else {
      finishNativeScrollPresentation(timestamp)
      if (scrollSurfaceStabilityPending) {
        scrollSurfaceStabilityPending = false
        scheduleSurfaceStabilityUpdate()
      }
    }
  }

  function scheduleScrollFrame() {
    if (scrollAnimationFrame !== null || presentationSpace !== 'scroll' || !resources) return

    scrollAnimationFrame = requestAnimationFrame(renderScrollFrame)
  }

  function handleScroll(event: Event) {
    if (presentationSpace !== 'scroll' || !resources) return

    const target = event.target
    if (!isRelevantScrollTarget(target)) return

    beginNativeScrollPresentation()
    scrollFrameCommitted = false
    scrollLateGeometryCommitted = false
    const isDocumentScroll =
      !(target instanceof Element) || target === document.documentElement || target === document.body
    if (!isDocumentScroll) {
      if (!(target instanceof Element) || !observedSurfaces.some(surface => target.contains(surface))) return
      scrollGeometryRefreshPending = true
    } else {
      resources.uniforms.uScrollOffset.value.set(window.scrollX, window.scrollY)
    }

    scrollDirty = true
    scheduleScrollFrame()
    if (surfaceUpdateFrame !== null) {
      cancelAnimationFrame(surfaceUpdateFrame)
      surfaceUpdateFrame = null
      queueScrollGeometryRefresh(false)
    }
    if (surfaceStabilityFrame !== null) {
      cancelAnimationFrame(surfaceStabilityFrame)
      surfaceStabilityFrame = null
      queueScrollGeometryRefresh(true)
    }
    if (surfaceTransformFrame !== null) {
      cancelAnimationFrame(surfaceTransformFrame)
      surfaceTransformFrame = null
      queueScrollGeometryRefresh(false)
    }
  }

  function handleScrollEnd(event: Event) {
    if (presentationSpace !== 'scroll' || !resources) return

    const target = event.target
    if (
      target instanceof Element &&
      target !== document.documentElement &&
      target !== document.body &&
      observedSurfaces.some(surface => target.contains(surface))
    ) {
      scrollGeometryRefreshPending = true
    }
    scrollDirty = false
    scrollStableFrameCount = 0
    scheduleScrollFrame()
  }

  /** 暂停事件驱动帧但保留 WebGL context、纹理、流场和最后一张稳定画面。 */
  function pauseRenderer() {
    cancelScheduledFrame()
    cancelScrollFrame()
    finishNativeScrollPresentation()
    cancelWallpaperTransitionFrame()
    cancelSurfaceTransformFrame()
    interactionAnimating = false
  }

  /** 合并同一可见性事务的多个浏览器事件，只恢复一次稳定帧。 */
  function resumeRenderer() {
    if (resumePromise) return resumePromise

    const version = resumeVersion
    const canResume = () => toValue(options.active) && document.visibilityState !== 'hidden'
    const task = (async () => {
      clearBackgroundDisposeTimer()
      if (!canResume()) return

      await nextTick()
      if (version !== resumeVersion || !canResume()) return
      if (!resources) {
        await initializeRenderer()
        return
      }

      resizeRenderer()
      updateSurfaceUniforms()
      const timestamp = performance.now()
      const keepRippleAnimating = hasRippleCapability() ? advanceRipple(timestamp) : false
      if (!keepRippleAnimating) resetInteractionState()
      renderFrame(timestamp, !hasRippleCapability())
      if (keepRippleAnimating) {
        interactionAnimating = true
        animationFrame = requestAnimationFrame(renderInteractionFrame)
      }
      scheduleWallpaperTransition()
    })()

    resumePromise = task
    void task.finally(() => {
      if (resumePromise === task) resumePromise = null
    })

    return task
  }

  /** 持续非活动才释放 GPU 资源，短时切换应用继续保留纹理与稳定画面。 */
  function scheduleInactiveRendererDisposal(isStillInactive: () => boolean) {
    clearBackgroundDisposeTimer()
    backgroundDisposeTimer = window.setTimeout(() => {
      backgroundDisposeTimer = null
      if (!isStillInactive()) return

      // 生命周期暂停后仍会复用同一 canvas；只释放 renderer 资源，不主动丢失其 WebGL context。
      disposeRenderer(false)
    }, APP_ACTIVITY_SUSPEND_DELAY_MS)
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      pauseRenderer()
      scheduleInactiveRendererDisposal(() => document.visibilityState === 'hidden')
      return
    }

    void resumeRenderer()
  }

  function handleWindowBlur() {
    if (document.visibilityState !== 'visible') return

    pauseRenderer()
    scheduleInactiveRendererDisposal(() => document.visibilityState === 'visible' && !document.hasFocus())
  }

  function handleWindowResume() {
    if (document.visibilityState === 'visible') void resumeRenderer()
  }

  function handleContextLost(event: Event) {
    event.preventDefault()
    const canvas = contextEventCanvas ?? options.canvas.value
    disposeRenderer(false)
    contextRecoveryPending = true
    // 丢失的 context 已回收全部 GPU 对象；在恢复前释放旧 Three 状态，避免恢复后删除失效句柄。
    contextRecoveryCanvas = canvas
    canvas?.addEventListener('webglcontextrestored', handleContextRestored, { once: true })
    updateRendererState('fallback')
  }

  function handleContextRestored() {
    if (!contextRecoveryPending) return

    contextRecoveryPending = false
    contextRecoveryCanvas?.removeEventListener('webglcontextrestored', handleContextRestored)
    contextRecoveryCanvas = null
    void initializeRenderer(false)
  }

  function handleWindowResize() {
    if (presentationSpace === 'scroll') schedulePresentationResizeUpdate()
    else resizeRenderer()
  }

  /** 只让会改变目标表面集合或圆角几何的 DOM 变更触发重扫。 */
  function mutationTouchesOpticalSurface(mutations: MutationRecord[]) {
    const removalRecords = mutations.flatMap(mutation => {
      if (mutation.type !== 'childList' || mutation.removedNodes.length === 0 || !(mutation.target instanceof Element))
        return []

      return [
        {
          removedElements: [...mutation.removedNodes].filter((node): node is Element => node instanceof Element),
          target: mutation.target,
        },
      ]
    })
    const managedRemovalTargets = new Set<Element>()
    const removedElementsFromManagedSurfaces = new Set<Element>()
    let removalGraphExpanded = removalRecords.length > 0

    // MutationRecord 保留节点身份，但回调时的最终 DOM 已丢失中间祖先关系，需要沿同批次移除边传递 owner。
    while (removalGraphExpanded) {
      removalGraphExpanded = false

      for (const record of removalRecords) {
        const belongsToManagedSurface =
          managedRemovalTargets.has(record.target) ||
          surfaceRegistry.some(surface => surface.key === record.target || surface.key.contains(record.target)) ||
          [...removedElementsFromManagedSurfaces].some(
            element => element === record.target || element.contains(record.target),
          )
        if (!belongsToManagedSurface) continue

        if (!managedRemovalTargets.has(record.target)) {
          managedRemovalTargets.add(record.target)
          removalGraphExpanded = true
        }
        for (const element of record.removedElements) {
          if (removedElementsFromManagedSurfaces.has(element)) continue

          removedElementsFromManagedSurfaces.add(element)
          removalGraphExpanded = true
        }
      }
    }

    return mutations.some(mutation => {
      if (mutation.type === 'attributes') return true

      const removedManagedSurface = [...mutation.removedNodes].some(
        node =>
          node instanceof Element &&
          (surfaceRegistry.some(surface => surface.key === node || node.contains(surface.key)) ||
            interactionClipRegistry.some(clip => clip.key === node || node.contains(clip.key))),
      )
      if (removedManagedSurface) return true

      const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes]

      // 新增节点按提交后的祖先资格判断；排除子树内部的图片 DOM 变化不需要重扫。
      if (mutation.target instanceof Element && !isGlassOpticalElementEligible(mutation.target)) {
        const belongsToManagedSurface = surfaceRegistry.some(
          surface => surface.key === mutation.target || surface.key.contains(mutation.target),
        )
        const removedFromManagedSurface = managedRemovalTargets.has(mutation.target)

        return (belongsToManagedSurface || removedFromManagedSurface) && changedNodes.some(containsGlassInteractionClip)
      }

      return changedNodes.some(node => containsGlassOpticalSurface(node) || containsGlassInteractionClip(node))
    })
  }

  function setupObservers() {
    resizeObserver = new ResizeObserver(handleSurfaceResize)
    observeResizeTargets(false)
    const observedMutationRoots = new Set<Node>()

    function observeMutationRoot(root: Node | null, subtree: boolean) {
      if (!root || observedMutationRoots.has(root)) return

      observedMutationRoots.add(root)
      surfaceMutationObserver?.observe(root, {
        attributeFilter: ['data-glass-optical-boundary', 'data-glass-optical-mode'],
        attributes: true,
        childList: true,
        subtree,
      })
    }

    surfaceMutationObserver = new MutationObserver(mutations => {
      // Vuetify 可能在首个弹层打开时才创建容器，后续变更需要纳入同一个表面生命周期。
      observeMutationRoot(document.querySelector('.v-overlay-container'), true)
      if (!mutationTouchesOpticalSurface(mutations)) return

      interactionClipMembershipDirty = true
      commitActivePagePresentation()
      scheduleSurfaceStabilityUpdate()
    })
    observeMutationRoot(document.querySelector('.app-wrapper'), true)
    observeMutationRoot(document.querySelector('.v-overlay-container'), true)
    observeMutationRoot(document.body, false)
    surfaceMutationObserver.observe(document.documentElement, {
      attributeFilter: ['data-theme-radius'],
      attributes: true,
    })
  }

  function setupInteractionEvents() {
    if (!hasDynamicCapability() || interactionEventsAttached) return

    interactionEventsAttached = true
    if (options.interactionSource) {
      unsubscribeInteractionSource = options.interactionSource.subscribe(presentationSpace, handleInteractionEvent)
    } else {
      window.addEventListener('pointermove', handlePointerMove, { passive: true })
      window.addEventListener('touchstart', handleTouchStart, { passive: true })
      window.addEventListener('touchmove', handleTouchMove, { passive: true })
      window.addEventListener('touchend', handleTouchEnd, { passive: true })
      window.addEventListener('touchcancel', handleTouchEnd, { passive: true })
    }
  }

  function removeInteractionEvents() {
    if (!interactionEventsAttached) return

    interactionEventsAttached = false
    unsubscribeInteractionSource?.()
    unsubscribeInteractionSource = null
    if (options.interactionSource) return

    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('touchstart', handleTouchStart)
    window.removeEventListener('touchmove', handleTouchMove)
    window.removeEventListener('touchend', handleTouchEnd)
    window.removeEventListener('touchcancel', handleTouchEnd)
  }

  /** context 生命周期在异步 shader 编译前生效，确保初始化中的丢失也进入统一恢复状态机。 */
  function setupContextEvents(canvas: HTMLCanvasElement) {
    if (contextEventCanvas === canvas) return

    removeContextEvents()
    contextEventCanvas = canvas
    canvas.addEventListener('webglcontextlost', handleContextLost)
    canvas.addEventListener('webglcontextrestored', handleContextRestored)
  }

  function removeContextEvents() {
    contextEventCanvas?.removeEventListener('webglcontextlost', handleContextLost)
    contextEventCanvas?.removeEventListener('webglcontextrestored', handleContextRestored)
    contextEventCanvas = null
    contextRecoveryCanvas?.removeEventListener('webglcontextrestored', handleContextRestored)
    contextRecoveryCanvas = null
  }

  function setupEvents() {
    setupInteractionEvents()
    window.addEventListener('resize', handleWindowResize, { passive: true })
    window.addEventListener('transitionrun', handleSurfaceTransitionRun, { capture: true, passive: true })
    window.addEventListener('transitionend', handleSurfaceTransitionEnd, { capture: true, passive: true })
    window.addEventListener('transitioncancel', handleSurfaceTransitionEnd, { capture: true, passive: true })
    if (presentationSpace === 'scroll') {
      window.addEventListener('wheel', handleScrollIntent, { capture: true, passive: true })
      window.addEventListener('touchmove', handleScrollIntent, { capture: true, passive: true })
      window.addEventListener('keydown', handleScrollIntent, { capture: true })
      window.addEventListener('scroll', handleScroll, { capture: true, passive: true })
      window.addEventListener('scrollend', handleScrollEnd, { passive: true })
    }
  }

  function removeEvents() {
    removeInteractionEvents()
    window.removeEventListener('resize', handleWindowResize)
    window.removeEventListener('transitionrun', handleSurfaceTransitionRun, true)
    window.removeEventListener('transitionend', handleSurfaceTransitionEnd, true)
    window.removeEventListener('transitioncancel', handleSurfaceTransitionEnd, true)
    if (presentationSpace === 'scroll') {
      window.removeEventListener('wheel', handleScrollIntent, true)
      window.removeEventListener('touchmove', handleScrollIntent, true)
      window.removeEventListener('keydown', handleScrollIntent, true)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('scrollend', handleScrollEnd)
    }
    removeContextEvents()
  }

  function disposeRenderer(releaseContext = true) {
    resumeVersion += 1
    loadVersion += 1
    prepareVersion += 1
    contextRecoveryPending = false
    interactionAnimating = false
    cancelScheduledFrame()
    cancelScrollFrame()
    cancelWallpaperTransitionFrame()
    cancelSurfaceTransformFrame()
    clearBackgroundDisposeTimer()
    if (surfaceUpdateFrame !== null) {
      cancelAnimationFrame(surfaceUpdateFrame)
      surfaceUpdateFrame = null
    }
    if (surfaceStabilityFrame !== null) {
      cancelAnimationFrame(surfaceStabilityFrame)
      surfaceStabilityFrame = null
    }
    if (presentationResizeTimer !== null) {
      window.clearTimeout(presentationResizeTimer)
      presentationResizeTimer = null
    }
    presentationResizeCandidate = ''
    presentationResizeStableSamples = 0
    removeEvents()
    resizeObserver?.disconnect()
    resizeObserver = null
    surfaceMutationObserver?.disconnect()
    surfaceMutationObserver = null
    observedSurfaces = []
    surfaceRegistry = []
    availableSurfaces = []
    surfaceSlots = []
    interactionClips = []
    interactionClipRegistry = []
    interactionClipConstrainedOwners = new Set<HTMLElement>()
    interactionClipMembershipDirty = true
    activeSurface = null
    activeInteractionClip = null
    outgoingSurface = null
    surfaceTransitionStartedAt = 0
    wakeDirection = { x: 0, y: -1 }
    document.documentElement.removeAttribute('data-glass-wallpaper-loading')
    activeTouchIdentifier = null
    if (presentationSpace === 'scroll') {
      scrollWallpaperSamplingSuppressed = false
      document.documentElement.removeAttribute('data-glass-scroll-presentation')
    }
    lastPointerX = window.innerWidth * 0.5
    lastPointerY = window.innerHeight * 0.5
    pointerTargetX = 0.5
    pointerTargetY = 0.5
    pointerPositionX = 0.5
    pointerPositionY = 0.5
    pendingFlowInjection = 0
    lastInteractionFrameAt = 0
    if (previousTexture && previousTexture !== activeTexture) {
      disposeWallpaperResources(previousTexture, previousFrostedTarget)
    }
    previousTexture = null
    previousFrostedTarget = null
    previousTextureHeight = 1
    previousTextureWidth = 1
    previousWallpaperExposure = DEFAULT_GLASS_WALLPAPER_TONE_PROFILE.exposure
    wallpaperTransitionStartedAt = 0
    wallpaperActivationRollback = null
    disposeWallpaperResources(activeTexture, activeFrostedTarget)
    activeTexture = null
    activeFrostedTarget = null
    activeTextureHeight = 1
    activeTextureWidth = 1
    activeHasWallpaperTexture = false
    activeWallpaperExposure = DEFAULT_GLASS_WALLPAPER_TONE_PROFILE.exposure
    activeWallpaperUrl.value = ''
    activeWallpaperRevision.value = 0
    activeWallpaperPreparationKey.value = ''
    releasePreparedWallpaper()
    clearPreparedWallpaperFailure()

    disposeFluidDynamics()
    disposeRippleResources()
    disposeFrostPrefilterResources()
    if (resources) {
      resources.geometry.dispose()
      resources.material.dispose()
      resources.renderer.dispose()
      if (releaseContext) resources.renderer.forceContextLoss()
      resources = null
    }

    delete document.documentElement.dataset.glassRendererState
  }

  /** 只有当前加载代次可以处置共享 renderer，过期请求的失败不会覆盖新状态。 */
  function fallbackFromCurrentLoad(version: number, message: string, error: unknown) {
    if (version !== loadVersion) return

    console.warn(message, error)
    disposeRenderer()
    updateRendererState('fallback')
  }

  /** 后台替换活动纹理；已有纹理在加载失败或完成前继续保持可交互。 */
  async function refreshWallpaper(message: string, beforeActivate?: () => void) {
    const version = ++loadVersion
    const retainsActiveTexture = Boolean(resources && activeTexture)
    if (!retainsActiveTexture) updateRendererState('loading')
    document.documentElement.setAttribute('data-glass-wallpaper-loading', 'true')

    try {
      await loadWallpaper(toValue(options.wallpaperUrl), version, beforeActivate)
    } catch (error) {
      if (version !== loadVersion) return
      if (retainsActiveTexture && resources && activeTexture) {
        console.warn(message, error)
        updateRendererState('ready')
        scheduleFrame()
        return
      }
      fallbackFromCurrentLoad(version, message, error)
    } finally {
      if (version === loadVersion) document.documentElement.removeAttribute('data-glass-wallpaper-loading')
    }
  }

  /** 在同一 renderer 内交接新旧纹理；只有真实壁纸轮换才启用双纹理时钟。 */
  function activateLoadedTexture(
    texture: Texture,
    frostedTarget: WebGLRenderTarget | null,
    width: number,
    height: number,
    hasWallpaperTexture: boolean,
    toneProfile: GlassWallpaperToneProfile,
    transitionStartedAt = toValue(options.transitionStartedAt ?? 0),
    forceTransition = false,
  ) {
    if (!resources) {
      disposeWallpaperResources(texture, frostedTarget)
      return
    }

    const hasActiveTransition =
      Boolean(activeTexture) &&
      transitionStartedAt > 0 &&
      (forceTransition || Boolean(toValue(options.previousWallpaperUrl ?? '')))
    cancelWallpaperTransitionFrame()

    if (hasActiveTransition && activeTexture) {
      if (previousTexture && previousTexture !== activeTexture) {
        disposeWallpaperResources(previousTexture, previousFrostedTarget)
      }
      previousTexture = activeTexture
      previousFrostedTarget = activeFrostedTarget
      previousTextureHeight = activeTextureHeight
      previousTextureWidth = activeTextureWidth
      previousWallpaperExposure = activeWallpaperExposure
      activeTexture = texture
      activeFrostedTarget = frostedTarget
      activeTextureHeight = height
      activeTextureWidth = width
      activeWallpaperExposure = toneProfile.exposure
      resources.uniforms.uPreviousTexture.value = previousTexture
      resources.uniforms.uPreviousFrostedTexture.value = previousFrostedTarget?.texture ?? previousTexture
      resources.uniforms.uTexture.value = activeTexture
      resources.uniforms.uFrostedTexture.value = activeFrostedTarget?.texture ?? activeTexture
      resources.uniforms.uPreviousWallpaperExposure.value = previousWallpaperExposure
      resources.uniforms.uWallpaperExposure.value = activeWallpaperExposure
      wallpaperTransitionStartedAt = transitionStartedAt
      resources.uniforms.uTextureMix.value = forceTransition
        ? 0
        : getGlassWallpaperTransitionProgress(
            performance.now() - wallpaperTransitionStartedAt,
            toValue(options.transitionDuration ?? 0),
          )
      syncCoverScale()
      scheduleWallpaperTransition()
    } else {
      if (previousTexture && previousTexture !== activeTexture) {
        disposeWallpaperResources(previousTexture, previousFrostedTarget)
      }
      disposeWallpaperResources(activeTexture, activeFrostedTarget)
      previousTexture = null
      previousFrostedTarget = null
      activeTexture = texture
      activeFrostedTarget = frostedTarget
      activeTextureHeight = height
      activeTextureWidth = width
      activeWallpaperExposure = toneProfile.exposure
      previousTextureHeight = height
      previousTextureWidth = width
      previousWallpaperExposure = toneProfile.exposure
      resources.uniforms.uPreviousTexture.value = texture
      resources.uniforms.uPreviousFrostedTexture.value = frostedTarget?.texture ?? texture
      resources.uniforms.uTexture.value = texture
      resources.uniforms.uFrostedTexture.value = frostedTarget?.texture ?? texture
      resources.uniforms.uPreviousWallpaperExposure.value = toneProfile.exposure
      resources.uniforms.uWallpaperExposure.value = toneProfile.exposure
      resources.uniforms.uTextureMix.value = 1
      wallpaperTransitionStartedAt = 0
      wallpaperActivationRollback = null
      syncCoverScale()
    }

    activeHasWallpaperTexture = hasWallpaperTexture
    syncWallpaperSamplingMode()
    resources.uniforms.uHasFrostedTexture.value = hasWallpaperTexture && frostedTarget ? 1 : 0
  }

  /** 解码并按当前质量预算缩放壁纸，不改变当前可见纹理。 */
  async function createWallpaperTexture(url: string): Promise<PreparedWallpaperTexture | null> {
    if (!resources || !three || !url) return null
    const appearance = toValue(options.appearance)
    const quality = toValue(options.quality)
    const routeKey = toValue(options.routeKey)
    const profile = getGlassOpticalRenderProfile(quality, routeKey)
    const preparationKey = getGlassWallpaperPreparationKey(appearance, quality, routeKey, url)
    const shouldUseProceduralTexture =
      profile.textureSource === 'procedural' ||
      (profile.textureSource === 'auto' && !canUseGlassWallpaperTexture(url, window.location.href))
    if (shouldUseProceduralTexture) {
      const textureCanvas = document.createElement('canvas')
      textureCanvas.width = 1
      textureCanvas.height = 1
      const texture = new three.CanvasTexture(textureCanvas)
      texture.colorSpace = three.SRGBColorSpace
      texture.generateMipmaps = false
      texture.minFilter = three.LinearFilter
      texture.magFilter = three.LinearFilter
      return {
        frostedTarget: null,
        hasWallpaperTexture: false,
        height: 1,
        preparationKey,
        texture,
        toneProfile: { ...DEFAULT_GLASS_WALLPAPER_TONE_PROFILE },
        width: 1,
      }
    }

    const { textureLimit } = profile
    const preparesFrostedTexture = appearance === 'frosted'
    // 源纹理只需覆盖各质量档的最大有效输出足迹；更高分辨率会重复占用两个 context 的上传与显存。
    const sourceLimit = quality === 'high' ? WALLPAPER_SOURCE_LIMIT_HIGH : WALLPAPER_SOURCE_LIMIT_BALANCED
    const cacheKey = `${sourceLimit}:${url}`
    recordGlassRendererTiming(presentationSpace, 'source-requested')
    const source = await wallpaperSourceCache.get(cacheKey, async () => {
      const tone = await loadGlassWallpaperTone(url)
      const decodedSource = tone.corsReady ? takeGlassWallpaperDecodedSource(url) : undefined
      let sourceTexture: Texture | null = null
      let image = decodedSource?.image
      if (!image) {
        const loader = new three!.TextureLoader()
        loader.setCrossOrigin('anonymous')
        sourceTexture = await loader.loadAsync(url)
        image = sourceTexture.image as HTMLImageElement
      }
      const sourceWidth = image.naturalWidth || image.width
      const sourceHeight = image.naturalHeight || image.height
      const sourceLongEdge = Math.max(sourceWidth, sourceHeight)
      const uploadLongEdge = Math.min(sourceLongEdge, textureLimit, sourceLimit)
      const scale = Math.min(1, uploadLongEdge / sourceLongEdge)
      const textureCanvas = document.createElement('canvas')
      textureCanvas.width = Math.max(1, Math.round(sourceWidth * scale))
      textureCanvas.height = Math.max(1, Math.round(sourceHeight * scale))
      const textureContext = textureCanvas.getContext('2d')
      const preparedImage = textureContext ? textureCanvas : image

      if (textureContext) textureContext.drawImage(image, 0, 0, textureCanvas.width, textureCanvas.height)
      sourceTexture?.dispose()

      return {
        height: textureContext ? textureCanvas.height : sourceHeight,
        image: preparedImage,
        toneProfile:
          decodedSource?.profile ?? tone.profile ?? analyzeGlassWallpaperTone(image, sourceWidth, sourceHeight),
        width: textureContext ? textureCanvas.width : sourceWidth,
      }
    })
    recordGlassRendererTiming(presentationSpace, 'source-ready')
    const texture = new three.Texture(source.image)
    texture.needsUpdate = true
    const textureWidth = source.width
    const textureHeight = source.height

    texture.colorSpace = three.SRGBColorSpace
    texture.generateMipmaps = false
    texture.minFilter = three.LinearFilter
    texture.magFilter = three.LinearFilter
    let frostedTarget: WebGLRenderTarget | null = null
    try {
      if (preparesFrostedTexture) {
        recordGlassRendererTiming(presentationSpace, 'prefilter-start')
        frostedTarget = await createFrostedWallpaperTarget(
          texture,
          textureWidth,
          textureHeight,
          Math.max(textureWidth, textureHeight) * FROST_PREFILTER_SCALE,
        )
        recordGlassRendererTiming(presentationSpace, 'prefilter-ready')
      }
    } catch (error) {
      // 预滤属于磨砂优化；失败时保留源纹理并退回既有扩散采样，不能拖垮其他材质。
      console.warn('玻璃磨砂壁纸预滤失败，继续使用实时扩散采样:', error)
    }
    return {
      frostedTarget,
      hasWallpaperTexture: true,
      height: textureHeight,
      preparationKey,
      texture,
      toneProfile: source.toneProfile,
      width: textureWidth,
    }
  }

  /** 提前准备下一张纹理；失败不会影响当前活动纹理。 */
  async function prepareWallpaper(url: string, revision: number) {
    const version = ++prepareVersion
    releasePreparedWallpaper()
    clearPreparedWallpaperFailure()
    if (!url || !resources || contextRecoveryPending || url === toValue(options.wallpaperUrl)) return
    const preparationKey = getWallpaperPreparationKey(url)

    try {
      const prepared = await createWallpaperTexture(url)
      if (!prepared) return
      if (
        version !== prepareVersion ||
        !resources ||
        contextRecoveryPending ||
        preparationKey !== prepared.preparationKey ||
        preparationKey !== getWallpaperPreparationKey(url)
      ) {
        disposeWallpaperResources(prepared.texture, prepared.frostedTarget)
        return
      }

      resources.renderer.initTexture(prepared.texture)
      recordGlassRendererTiming(presentationSpace, 'prepare-compile-start')
      await resources.renderer.compileAsync(resources.scene, resources.camera)
      recordGlassRendererTiming(presentationSpace, 'prepare-compile-ready')
      if (
        version !== prepareVersion ||
        !resources ||
        contextRecoveryPending ||
        preparationKey !== getWallpaperPreparationKey(url)
      ) {
        disposeWallpaperResources(prepared.texture, prepared.frostedTarget)
        return
      }

      preparedWallpaper = prepared
      preparedWallpaperUrl.value = url
      preparedWallpaperRevision.value = revision
      preparedWallpaperPreparationKey.value = preparationKey
    } catch (error) {
      if (version === prepareVersion) {
        failedWallpaperUrl.value = url
        failedWallpaperRevision.value = revision
        failedWallpaperPreparationKey.value = preparationKey
        console.warn('玻璃光学壁纸预备失败，继续使用当前纹理:', error)
      }
    }
  }

  async function loadWallpaper(url: string, version: number, beforeActivate?: () => void) {
    if (!resources || !three || !url) return

    const prepared = await createWallpaperTexture(url)
    if (!prepared) return
    if (
      version !== loadVersion ||
      !resources ||
      contextRecoveryPending ||
      prepared.preparationKey !== getWallpaperPreparationKey(url)
    ) {
      disposeWallpaperResources(prepared.texture, prepared.frostedTarget)
      return
    }

    recordGlassRendererTiming(presentationSpace, 'compile-start')
    await resources.renderer.compileAsync(resources.scene, resources.camera)
    recordGlassRendererTiming(presentationSpace, 'compile-ready')
    if (
      version !== loadVersion ||
      !resources ||
      contextRecoveryPending ||
      prepared.preparationKey !== getWallpaperPreparationKey(url)
    ) {
      disposeWallpaperResources(prepared.texture, prepared.frostedTarget)
      return
    }

    const timestamp = performance.now()
    beforeActivate?.()
    activateLoadedTexture(
      prepared.texture,
      prepared.frostedTarget,
      prepared.width,
      prepared.height,
      prepared.hasWallpaperTexture,
      prepared.toneProfile,
    )
    updateSurfaceUniforms(timestamp, false)
    resetInteractionState()
    renderFrame(timestamp, false)
    activeWallpaperUrl.value = url
    activeWallpaperRevision.value = 0
    activeWallpaperPreparationKey.value = prepared.preparationKey
    updateRendererState('ready')
    recordGlassRendererTiming(presentationSpace, 'ready')
    scheduleWallpaperTransition()
  }

  /** 只读校验由 Layer 执行，两个 context 均通过后才允许进入同一绘制帧提交。 */
  function canActivatePreparedWallpaper(url: string, revision: number, preparationKey: string) {
    return Boolean(
      resources &&
      !contextRecoveryPending &&
      state.value === 'ready' &&
      preparedWallpaper &&
      preparedWallpaperUrl.value === url &&
      preparedWallpaperRevision.value === revision &&
      preparedWallpaperPreparationKey.value === preparationKey &&
      preparationKey === getWallpaperPreparationKey(url),
    )
  }

  /** 在共享 rAF 内同步消费当前 context 的 prepared bundle，并以统一时钟绘制首个过渡帧。 */
  function activatePreparedWallpaper(url: string, revision: number, preparationKey: string, startedAt: number) {
    if (!canActivatePreparedWallpaper(url, revision, preparationKey) || !preparedWallpaper) return false

    const rollback = {
      activatedRevision: revision,
      activatedUrl: url,
      previousHasWallpaperTexture: activeHasWallpaperTexture,
      previousPreparationKey: activeWallpaperPreparationKey.value,
      previousRevision: activeWallpaperRevision.value,
      previousUrl: activeWallpaperUrl.value,
    }
    const prepared = preparedWallpaper
    preparedWallpaper = null
    preparedWallpaperUrl.value = ''
    preparedWallpaperRevision.value = 0
    preparedWallpaperPreparationKey.value = ''
    loadVersion += 1
    activateLoadedTexture(
      prepared.texture,
      prepared.frostedTarget,
      prepared.width,
      prepared.height,
      prepared.hasWallpaperTexture,
      prepared.toneProfile,
      startedAt,
      true,
    )
    wallpaperActivationRollback = previousTexture ? rollback : null
    activeWallpaperUrl.value = url
    activeWallpaperRevision.value = revision
    activeWallpaperPreparationKey.value = preparationKey
    updateSurfaceUniforms(startedAt, false)
    resetInteractionState()
    renderFrame(startedAt, false)
    updateRendererState('ready')
    recordGlassRendererTiming(presentationSpace, 'active')
    scheduleWallpaperTransition()

    return true
  }

  /**
   * 撤销刚完成但尚未由父层确认的 prepared 激活。
   * 旧活动纹理仍在 previous 槽中，因此失败恢复不需要重新下载或上传。
   */
  function rollbackPreparedWallpaperActivation(url: string, revision: number) {
    const rollback = wallpaperActivationRollback
    if (
      !resources ||
      !activeTexture ||
      !previousTexture ||
      !rollback ||
      rollback.activatedUrl !== url ||
      rollback.activatedRevision !== revision ||
      activeWallpaperUrl.value !== url ||
      activeWallpaperRevision.value !== revision
    ) {
      return false
    }

    cancelWallpaperTransitionFrame()
    const rejectedTexture = activeTexture
    const rejectedFrostedTarget = activeFrostedTarget
    activeTexture = previousTexture
    activeFrostedTarget = previousFrostedTarget
    activeTextureHeight = previousTextureHeight
    activeTextureWidth = previousTextureWidth
    activeWallpaperExposure = previousWallpaperExposure
    previousTexture = null
    previousFrostedTarget = null
    previousTextureHeight = activeTextureHeight
    previousTextureWidth = activeTextureWidth
    previousWallpaperExposure = activeWallpaperExposure
    wallpaperTransitionStartedAt = 0
    wallpaperActivationRollback = null
    activeWallpaperUrl.value = rollback.previousUrl
    activeWallpaperRevision.value = rollback.previousRevision
    activeWallpaperPreparationKey.value = rollback.previousPreparationKey
    resources.uniforms.uTexture.value = activeTexture
    resources.uniforms.uFrostedTexture.value = activeFrostedTarget?.texture ?? activeTexture
    resources.uniforms.uPreviousTexture.value = activeTexture
    resources.uniforms.uPreviousFrostedTexture.value = activeFrostedTarget?.texture ?? activeTexture
    resources.uniforms.uWallpaperExposure.value = activeWallpaperExposure
    resources.uniforms.uPreviousWallpaperExposure.value = activeWallpaperExposure
    resources.uniforms.uTextureMix.value = 1
    activeHasWallpaperTexture = rollback.previousHasWallpaperTexture
    syncWallpaperSamplingMode()
    resources.uniforms.uHasFrostedTexture.value = rollback.previousHasWallpaperTexture && activeFrostedTarget ? 1 : 0
    syncCoverScale()
    resetInteractionState()
    disposeWallpaperResources(rejectedTexture, rejectedFrostedTarget)
    renderFrame(performance.now(), false)

    return true
  }

  async function initializeRenderer(releaseContext = true) {
    recordGlassRendererTiming(presentationSpace, 'initialize-start')
    disposeRenderer(releaseContext)
    if (!toValue(options.active) || !options.canvas.value) return

    if (!window.WebGLRenderingContext || reducedTransparencyQuery.matches || !toValue(options.wallpaperUrl)) {
      updateRendererState('fallback')
      return
    }

    updateRendererState('loading')
    const version = ++loadVersion

    try {
      three = await import('three')
      recordGlassRendererTiming(presentationSpace, 'three-ready')
      if (version !== loadVersion || !options.canvas.value) return
      const Vector4Class = three.Vector4
      const canvas = options.canvas.value
      const context = prepareGlassWebGLContext(canvas)

      const renderer = new three.WebGLRenderer({
        alpha: true,
        antialias: false,
        canvas,
        ...(context ? { context } : {}),
        powerPreference: 'high-performance',
        premultipliedAlpha: true,
      })
      recordGlassRendererTiming(presentationSpace, 'context-ready')
      renderer.setClearColor(0x000000, 0)
      renderer.setPixelRatio(1)

      const geometry = new three.BufferGeometry()
      geometry.setAttribute('position', new three.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
      const materialResponse = getMaterialResponse()
      const uniforms: GlassRendererUniforms = {
        uAppearance: { value: getGlassAppearanceUniformValue(toValue(options.appearance)) },
        uBackgroundVisibility: { value: materialResponse.backgroundVisibility },
        uCoverScale: { value: new three.Vector2(1, 1) },
        uDeformationStrength: { value: getDeformationStrengthScale() },
        uDynamicsOnly: { value: usesDynamicsOnly() ? 1 : 0 },
        uDynamicsMode: { value: getDynamicsModeUniformValue() },
        uFlowTexture: { value: null },
        uFlowStrength: { value: getFlowStrengthScale() },
        uHasFlowTexture: { value: 0 },
        uHasFrostedTexture: { value: 0 },
        uHasRippleTexture: { value: 0 },
        uHasWallpaperTexture: { value: 0 },
        uInteractionRadii: { value: Array.from({ length: 8 }, () => new Vector4Class()) },
        uInteractionRectCount: { value: 0 },
        uInteractionRects: { value: Array.from({ length: 8 }, () => new Vector4Class()) },
        uMotion: { value: 0 },
        uMotionExpansion: { value: getMotionExpansion() },
        uMaxRefractionPixels: { value: getMaxRefractionPixels() },
        uPointer: { value: new three.Vector2(0.5, 0.5) },
        uPointerVelocity: { value: new three.Vector2(0, 0) },
        uPresentationSize: { value: new three.Vector2(window.innerWidth, window.innerHeight) },
        uPreviousCoverScale: { value: new three.Vector2(1, 1) },
        uPreviousWallpaperExposure: { value: DEFAULT_GLASS_WALLPAPER_TONE_PROFILE.exposure },
        uQuality: { value: toValue(options.quality) === 'high' ? 1 : 0 },
        uReflectionStrength: { value: getReflectionStrengthScale() },
        uRippleDeformationStrength: {
          value: hasRippleCapability()
            ? Math.min(1, Math.max(0, toValue(options.deformationStrength ?? getLegacyDynamicStrength()) / 100))
            : 0,
        },
        uRippleTexelSize: { value: new three.Vector2(1, 1) },
        uRippleTexture: { value: null },
        uRadii: { value: Array.from({ length: 8 }, () => new Vector4Class()) },
        uRectCount: { value: 0 },
        uRects: { value: Array.from({ length: 8 }, () => new Vector4Class()) },
        uSurfaceWeights: { value: Array.from({ length: 8 }, () => 0) },
        uSurfaceDynamics: { value: Array.from({ length: 8 }, () => 1) },
        uPreviousTexture: { value: null },
        uPreviousFrostedTexture: { value: null },
        uTexture: { value: null },
        uFrostedTexture: { value: null },
        uTextureMix: { value: 1 },
        uWallpaperExposure: { value: DEFAULT_GLASS_WALLPAPER_TONE_PROFILE.exposure },
        uTintColor: { value: new three.Color(toValue(options.tintColor)) },
        uFrostDetailLevel: { value: materialResponse.frostDetailLevel },
        uSurfaceDensity: { value: materialResponse.surfaceDensity },
        uTintDensity: { value: materialResponse.tintDensity },
        uTransmissionStrength: {
          value: getGlassOpticalTransmissionStrength(
            toValue(options.transmissionStrength ?? GLASS_OPTICAL_STRENGTH_DEFAULT),
          ),
        },
        uTranslationStrength: { value: getTranslationStrengthScale() },
        uTrail: { value: Array.from({ length: 4 }, () => new Vector4Class(0.5, 0.5, 0, 0)) },
        uTrailCount: { value: hasFluidCapability() ? getRenderProfile().trailCount : 0 },
        uVisibleViewportSize: { value: new three.Vector2(window.innerWidth, window.innerHeight) },
        uScrollOffset: { value: new three.Vector2(0, 0) },
        uWakeDirection: { value: new three.Vector2(0, -1) },
      }
      const material = new three.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        uniforms,
        vertexShader: VERTEX_SHADER,
      })
      const scene = new three.Scene()
      const camera = new three.OrthographicCamera(-1, 1, 1, -1, 0, 1)
      const mesh = new three.Mesh(geometry, material)
      mesh.frustumCulled = false
      scene.add(mesh)
      resources = { camera, geometry, material, mesh, renderer, scene, uniforms }
      const ownerResources = resources
      setupContextEvents(canvas)
      syncFluidDynamics()
      await syncRippleResources()
      if (
        version !== loadVersion ||
        resources !== ownerResources ||
        !toValue(options.active) ||
        options.canvas.value !== canvas
      ) {
        return
      }

      setupObservers()
      setupEvents()
      resizeRenderer()
      await loadWallpaper(toValue(options.wallpaperUrl), version)
      preparePendingWallpaper()
    } catch (error) {
      fallbackFromCurrentLoad(version, '玻璃光学渲染器初始化失败，已回退标准材质:', error)
    }
  }

  /** 由复合层显式重建已释放的 renderer；失败仍进入 fallback，不安排自动重试。 */
  function retryAfterFailure() {
    if (contextRecoveryPending) return Promise.resolve()

    return initializeRenderer()
  }

  /** 运行中切换减少透明度时立即释放或恢复光学资源。 */
  function handleReducedTransparencyChange(event: MediaQueryListEvent) {
    if (!toValue(options.active)) return

    if (event.matches) {
      disposeRenderer()
      updateRendererState('fallback')
      return
    }

    void initializeRenderer()
  }

  const reducedTransparencyQuery = matchMedia('(prefers-reduced-transparency: reduce)')
  reducedTransparencyQuery.addEventListener('change', handleReducedTransparencyChange)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('blur', handleWindowBlur)
  window.addEventListener('focus', handleWindowResume)
  window.addEventListener('pageshow', handleWindowResume)

  watch(
    () => [toValue(options.active), toValue(options.wallpaperUrl)] as const,
    async ([active, wallpaperUrl], previous) => {
      if (!active) {
        disposeRenderer()
        return
      }

      if (resources && wallpaperUrl !== previous?.[1]) {
        if (
          activeWallpaperUrl.value === wallpaperUrl &&
          activeWallpaperPreparationKey.value === getWallpaperPreparationKey(wallpaperUrl)
        ) {
          scheduleWallpaperTransition()
          return
        }
        await refreshWallpaper('玻璃光学壁纸纹理加载失败，已保留当前材质:')
        return
      }

      if (!resources) {
        await nextTick()
        await initializeRenderer()
      }
    },
    { immediate: true },
  )

  watch(
    () => [toValue(options.pendingWallpaperUrl ?? ''), toValue(options.pendingWallpaperRevision ?? 0)] as const,
    ([pendingWallpaperUrl, pendingWallpaperRevision]) => {
      void prepareWallpaper(pendingWallpaperUrl, pendingWallpaperRevision)
    },
    { immediate: true },
  )

  watch(
    () => toValue(options.previousWallpaperUrl ?? ''),
    previousWallpaperUrl => {
      if (previousWallpaperUrl || !resources || !activeTexture) return

      // 外层 previous 槽清空即代表共享切换事务完成；双纹理必须在下一笔输入前同步归一。
      finishWallpaperTransition()
      renderFrame(performance.now(), false)
    },
    { flush: 'sync' },
  )

  watch(
    () => toValue(options.appearance),
    async (appearance, previousAppearance) => {
      if (!resources) return

      const applyAppearance = () => {
        if (!resources || toValue(options.appearance) !== appearance) return

        const materialResponse = getGlassMaterialResponse(
          appearance,
          toValue(options.transparencyStrength ?? GLASS_OPTICAL_STRENGTH_DEFAULT),
        )
        resources.uniforms.uAppearance.value = getGlassAppearanceUniformValue(appearance)
        resources.uniforms.uBackgroundVisibility.value = materialResponse.backgroundVisibility
        resources.uniforms.uDynamicsOnly.value = usesDynamicsOnly() ? 1 : 0
        resources.uniforms.uFrostDetailLevel.value = materialResponse.frostDetailLevel
        resources.uniforms.uSurfaceDensity.value = materialResponse.surfaceDensity
        resources.uniforms.uTintDensity.value = materialResponse.tintDensity
      }
      const wallpaperUrl = toValue(options.wallpaperUrl)
      const quality = toValue(options.quality)
      const routeKey = toValue(options.routeKey)
      const previousKey = getGlassWallpaperPreparationKey(
        previousAppearance ?? appearance,
        quality,
        routeKey,
        wallpaperUrl,
      )
      const nextKey = getGlassWallpaperPreparationKey(appearance, quality, routeKey, wallpaperUrl)
      if (previousKey !== nextKey) {
        invalidatePreparedWallpaper()
        await refreshWallpaper('玻璃材质纹理切换失败，已保留当前材质:', applyAppearance)
        if (toValue(options.appearance) === appearance) preparePendingWallpaper()
        return
      }

      applyAppearance()
      scheduleSurfaceStabilityUpdate()
    },
  )

  watch(
    () => [toValue(options.dynamicsActive ?? true), toValue(options.dynamicsMode ?? 'fluid')] as const,
    async () => {
      if (!resources) return

      const version = loadVersion
      try {
        await syncDynamicsMode()
      } catch (error) {
        fallbackFromCurrentLoad(version, '玻璃动态策略切换失败，已回退标准材质:', error)
      }
    },
  )

  watch(
    () => toValue(options.quality),
    async (quality, previousQuality) => {
      if (!resources) return

      const previousProfile = getGlassOpticalRenderProfile(previousQuality, toValue(options.routeKey))
      const nextProfile = getGlassOpticalRenderProfile(quality, toValue(options.routeKey))
      const applyQuality = () => {
        if (!resources || toValue(options.quality) !== quality) return

        resources.uniforms.uMaxRefractionPixels.value = getMaxRefractionPixels()
        resources.uniforms.uQuality.value = quality === 'high' ? 1 : 0
        resources.uniforms.uTrailCount.value = hasFluidCapability() ? nextProfile.trailCount : 0
        interactionAnimating = false
        cancelScheduledFrame()
        resetInteractionState()
        if (hasRippleCapability()) disposeRippleResources()
      }
      const finishQualityChange = async () => {
        if (!resources || toValue(options.quality) !== quality) return

        await syncDynamicsMode()
      }

      if (!profileRequiresTextureReload(previousProfile, nextProfile)) {
        applyQuality()
        try {
          await finishQualityChange()
        } catch (error) {
          fallbackFromCurrentLoad(loadVersion, '玻璃动态质量切换失败，已回退标准材质:', error)
        }
        return
      }

      invalidatePreparedWallpaper()
      await refreshWallpaper('玻璃光学质量切换失败，已保留当前材质:', applyQuality)
      if (toValue(options.quality) === quality) {
        try {
          await finishQualityChange()
        } catch (error) {
          fallbackFromCurrentLoad(loadVersion, '玻璃动态质量切换失败，已回退标准材质:', error)
          return
        }
        preparePendingWallpaper()
      }
    },
  )

  watch(
    () => toValue(options.tintColor),
    tintColor => {
      if (!resources) return

      resources.uniforms.uTintColor.value.set(tintColor)
      scheduleFrame()
    },
  )

  watch(
    () =>
      [
        toValue(options.translationStrength ?? getLegacyDynamicStrength()),
        toValue(options.deformationStrength ?? getLegacyDynamicStrength()),
        toValue(options.flowStrength ?? getLegacyDynamicStrength()),
        toValue(options.reflectionStrength ?? GLASS_OPTICAL_STRENGTH_DEFAULT),
        toValue(options.transparencyStrength ?? GLASS_OPTICAL_STRENGTH_DEFAULT),
        toValue(options.transmissionStrength ?? GLASS_OPTICAL_STRENGTH_DEFAULT),
      ] as const,
    ([
      translationStrength,
      deformationStrength,
      flowStrength,
      reflectionStrength,
      transparencyStrength,
      transmissionStrength,
    ]) => {
      if (!resources) return

      const fluidActive = hasFluidCapability()
      resources.uniforms.uTranslationStrength.value = fluidActive
        ? getGlassOpticalTranslationStrengthScale(translationStrength)
        : 0
      resources.uniforms.uDeformationStrength.value = fluidActive
        ? getGlassOpticalDeformationStrengthScale(deformationStrength)
        : 0
      resources.uniforms.uFlowStrength.value = fluidActive ? getGlassOpticalFlowStrengthScale(flowStrength) : 0
      resources.uniforms.uMotionExpansion.value = fluidActive ? getGlassOpticalMotionExpansion(flowStrength) : 0
      resources.uniforms.uMaxRefractionPixels.value = getMaxRefractionPixels()
      resources.uniforms.uRippleDeformationStrength.value = hasRippleCapability()
        ? Math.min(1, Math.max(0, deformationStrength / 100))
        : 0
      rippleResources?.setParameters(translationStrength, flowStrength)
      resources.uniforms.uReflectionStrength.value = getGlassOpticalReflectionStrengthScale(reflectionStrength)
      const materialResponse = getGlassMaterialResponse(toValue(options.appearance), transparencyStrength)
      resources.uniforms.uBackgroundVisibility.value = materialResponse.backgroundVisibility
      resources.uniforms.uFrostDetailLevel.value = materialResponse.frostDetailLevel
      resources.uniforms.uSurfaceDensity.value = materialResponse.surfaceDensity
      resources.uniforms.uTintDensity.value = materialResponse.tintDensity
      resources.uniforms.uTransmissionStrength.value = getGlassOpticalTransmissionStrength(transmissionStrength)
      if (fluidActive && resources.uniforms.uFlowStrength.value <= 0 && interactionAnimating) {
        interactionAnimating = false
        cancelScheduledFrame()
        pendingFlowInjection = 0
        for (const trail of resources.uniforms.uTrail.value) trail.z = 0
      }
      scheduleFrame()
    },
  )

  watch(
    () => toValue(options.pageMotion?.revision ?? 0),
    () => {
      if (!resources || presentationSpace !== 'scroll') return

      const timestamp = performance.now()
      // 页面入场期间内容高度与 canvas CSS 尺寸可能同帧变化；presentation 必须先于表面和清屏提交。
      resizeRenderer()
      updateSurfaceUniforms(timestamp, false)
      renderFrame(timestamp, false)
    },
    { flush: 'sync' },
  )

  watch(
    () => [toValue(options.pageMotion?.active ?? false), toValue(options.pageMotion?.epoch ?? 0)] as const,
    ([motionActive, motionEpoch]) => {
      if (!resources || presentationSpace !== 'scroll' || !motionActive) return

      // motion epoch 是页面事务的唯一身份；同步重置稳定采样，避免旧路由的尾帧释放新事务。
      pagePresentationGeometryReady = false
      scheduleSurfaceStabilityUpdate(motionEpoch)
    },
    { flush: 'sync' },
  )

  watch(
    () => toValue(options.routeKey),
    async (routeKey, previousRouteKey) => {
      const previousProfile = getRenderProfile(previousRouteKey ?? '')
      const wallpaperUrl = toValue(options.wallpaperUrl)
      const appearance = toValue(options.appearance)
      const quality = toValue(options.quality)
      const previousKey = getGlassWallpaperPreparationKey(appearance, quality, previousRouteKey ?? '', wallpaperUrl)
      const nextKey = getGlassWallpaperPreparationKey(appearance, quality, routeKey, wallpaperUrl)
      if (previousKey !== nextKey) invalidatePreparedWallpaper()
      if (resources && presentationSpace === 'scroll' && options.pageMotion) {
        pagePresentationGeometryReady = false
        pagePresentationMotionEpoch = toValue(options.pageMotion.epoch)
        const timestamp = performance.now()
        updateSurfaceUniforms(timestamp, false)
        renderFrame(timestamp, false)
      }
      await nextTick()
      if (resources) {
        const nextProfile = getRenderProfile(routeKey)
        resizeRenderer()

        if (profileRequiresTextureReload(previousProfile, nextProfile)) {
          await refreshWallpaper('玻璃场景纹理切换失败，已保留当前材质:', resizeRenderer)
          if (toValue(options.routeKey) === routeKey) preparePendingWallpaper()
          return
        }
      }
      if (presentationSpace === 'scroll' && options.pageMotion) {
        scheduleSurfaceStabilityUpdate(toValue(options.pageMotion.epoch))
      } else scheduleSurfaceUpdate()
    },
  )

  onScopeDispose(() => {
    reducedTransparencyQuery.removeEventListener('change', handleReducedTransparencyChange)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('blur', handleWindowBlur)
    window.removeEventListener('focus', handleWindowResume)
    window.removeEventListener('pageshow', handleWindowResume)
    disposeRenderer()
  })

  return {
    activatePreparedWallpaper,
    activeWallpaperPreparationKey,
    activeWallpaperRevision,
    activeWallpaperUrl,
    canActivatePreparedWallpaper,
    failedWallpaperPreparationKey,
    failedWallpaperRevision,
    failedWallpaperUrl,
    preparedWallpaperPreparationKey,
    preparedWallpaperUrl,
    preparedWallpaperRevision,
    renderedFrames,
    retryAfterFailure,
    rollbackPreparedWallpaperActivation,
    state,
  }
}
