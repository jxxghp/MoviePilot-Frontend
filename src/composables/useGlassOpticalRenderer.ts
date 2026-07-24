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
  getGlassCoverScale,
  getGlassOpticalBufferSize,
  getGlassOpticalDecay,
  getGlassOpticalMotionEnergy,
  getGlassOpticalRenderProfile,
  normalizeGlassOpticalRect,
  selectGlassOpticalRects,
  type GlassCornerRadii,
  type GlassOpticalQuality,
  type GlassOpticalRect,
} from '@/utils/glassOptics'
import type { ThemeCustomizerGlassAppearance } from '@/composables/useThemeCustomizer'

type ThreeModule = typeof import('three')
export type GlassRendererState = 'fallback' | 'loading' | 'ready'

/** 同步组件状态和根节点属性，确保 CSS 回退与 renderer 生命周期一致。 */
export function setGlassRendererState(state: Ref<GlassRendererState>, value: GlassRendererState) {
  state.value = value
  document.documentElement.dataset.glassRendererState = value
}

interface GlassRendererUniforms extends Record<string, IUniform> {
  uAppearance: IUniform<number>
  uCoverScale: IUniform<Vector2>
  uFlowTexture: IUniform<Texture | null>
  uHasWallpaperTexture: IUniform<number>
  uHasFlowTexture: IUniform<number>
  uMotion: IUniform<number>
  uPointer: IUniform<Vector2>
  uPointerVelocity: IUniform<Vector2>
  uQuality: IUniform<number>
  uRadii: IUniform<Vector4[]>
  uRectCount: IUniform<number>
  uRects: IUniform<Vector4[]>
  uTexture: IUniform<Texture | null>
  uTintColor: IUniform<Color>
  uTrail: IUniform<Vector4[]>
  uTrailCount: IUniform<number>
  uViewportSize: IUniform<Vector2>
}

