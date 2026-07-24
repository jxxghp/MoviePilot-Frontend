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
  getGlassCoverScale,
  getGlassOpticalBufferSize,
  getGlassOpticalDecay,
  getGlassOpticalMotionEnergy,
  getGlassOpticalRenderProfile,
  getGlassOpticalSurfaceTransitionWeights,
  getGlassOpticalWakeDirection,
  normalizeGlassOpticalRect,
  reconcileGlassOpticalSurfaceSlots,
  selectGlassOpticalRects,
  stepGlassOpticalSpring,
  type GlassCornerRadii,
  type GlassOpticalQuality,
  type GlassOpticalRect,
  type GlassOpticalSurfaceCandidate,
  type GlassOpticalSurfaceSlot,
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
  uMaxRefractionPixels: IUniform<number>
  uPointer: IUniform<Vector2>
  uPointerVelocity: IUniform<Vector2>
  uQuality: IUniform<number>
  uRadii: IUniform<Vector4[]>
  uRectCount: IUniform<number>
  uRects: IUniform<Vector4[]>
  uSurfaceWeights: IUniform<number[]>
  uTexture: IUniform<Texture | null>
  uTintColor: IUniform<Color>
  uTrail: IUniform<Vector4[]>
  uTrailCount: IUniform<number>
  uViewportSize: IUniform<Vector2>
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

interface UseGlassOpticalRendererOptions {
  active: MaybeRefOrGetter<boolean>
  appearance: MaybeRefOrGetter<ThemeCustomizerGlassAppearance>
  canvas: Ref<HTMLCanvasElement | null>
  quality: MaybeRefOrGetter<GlassOpticalQuality>
  routeKey: MaybeRefOrGetter<string>
  tintColor: MaybeRefOrGetter<string>
  wallpaperUrl: MaybeRefOrGetter<string>
}

type GlassOpticalSurfaceDescriptor = GlassOpticalSurfaceCandidate<HTMLElement>

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

const FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D uTexture;
uniform sampler2D uFlowTexture;
uniform vec2 uCoverScale;
uniform float uHasWallpaperTexture;
uniform float uHasFlowTexture;
uniform float uMotion;
uniform float uMaxRefractionPixels;
uniform vec2 uPointer;
uniform vec2 uPointerVelocity;
uniform vec2 uWakeDirection;
uniform float uWakeProgress;
uniform float uQuality;
uniform vec4 uRects[8];
uniform vec4 uRadii[8];
uniform float uSurfaceWeights[8];
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

