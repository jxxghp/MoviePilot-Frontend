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
  getGlassOpticalTransparency,
  getGlassOpticalTranslationStrengthScale,
  getGlassOpticalSurfaceTransitionWeights,
  getGlassOpticalWakeDirection,
  getGlassWallpaperTransitionProgress,
  normalizeGlassOpticalRect,
  reconcileGlassOpticalSurfaceSlots,
  selectGlassOpticalRects,
  stepGlassOpticalSpring,
  type GlassCornerRadii,
  type GlassOpticalQuality,
  type GlassOpticalRect,
  type GlassOpticalSurfaceCandidate,
  type GlassOpticalSurfaceMode,
  type GlassOpticalSurfaceSlot,
} from '@/utils/glassOptics'
import type { ThemeCustomizerGlassAppearance } from '@/composables/useThemeCustomizer'
import type { PagePresentationMotionReader } from '@/composables/usePagePresentationMotion'
import { APP_ACTIVITY_SUSPEND_DELAY_MS } from '@/utils/appActivityLifecycle'
import {
  analyzeGlassWallpaperTone,
  DEFAULT_GLASS_WALLPAPER_TONE_PROFILE,
  type GlassWallpaperToneProfile,
} from '@/utils/glassWallpaperTone'

type ThreeModule = typeof import('three')
export type GlassRendererState = 'fallback' | 'loading' | 'ready'
export type GlassPresentationSpace = 'fixed' | 'scroll'

export interface GlassOpticalInteractionSource {
  /** 按呈现空间订阅共享输入；同一事件只会交给一个空间。 */
  subscribe(space: GlassPresentationSpace, listener: (event: PointerEvent | TouchEvent) => void): () => void
}

/** 同步组件状态和根节点属性，确保 CSS 回退与 renderer 生命周期一致。 */
export function setGlassRendererState(state: Ref<GlassRendererState>, value: GlassRendererState) {
  state.value = value
  document.documentElement.dataset.glassRendererState = value
}