interface GlassFlowUniforms extends Record<string, IUniform> {
  uDecay: IUniform<number>
  uInjection: IUniform<number>
  uPointer: IUniform<Vector2>
  uPrevious: IUniform<Texture | null>
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

interface UseGlassOpticalRendererOptions {
  active: MaybeRefOrGetter<boolean>
  appearance: MaybeRefOrGetter<ThemeCustomizerGlassAppearance>
  canvas: Ref<HTMLCanvasElement | null>
  quality: MaybeRefOrGetter<GlassOpticalQuality>
  routeKey: MaybeRefOrGetter<string>
  tintColor: MaybeRefOrGetter<string>
  wallpaperUrl: MaybeRefOrGetter<string>
}

const SURFACE_SELECTORS = [
  { rank: 1, selector: '.v-overlay--active .v-overlay__content > .v-card' },
  { rank: 1, selector: '.v-overlay--active .v-overlay__content > .v-sheet' },
  { rank: 1, selector: '.agent-assistant-panel' },
  { rank: 1, selector: '.login-card' },
  { rank: 2, selector: '.layout-vertical-nav' },
  { rank: 2, selector: '.layout-navbar' },
  {
    rank: 3,
    selector: '.dashboard-grid-item-content > .dashboard-grid-auto-size > .dashboard-grid-content-measure > .v-card',
  },
  {
    rank: 3,
    selector:
      '.dashboard-grid-item-content > .dashboard-grid-auto-size > .dashboard-grid-content-measure > :first-child > .v-card',
  },
  { rank: 3, selector: '[data-glass-optical-surface]' },
  // 推荐、订阅、媒体详情与设置页共用该交互卡片契约，不按业务路由维护 renderer 白名单。
  { rank: 4, selector: '.app-hover-lift-card' },
] as const
const SURFACE_SELECTOR_QUERY = SURFACE_SELECTORS.map(({ selector }) => selector).join(',')

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
uniform float uInjection;
uniform float uDecay;
uniform float uViewportAspect;
varying vec2 vUv;

void main() {
  vec4 previous = texture2D(uPrevious, vUv);
  vec2 flow = previous.a < 0.5 ? vec2(0.0) : (previous.xy * 2.0 - 1.0) * uDecay;
  float energy = previous.a < 0.5 ? 0.0 : previous.z * uDecay;
  vec2 delta = vUv - uPointer;
  delta.x *= uViewportAspect;
  float distanceSquared = dot(delta, delta);
  float injection = exp(-distanceSquared * 92.0) * uInjection;
  float speed = length(uVelocity);
  vec2 direction = speed > 0.0001 ? uVelocity / speed : vec2(0.0, -1.0);
  vec2 perpendicular = vec2(-direction.y, direction.x);
  float curl = sin(length(delta) * 58.0) * 0.14;

  flow += (direction * min(speed * 8.0, 0.82) + perpendicular * curl) * injection * 0.36;
  energy = max(energy, injection);

  gl_FragColor = vec4(flow * 0.5 + 0.5, energy, 1.0);
}
`

const FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D uTexture;
uniform sampler2D uFlowTexture;
uniform vec2 uCoverScale;
uniform float uHasWallpaperTexture;
uniform float uHasFlowTexture;
uniform float uMotion;
uniform vec2 uPointer;
uniform vec2 uPointerVelocity;
uniform float uQuality;
uniform vec4 uRects[8];
uniform vec4 uRadii[8];
uniform int uRectCount;
uniform float uAppearance;
uniform vec3 uTintColor;
uniform vec4 uTrail[4];
uniform int uTrailCount;
uniform vec2 uViewportSize;
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
  return vec2(0.5) + (uv - vec2(0.5)) * uCoverScale;
}

vec3 sampleChromatic(vec2 uv, float separation) {
  return vec3(
    texture2D(uTexture, uv + vec2(separation, 0.0)).r,
    texture2D(uTexture, uv).g,
    texture2D(uTexture, uv - vec2(separation, 0.0)).b
  );
}

vec3 sampleDiffuse(vec2 uv, vec2 axis, float radius) {
  vec2 firstOffset = axis * radius;
  vec2 secondOffset = vec2(-axis.y, axis.x) * radius;

  return (
    texture2D(uTexture, uv).rgb * 0.28 +
    texture2D(uTexture, uv + firstOffset).rgb * 0.18 +
    texture2D(uTexture, uv - firstOffset).rgb * 0.18 +
    texture2D(uTexture, uv + secondOffset).rgb * 0.18 +
    texture2D(uTexture, uv - secondOffset).rgb * 0.18
  );
}

void main() {
  float mask = 0.0;
  float edge = 0.0;
  float caustic = 0.0;
  vec2 refraction = vec2(0.0);
  vec2 velocityDirection = length(uPointerVelocity) > 0.0001 ? normalize(uPointerVelocity) : vec2(0.0, -1.0);
  vec2 velocityPerpendicular = vec2(-velocityDirection.y, velocityDirection.x);
  vec2 trailRefraction = vec2(0.0);
  float trailEnergy = 0.0;

  for (int trailIndex = 0; trailIndex < 4; trailIndex++) {
    if (trailIndex >= uTrailCount) break;

    vec4 trail = uTrail[trailIndex];
    vec2 trailDelta = vUv - trail.xy;
    trailDelta.x *= uViewportSize.x / max(uViewportSize.y, 1.0);
    float along = dot(trailDelta, velocityDirection);
    float across = dot(trailDelta, velocityPerpendicular);
    float lobe = exp(-(along * along * 42.0 + across * across * 210.0)) * trail.z * uMotion;
    float wake = mix(0.88, 0.58, float(trailIndex) / 3.0);

    trailRefraction += (velocityDirection * 0.0048 + velocityPerpendicular * across * 0.018) * lobe;
    trailEnergy += lobe * wake * mix(0.72, 0.42, float(trailIndex) / 3.0);
  }

  vec4 flowSample = uHasFlowTexture > 0.5 ? texture2D(uFlowTexture, vUv) : vec4(0.5, 0.5, 0.0, 1.0);
  vec2 temporalFlow = uHasFlowTexture > 0.5 ? (flowSample.xy * 2.0 - 1.0) * flowSample.z * uMotion : vec2(0.0);
  float temporalEnergy = uHasFlowTexture > 0.5 ? flowSample.z * uMotion : 0.0;
  float frosted = step(1.5, uAppearance);

  for (int i = 0; i < 8; i++) {
    if (i >= uRectCount) break;

    vec4 rect = uRects[i];
    vec2 local = (vUv - rect.xy) / rect.zw;
    float rectMask = roundedRectMask(local, rect.zw * uViewportSize, uRadii[i]);
    if (rectMask <= 0.0) continue;

    float sideDistance = min(local.x, 1.0 - local.x);
    float nonBottomDistance = min(sideDistance, 1.0 - local.y);
    float edgeResponse = 1.0 - smoothstep(0.0, 0.16, nonBottomDistance);
    vec2 lens = local - vec2(0.5);
    vec2 pointerDelta = uPointer - vUv;
    vec2 pointerDeltaAspect = pointerDelta;
    pointerDeltaAspect.x *= uViewportSize.x / max(uViewportSize.y, 1.0);
    float pointerDistance = length(pointerDeltaAspect);
    float pointerSpread = mix(24.0, 10.0, frosted);
    float pointerEnergy = exp(-dot(pointerDeltaAspect, pointerDeltaAspect) * pointerSpread) * uMotion;
    float liquidEnergy = clamp(pointerEnergy * 0.72 + trailEnergy * 0.38 + temporalEnergy * 0.52, 0.0, 1.0);
    float directionalBend = dot(pointerDeltaAspect, velocityPerpendicular);
    float ripple = directionalBend * exp(-pointerDistance * 7.0) * mix(0.011, 0.016, uQuality) * liquidEnergy;
    float staticLens = 0.0012 + edgeResponse * mix(0.009, 0.011, uQuality);
    float pointerStrength = mix(mix(0.006, 0.0085, uQuality), mix(0.011, 0.014, uQuality), frosted);
    float trailStrength = mix(mix(0.85, 1.2, uQuality), mix(1.2, 1.55, uQuality), frosted);
    float temporalStrength = mix(0.038, 0.05, frosted) * uQuality;
    float localLight = mix(0.78 + pointerEnergy * 0.12, 0.8, frosted);
    float localCaustic = liquidEnergy * localLight * rectMask;

    refraction += (
      lens * staticLens * mix(1.0, 0.82, frosted) +
      pointerDelta * pointerEnergy * pointerStrength +
      trailRefraction * trailStrength +
      temporalFlow * temporalStrength +
      ripple
    ) * rectMask;
    edge = max(edge, edgeResponse * rectMask);
    caustic = max(caustic, localCaustic);
    mask = max(mask, rectMask);
  }

  if (mask <= 0.0) discard;

  vec2 sourceUv = coverUv(vUv + refraction);
  float separation = edge * mix(0.00072, 0.0013, uQuality) * mix(1.0, 0.58, frosted);
  vec3 refracted = sampleChromatic(sourceUv, separation);
  float detailSeparation = separation * mix(1.45, 2.35, uQuality);
  vec3 detailed = sampleChromatic(sourceUv, detailSeparation);
  refracted = mix(refracted, detailed, mix(0.12, 0.32, uQuality) * (1.0 - frosted));
  vec2 diffusionAxis = length(refraction) > 0.00001 ? normalize(refraction) : velocityPerpendicular;
  float diffusionRadius = mix(0.0022, 0.0038, uQuality) * (0.82 + caustic * 0.32);
  vec3 diffused = sampleDiffuse(sourceUv, diffusionAxis, diffusionRadius);
  refracted = mix(refracted, diffused, frosted);
  vec3 highlight = vec3(0.84, 0.92, 1.0);
  float edgeHighlightMix = 0.12;
  float causticHighlightMix = 0.12;
  float liquidPresence = clamp(uMotion + temporalEnergy * 0.7 + trailEnergy * 0.3, 0.0, 1.0);
  float materialAlpha = 0.28 * liquidPresence;
  float proceduralEdgeAlpha = 0.14;
  float proceduralCausticAlpha = 0.1;

  if (uAppearance > 1.5) {
    highlight = vec3(0.94, 0.97, 1.0);
    edgeHighlightMix = 0.18;
    causticHighlightMix = 0.055;
    materialAlpha = mix(0.035, 0.4, liquidPresence);
    proceduralEdgeAlpha = 0.18;
    proceduralCausticAlpha = 0.06;
  } else if (uAppearance > 0.5) {
    highlight = mix(vec3(1.0), uTintColor, 0.72);
    edgeHighlightMix = 0.17;
    causticHighlightMix = 0.13;
    materialAlpha = 0.3 * liquidPresence;
  }

  if (uHasWallpaperTexture < 0.5) {
    vec3 proceduralHighlight = highlight * (edge * 0.46 + caustic * 0.72);
    float proceduralAlpha = mask * (edge * proceduralEdgeAlpha + caustic * proceduralCausticAlpha);
    gl_FragColor = vec4(proceduralHighlight, proceduralAlpha);
    return;
  }

  refracted = mix(refracted, highlight, edge * edgeHighlightMix);
  refracted += highlight * caustic * causticHighlightMix;

  gl_FragColor = vec4(
    refracted,
    mask * (materialAlpha + edge * 0.22 + caustic * mix(0.055, 0.08, uQuality))
  );
}
`

const SCROLL_SURFACE_UPDATE_INTERVAL_MS = 32
const FLOW_BUFFER_SCALE = 0.25

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

/** 将活动界面中的高价值材质面集中转换为 renderer 矩形预算。 */
export function collectGlassOpticalRects(
  viewportWidth: number,
  viewportHeight: number,
  appearance: ThemeCustomizerGlassAppearance,
  interactionPoint?: { x: number; y: number },
) {
  const candidates: GlassOpticalRect[] = []
  const seen = new Set<HTMLElement>()

  for (const { rank, selector } of SURFACE_SELECTORS) {
    // 移动端透明顶栏只使用稳定的 CSS 表面，避免滚动重扫时再次叠加壁纸折射。
    if (viewportWidth <= 600 && appearance === 'clear' && selector === '.layout-navbar') continue

    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (seen.has(element)) continue
      seen.add(element)

      const bounds = element.getBoundingClientRect()
      if (!isVisibleSurface(element, bounds)) continue

      candidates.push({
        height: bounds.height,
        radii: [...readBorderRadii(element)] as GlassCornerRadii,
        rank: rank + candidates.length * 0.001,
        width: bounds.width,
        x: bounds.left,
        y: bounds.top,
      })
    }
  }