vec3 sampleBalancedDiffuse(vec2 uv, vec2 axis, float radius) {
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

vec3 sampleHighQualityDiffuse(vec2 uv, vec2 axis, float radius) {
  vec2 firstOffset = axis * radius;
  vec2 secondOffset = vec2(-axis.y, axis.x) * radius;
  vec2 firstDiagonal = normalize(firstOffset + secondOffset) * radius * 1.15;
  vec2 secondDiagonal = normalize(firstOffset - secondOffset) * radius * 1.15;

  return (
    texture2D(uTexture, uv).rgb * 0.2 +
    texture2D(uTexture, uv + firstOffset).rgb * 0.12 +
    texture2D(uTexture, uv - firstOffset).rgb * 0.12 +
    texture2D(uTexture, uv + secondOffset).rgb * 0.12 +
    texture2D(uTexture, uv - secondOffset).rgb * 0.12 +
    texture2D(uTexture, uv + firstDiagonal).rgb * 0.08 +
    texture2D(uTexture, uv - firstDiagonal).rgb * 0.08 +
    texture2D(uTexture, uv + secondDiagonal).rgb * 0.08 +
    texture2D(uTexture, uv - secondDiagonal).rgb * 0.08
  );
}

float getContentProtection(vec2 sourceUv) {
  if (uQuality < 0.5 || uHasWallpaperTexture < 0.5) return 1.0;

  vec2 sourceTexel = max(uCoverScale, vec2(0.0001)) / max(uViewportSize, vec2(1.0));
  vec3 horizontalStart = texture2D(uTexture, sourceUv - vec2(sourceTexel.x * 2.5, 0.0)).rgb;
  vec3 horizontalEnd = texture2D(uTexture, sourceUv + vec2(sourceTexel.x * 2.5, 0.0)).rgb;
  vec3 verticalStart = texture2D(uTexture, sourceUv - vec2(0.0, sourceTexel.y * 2.5)).rgb;
  vec3 verticalEnd = texture2D(uTexture, sourceUv + vec2(0.0, sourceTexel.y * 2.5)).rgb;
  float contentGradient = max(length(horizontalEnd - horizontalStart), length(verticalEnd - verticalStart));

  return mix(1.0, 0.44, smoothstep(0.07, 0.34, contentGradient));
}

vec2 softLimitDynamicRefraction(vec2 refraction) {
  vec2 viewport = max(uViewportSize, vec2(1.0));
  vec2 refractionPixels = refraction * viewport;
  float limit = max(0.5, uMaxRefractionPixels);
  float limitScale = limit / sqrt(limit * limit + dot(refractionPixels, refractionPixels));

  return refractionPixels * limitScale / viewport;
}

void main() {
  float mask = 0.0;
  float edge = 0.0;
  float caustic = 0.0;
  float materialEnergy = 0.0;
  vec2 staticRefraction = vec2(0.0);
  vec2 dynamicRefraction = vec2(0.0);
  vec2 wakeDirection = length(uWakeDirection) > 0.0001 ? normalize(uWakeDirection) : vec2(0.0, -1.0);
  vec2 wakePerpendicular = vec2(-wakeDirection.y, wakeDirection.x);
  vec2 trailRefraction = vec2(0.0);
  float trailEnergy = 0.0;

  for (int trailIndex = 0; trailIndex < 4; trailIndex++) {
    if (trailIndex >= uTrailCount) break;

    vec4 trail = uTrail[trailIndex];
    vec2 trailDelta = vUv - trail.xy;
    trailDelta.x *= uViewportSize.x / max(uViewportSize.y, 1.0);
    float along = dot(trailDelta, wakeDirection);
    float across = dot(trailDelta, wakePerpendicular);
    float lobe = exp(-(along * along * 42.0 + across * across * 210.0)) * trail.z * uMotion;
    float wake = mix(0.88, 0.58, float(trailIndex) / 3.0);

    trailRefraction += (wakeDirection * 0.0048 + wakePerpendicular * across * 0.018) * lobe;
    trailEnergy += lobe * wake * mix(0.72, 0.42, float(trailIndex) / 3.0);
  }

  vec4 flowSample = uHasFlowTexture > 0.5 ? texture2D(uFlowTexture, vUv) : vec4(0.5, 0.5, 0.0, 1.0);
  vec2 temporalFlow = uHasFlowTexture > 0.5 ? (flowSample.xy * 2.0 - 1.0) * flowSample.z * uMotion : vec2(0.0);
  float temporalEnergy = uHasFlowTexture > 0.5 ? flowSample.z * uMotion : 0.0;
  float flowSurfaceDetail = 0.0;
  if (uQuality > 0.5 && uHasFlowTexture > 0.5) {
    vec2 flowTexel = vec2(3.0) / max(uViewportSize, vec2(1.0));
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
    vec2 local = (vUv - rect.xy) / rect.zw;
    float rectMask = roundedRectMask(local, rect.zw * uViewportSize, uRadii[i]) * uSurfaceWeights[i];
    if (rectMask <= 0.0) continue;

    float sideDistance = min(local.x, 1.0 - local.x);
    float nonBottomDistance = min(sideDistance, 1.0 - local.y);
    float edgeResponse = 1.0 - smoothstep(0.0, 0.16, nonBottomDistance);
    vec2 lens = local - vec2(0.5);
    vec2 pointerDelta = uPointer - vUv;
    vec2 pointerDeltaAspect = pointerDelta;
    pointerDeltaAspect.x *= uViewportSize.x / max(uViewportSize.y, 1.0);
    float pointerSpread = mix(mix(26.0, 17.0, uQuality), mix(12.0, 8.0, uQuality), frosted);
    float pointerEnergy = exp(-dot(pointerDeltaAspect, pointerDeltaAspect) * pointerSpread) * uMotion;
    vec2 wakeDelta = vUv - uPointer;
    wakeDelta.x *= uViewportSize.x / max(uViewportSize.y, 1.0);
    float wakeAlong = dot(wakeDelta, wakeDirection);
    float wakeAcross = dot(wakeDelta, wakePerpendicular);
    float wakeTravel = mix(0.014, 0.075, uWakeProgress) * mix(0.82, 1.18, uQuality);
    float wakeWidth = mix(0.027, 0.044, uQuality);
    float wakeCoordinate = (wakeAlong + wakeTravel) / wakeWidth;
    float wakeShape = wakeCoordinate * exp(-0.5 * wakeCoordinate * wakeCoordinate);
    float wakeEnvelope = exp(-wakeAcross * wakeAcross * mix(280.0, 145.0, uQuality));
    vec2 wakeRefraction =
      wakeDirection * wakeShape * wakeEnvelope * mix(0.0045, 0.0075, uQuality) * uMotion;
    float wakeEnergy = abs(wakeShape) * wakeEnvelope * uMotion;
    float liquidEnergy = max(
      pointerEnergy,
      max(min(1.0, trailEnergy) * 0.68, max(temporalEnergy * 0.76, wakeEnergy * 0.82))
    );
    float staticLens = 0.0007 + edgeResponse * mix(0.006, 0.0075, uQuality);
    float pointerStrength = mix(mix(0.0055, 0.008, uQuality), mix(0.0085, 0.012, uQuality), frosted);
    float trailStrength = mix(mix(0.78, 1.08, uQuality), mix(0.96, 1.3, uQuality), frosted);
    float temporalStrength = mix(0.032, 0.042, frosted) * uQuality;
    float pointerCurvature = 4.0 * pointerEnergy * (1.0 - pointerEnergy);
    float wakeCurvature =
      abs((1.0 - wakeCoordinate * wakeCoordinate) * exp(-0.5 * wakeCoordinate * wakeCoordinate)) *
      wakeEnvelope *
      uMotion;
    float surfaceCurvature = max(pointerCurvature * 0.68, wakeCurvature * 0.78);
    surfaceCurvature = max(surfaceCurvature, flowSurfaceDetail * temporalEnergy * 0.9);
    float localCaustic = surfaceCurvature * rectMask;

    staticRefraction += lens * staticLens * mix(1.0, 0.82, frosted) * rectMask;
    dynamicRefraction += (
      pointerDelta * pointerEnergy * pointerStrength +
      trailRefraction * trailStrength +
      temporalFlow * temporalStrength +
      wakeRefraction
    ) * rectMask;
    edge = max(edge, edgeResponse * rectMask);
    caustic = max(caustic, localCaustic);
    materialEnergy = max(materialEnergy, liquidEnergy * rectMask);
    mask = max(mask, rectMask);
  }

  if (mask <= 0.0) discard;

  float contentProtection = getContentProtection(coverUv(vUv + staticRefraction));
  dynamicRefraction *= contentProtection;
  dynamicRefraction = softLimitDynamicRefraction(dynamicRefraction);
  vec2 refraction = staticRefraction + dynamicRefraction;
  vec2 sourceUv = coverUv(vUv + refraction);
  float separation = edge * mix(0.00072, 0.0013, uQuality) * mix(1.0, 0.58, frosted);
  vec3 refracted = sampleChromatic(sourceUv, separation);
  float detailSeparation = separation * mix(1.45, 2.35, uQuality);
  vec3 detailed = sampleChromatic(sourceUv, detailSeparation);
  refracted = mix(refracted, detailed, mix(0.12, 0.32, uQuality) * (1.0 - frosted));
  vec2 diffusionAxis = length(refraction) > 0.00001 ? normalize(refraction) : wakePerpendicular;
  float diffusionRadius = mix(0.0022, 0.0038, uQuality) * (0.82 + caustic * 0.32);
  vec3 diffused;
  if (uQuality > 0.5) {
    diffused = sampleHighQualityDiffuse(sourceUv, diffusionAxis, diffusionRadius);
  } else {
    diffused = sampleBalancedDiffuse(sourceUv, diffusionAxis, diffusionRadius);
  }
  refracted = mix(refracted, diffused, frosted);
  float refractedLuminance = dot(refracted, vec3(0.2126, 0.7152, 0.0722));
  float frostedBrightCompression = smoothstep(0.58, 0.94, refractedLuminance) * frosted;
  refracted *= 1.0 - frostedBrightCompression * mix(0.16, 0.22, uQuality);
  vec3 highlight = vec3(0.84, 0.92, 1.0);
  float edgeHighlightMix = 0.12;
  float causticHighlightMix = 0.075;
  float liquidPresence = clamp(materialEnergy, 0.0, 1.0);
  float materialAlpha = 0.26 * liquidPresence;
  float proceduralEdgeAlpha = 0.14;
  float proceduralCausticAlpha = 0.075;

  if (uAppearance > 1.5) {
    highlight = vec3(0.94, 0.97, 1.0);
    edgeHighlightMix = 0.15;
    causticHighlightMix = 0.042;
    materialAlpha = mix(0.06, 0.12, liquidPresence);
    proceduralEdgeAlpha = 0.16;
    proceduralCausticAlpha = 0.045;
  } else if (uAppearance > 0.5) {
    highlight = mix(vec3(1.0), uTintColor, 0.72);
    edgeHighlightMix = 0.17;
    causticHighlightMix = 0.085;
    materialAlpha = 0.28 * liquidPresence;
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
    mask * (materialAlpha + edge * 0.2 + caustic * mix(0.038, 0.052, uQuality))
  );
}
`

const SCROLL_SURFACE_UPDATE_INTERVAL_MS = 32
const FLOW_BUFFER_SCALE = 0.25
const SURFACE_TRANSITION_DURATION_MS = 96

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

/** 读取全部可见视觉表面，并保留 DOM 元素作为 renderer 生命周期内的稳定身份。 */
function collectGlassOpticalSurfaceDescriptors(
  viewportWidth: number,
  viewportHeight: number,
  appearance: ThemeCustomizerGlassAppearance,
) {
  const candidates: Array<GlassOpticalSurfaceDescriptor & { visibleArea: number }> = []
  const seen = new Set<HTMLElement>()

  for (const { rank, selector } of SURFACE_SELECTORS) {
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

      candidates.push({
        key: element,
        rect: {
          height: bounds.height,
          radii: [...readBorderRadii(element)] as GlassCornerRadii,
          rank: rank + candidates.length * 0.001,
          width: bounds.width,
          x: bounds.left,
          y: bounds.top,
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
        rect.x >= parent.rect.x &&
        rect.y >= parent.rect.y &&
        rect.x + rect.width <= parent.rect.x + parent.rect.width &&
        rect.y + rect.height <= parent.rect.y + parent.rect.height,
    )
    if (!nested) selected.push({ key: candidate.key, rect })
  }

  return selected
}

/** 将活动界面中的高价值材质面集中转换为 renderer 矩形预算。 */
export function collectGlassOpticalRects(
  viewportWidth: number,
  viewportHeight: number,
  appearance: ThemeCustomizerGlassAppearance,
  interactionPoint?: { x: number; y: number },
) {
  const candidates = collectGlassOpticalSurfaceDescriptors(viewportWidth, viewportHeight, appearance)

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
  let pointerTargetX = 0.5
  let pointerTargetY = 0.5
  let pointerPositionX = 0.5
  let pointerPositionY = 0.5
  let pointerSpringVelocityX = 0
  let pointerSpringVelocityY = 0
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
  let availableSurfaces: GlassOpticalSurfaceDescriptor[] = []
  let surfaceSlots: GlassOpticalSurfaceSlot<HTMLElement>[] = []
  let activeSurface: HTMLElement | null = null
  let outgoingSurface: HTMLElement | null = null
  let surfaceTransitionStartedAt = 0
  let wakeDirection = { x: 0, y: -1 }
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

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const normalized = surfaceSlots.map(slot => normalizeGlassOpticalRect(slot.rect, viewportWidth, viewportHeight))
    const uniformRects = resources.uniforms.uRects.value
    const uniformRadii = resources.uniforms.uRadii.value
    const uniformWeights = resources.uniforms.uSurfaceWeights.value
    const transitionWeights = outgoingSurface
      ? getGlassOpticalSurfaceTransitionWeights(timestamp - surfaceTransitionStartedAt, SURFACE_TRANSITION_DURATION_MS)
      : { incoming: 1, outgoing: 0 }

    for (let index = 0; index < 8; index += 1) {
      const surface = normalized[index]
      const slot = surfaceSlots[index]
      const rect = surface?.rect ?? [0, 0, 0, 0]
      const radii = surface?.radii ?? [0, 0, 0, 0]
      uniformRects[index].set(rect[0], rect[1], rect[2], rect[3])
      uniformRadii[index].set(radii[0], radii[1], radii[2], radii[3])
      uniformWeights[index] =
        slot?.role === 'outgoing'
          ? transitionWeights.outgoing
          : slot?.role === 'active'
            ? transitionWeights.incoming
            : slot
              ? 1
              : 0
    }

    resources.uniforms.uRectCount.value = normalized.length
  }

  function updateSurfaceUniforms(timestamp = performance.now()) {
    if (!resources) return

    const viewportWidth = window.innerWidth
    availableSurfaces = collectGlassOpticalSurfaceDescriptors(
      viewportWidth,
      window.innerHeight,
      toValue(options.appearance),
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
      flowResources.uniforms.uTexelSize.value.set(1 / flowWidth, 1 / flowHeight)
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

    const normalizedX = x / Math.max(window.innerWidth, 1)
    const normalizedY = 1 - y / Math.max(window.innerHeight, 1)
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
    const motion = getGlassOpticalMotionEnergy(elapsed, profile.motionDuration, profile.motionHalfLife)
    writeSurfaceUniforms(timestamp)
    resources.uniforms.uWakeProgress.value = Math.min(1, elapsed / Math.max(1, profile.motionDuration))
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
    const elapsed = Math.max(8, timestamp - lastPointerAt)
    const previousNormalizedX = lastPointerX / viewportWidth
    const previousNormalizedY = 1 - lastPointerY / viewportHeight
    const velocityX = velocityOverride?.x ?? ((clientX - lastPointerX) / viewportWidth) * Math.min(2, 16.67 / elapsed)
    const velocityY = velocityOverride?.y ?? (-(clientY - lastPointerY) / viewportHeight) * Math.min(2, 16.67 / elapsed)
    const velocityLength = Math.hypot(velocityX, velocityY)
    const velocityScale = velocityLength > 0.09 ? 0.09 / velocityLength : 1
    const surface = findInteractionSurface(clientX, clientY)
    lastPointerX = clientX
    lastPointerY = clientY
    lastPointerAt = timestamp
    if (!resources || !surface) return

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    const surfaceChanged = activateInteractionSurface(surface.key, timestamp, reducedMotion)
    const restartsWake = surfaceChanged || !interactionAnimating
    const normalizedX = clientX / viewportWidth
    const normalizedY = 1 - clientY / viewportHeight
    if (surfaceChanged) {
      snapPointer(normalizedX, normalizedY)
      updateTrail(clientX, clientY, timestamp, normalizedX, normalizedY)
    } else {
      updateTrail(clientX, clientY, timestamp, previousNormalizedX, previousNormalizedY)
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
    const surface = findInteractionSurface(touch.clientX, touch.clientY)
    if (resources && surface) {
      activateInteractionSurface(surface.key, timestamp, matchMedia('(prefers-reduced-motion: reduce)').matches)
      snapPointer(touch.clientX / Math.max(window.innerWidth, 1), 1 - touch.clientY / Math.max(window.innerHeight, 1))
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

    const currentPointIsVisible = surfaceSlots.some(slot => rectContainsPoint(slot.rect, lastPointerX, lastPointerY))
    const fallbackSurface = surfaceSlots.find(
      slot => slot.rect.y < window.innerHeight && slot.rect.y + slot.rect.height > 0 && slot.rect.x < window.innerWidth,
    )
    const clientX = currentPointIsVisible
      ? lastPointerX
      : fallbackSurface
        ? Math.min(window.innerWidth - 1, Math.max(0, fallbackSurface.rect.x + fallbackSurface.rect.width * 0.5))
        : window.innerWidth * 0.5
    const clientY = currentPointIsVisible
      ? lastPointerY
      : fallbackSurface
        ? Math.min(window.innerHeight - 1, Math.max(0, fallbackSurface.rect.y + fallbackSurface.rect.height * 0.5))
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
    availableSurfaces = []
    surfaceSlots = []
    activeSurface = null
    outgoingSurface = null
    surfaceTransitionStartedAt = 0
    wakeDirection = { x: 0, y: -1 }
    tracksScrollingSurfaces = false
    scrollStates = new WeakMap<object, { position: number; timestamp: number }>()
    activeTouchIdentifier = null
    lastTouchAt = Number.NEGATIVE_INFINITY
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
        uMaxRefractionPixels: { value: getRenderProfile().maxRefractionPixels },
        uPointer: { value: new three.Vector2(0.5, 0.5) },
        uPointerVelocity: { value: new three.Vector2(0, 0) },
        uQuality: { value: toValue(options.quality) === 'high' ? 1 : 0 },
        uRadii: { value: Array.from({ length: 8 }, () => new Vector4Class()) },
        uRectCount: { value: 0 },
        uRects: { value: Array.from({ length: 8 }, () => new Vector4Class()) },
        uSurfaceWeights: { value: Array.from({ length: 8 }, () => 0) },
        uTexture: { value: null },
        uTintColor: { value: new three.Color(toValue(options.tintColor)) },
        uTrail: { value: Array.from({ length: 4 }, () => new Vector4Class(0.5, 0.5, 0, 0)) },
        uTrailCount: { value: getRenderProfile().trailCount },
        uViewportSize: { value: new three.Vector2(window.innerWidth, window.innerHeight) },
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
      resources.uniforms.uMaxRefractionPixels.value = nextProfile.maxRefractionPixels
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