/** 为有界的多个呈现 context 建立唯一的全局指针与触摸事件源。 */
export function useGlassOpticalInteractionSource(): GlassOpticalInteractionSource {
  const listeners: Record<GlassPresentationSpace, Set<(event: PointerEvent | TouchEvent) => void>> = {
    fixed: new Set(),
    scroll: new Set(),
  }
  const touchOwners = new Map<number, GlassPresentationSpace>()

  const resolvePointOwner = (clientX: number, clientY: number): GlassPresentationSpace => {
    if (document.querySelector('.v-overlay--active')) return 'fixed'

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
      touchOwners.set(changedTouch.identifier, owner)
      return owner
    }

    return touchOwners.get(changedTouch.identifier) ?? null
  }

  const dispatch = (event: PointerEvent | TouchEvent) => {
    const owner =
      event instanceof TouchEvent
        ? resolveTouchOwner(event)
        : resolvePointOwner((event as PointerEvent).clientX, (event as PointerEvent).clientY)
    if (!owner) return

    for (const listener of listeners[owner]) listener(event)
    if (event instanceof TouchEvent && (event.type === 'touchend' || event.type === 'touchcancel')) {
      for (const touch of Array.from(event.changedTouches)) touchOwners.delete(touch.identifier)
    }
  }

  window.addEventListener('pointermove', dispatch, { passive: true })
  window.addEventListener('touchstart', dispatch, { passive: true })
  window.addEventListener('touchmove', dispatch, { passive: true })
  window.addEventListener('touchend', dispatch, { passive: true })
  window.addEventListener('touchcancel', dispatch, { passive: true })

  onScopeDispose(() => {
    listeners.fixed.clear()
    listeners.scroll.clear()
    touchOwners.clear()
    window.removeEventListener('pointermove', dispatch)
    window.removeEventListener('touchstart', dispatch)
    window.removeEventListener('touchmove', dispatch)
    window.removeEventListener('touchend', dispatch)
    window.removeEventListener('touchcancel', dispatch)
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
  uCoverScale: IUniform<Vector2>
  uDeformationStrength: IUniform<number>
  uFlowTexture: IUniform<Texture | null>
  uFlowStrength: IUniform<number>
  uHasWallpaperTexture: IUniform<number>
  uHasFlowTexture: IUniform<number>
  uHasFrostedTexture: IUniform<number>
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
  uTransparency: IUniform<number>
  uTransmissionStrength: IUniform<number>
  uTranslationStrength: IUniform<number>
  uTrail: IUniform<Vector4[]>
  uTrailCount: IUniform<number>
  uVisibleViewportSize: IUniform<Vector2>
  uScrollOffset: IUniform<Vector2>
  uWakeDirection: IUniform<Vector2>
  uWakeProgress: IUniform<number>
}

interface GlassFlowUniforms extends Record<string, IUniform> {
  uDecay: IUniform<number>
  uInjection: IUniform<number>
  uPointer: IUniform<Vector2>
  uPrevious: IUniform<Texture | null>
  uTexelSize: IUniform<Vector2>
  uVelocity: IUniform<Vector2>
  uViewportAspect: IUniform<number>
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

interface GlassFlowResources {
  material: ShaderMaterial
  mesh: Mesh
  readTarget: WebGLRenderTarget
  scene: Scene
  uniforms: GlassFlowUniforms
  writeTarget: WebGLRenderTarget
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
}

type GlassOpticalSurfaceDescriptor = GlassOpticalSurfaceCandidate<HTMLElement> & {
  mode: GlassOpticalSurfaceMode
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
  /** 纹理像素宽度。 */
  width: number
}

const SURFACE_SELECTORS = [
  { rank: 1, selector: '.v-overlay--active .v-overlay__content > .v-card', space: 'fixed' },
  { rank: 1, selector: '.v-overlay--active .v-overlay__content > .v-sheet', space: 'fixed' },
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

/** 登录卡片随文档弹性合成，其余固定表面继续使用 viewport 坐标。 */
function getSurfacePresentationSpace(
  selector: (typeof SURFACE_SELECTORS)[number]['selector'],
  defaultSpace: GlassPresentationSpace,
) {
  return selector === '.login-card' && document.querySelector('.login-root') ? 'scroll' : defaultSpace
}

/** 判断新增或移除的 DOM 子树是否会改变光学表面集合。 */
export function containsGlassOpticalSurface(node: Node) {
  return (
    node instanceof Element &&
    (node.matches(SURFACE_SELECTOR_QUERY) || Boolean(node.querySelector(SURFACE_SELECTOR_QUERY)))
  )
}

const VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FLOW_FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D uPrevious;
uniform vec2 uPointer;
uniform vec2 uVelocity;
uniform vec2 uTexelSize;
uniform float uInjection;
uniform float uDecay;
uniform float uViewportAspect;
varying vec2 vUv;

void main() {
  vec4 previous = (
    texture2D(uPrevious, vUv) * 0.5 +
    texture2D(uPrevious, vUv + vec2(uTexelSize.x, 0.0)) * 0.125 +
    texture2D(uPrevious, vUv - vec2(uTexelSize.x, 0.0)) * 0.125 +
    texture2D(uPrevious, vUv + vec2(0.0, uTexelSize.y)) * 0.125 +
    texture2D(uPrevious, vUv - vec2(0.0, uTexelSize.y)) * 0.125
  );
  float previousEnergy = previous.z;
  vec2 flow = previousEnergy < 0.001 ? vec2(0.0) : (previous.xy * 2.0 - 1.0) * uDecay;
  float energy = previousEnergy * uDecay;
  vec2 delta = vUv - uPointer;
  delta.x *= uViewportAspect;
  float distanceSquared = dot(delta, delta);
  float injection = exp(-distanceSquared * 70.0) * uInjection;
  float speed = length(uVelocity);
  vec2 direction = speed > 0.0001 ? uVelocity / speed : vec2(0.0, -1.0);
  vec2 perpendicular = vec2(-direction.y, direction.x);
  float shear = dot(delta, perpendicular) * exp(-distanceSquared * 42.0);

  flow += (direction * min(speed * 9.0, 0.9) - perpendicular * shear * 0.85) * injection * 0.44;
  energy = max(energy, injection);

  gl_FragColor = vec4(flow * 0.5 + 0.5, energy, 1.0);
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
uniform float uFlowStrength;
uniform float uHasWallpaperTexture;
uniform float uHasFlowTexture;
uniform float uHasFrostedTexture;
uniform float uMotion;
uniform float uMotionExpansion;
uniform float uMaxRefractionPixels;
uniform vec2 uPointer;
uniform vec2 uPointerVelocity;
uniform vec2 uWakeDirection;
uniform float uWakeProgress;
uniform float uQuality;
uniform float uReflectionStrength;
uniform vec4 uRects[8];
uniform vec4 uRadii[8];
uniform float uSurfaceWeights[8];
uniform float uSurfaceDynamics[8];
uniform int uRectCount;
uniform float uAppearance;
uniform vec3 uTintColor;
uniform float uTransparency;
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
  return 1.0 - smoothstep(-1.5, 0.0, distanceToEdge);
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
  transmissionMaterialScale = mix(transmissionMaterialScale, 0.42, frosted);
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
    previous = texture2D(uPreviousFrostedTexture, previousUv).rgb;
    current = texture2D(uFrostedTexture, uv).rgb;
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
  float dynamicMask = 0.0;
  vec2 staticRefraction = vec2(0.0);
  vec2 dynamicRefraction = vec2(0.0);
  vec2 wakeDirection = length(uWakeDirection) > 0.0001 ? normalize(uWakeDirection) : vec2(0.0, -1.0);
  vec2 wakePerpendicular = vec2(-wakeDirection.y, wakeDirection.x);
  vec2 trailRefraction = vec2(0.0);
  float trailEnergy = 0.0;
  float motionRangeCompression = mix(1.0, 1.34, uMotionExpansion);

  for (int trailIndex = 0; trailIndex < 4; trailIndex++) {
    if (trailIndex >= uTrailCount) break;

    vec4 trail = uTrail[trailIndex];
    vec2 trailDelta = vUv - trail.xy;
    trailDelta *= uPresentationSize / max(uVisibleViewportSize.y, 1.0) * motionRangeCompression;
    float along = dot(trailDelta, wakeDirection);
    float across = dot(trailDelta, wakePerpendicular);
    float trailAlongDensity = mix(42.0, 22.0, uMotionExpansion);
    float trailAcrossDensity = mix(210.0, 86.0, uMotionExpansion);
    float lobe =
      exp(-(along * along * trailAlongDensity + across * across * trailAcrossDensity)) * trail.z * uMotion;
    float wake = mix(0.88, 0.58, float(trailIndex) / 3.0);

    trailRefraction +=
      (wakeDirection * 0.0048 + wakePerpendicular * across * 0.018) *
      lobe *
      uDeformationStrength *
      uFlowStrength;
    trailEnergy += lobe * wake * mix(0.72, 0.42, float(trailIndex) / 3.0);
  }

  vec4 flowSample = uHasFlowTexture > 0.5 ? texture2D(uFlowTexture, vUv) : vec4(0.5, 0.5, 0.0, 1.0);
  vec2 temporalFlow =
    uHasFlowTexture > 0.5
      ? (flowSample.xy * 2.0 - 1.0) *
        flowSample.z *
        uMotion *
        uDeformationStrength *
        uFlowStrength
      : vec2(0.0);
  float temporalEnergy = uHasFlowTexture > 0.5 ? flowSample.z * uMotion : 0.0;
  float flowSurfaceDetail = 0.0;
  if (uQuality > 0.5 && uHasFlowTexture > 0.5) {
    vec2 flowTexel = vec2(3.0) / max(uPresentationSize, vec2(1.0));
    vec3 flowLeft = texture2D(uFlowTexture, vUv - vec2(flowTexel.x, 0.0)).xyz;
    vec3 flowRight = texture2D(uFlowTexture, vUv + vec2(flowTexel.x, 0.0)).xyz;
    vec3 flowBottom = texture2D(uFlowTexture, vUv - vec2(0.0, flowTexel.y)).xyz;
    vec3 flowTop = texture2D(uFlowTexture, vUv + vec2(0.0, flowTexel.y)).xyz;
    float flowGradient = length(flowRight.xy - flowLeft.xy) + length(flowTop.xy - flowBottom.xy);
    float energyGradient = abs(flowRight.z - flowLeft.z) + abs(flowTop.z - flowBottom.z);
    flowSurfaceDetail = smoothstep(0.015, 0.24, flowGradient + energyGradient * 0.72) * uMotion;
  }
  float frosted = step(1.5, uAppearance);

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
    vec2 pointerDelta = uPointer - vUv;
    vec2 pointerDeltaAspect = pointerDelta;
    pointerDeltaAspect *= uPresentationSize / max(uVisibleViewportSize.y, 1.0) * motionRangeCompression;
    float pointerSpread = mix(mix(26.0, 17.0, uQuality), mix(12.0, 8.0, uQuality), frosted);
    pointerSpread *= mix(1.0, 0.46, uMotionExpansion);
    float pointerEnergy =
      clamp(exp(-dot(pointerDeltaAspect, pointerDeltaAspect) * pointerSpread) * uMotion, 0.0, 1.0);
    vec2 wakeDelta = vUv - uPointer;
    wakeDelta *= uPresentationSize / max(uVisibleViewportSize.y, 1.0) * motionRangeCompression;
    float wakeAlong = dot(wakeDelta, wakeDirection);
    float wakeAcross = dot(wakeDelta, wakePerpendicular);
    float wakeTravel =
      mix(0.014, 0.075, uWakeProgress) *
      mix(0.82, 1.18, uQuality) *
      mix(1.0, 1.45, uMotionExpansion);
    float wakeWidth = mix(0.027, 0.044, uQuality) * mix(1.0, 1.72, uMotionExpansion);
    float wakeCoordinate = (wakeAlong + wakeTravel) / wakeWidth;
    float wakeShape = wakeCoordinate * exp(-0.5 * wakeCoordinate * wakeCoordinate);
    float wakeEnvelope =
      exp(-wakeAcross * wakeAcross * mix(280.0, 145.0, uQuality) * mix(1.0, 0.44, uMotionExpansion));
    vec2 wakeRefraction =
      wakeDirection *
      wakeShape *
      wakeEnvelope *
      mix(0.0045, 0.0075, uQuality) *
      uMotion *
      uDeformationStrength *
      uFlowStrength;
    float wakeEnergy = abs(wakeShape) * wakeEnvelope * uMotion;
    float liquidEnergy = clamp(max(
      pointerEnergy,
      max(min(1.0, trailEnergy) * 0.68, max(temporalEnergy * 0.76, wakeEnergy * 0.82))
    ), 0.0, 1.0);
    float staticLens = 0.00008 + edgeResponse * mix(0.00045, 0.00072, uQuality);
    float pointerStrength = mix(mix(0.0055, 0.008, uQuality), mix(0.0085, 0.012, uQuality), frosted);
    float trailStrength = mix(mix(0.78, 1.08, uQuality), mix(0.96, 1.3, uQuality), frosted);
    float temporalStrength = mix(0.032, 0.042, frosted) * uQuality * (1.0 + flowSurfaceDetail * 0.5);
    vec2 specularDelta = vUv - (uPointer - wakeDirection * mix(0.006, 0.022, uMotionExpansion));
    specularDelta *= uPresentationSize / max(uVisibleViewportSize.y, 1.0) * motionRangeCompression;
    float specularAlong = dot(specularDelta, wakeDirection);
    float specularAcross = dot(specularDelta, wakePerpendicular);
    float singleSpecular =
      exp(-(
        specularAlong * specularAlong * mix(58.0, 25.0, uMotionExpansion) +
        specularAcross * specularAcross * mix(190.0, 78.0, uMotionExpansion)
      )) *
      uMotion *
      mix(1.0, 1.24, uMotionExpansion);
    float localCaustic = singleSpecular * rectMask * surfaceDynamic;
    staticRefraction += lens * staticLens * mix(1.0, 0.72, frosted) * rectMask * surfaceDynamic;
    vec2 sampleTranslation =
      uPointerVelocity *
      mix(0.055, 0.075, uQuality) *
      uMotion *
      uTranslationStrength;
    dynamicRefraction += (
      sampleTranslation +
      pointerDelta * pointerEnergy * pointerStrength * uDeformationStrength +
      trailRefraction * trailStrength +
      temporalFlow * temporalStrength +
      wakeRefraction
    ) * rectMask * surfaceDynamic;
    edge = max(edge, edgeResponse * rectMask * surfaceDynamic);
    caustic = max(caustic, localCaustic);
    directionalReflection = max(directionalReflection, localDirectionalReflection);
    topPrism = max(topPrism, localTopPrism);
    backlightAbsorption = max(backlightAbsorption, localBacklightAbsorption);
    materialEnergy = max(materialEnergy, liquidEnergy * rectMask * surfaceDynamic);
    dynamicMask = max(dynamicMask, rectMask * surfaceDynamic);
    mask = max(mask, rectMask);
  }

  if (mask <= 0.0) discard;

  float contentProtection = getContentProtection(coverUv(vUv + staticRefraction));
  dynamicRefraction *= contentProtection;
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
  float frostedDensity = frosted * (1.0 - smoothstep(0.25, 0.9, uTransparency));
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
  // 只有局部动态覆盖可以提高壁纸替换权，静止像素继续遵循用户设置的通透度。
  float opticalCoverage = smoothstep(0.02, 0.55, liquidPresence);
  float materialAlpha = mix(uTransparency * 0.26, 0.92, opticalCoverage);
  float proceduralEdgeAlpha = 0.14;
  float proceduralCausticAlpha = 0.075;

  if (uAppearance > 1.5) {
    highlight = vec3(0.94, 0.97, 1.0);
    edgeHighlightMix = 0.15;
    causticHighlightMix = 0.042;
    float frostedBaseAlpha = mix(0.78, 0.94, uTransparency) * 0.9;
    materialAlpha = mix(frostedBaseAlpha, 0.94, opticalCoverage);
    proceduralEdgeAlpha = 0.16;
    proceduralCausticAlpha = 0.045;
  } else if (uAppearance > 0.5) {
    highlight = mix(vec3(1.0), uTintColor, 0.72);
    edgeHighlightMix = 0.17;
    causticHighlightMix = 0.085;
    materialAlpha = mix(uTransparency * 0.44, 0.92, opticalCoverage);
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
const FLOW_BUFFER_SCALE = 0.25
const FROST_PREFILTER_SCALE = 0.125
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

      const bounds = element.getBoundingClientRect()
      if (!isVisibleSurface(element, bounds)) continue

      const left = Math.max(0, bounds.left)
      const top = Math.max(0, bounds.top)
      const right = Math.min(viewportWidth, bounds.right)
      const bottom = Math.min(viewportHeight, bounds.bottom)
      const visibleHeight = Math.max(0, bottom - top)
      const visibleWidth = Math.max(0, right - left)
      if (visibleWidth < 24 || visibleHeight < 24) continue
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
  for (const candidate of candidates.sort(
    (left, right) => left.rect.rank - right.rect.rank || left.visibleArea - right.visibleArea,
  )) {
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
  const preparedWallpaperUrl = ref('')
  let three: ThreeModule | null = null
  let resources: GlassRendererResources | null = null
  let flowResources: GlassFlowResources | null = null
  let frostPrefilterResources: GlassFrostPrefilterResources | null = null
  let activeTexture: Texture | null = null
  let activeFrostedTarget: WebGLRenderTarget | null = null
  let activeTextureHeight = 1
  let activeTextureWidth = 1
  let activeWallpaperExposure = DEFAULT_GLASS_WALLPAPER_TONE_PROFILE.exposure
  let previousTexture: Texture | null = null
  let previousFrostedTarget: WebGLRenderTarget | null = null
  let previousTextureHeight = 1
  let previousTextureWidth = 1
  let previousWallpaperExposure = DEFAULT_GLASS_WALLPAPER_TONE_PROFILE.exposure
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
  let lastTrailAt = 0
  let lastPointerX = window.innerWidth * 0.5
  let lastPointerY = window.innerHeight * 0.5
  let pointerTargetX = 0.5
  let pointerTargetY = 0.5
  let pointerPositionX = 0.5
  let pointerPositionY = 0.5
  let pointerSpringVelocityX = 0
  let pointerSpringVelocityY = 0
  let activeTouchIdentifier: number | null = null
  let pendingFlowInjection = 0
  let interactionAnimating = false
  let presentationResizeCandidate = ''
  let presentationResizeStableSamples = 0
  let presentationResizeTimer: number | null = null
  let scrollAnimationFrame: number | null = null
  let scrollDirty = false
  let scrollSurfaceRefreshPending = false
  let scrollStableFrameCount = 0
  let lastRenderedScrollX = window.scrollX
  let lastRenderedScrollY = window.scrollY
  let unsubscribeInteractionSource: (() => void) | null = null
  let resizeObserver: ResizeObserver | null = null
  let surfaceMutationObserver: MutationObserver | null = null
  let observedSurfaces: HTMLElement[] = []
  let availableSurfaces: GlassOpticalSurfaceDescriptor[] = []
  let surfaceSlots: GlassOpticalSurfaceSlot<HTMLElement>[] = []
  let activeSurface: HTMLElement | null = null
  let outgoingSurface: HTMLElement | null = null
  let surfaceTransitionStartedAt = 0
  let surfaceTransformFrame: number | null = null
  let surfaceTransformTrackingDeadline = 0
  const transformingSurfaces = new Set<HTMLElement>()
  let pagePresentationGeometryReady = true
  let wakeDirection = { x: 0, y: -1 }
  let contextRecoveryPending = false
  const presentationSpace = options.surfaceSpace ?? 'fixed'

  function updateRendererState(value: GlassRendererState) {
    if (options.syncDocumentState === false) {
      state.value = value
      return
    }

    setGlassRendererState(state, value)
  }

  function getPresentationSize() {
    if (presentationSpace === 'fixed') {
      return { height: window.innerHeight, width: window.innerWidth }
    }

    const root = options.canvas.value?.parentElement

    return {
      height: Math.max(window.innerHeight, root?.scrollHeight ?? 0, document.documentElement.scrollHeight),
      width: Math.max(window.innerWidth, root?.scrollWidth ?? 0, document.documentElement.scrollWidth),
    }
  }

  function getPresentationPoint(clientX: number, clientY: number) {
    if (presentationSpace === 'fixed') return { x: clientX, y: clientY }

    return { x: clientX + window.scrollX, y: clientY + window.scrollY }
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
    scrollSurfaceRefreshPending = false
    scrollStableFrameCount = 0
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
    cancelWallpaperTransitionFrame()
  }

  /** 使用外层壁纸的 CSS ease 时钟推进双纹理，不创建常驻动画帧。 */
  function updateWallpaperTransition(timestamp: number) {
    if (!resources || !previousTexture) return false

    const startedAt = toValue(options.transitionStartedAt ?? 0)
    const duration = toValue(options.transitionDuration ?? 0)
    const progress = getGlassWallpaperTransitionProgress(timestamp - startedAt, duration)
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

  /** 壁纸上传时执行两次 separable blur，常态只保留最终 1/8 RenderTarget。 */
  async function createFrostedWallpaperTarget(texture: Texture, width: number, height: number) {
    if (!resources || !three) return null

    const ownerResources = resources
    const prefilter = getFrostPrefilterResources()
    if (!prefilter) return null

    const targetWidth = Math.max(1, Math.round(width * FROST_PREFILTER_SCALE))
    const targetHeight = Math.max(1, Math.round(height * FROST_PREFILTER_SCALE))
    const createTarget = () =>
      new three!.WebGLRenderTarget(targetWidth, targetHeight, {
        depthBuffer: false,
        magFilter: three!.LinearFilter,
        minFilter: three!.LinearFilter,
        stencilBuffer: false,
      })
    const intermediateTarget = createTarget()
    const outputTarget = createTarget()
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
      prefilter.uniforms.uTextureSize.value.set(targetWidth, targetHeight)
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
  function disposeFlowResources() {
    if (!flowResources) return

    flowResources.material.dispose()
    flowResources.readTarget.dispose()
    flowResources.writeTarget.dispose()
    flowResources = null
    if (resources) {
      resources.uniforms.uFlowTexture.value = null
      resources.uniforms.uHasFlowTexture.value = 0
    }
  }

  /** 根据当前质量档创建或释放共享 renderer 内的液态位移场。 */
  function syncFlowResources() {
    if (!resources || !three) return

    const profile = getRenderProfile()
    if (!profile.flowField) {
      disposeFlowResources()
      return
    }
    if (flowResources) return

    const createTarget = () =>
      new three!.WebGLRenderTarget(1, 1, {
        depthBuffer: false,
        magFilter: three!.LinearFilter,
        minFilter: three!.LinearFilter,
        stencilBuffer: false,
      })
    const uniforms: GlassFlowUniforms = {
      uDecay: { value: 1 },
      uInjection: { value: 0 },
      uPointer: { value: resources.uniforms.uPointer.value },
      uPrevious: { value: null },
      uTexelSize: { value: new three.Vector2(1, 1) },
      uVelocity: { value: resources.uniforms.uPointerVelocity.value },
      uViewportAspect: { value: window.innerWidth / Math.max(window.innerHeight, 1) },
    }
    const material = new three.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      fragmentShader: FLOW_FRAGMENT_SHADER,
      uniforms,
      vertexShader: VERTEX_SHADER,
    })
    const scene = new three.Scene()
    const mesh = new three.Mesh(resources.geometry, material)
    mesh.frustumCulled = false
    scene.add(mesh)
    flowResources = {
      material,
      mesh,
      readTarget: createTarget(),
      scene,
      uniforms,
      writeTarget: createTarget(),
    }
    resources.uniforms.uHasFlowTexture.value = 1
  }

  function renderFrame(timestamp = performance.now(), advanceFlow = true) {
    if (!resources || !toValue(options.active) || document.visibilityState === 'hidden') return

    updateWallpaperTransition(timestamp)
    if (flowResources && advanceFlow) {
      resources.renderer.setScissorTest(false)
      flowResources.uniforms.uPrevious.value = flowResources.readTarget.texture
      resources.renderer.setRenderTarget(flowResources.writeTarget)
      resources.renderer.render(flowResources.scene, resources.camera)
      resources.renderer.setRenderTarget(null)
      const previousReadTarget = flowResources.readTarget
      flowResources.readTarget = flowResources.writeTarget
      flowResources.writeTarget = previousReadTarget
      resources.uniforms.uFlowTexture.value = flowResources.readTarget.texture
    }
    if (presentationSpace === 'scroll') {
      const { height: presentationHeight } = getPresentationSize()
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

    const presentation = getPresentationSize()
    const normalized = surfaceSlots.map(slot =>
      normalizeGlassOpticalRect(slot.rect, presentation.width, presentation.height),
    )
    const uniformRects = resources.uniforms.uRects.value
    const uniformRadii = resources.uniforms.uRadii.value
    const uniformWeights = resources.uniforms.uSurfaceWeights.value
    const uniformDynamics = resources.uniforms.uSurfaceDynamics.value
    const transitionWeights = outgoingSurface
      ? getGlassOpticalSurfaceTransitionWeights(timestamp - surfaceTransitionStartedAt, SURFACE_TRANSITION_DURATION_MS)
      : { incoming: 1, outgoing: 0 }
    const pageMotionOpacity =
      presentationSpace === 'scroll' ? Math.min(1, Math.max(0, toValue(options.pageMotion?.opacity ?? 1))) : 1
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
      uniformDynamics[index] = slot?.mode === 'static-material' ? 0 : 1
    }

    resources.uniforms.uRectCount.value = normalized.length
  }

  function updateSurfaceUniforms(timestamp = performance.now(), scheduleRender = true) {
    if (!resources) return

    const viewportWidth = window.innerWidth
    availableSurfaces = collectGlassOpticalSurfaceDescriptors(
      viewportWidth,
      window.innerHeight,
      toValue(options.appearance),
      presentationSpace,
    )
    const availableKeys = new Set(availableSurfaces.map(surface => surface.key))
    if (activeSurface && !availableKeys.has(activeSurface)) activeSurface = null
    if (outgoingSurface && !availableKeys.has(outgoingSurface)) outgoingSurface = null
    const maxCount = viewportWidth <= 600 ? GLASS_OPTICAL_MAX_SURFACES_MOBILE : GLASS_OPTICAL_MAX_SURFACES_DESKTOP
    surfaceSlots = reconcileGlassOpticalSurfaceSlots(
      surfaceSlots,
      availableSurfaces,
      maxCount,
      activeSurface ?? undefined,
      outgoingSurface ?? undefined,
    )
    writeSurfaceUniforms(timestamp)

    const nextObservedSurfaces = Array.from(
      new Set(
        SURFACE_SELECTORS.filter(
          ({ selector, space }) => getSurfacePresentationSpace(selector, space) === presentationSpace,
        ).flatMap(({ selector }) => Array.from(document.querySelectorAll<HTMLElement>(selector))),
      ),
    )
    const observedSurfacesChanged =
      nextObservedSurfaces.length !== observedSurfaces.length ||
      nextObservedSurfaces.some((element, index) => element !== observedSurfaces[index])

    if (observedSurfacesChanged) {
      observedSurfaces = nextObservedSurfaces
      observeResizeTargets()
    }
    if (scheduleRender) scheduleFrame()
  }

  function scheduleSurfaceUpdate() {
    if (surfaceUpdateFrame !== null || !resources) return

    surfaceUpdateFrame = requestAnimationFrame(timestamp => {
      surfaceUpdateFrame = null
      updateSurfaceUniforms(timestamp, false)
      // 表面失效必须在同一有界帧内清除旧像素，不能等待下一次指针或壁纸事件。
      renderFrame(timestamp, false)
    })
  }

  /** DOM 重排后连续采样少量帧，避免把虚拟列表的中间几何误认为最终表面。 */
  function scheduleSurfaceStabilityUpdate() {
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

      const presentation = getPresentationSize()
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
    if (
      !resources ||
      presentationSpace !== 'scroll' ||
      !toValue(options.pageMotion?.active ?? false)
    )
      return false

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

    const timestamp = performance.now()
    updateSurfaceUniforms(timestamp, false)
    renderFrame(timestamp, false)
  }

  /** CSS transform 不改变布局尺寸，过渡期间用有界帧同步真实几何并清除旧蒙版。 */
  function scheduleSurfaceTransformFrame() {
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
    if (!surface) return null

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

  function getLegacyDynamicStrength() {
    return toValue(options.motionStrength ?? GLASS_OPTICAL_STRENGTH_DEFAULT)
  }

  function getTranslationStrengthScale() {
    return getGlassOpticalTranslationStrengthScale(toValue(options.translationStrength ?? getLegacyDynamicStrength()))
  }

  function getDeformationStrengthScale() {
    return getGlassOpticalDeformationStrengthScale(toValue(options.deformationStrength ?? getLegacyDynamicStrength()))
  }

  function getFlowStrengthScale() {
    return getGlassOpticalFlowStrengthScale(toValue(options.flowStrength ?? getLegacyDynamicStrength()))
  }

  function getMotionExpansion() {
    return getGlassOpticalMotionExpansion(toValue(options.flowStrength ?? getLegacyDynamicStrength()))
  }

  function getMaxRefractionPixels() {
    return getGlassOpticalMaxRefractionPixels(
      getRenderProfile().maxRefractionPixels,
      toValue(options.deformationStrength ?? getLegacyDynamicStrength()),
    )
  }

  function getReflectionStrengthScale() {
    return getGlassOpticalReflectionStrengthScale(toValue(options.reflectionStrength ?? GLASS_OPTICAL_STRENGTH_DEFAULT))
  }

  function getTransparency() {
    return getGlassOpticalTransparency(toValue(options.transparencyStrength ?? GLASS_OPTICAL_STRENGTH_DEFAULT))
  }

  function resizeRenderer() {
    if (!resources) return

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const presentation = getPresentationSize()
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
    if (flowResources) {
      const flowWidth = Math.max(96, Math.round(buffer.width * FLOW_BUFFER_SCALE))
      const flowHeight = Math.max(96, Math.round(buffer.height * FLOW_BUFFER_SCALE))
      const flowBufferChanged =
        flowResources.readTarget.width !== flowWidth || flowResources.readTarget.height !== flowHeight
      if (flowBufferChanged) {
        flowResources.readTarget.setSize(flowWidth, flowHeight)
        flowResources.writeTarget.setSize(flowWidth, flowHeight)
      }
      flowResources.uniforms.uTexelSize.value.set(1 / flowWidth, 1 / flowHeight)
      flowResources.uniforms.uViewportAspect.value = viewportWidth / Math.max(viewportHeight, 1)
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

  function findInteractionSurface(x: number, y: number) {
    if (availableSurfaces.length === 0) updateSurfaceUniforms()

    return availableSurfaces.find(surface => rectContainsPoint(surface.rect, x, y)) ?? null
  }

  /**
   * 跨表面移动只交接活动身份，不重排其余槽位或让轨迹穿过卡片间隙。
   * 已在预算内的表面保持完整权重；只有预算外表面进入时才让被替换表面单调淡出。
   */
  function activateInteractionSurface(surface: HTMLElement, timestamp: number, reducedMotion: boolean) {
    if (activeSurface === surface) {
      writeSurfaceUniforms(timestamp)
      return false
    }

    const surfaceAlreadyHasSlot = surfaceSlots.some(slot => slot.key === surface)
    outgoingSurface = reducedMotion || surfaceAlreadyHasSlot ? null : activeSurface
    activeSurface = surface
    surfaceTransitionStartedAt = timestamp
    lastTrailAt = Number.NEGATIVE_INFINITY
    pendingFlowInjection = 0
    if (resources) {
      for (const trail of resources.uniforms.uTrail.value) trail.z = 0
    }
    if (flowResources) {
      flowResources.uniforms.uDecay.value = 0
      flowResources.uniforms.uInjection.value = 0
    }
    const maxCount = window.innerWidth <= 600 ? GLASS_OPTICAL_MAX_SURFACES_MOBILE : GLASS_OPTICAL_MAX_SURFACES_DESKTOP
    surfaceSlots = reconcileGlassOpticalSurfaceSlots(
      surfaceSlots,
      availableSurfaces,
      maxCount,
      activeSurface,
      outgoingSurface ?? undefined,
    )
    writeSurfaceUniforms(timestamp)

    return true
  }

  /** 让触点保持直接反馈，精细指针则以受控惯性跟随输入目标。 */
  function updatePointerTarget(x: number, y: number, response: number) {
    if (!resources) return

    pointerTargetX = x
    pointerTargetY = y
    const clampedResponse = Math.min(1, Math.max(0, response))
    pointerPositionX += (pointerTargetX - pointerPositionX) * clampedResponse
    pointerPositionY += (pointerTargetY - pointerPositionY) * clampedResponse
    if (clampedResponse >= 1) {
      pointerSpringVelocityX = 0
      pointerSpringVelocityY = 0
    }
    resources.uniforms.uPointer.value.set(pointerPositionX, pointerPositionY)
  }

  function snapPointer(x: number, y: number) {
    pointerTargetX = x
    pointerTargetY = y
    pointerPositionX = x
    pointerPositionY = y
    pointerSpringVelocityX = 0
    pointerSpringVelocityY = 0
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

    const presentation = getPresentationSize()
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
    if (!resources) return

    snapPointer(pointerTargetX, pointerTargetY)
    resources.uniforms.uMotion.value = 0
    resources.uniforms.uPointerVelocity.value.set(0, 0)
    resources.uniforms.uWakeProgress.value = 1
    for (const trail of resources.uniforms.uTrail.value) trail.z = 0
    if (flowResources) {
      flowResources.uniforms.uDecay.value = 0
      flowResources.uniforms.uInjection.value = 0
    }
  }

  function renderInteractionFrame(timestamp: number) {
    if (!resources || !toValue(options.active) || document.visibilityState === 'hidden') {
      animationFrame = null
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
    resources.uniforms.uWakeProgress.value = Math.min(1, elapsed / Math.max(1, motionDuration))
    if (motion <= 0) {
      resetInteractionState()
      renderFrame()
      interactionAnimating = false
      return
    }

    const delta = lastInteractionFrameAt > 0 ? Math.min(64, Math.max(0, timestamp - lastInteractionFrameAt)) : 16.67
    lastInteractionFrameAt = timestamp
    const horizontalSpring = stepGlassOpticalSpring(
      { position: pointerPositionX, velocity: pointerSpringVelocityX },
      pointerTargetX,
      delta,
      profile.springFrequency,
      profile.springDamping,
    )
    const verticalSpring = stepGlassOpticalSpring(
      { position: pointerPositionY, velocity: pointerSpringVelocityY },
      pointerTargetY,
      delta,
      profile.springFrequency,
      profile.springDamping,
    )
    pointerPositionX = horizontalSpring.position
    pointerPositionY = verticalSpring.position
    pointerSpringVelocityX = horizontalSpring.velocity
    pointerSpringVelocityY = verticalSpring.velocity
    resources.uniforms.uPointer.value.set(pointerPositionX, pointerPositionY)
    // 收敛期只衰减能量；输入方向保留到最终清场，避免低能量归一化时发生方向跳变。
    resources.uniforms.uMotion.value = motion
    if (flowResources) {
      flowResources.uniforms.uDecay.value = getGlassOpticalDecay(profile.flowHalfLife, delta)
      flowResources.uniforms.uInjection.value = pendingFlowInjection
    }
    pendingFlowInjection = 0
    renderFrame()
    if (flowResources) flowResources.uniforms.uInjection.value = 0
    animationFrame = requestAnimationFrame(renderInteractionFrame)
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
  ) {
    const viewportWidth = Math.max(window.innerWidth, 1)
    const viewportHeight = Math.max(window.innerHeight, 1)
    const presentation = getPresentationSize()
    const point = getPresentationPoint(clientX, clientY)
    const previousPoint = getPresentationPoint(lastPointerX, lastPointerY)
    const elapsed = Math.max(8, timestamp - lastPointerAt)
    const previousNormalizedX = previousPoint.x / Math.max(presentation.width, 1)
    const previousNormalizedY = 1 - previousPoint.y / Math.max(presentation.height, 1)
    const velocityX = velocityOverride?.x ?? ((clientX - lastPointerX) / viewportWidth) * Math.min(2, 16.67 / elapsed)
    const velocityY = velocityOverride?.y ?? (-(clientY - lastPointerY) / viewportHeight) * Math.min(2, 16.67 / elapsed)
    const velocityLength = Math.hypot(velocityX, velocityY)
    const velocityScale = velocityLength > 0.09 ? 0.09 / velocityLength : 1
    const surface = findInteractionSurface(point.x, point.y)
    lastPointerX = clientX
    lastPointerY = clientY
    lastPointerAt = timestamp
    if (!resources || !surface || surface.mode === 'static-material') return

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const surfaceChanged = activateInteractionSurface(surface.key, timestamp, reducedMotion)
    const restartsWake = surfaceChanged || !interactionAnimating
    const normalizedX = point.x / Math.max(presentation.width, 1)
    const normalizedY = 1 - point.y / Math.max(presentation.height, 1)
    if (surfaceChanged) {
      snapPointer(normalizedX, normalizedY)
      updateTrail(point.x, point.y, timestamp, normalizedX, normalizedY)
    } else {
      updateTrail(point.x, point.y, timestamp, previousNormalizedX, previousNormalizedY)
      const profile = getRenderProfile()
      const directTouchResponse =
        window.innerWidth <= 600 || matchMedia('(pointer: coarse)').matches || activeTouchIdentifier !== null
      updatePointerTarget(normalizedX, normalizedY, directTouchResponse ? 1 : profile.pointerImmediateResponse)
    }
    const scaledVelocity = { x: velocityX * velocityScale, y: velocityY * velocityScale }
    wakeDirection = getGlassOpticalWakeDirection(
      wakeDirection,
      scaledVelocity,
      Math.hypot(scaledVelocity.x, scaledVelocity.y),
      restartsWake,
    )
    resources.uniforms.uPointerVelocity.value.set(scaledVelocity.x, scaledVelocity.y)
    resources.uniforms.uWakeDirection.value.set(wakeDirection.x, wakeDirection.y)
    resources.uniforms.uWakeProgress.value = 0
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
      if (flowResources) {
        flowResources.uniforms.uDecay.value = 0
        flowResources.uniforms.uInjection.value = 0
      }
      scheduleFrame()
      return
    }

    pendingFlowInjection = Math.max(pendingFlowInjection, Math.min(1, velocityLength * 18))
    startInteractionAnimation()
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerType === 'touch') return

    applyInteraction(event.clientX, event.clientY, event.timeStamp || performance.now())
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

    const touch = findTouch(event.changedTouches, null)
    if (!touch) return

    const timestamp = event.timeStamp || performance.now()
    activeTouchIdentifier = touch.identifier
    lastPointerX = touch.clientX
    lastPointerY = touch.clientY
    lastPointerAt = timestamp
    const point = getPresentationPoint(touch.clientX, touch.clientY)
    const presentation = getPresentationSize()
    const surface = findInteractionSurface(point.x, point.y)
    if (resources && surface?.mode === 'dynamic') {
      activateInteractionSurface(surface.key, timestamp, matchMedia('(prefers-reduced-motion: reduce)').matches)
      snapPointer(point.x / Math.max(presentation.width, 1), 1 - point.y / Math.max(presentation.height, 1))
      scheduleFrame()
    }
  }

  function handleTouchMove(event: TouchEvent) {
    const touch = findTouch(event.touches, activeTouchIdentifier)
    if (!touch) return

    const timestamp = event.timeStamp || performance.now()
    applyInteraction(touch.clientX, touch.clientY, timestamp)
  }

  function handleTouchEnd(event: TouchEvent) {
    if (!findTouch(event.changedTouches, activeTouchIdentifier)) return

    activeTouchIdentifier = null
  }

  function handleInteractionEvent(event: PointerEvent | TouchEvent) {
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

  /**
   * 滚动坐标连续稳定两帧后停止刷新，给 compositor 留出提交最终位置的机会。
   * 滚动期间只更新采样坐标；稳定后同步一次可见表面，不改变交互能量或时序流场。
   */
  function renderScrollFrame(timestamp: number) {
    scrollAnimationFrame = null
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

    scrollStableFrameCount = receivedScrollEvent || coordinatesChanged ? 0 : scrollStableFrameCount + 1
    if (scrollStableFrameCount >= SCROLL_STABLE_TAIL_FRAMES && scrollSurfaceRefreshPending) {
      scrollSurfaceRefreshPending = false
      updateSurfaceUniforms(timestamp, false)
    }
    if (!interactionAnimating) renderFrame(timestamp, false)

    if (scrollStableFrameCount < SCROLL_STABLE_TAIL_FRAMES) {
      scrollAnimationFrame = requestAnimationFrame(renderScrollFrame)
    }
  }

  function scheduleScrollFrame() {
    if (scrollAnimationFrame !== null || presentationSpace !== 'scroll' || !resources) return

    scrollAnimationFrame = requestAnimationFrame(renderScrollFrame)
  }

  function handleScroll() {
    if (presentationSpace === 'scroll' && resources) {
      resources.uniforms.uScrollOffset.value.set(window.scrollX, window.scrollY)
      scrollDirty = true
      scrollSurfaceRefreshPending = true
      scheduleScrollFrame()
      return
    }
  }

  function handleScrollEnd() {
    if (presentationSpace !== 'scroll' || !resources) return

    scrollDirty = false
    scrollSurfaceRefreshPending = true
    scrollStableFrameCount = 0
    scheduleScrollFrame()
  }

  /** 暂停事件驱动帧但保留 WebGL context、纹理、流场和最后一张稳定画面。 */
  function pauseRenderer() {
    cancelScheduledFrame()
    cancelScrollFrame()
    cancelWallpaperTransitionFrame()
    cancelSurfaceTransformFrame()
    interactionAnimating = false
  }

  /** 恢复时先同步尺寸和表面，再立即绘制不含旧惯性的稳定首帧。 */
  async function resumeRenderer() {
    clearBackgroundDisposeTimer()
    if (!toValue(options.active) || document.visibilityState === 'hidden') return

    await nextTick()
    if (!resources) {
      await initializeRenderer()
      return
    }

    resizeRenderer()
    updateSurfaceUniforms()
    resetInteractionState()
    renderFrame(performance.now())
    scheduleWallpaperTransition()
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
    cancelScheduledFrame()
    contextRecoveryPending = true
    updateRendererState('fallback')
  }

  function handleContextRestored() {
    if (!contextRecoveryPending) return

    contextRecoveryPending = false
    void initializeRenderer(false)
  }

  function handleWindowResize() {
    if (presentationSpace === 'scroll') schedulePresentationResizeUpdate()
    else resizeRenderer()
  }

  /** 只让会改变目标表面集合或圆角几何的 DOM 变更触发重扫。 */
  function mutationTouchesOpticalSurface(mutations: MutationRecord[]) {
    return mutations.some(
      mutation =>
        mutation.type === 'attributes' ||
        [...mutation.addedNodes, ...mutation.removedNodes].some(containsGlassOpticalSurface),
    )
  }

  function setupObservers() {
    resizeObserver = new ResizeObserver(handleSurfaceResize)
    observeResizeTargets(false)
    const observedMutationRoots = new Set<Node>()

    function observeMutationRoot(root: Node | null, subtree: boolean) {
      if (!root || observedMutationRoots.has(root)) return

      observedMutationRoots.add(root)
      surfaceMutationObserver?.observe(root, {
        attributeFilter: ['data-glass-optical-mode'],
        attributes: true,
        childList: true,
        subtree,
      })
    }

    surfaceMutationObserver = new MutationObserver(mutations => {
      // Vuetify 可能在首个弹层打开时才创建容器，后续变更需要纳入同一个表面生命周期。
      observeMutationRoot(document.querySelector('.v-overlay-container'), true)
      if (!mutationTouchesOpticalSurface(mutations)) return

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

  function setupEvents() {
    if (options.interactionSource) {
      unsubscribeInteractionSource = options.interactionSource.subscribe(presentationSpace, handleInteractionEvent)
    } else {
      window.addEventListener('pointermove', handlePointerMove, { passive: true })
      window.addEventListener('touchstart', handleTouchStart, { passive: true })
      window.addEventListener('touchmove', handleTouchMove, { passive: true })
      window.addEventListener('touchend', handleTouchEnd, { passive: true })
      window.addEventListener('touchcancel', handleTouchEnd, { passive: true })
    }
    window.addEventListener('resize', handleWindowResize, { passive: true })
    window.addEventListener('transitionrun', handleSurfaceTransitionRun, { capture: true, passive: true })
    window.addEventListener('transitionend', handleSurfaceTransitionEnd, { capture: true, passive: true })
    window.addEventListener('transitioncancel', handleSurfaceTransitionEnd, { capture: true, passive: true })
    if (presentationSpace === 'scroll') {
      window.addEventListener('scroll', handleScroll, { capture: true, passive: true })
      window.addEventListener('scrollend', handleScrollEnd, { passive: true })
    }
    options.canvas.value?.addEventListener('webglcontextlost', handleContextLost)
    options.canvas.value?.addEventListener('webglcontextrestored', handleContextRestored)
  }

  function removeEvents() {
    unsubscribeInteractionSource?.()
    unsubscribeInteractionSource = null
    if (!options.interactionSource) {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
    }
    window.removeEventListener('resize', handleWindowResize)
    window.removeEventListener('transitionrun', handleSurfaceTransitionRun, true)
    window.removeEventListener('transitionend', handleSurfaceTransitionEnd, true)
    window.removeEventListener('transitioncancel', handleSurfaceTransitionEnd, true)
    if (presentationSpace === 'scroll') {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('scrollend', handleScrollEnd)
    }
    options.canvas.value?.removeEventListener('webglcontextlost', handleContextLost)
    options.canvas.value?.removeEventListener('webglcontextrestored', handleContextRestored)
  }

  function disposeRenderer(releaseContext = true) {
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
    availableSurfaces = []
    surfaceSlots = []
    activeSurface = null
    outgoingSurface = null
    surfaceTransitionStartedAt = 0
    wakeDirection = { x: 0, y: -1 }
    document.documentElement.removeAttribute('data-glass-wallpaper-loading')
    activeTouchIdentifier = null
    lastPointerX = window.innerWidth * 0.5
    lastPointerY = window.innerHeight * 0.5
    pointerTargetX = 0.5
    pointerTargetY = 0.5
    pointerPositionX = 0.5
    pointerPositionY = 0.5
    pointerSpringVelocityX = 0
    pointerSpringVelocityY = 0
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
    disposeWallpaperResources(activeTexture, activeFrostedTarget)
    activeTexture = null
    activeFrostedTarget = null
    activeTextureHeight = 1
    activeTextureWidth = 1
    activeWallpaperExposure = DEFAULT_GLASS_WALLPAPER_TONE_PROFILE.exposure
    if (preparedWallpaper) {
      disposeWallpaperResources(preparedWallpaper.texture, preparedWallpaper.frostedTarget)
    }
    preparedWallpaper = null
    preparedWallpaperUrl.value = ''

    disposeFlowResources()
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
  async function refreshWallpaper(message: string) {
    const version = ++loadVersion
    const retainsActiveTexture = Boolean(resources && activeTexture)
    if (!retainsActiveTexture) updateRendererState('loading')
    document.documentElement.setAttribute('data-glass-wallpaper-loading', 'true')

    try {
      await loadWallpaper(toValue(options.wallpaperUrl), version)
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
  ) {
    if (!resources) {
      disposeWallpaperResources(texture, frostedTarget)
      return
    }

    const hasActiveTransition =
      Boolean(activeTexture) &&
      Boolean(toValue(options.previousWallpaperUrl ?? '')) &&
      toValue(options.transitionStartedAt ?? 0) > 0
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
      resources.uniforms.uTextureMix.value = getGlassWallpaperTransitionProgress(
        performance.now() - toValue(options.transitionStartedAt ?? 0),
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
      syncCoverScale()
    }

    resources.uniforms.uHasWallpaperTexture.value = hasWallpaperTexture ? 1 : 0
    resources.uniforms.uHasFrostedTexture.value = hasWallpaperTexture && frostedTarget ? 1 : 0
  }

  /** 解码并按当前质量预算缩放壁纸，不改变当前可见纹理。 */
  async function createWallpaperTexture(url: string): Promise<PreparedWallpaperTexture | null> {
    if (!resources || !three || !url) return null
    const profile = getRenderProfile()
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
        texture,
        toneProfile: { ...DEFAULT_GLASS_WALLPAPER_TONE_PROFILE },
        width: 1,
      }
    }

    const loader = new three.TextureLoader()
    loader.setCrossOrigin('anonymous')
    const sourceTexture = await loader.loadAsync(url)

    const image = sourceTexture.image as HTMLImageElement
    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    const { textureLimit } = profile
    const scale = Math.min(1, textureLimit / Math.max(sourceWidth, sourceHeight))
    const textureCanvas = document.createElement('canvas')
    textureCanvas.width = Math.max(1, Math.round(sourceWidth * scale))
    textureCanvas.height = Math.max(1, Math.round(sourceHeight * scale))
    const textureContext = textureCanvas.getContext('2d')
    let texture: Texture
    let textureWidth = sourceWidth
    let textureHeight = sourceHeight

    if (textureContext) {
      textureContext.drawImage(image, 0, 0, textureCanvas.width, textureCanvas.height)
      sourceTexture.dispose()
      texture = new three.CanvasTexture(textureCanvas)
      textureWidth = textureCanvas.width
      textureHeight = textureCanvas.height
    } else {
      texture = sourceTexture
    }

    texture.colorSpace = three.SRGBColorSpace
    texture.generateMipmaps = false
    texture.minFilter = three.LinearFilter
    texture.magFilter = three.LinearFilter
    let frostedTarget: WebGLRenderTarget | null = null
    try {
      frostedTarget = await createFrostedWallpaperTarget(texture, textureWidth, textureHeight)
    } catch (error) {
      // 预滤属于磨砂优化；失败时保留源纹理并退回既有扩散采样，不能拖垮其他材质。
      console.warn('玻璃磨砂壁纸预滤失败，继续使用实时扩散采样:', error)
    }
    return {
      frostedTarget,
      hasWallpaperTexture: true,
      height: textureHeight,
      texture,
      toneProfile: analyzeGlassWallpaperTone(image, sourceWidth, sourceHeight),
      width: textureWidth,
    }
  }

  /** 提前准备下一张纹理；失败不会影响当前活动纹理。 */
  async function prepareWallpaper(url: string) {
    const version = ++prepareVersion
    if (preparedWallpaper) {
      disposeWallpaperResources(preparedWallpaper.texture, preparedWallpaper.frostedTarget)
    }
    preparedWallpaper = null
    preparedWallpaperUrl.value = ''
    if (!url || !resources || url === toValue(options.wallpaperUrl)) {
      if (url && activeTexture) preparedWallpaperUrl.value = url
      return
    }

    try {
      const prepared = await createWallpaperTexture(url)
      if (!prepared) return
      if (version !== prepareVersion || !resources) {
        disposeWallpaperResources(prepared.texture, prepared.frostedTarget)
        return
      }

      resources.renderer.initTexture(prepared.texture)
      preparedWallpaper = prepared
      preparedWallpaperUrl.value = url
    } catch (error) {
      if (version === prepareVersion) console.warn('玻璃光学壁纸预备失败，继续使用当前纹理:', error)
    }
  }

  async function loadWallpaper(url: string, version: number) {
    if (!resources || !three || !url) return

    const prepared =
      preparedWallpaper && preparedWallpaperUrl.value === url ? preparedWallpaper : await createWallpaperTexture(url)
    if (!prepared) return
    if (preparedWallpaper === prepared) {
      preparedWallpaper = null
      preparedWallpaperUrl.value = ''
    }
    if (version !== loadVersion || !resources) {
      disposeWallpaperResources(prepared.texture, prepared.frostedTarget)
      return
    }

    activateLoadedTexture(
      prepared.texture,
      prepared.frostedTarget,
      prepared.width,
      prepared.height,
      prepared.hasWallpaperTexture,
      prepared.toneProfile,
    )
    await resources.renderer.compileAsync(resources.scene, resources.camera)
    if (version !== loadVersion || !resources) return

    updateRendererState('ready')
    scheduleFrame()
  }

  async function initializeRenderer(releaseContext = true) {
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
      if (version !== loadVersion || !options.canvas.value) return
      const Vector4Class = three.Vector4

      const renderer = new three.WebGLRenderer({
        alpha: true,
        antialias: false,
        canvas: options.canvas.value,
        powerPreference: 'high-performance',
        premultipliedAlpha: true,
      })
      renderer.setClearColor(0x000000, 0)
      renderer.setPixelRatio(1)

      const geometry = new three.BufferGeometry()
      geometry.setAttribute('position', new three.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
      const uniforms: GlassRendererUniforms = {
        uAppearance: { value: getGlassAppearanceUniformValue(toValue(options.appearance)) },
        uCoverScale: { value: new three.Vector2(1, 1) },
        uDeformationStrength: { value: getDeformationStrengthScale() },
        uFlowTexture: { value: null },
        uFlowStrength: { value: getFlowStrengthScale() },
        uHasFlowTexture: { value: 0 },
        uHasFrostedTexture: { value: 0 },
        uHasWallpaperTexture: { value: 0 },
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
        uTransparency: { value: getTransparency() },
        uTransmissionStrength: {
          value: getGlassOpticalTransmissionStrength(
            toValue(options.transmissionStrength ?? GLASS_OPTICAL_STRENGTH_DEFAULT),
          ),
        },
        uTranslationStrength: { value: getTranslationStrengthScale() },
        uTrail: { value: Array.from({ length: 4 }, () => new Vector4Class(0.5, 0.5, 0, 0)) },
        uTrailCount: { value: getRenderProfile().trailCount },
        uVisibleViewportSize: { value: new three.Vector2(window.innerWidth, window.innerHeight) },
        uScrollOffset: { value: new three.Vector2(0, 0) },
        uWakeDirection: { value: new three.Vector2(0, -1) },
        uWakeProgress: { value: 1 },
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
      syncFlowResources()

      setupObservers()
      setupEvents()
      resizeRenderer()
      await loadWallpaper(toValue(options.wallpaperUrl), version)
    } catch (error) {
      fallbackFromCurrentLoad(version, '玻璃光学渲染器初始化失败，已回退标准材质:', error)
    }
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
    () => toValue(options.pendingWallpaperUrl ?? ''),
    pendingWallpaperUrl => {
      void prepareWallpaper(pendingWallpaperUrl)
    },
    { immediate: true },
  )

  watch(
    () => toValue(options.appearance),
    appearance => {
      if (!resources) return

      resources.uniforms.uAppearance.value = getGlassAppearanceUniformValue(appearance)
      scheduleSurfaceStabilityUpdate()
    },
  )

  watch(
    () => toValue(options.quality),
    async (quality, previousQuality) => {
      if (!resources) return

      const previousProfile = getGlassOpticalRenderProfile(previousQuality, toValue(options.routeKey))
      const nextProfile = getGlassOpticalRenderProfile(quality, toValue(options.routeKey))
      resources.uniforms.uMaxRefractionPixels.value = getGlassOpticalMaxRefractionPixels(
        nextProfile.maxRefractionPixels,
        toValue(options.deformationStrength ?? getLegacyDynamicStrength()),
      )
      resources.uniforms.uQuality.value = quality === 'high' ? 1 : 0
      resources.uniforms.uTrailCount.value = nextProfile.trailCount
      interactionAnimating = false
      cancelScheduledFrame()
      resetInteractionState()
      syncFlowResources()
      resizeRenderer()

      if (!profileRequiresTextureReload(previousProfile, nextProfile)) {
        scheduleFrame()
        return
      }

      await refreshWallpaper('玻璃光学质量切换失败，已保留当前材质:')
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

      resources.uniforms.uTranslationStrength.value = getGlassOpticalTranslationStrengthScale(translationStrength)
      resources.uniforms.uDeformationStrength.value = getGlassOpticalDeformationStrengthScale(deformationStrength)
      resources.uniforms.uFlowStrength.value = getGlassOpticalFlowStrengthScale(flowStrength)
      resources.uniforms.uMotionExpansion.value = getGlassOpticalMotionExpansion(flowStrength)
      resources.uniforms.uMaxRefractionPixels.value = getGlassOpticalMaxRefractionPixels(
        getRenderProfile().maxRefractionPixels,
        deformationStrength,
      )
      resources.uniforms.uReflectionStrength.value = getGlassOpticalReflectionStrengthScale(reflectionStrength)
      resources.uniforms.uTransparency.value = getGlassOpticalTransparency(transparencyStrength)
      resources.uniforms.uTransmissionStrength.value = getGlassOpticalTransmissionStrength(transmissionStrength)
      if (resources.uniforms.uFlowStrength.value <= 0 && interactionAnimating) {
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
    () => toValue(options.routeKey),
    async (routeKey, previousRouteKey) => {
      const previousProfile = getRenderProfile(previousRouteKey ?? '')
      if (resources && presentationSpace === 'scroll' && options.pageMotion) {
        pagePresentationGeometryReady = false
        const timestamp = performance.now()
        updateSurfaceUniforms(timestamp, false)
        renderFrame(timestamp, false)
      }
      await nextTick()
      if (resources) {
        const nextProfile = getRenderProfile(routeKey)
        resizeRenderer()

        if (profileRequiresTextureReload(previousProfile, nextProfile)) {
          await refreshWallpaper('玻璃场景纹理切换失败，已保留当前材质:')
          return
        }
      }
      if (presentationSpace === 'scroll' && options.pageMotion) scheduleSurfaceStabilityUpdate()
      else scheduleSurfaceUpdate()
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
    preparedWallpaperUrl,
    renderedFrames,
    state,
  }
}