  return selectGlassOpticalRects(candidates, viewportWidth, viewportHeight, viewportWidth <= 600, interactionPoint)
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
  let three: ThreeModule | null = null
  let resources: GlassRendererResources | null = null
  let flowResources: GlassFlowResources | null = null
  let activeTexture: Texture | null = null
  let activeTextureHeight = 1
  let activeTextureWidth = 1
  let loadVersion = 0
  let animationFrame: number | null = null
  let surfaceUpdateFrame: number | null = null
  let lastInteractionAt = 0
  let lastInteractionFrameAt = 0
  let lastPointerAt = 0
  let lastTrailAt = 0
  let lastPointerX = window.innerWidth * 0.5
  let lastPointerY = window.innerHeight * 0.5
  let lastTouchAt = Number.NEGATIVE_INFINITY
  let activeTouchIdentifier: number | null = null
  let pendingFlowInjection = 0
  let interactionAnimating = false
  let surfaceResizeTimer: number | null = null
  let scrollSurfaceTimer: number | null = null
  let lastScrollSurfaceUpdateAt = 0
  let resizeObserver: ResizeObserver | null = null
  let surfaceMutationObserver: MutationObserver | null = null
  let observedSurfaces: HTMLElement[] = []
  let currentRects: GlassOpticalRect[] = []
  let tracksScrollingSurfaces = false
  let contextRecoveryPending = false
  let scrollStates = new WeakMap<object, { position: number; timestamp: number }>()

  function cancelScheduledFrame() {
    if (animationFrame === null) return

    cancelAnimationFrame(animationFrame)
    animationFrame = null
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

  function renderFrame() {
    animationFrame = null
    if (!resources || !toValue(options.active) || document.visibilityState === 'hidden') return

    if (flowResources) {
      flowResources.uniforms.uPrevious.value = flowResources.readTarget.texture
      resources.renderer.setRenderTarget(flowResources.writeTarget)
      resources.renderer.render(flowResources.scene, resources.camera)
      resources.renderer.setRenderTarget(null)
      const previousReadTarget = flowResources.readTarget
      flowResources.readTarget = flowResources.writeTarget
      flowResources.writeTarget = previousReadTarget
      resources.uniforms.uFlowTexture.value = flowResources.readTarget.texture
    }
    resources.renderer.render(resources.scene, resources.camera)
    renderedFrames.value += 1
  }

  function scheduleFrame() {
    if (animationFrame !== null || !resources) return

    animationFrame = requestAnimationFrame(renderFrame)
  }

  function updateSurfaceUniforms(interactionPoint?: { x: number; y: number }) {
    if (!resources || !three) return

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const rects = collectGlassOpticalRects(viewportWidth, viewportHeight, toValue(options.appearance), interactionPoint)
    currentRects = rects
    const normalized = rects.map(rect => normalizeGlassOpticalRect(rect, viewportWidth, viewportHeight))
    const uniformRects = resources.uniforms.uRects.value
    const uniformRadii = resources.uniforms.uRadii.value

    for (let index = 0; index < 8; index += 1) {
      const surface = normalized[index]
      const rect = surface?.rect ?? [0, 0, 0, 0]
      const radii = surface?.radii ?? [0, 0, 0, 0]
      uniformRects[index].set(rect[0], rect[1], rect[2], rect[3])
      uniformRadii[index].set(radii[0], radii[1], radii[2], radii[3])
    }

    resources.uniforms.uRectCount.value = normalized.length
    const nextObservedSurfaces = Array.from(
      new Set(
        SURFACE_SELECTORS.flatMap(({ selector }) => Array.from(document.querySelectorAll<HTMLElement>(selector))),
      ),
    )
    const observedSurfacesChanged =
      nextObservedSurfaces.length !== observedSurfaces.length ||
      nextObservedSurfaces.some((element, index) => element !== observedSurfaces[index])

    if (observedSurfacesChanged) {
      resizeObserver?.disconnect()
      observedSurfaces = nextObservedSurfaces
      for (const element of observedSurfaces) resizeObserver?.observe(element)
    }
    tracksScrollingSurfaces = observedSurfaces.length > 0
    scheduleFrame()
  }

  function scheduleSurfaceUpdate() {
    if (surfaceUpdateFrame !== null || !resources) return

    surfaceUpdateFrame = requestAnimationFrame(() => {
      surfaceUpdateFrame = null
      updateSurfaceUniforms()
    })
  }

  function scheduleSurfaceResizeUpdate() {
    if (surfaceResizeTimer !== null) window.clearTimeout(surfaceResizeTimer)

    surfaceResizeTimer = window.setTimeout(() => {
      surfaceResizeTimer = null
      scheduleSurfaceUpdate()
    }, 160)
  }

  function syncCoverScale(viewportWidth = window.innerWidth, viewportHeight = window.innerHeight) {
    if (!resources) return

    const cover = getGlassCoverScale(viewportWidth, viewportHeight, activeTextureWidth, activeTextureHeight)
    resources.uniforms.uCoverScale.value.set(cover.x, cover.y)
  }

  function getRenderProfile(routeKey = toValue(options.routeKey)) {
    return getGlassOpticalRenderProfile(toValue(options.quality), routeKey)
  }

  function resizeRenderer() {
    if (!resources) return

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const profile = getRenderProfile()
    const buffer = getGlassOpticalBufferSize(
      viewportWidth,
      viewportHeight,
      viewportWidth <= 600,
      profile.bufferQuality,
      window.devicePixelRatio,
    )
    resources.renderer.setSize(buffer.width, buffer.height, false)
    resources.uniforms.uViewportSize.value.set(viewportWidth, viewportHeight)
    if (flowResources) {
      const flowWidth = Math.max(96, Math.round(buffer.width * FLOW_BUFFER_SCALE))
      const flowHeight = Math.max(96, Math.round(buffer.height * FLOW_BUFFER_SCALE))
      flowResources.readTarget.setSize(flowWidth, flowHeight)
      flowResources.writeTarget.setSize(flowWidth, flowHeight)
      flowResources.uniforms.uViewportAspect.value = viewportWidth / Math.max(viewportHeight, 1)
    }
    syncCoverScale(viewportWidth, viewportHeight)
    scheduleSurfaceUpdate()
  }

  function profileRequiresTextureReload(
    previousProfile: ReturnType<typeof getGlassOpticalRenderProfile>,
    nextProfile: ReturnType<typeof getGlassOpticalRenderProfile>,
  ) {
    return (
      previousProfile.textureLimit !== nextProfile.textureLimit ||
      previousProfile.textureSource !== nextProfile.textureSource
    )
  }

  function rectContainsPoint(rect: GlassOpticalRect, x: number, y: number) {
    return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
  }

  /** 确保当前交互表面优先进入固定数量的 shader 预算。 */
  function ensureInteractionSurface(x: number, y: number) {
    if (currentRects.some(rect => rectContainsPoint(rect, x, y))) return true

    updateSurfaceUniforms({ x, y })

    return currentRects.some(rect => rectContainsPoint(rect, x, y))
  }

  /** 快速输入在单次事件内补齐视口路径，避免事件稀疏时只留下孤立触点。 */
  function updateTrail(x: number, y: number, timestamp: number) {
    if (!resources) return

    const normalizedX = x / Math.max(window.innerWidth, 1)
    const normalizedY = 1 - y / Math.max(window.innerHeight, 1)
    const previousX = resources.uniforms.uPointer.value.x
    const previousY = resources.uniforms.uPointer.value.y
    const distance = Math.hypot(normalizedX - previousX, normalizedY - previousY)
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
          normalizedX + (previousX - normalizedX) * progress,
          normalizedY + (previousY - normalizedY) * progress,
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

    resources.uniforms.uMotion.value = 0
    resources.uniforms.uPointerVelocity.value.set(0, 0)
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
    const motion = getGlassOpticalMotionEnergy(elapsed, profile.motionDuration, profile.motionHalfLife)
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
    if (!resources || !ensureInteractionSurface(clientX, clientY)) return

    const viewportWidth = Math.max(window.innerWidth, 1)
    const viewportHeight = Math.max(window.innerHeight, 1)
    const elapsed = Math.max(8, timestamp - lastPointerAt)
    const velocityX = velocityOverride?.x ?? ((clientX - lastPointerX) / viewportWidth) * Math.min(2, 16.67 / elapsed)
    const velocityY = velocityOverride?.y ?? (-(clientY - lastPointerY) / viewportHeight) * Math.min(2, 16.67 / elapsed)
    const velocityLength = Math.hypot(velocityX, velocityY)
    const velocityScale = velocityLength > 0.09 ? 0.09 / velocityLength : 1

    updateTrail(clientX, clientY, timestamp)
    resources.uniforms.uPointer.value.set(clientX / viewportWidth, 1 - clientY / viewportHeight)
    resources.uniforms.uPointerVelocity.value.set(velocityX * velocityScale, velocityY * velocityScale)
    resources.uniforms.uTrailCount.value = getRenderProfile().trailCount
    lastPointerX = clientX
    lastPointerY = clientY
    lastPointerAt = timestamp
    lastInteractionAt = timestamp

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      resetInteractionState()
      scheduleFrame()
      return
    }

    resources.uniforms.uMotion.value = 1
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
    lastTouchAt = timestamp
    if (resources && ensureInteractionSurface(touch.clientX, touch.clientY)) {
      resources.uniforms.uPointer.value.set(
        touch.clientX / Math.max(window.innerWidth, 1),
        1 - touch.clientY / Math.max(window.innerHeight, 1),
      )
      scheduleFrame()
    }
  }

  function handleTouchMove(event: TouchEvent) {
    const touch = findTouch(event.touches, activeTouchIdentifier)
    if (!touch) return

    const timestamp = event.timeStamp || performance.now()
    lastTouchAt = timestamp
    applyInteraction(touch.clientX, touch.clientY, timestamp)
  }

  function handleTouchEnd(event: TouchEvent) {
    if (!findTouch(event.changedTouches, activeTouchIdentifier)) return

    lastTouchAt = event.timeStamp || performance.now()
    activeTouchIdentifier = null
  }

  function getScrollPosition(target: EventTarget | null) {
    if (target instanceof Element) return target.scrollTop
    if (target instanceof Document) return target.scrollingElement?.scrollTop ?? window.scrollY

    return window.scrollY
  }

  function driveTouchScrollFlow(event: Event, timestamp: number) {
    if (!resources || !(window.innerWidth <= 600 || matchMedia('(pointer: coarse)').matches)) return

    const target = (event.target ?? document) as object
    const position = getScrollPosition(event.target)
    const previous = scrollStates.get(target)
    scrollStates.set(target, { position, timestamp })
    if (!previous) return

    const elapsed = Math.max(8, timestamp - previous.timestamp)
    const delta = position - previous.position
    if (Math.abs(delta) < 0.5) return
    if (timestamp - lastTouchAt < 120) return

    const currentPointIsVisible = currentRects.some(rect => rectContainsPoint(rect, lastPointerX, lastPointerY))
    const fallbackSurface = currentRects.find(
      rect => rect.y < window.innerHeight && rect.y + rect.height > 0 && rect.x < window.innerWidth,
    )
    const clientX = currentPointIsVisible
      ? lastPointerX
      : fallbackSurface
        ? Math.min(window.innerWidth - 1, Math.max(0, fallbackSurface.x + fallbackSurface.width * 0.5))
        : window.innerWidth * 0.5
    const clientY = currentPointIsVisible
      ? lastPointerY
      : fallbackSurface
        ? Math.min(window.innerHeight - 1, Math.max(0, fallbackSurface.y + fallbackSurface.height * 0.5))
        : window.innerHeight * 0.5
    const normalizedVelocity = Math.max(-0.09, Math.min(0.09, -(delta / window.innerHeight) * (16.67 / elapsed)))

    applyInteraction(clientX, clientY, timestamp, { x: 0, y: normalizedVelocity })
  }

  function handleScroll(event: Event) {
    const timestamp = performance.now()
    driveTouchScrollFlow(event, timestamp)
    if (!tracksScrollingSurfaces || scrollSurfaceTimer !== null) return

    const elapsed = timestamp - lastScrollSurfaceUpdateAt
    const delay = Math.max(0, SCROLL_SURFACE_UPDATE_INTERVAL_MS - elapsed)
    scrollSurfaceTimer = window.setTimeout(() => {
      scrollSurfaceTimer = null
      lastScrollSurfaceUpdateAt = performance.now()
      scheduleSurfaceUpdate()
    }, delay)
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      cancelScheduledFrame()
      interactionAnimating = false
      resetInteractionState()
      return
    }

    scheduleFrame()
  }

  function handleContextLost(event: Event) {
    event.preventDefault()
    cancelScheduledFrame()
    contextRecoveryPending = true
    setGlassRendererState(state, 'fallback')
  }

  function handleContextRestored() {
    if (!contextRecoveryPending) return

    contextRecoveryPending = false
    void initializeRenderer(false)
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
    resizeObserver = new ResizeObserver(scheduleSurfaceResizeUpdate)
    const observedMutationRoots = new Set<Node>()

    function observeMutationRoot(root: Node | null, subtree: boolean) {
      if (!root || observedMutationRoots.has(root)) return

      observedMutationRoots.add(root)
      surfaceMutationObserver?.observe(root, { childList: true, subtree })
    }

    surfaceMutationObserver = new MutationObserver(mutations => {
      // Vuetify 可能在首个弹层打开时才创建容器，后续变更需要纳入同一个表面生命周期。
      observeMutationRoot(document.querySelector('.v-overlay-container'), true)
      if (mutationTouchesOpticalSurface(mutations)) scheduleSurfaceUpdate()
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
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    window.addEventListener('touchcancel', handleTouchEnd, { passive: true })
    window.addEventListener('resize', resizeRenderer, { passive: true })
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    document.addEventListener('visibilitychange', handleVisibilityChange)
    options.canvas.value?.addEventListener('webglcontextlost', handleContextLost)
    options.canvas.value?.addEventListener('webglcontextrestored', handleContextRestored)
  }

  function removeEvents() {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('touchstart', handleTouchStart)
    window.removeEventListener('touchmove', handleTouchMove)
    window.removeEventListener('touchend', handleTouchEnd)
    window.removeEventListener('touchcancel', handleTouchEnd)
    window.removeEventListener('resize', resizeRenderer)
    window.removeEventListener('scroll', handleScroll, true)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    options.canvas.value?.removeEventListener('webglcontextlost', handleContextLost)
    options.canvas.value?.removeEventListener('webglcontextrestored', handleContextRestored)
  }

  function disposeRenderer(releaseContext = true) {
    loadVersion += 1
    contextRecoveryPending = false
    interactionAnimating = false
    cancelScheduledFrame()
    if (surfaceUpdateFrame !== null) {
      cancelAnimationFrame(surfaceUpdateFrame)
      surfaceUpdateFrame = null
    }
    if (surfaceResizeTimer !== null) {
      window.clearTimeout(surfaceResizeTimer)
      surfaceResizeTimer = null
    }
    if (scrollSurfaceTimer !== null) {
      window.clearTimeout(scrollSurfaceTimer)
      scrollSurfaceTimer = null
    }
    removeEvents()
    resizeObserver?.disconnect()
    resizeObserver = null
    surfaceMutationObserver?.disconnect()
    surfaceMutationObserver = null
    observedSurfaces = []
    currentRects = []
    tracksScrollingSurfaces = false
    scrollStates = new WeakMap<object, { position: number; timestamp: number }>()
    activeTouchIdentifier = null
    lastTouchAt = Number.NEGATIVE_INFINITY
    pendingFlowInjection = 0
    lastInteractionFrameAt = 0
    activeTexture?.dispose()
    activeTexture = null
    activeTextureHeight = 1
    activeTextureWidth = 1

    disposeFlowResources()
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
    setGlassRendererState(state, 'fallback')
  }

  /** 后台替换活动纹理；已有纹理在加载失败或完成前继续保持可交互。 */
  async function refreshWallpaper(message: string) {
    const version = ++loadVersion
    const retainsActiveTexture = Boolean(resources && activeTexture)
    if (!retainsActiveTexture) setGlassRendererState(state, 'loading')

    try {
      await loadWallpaper(toValue(options.wallpaperUrl), version)
    } catch (error) {
      if (version !== loadVersion) return
      if (retainsActiveTexture && resources && activeTexture) {
        console.warn(message, error)
        setGlassRendererState(state, 'ready')
        scheduleFrame()
        return
      }
      fallbackFromCurrentLoad(version, message, error)
    }
  }

  async function loadWallpaper(url: string, version: number) {
    if (!resources || !three || !url) return

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
      activeTexture?.dispose()
      activeTexture = texture
      activeTextureHeight = 1
      activeTextureWidth = 1
      resources.uniforms.uTexture.value = texture
      resources.uniforms.uHasWallpaperTexture.value = 0
      await resources.renderer.compileAsync(resources.scene, resources.camera)
      if (version !== loadVersion || !resources) return

      setGlassRendererState(state, 'ready')
      scheduleFrame()
      return
    }

    const loader = new three.TextureLoader()
    loader.setCrossOrigin('anonymous')
    const sourceTexture = await loader.loadAsync(url)
    if (version !== loadVersion || !resources) {
      sourceTexture.dispose()
      return
    }

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
    activeTexture?.dispose()
    activeTexture = texture
    activeTextureHeight = textureHeight
    activeTextureWidth = textureWidth
    resources.uniforms.uTexture.value = texture
    resources.uniforms.uHasWallpaperTexture.value = 1

    syncCoverScale()
    await resources.renderer.compileAsync(resources.scene, resources.camera)
    if (version !== loadVersion || !resources) return

    setGlassRendererState(state, 'ready')
    scheduleFrame()
  }

  async function initializeRenderer(releaseContext = true) {
    disposeRenderer(releaseContext)
    if (!toValue(options.active) || !options.canvas.value) return

    if (!window.WebGLRenderingContext || reducedTransparencyQuery.matches || !toValue(options.wallpaperUrl)) {
      setGlassRendererState(state, 'fallback')
      return
    }

    setGlassRendererState(state, 'loading')
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
        uFlowTexture: { value: null },
        uHasFlowTexture: { value: 0 },
        uHasWallpaperTexture: { value: 0 },
        uMotion: { value: 0 },
        uPointer: { value: new three.Vector2(0.5, 0.5) },
        uPointerVelocity: { value: new three.Vector2(0, 0) },
        uQuality: { value: toValue(options.quality) === 'high' ? 1 : 0 },
        uRadii: { value: Array.from({ length: 8 }, () => new Vector4Class()) },
        uRectCount: { value: 0 },
        uRects: { value: Array.from({ length: 8 }, () => new Vector4Class()) },
        uTexture: { value: null },
        uTintColor: { value: new three.Color(toValue(options.tintColor)) },
        uTrail: { value: Array.from({ length: 4 }, () => new Vector4Class(0.5, 0.5, 0, 0)) },
        uTrailCount: { value: getRenderProfile().trailCount },
        uViewportSize: { value: new three.Vector2(window.innerWidth, window.innerHeight) },
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
      setGlassRendererState(state, 'fallback')
      return
    }

    void initializeRenderer()
  }

  const reducedTransparencyQuery = matchMedia('(prefers-reduced-transparency: reduce)')
  reducedTransparencyQuery.addEventListener('change', handleReducedTransparencyChange)

  watch(
    () => [toValue(options.active), toValue(options.wallpaperUrl)] as const,
    async ([active, wallpaperUrl], previous) => {
      if (!active) {
        disposeRenderer()
        return
      }

      await nextTick()
      if (!resources) {
        await initializeRenderer()
        return
      }

      if (wallpaperUrl !== previous?.[1]) {
        await refreshWallpaper('玻璃光学壁纸纹理加载失败，已保留当前材质:')
      }
    },
    { immediate: true },
  )

  watch(
    () => toValue(options.appearance),
    appearance => {
      if (!resources) return

      resources.uniforms.uAppearance.value = getGlassAppearanceUniformValue(appearance)
      scheduleSurfaceUpdate()
    },
  )

  watch(
    () => toValue(options.quality),
    async (quality, previousQuality) => {
      if (!resources) return

      const previousProfile = getGlassOpticalRenderProfile(previousQuality, toValue(options.routeKey))
      const nextProfile = getGlassOpticalRenderProfile(quality, toValue(options.routeKey))
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
    () => toValue(options.routeKey),
    async (routeKey, previousRouteKey) => {
      const previousProfile = getRenderProfile(previousRouteKey ?? '')
      await nextTick()
      if (resources) {
        const nextProfile = getRenderProfile(routeKey)
        resizeRenderer()

        if (profileRequiresTextureReload(previousProfile, nextProfile)) {
          await refreshWallpaper('玻璃场景纹理切换失败，已保留当前材质:')
          return
        }
      }
      scheduleSurfaceUpdate()
    },
  )

  onScopeDispose(() => {
    reducedTransparencyQuery.removeEventListener('change', handleReducedTransparencyChange)
    disposeRenderer()
  })

  return {
    renderedFrames,
    state,
  }
}
