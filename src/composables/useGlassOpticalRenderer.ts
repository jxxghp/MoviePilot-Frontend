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
  WebGLRenderer,
} from 'three'
import {
  canUseGlassWallpaperTexture,
  getGlassCoverScale,
  getGlassOpticalBufferSize,
  getGlassOpticalRenderProfile,
  normalizeGlassOpticalRect,
  selectGlassOpticalRects,
  type GlassOpticalQuality,
  type GlassOpticalRect,
} from '@/utils/glassOptics'
import type { ThemeCustomizerGlassAppearance } from '@/composables/useThemeCustomizer'

type ThreeModule = typeof import('three')
type RendererState = 'fallback' | 'loading' | 'ready'

interface GlassRendererUniforms extends Record<string, IUniform> {
  uAppearance: IUniform<number>
  uCoverScale: IUniform<Vector2>
  uHasWallpaperTexture: IUniform<number>
  uPointer: IUniform<Vector2>
  uQuality: IUniform<number>
  uRadii: IUniform<number[]>
  uRectCount: IUniform<number>
  uRects: IUniform<Vector4[]>
  uTexture: IUniform<Texture | null>
  uTintColor: IUniform<Color>
  uTime: IUniform<number>
  uViewportSize: IUniform<Vector2>
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
  { rank: 3, selector: '.dashboard-grid-item-content' },
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

const FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D uTexture;
uniform vec2 uCoverScale;
uniform float uHasWallpaperTexture;
uniform vec2 uPointer;
uniform float uQuality;
uniform vec4 uRects[8];
uniform float uRadii[8];
uniform int uRectCount;
uniform float uAppearance;
uniform vec3 uTintColor;
uniform float uTime;
uniform vec2 uViewportSize;
varying vec2 vUv;

float roundedRectMask(vec2 local, vec2 rectSize, float radius) {
  float safeRadius = min(max(radius, 0.0), min(rectSize.x, rectSize.y) * 0.5);
  vec2 centered = abs(local - 0.5) * rectSize - (rectSize * 0.5 - vec2(safeRadius));
  float distanceToEdge = length(max(centered, 0.0)) + min(max(centered.x, centered.y), 0.0) - safeRadius;
  return 1.0 - smoothstep(-1.0, 1.0, distanceToEdge);
}

vec2 coverUv(vec2 uv) {
  return vec2(0.5) + (uv - vec2(0.5)) * uCoverScale;
}

void main() {
  float mask = 0.0;
  float edge = 0.0;
  float caustic = 0.0;
  vec2 refraction = vec2(0.0);

  for (int i = 0; i < 8; i++) {
    if (i >= uRectCount) break;

    vec4 rect = uRects[i];
    vec2 local = (vUv - rect.xy) / rect.zw;
    float rectMask = roundedRectMask(local, rect.zw * uViewportSize, uRadii[i]);
    if (rectMask <= 0.0) continue;

    float edgeDistance = min(min(local.x, 1.0 - local.x), min(local.y, 1.0 - local.y));
    float edgeResponse = 1.0 - smoothstep(0.0, 0.16, edgeDistance);
    vec2 lens = local - vec2(0.5);
    vec2 pointerDelta = uPointer - vUv;
    float pointerEnergy = exp(-dot(pointerDelta, pointerDelta) * 18.0);
    float ripple = sin((local.x + local.y) * 10.0 + uTime * 0.004) * mix(0.0008, 0.0014, uQuality);
    vec2 pointerLocal = (uPointer - rect.xy) / rect.zw;
    float causticDistance = length(local - pointerLocal);
    float causticWave = 0.5 + 0.5 * cos(causticDistance * 34.0 - uTime * 0.018);
    float localCaustic = exp(-causticDistance * 7.0) * causticWave * rectMask * uQuality;

    refraction += (lens * mix(0.006 + edgeResponse * 0.012, 0.009 + edgeResponse * 0.017, uQuality) + pointerDelta * pointerEnergy * mix(0.0024, 0.0042, uQuality) + ripple) * rectMask;
    edge = max(edge, edgeResponse * rectMask);
    caustic = max(caustic, localCaustic);
    mask = max(mask, rectMask);
  }

  if (mask <= 0.0) discard;

  vec2 sourceUv = coverUv(vUv + refraction);
  float separation = 0.0012 * edge;
  vec3 refracted = vec3(
    texture2D(uTexture, sourceUv + vec2(separation, 0.0)).r,
    texture2D(uTexture, sourceUv).g,
    texture2D(uTexture, sourceUv - vec2(separation, 0.0)).b
  );
  if (uQuality > 0.5) {
    float detailSeparation = separation * 1.8 + 0.0007;
    vec3 detailed = vec3(
      texture2D(uTexture, sourceUv + vec2(detailSeparation, detailSeparation * 0.35)).r,
      texture2D(uTexture, sourceUv).g,
      texture2D(uTexture, sourceUv - vec2(detailSeparation, detailSeparation * 0.35)).b
    );
    refracted = mix(refracted, detailed, 0.42);
  }
  vec3 highlight = vec3(0.84, 0.92, 1.0);
  float edgeHighlightMix = 0.12;
  float causticHighlightMix = 0.12;
  float materialAlpha = 0.28;
  float proceduralEdgeAlpha = 0.14;
  float proceduralCausticAlpha = 0.1;

  if (uAppearance > 1.5) {
    highlight = vec3(0.94, 0.97, 1.0);
    edgeHighlightMix = 0.22;
    causticHighlightMix = 0.1;
    materialAlpha = 0.34;
    proceduralEdgeAlpha = 0.18;
    proceduralCausticAlpha = 0.08;
  } else if (uAppearance > 0.5) {
    highlight = mix(vec3(1.0), uTintColor, 0.72);
    edgeHighlightMix = 0.17;
    causticHighlightMix = 0.16;
    materialAlpha = 0.3;
  }

  if (uHasWallpaperTexture < 0.5) {
    vec3 proceduralHighlight = highlight * (edge * 0.46 + caustic * 0.72);
    float proceduralAlpha = mask * (edge * proceduralEdgeAlpha + caustic * proceduralCausticAlpha);
    gl_FragColor = vec4(proceduralHighlight, proceduralAlpha);
    return;
  }

  refracted = mix(refracted, highlight, edge * edgeHighlightMix);
  refracted += highlight * caustic * causticHighlightMix;

  gl_FragColor = vec4(refracted, mask * (materialAlpha + edge * 0.25 + caustic * 0.08));
}
`

const SCROLL_SURFACE_UPDATE_INTERVAL_MS = 32

/** 读取 CSS 圆角并折算为像素值。 */
function readBorderRadius(element: HTMLElement) {
  const value = Number.parseFloat(getComputedStyle(element).borderTopLeftRadius)

  return Number.isFinite(value) ? value : 0
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
export function collectGlassOpticalRects(viewportWidth: number, viewportHeight: number) {
  const candidates: GlassOpticalRect[] = []
  const seen = new Set<HTMLElement>()

  for (const { rank, selector } of SURFACE_SELECTORS) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (seen.has(element)) continue
      seen.add(element)

      const bounds = element.getBoundingClientRect()
      if (!isVisibleSurface(element, bounds)) continue

      candidates.push({
        height: bounds.height,
        radius: readBorderRadius(element),
        rank: rank + candidates.length * 0.001,
        width: bounds.width,
        x: bounds.left,
        y: bounds.top,
      })
    }
  }

  return selectGlassOpticalRects(candidates, viewportWidth, viewportHeight, viewportWidth <= 600)
}

/** 将材质语义映射为稳定 shader 协议，质量档不参与该映射。 */
function getGlassAppearanceUniformValue(appearance: ThemeCustomizerGlassAppearance) {
  if (appearance === 'tinted') return 1
  if (appearance === 'frosted') return 2

  return 0
}

/** 管理玻璃主题唯一 renderer、事件驱动帧调度与完整 GPU 资源释放。 */
export function useGlassOpticalRenderer(options: UseGlassOpticalRendererOptions) {
  const state = ref<RendererState>('loading')
  const renderedFrames = ref(0)
  let three: ThreeModule | null = null
  let resources: GlassRendererResources | null = null
  let activeTexture: Texture | null = null
  let activeTextureHeight = 1
  let activeTextureWidth = 1
  let loadVersion = 0
  let animationFrame: number | null = null
  let surfaceUpdateFrame: number | null = null
  let pointerAnimationStartedAt = 0
  let surfaceResizeTimer: number | null = null
  let scrollSurfaceTimer: number | null = null
  let lastScrollSurfaceUpdateAt = 0
  let resizeObserver: ResizeObserver | null = null
  let surfaceMutationObserver: MutationObserver | null = null
  let observedSurfaces: HTMLElement[] = []
  let currentRects: GlassOpticalRect[] = []
  let tracksScrollingSurfaces = false
  let contextRestoreAttempts = 0

  function cancelScheduledFrame() {
    if (animationFrame === null) return

    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }

  function renderFrame(timestamp = performance.now()) {
    animationFrame = null
    if (!resources || !toValue(options.active) || document.visibilityState === 'hidden') return

    resources.uniforms.uTime.value = timestamp
    resources.renderer.render(resources.scene, resources.camera)
    renderedFrames.value += 1
  }

  function scheduleFrame() {
    if (animationFrame !== null || !resources) return

    animationFrame = requestAnimationFrame(renderFrame)
  }

  function updateSurfaceUniforms() {
    if (!resources || !three) return

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const rects = collectGlassOpticalRects(viewportWidth, viewportHeight)
    currentRects = rects
    const normalized = rects.map(rect => normalizeGlassOpticalRect(rect, viewportWidth, viewportHeight))
    const uniformRects = resources.uniforms.uRects.value
    const uniformRadii = resources.uniforms.uRadii.value

    for (let index = 0; index < 8; index += 1) {
      const surface = normalized[index]
      const rect = surface?.rect ?? [0, 0, 0, 0]
      uniformRects[index].set(rect[0], rect[1], rect[2], rect[3])
      uniformRadii[index] = surface?.radius ?? 0
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
    tracksScrollingSurfaces = observedSurfaces.some(element => element.matches('.dashboard-grid-item-content'))
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

  function resizeRenderer() {
    if (!resources) return

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const profile = getGlassOpticalRenderProfile(toValue(options.quality), toValue(options.routeKey))
    const buffer = getGlassOpticalBufferSize(viewportWidth, viewportHeight, viewportWidth <= 600, profile.bufferQuality)
    resources.renderer.setSize(buffer.width, buffer.height, false)
    resources.uniforms.uViewportSize.value.set(viewportWidth, viewportHeight)
    syncCoverScale(viewportWidth, viewportHeight)
    scheduleSurfaceUpdate()
  }

  function handlePointerMove(event: PointerEvent) {
    if (!resources || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (
      !currentRects.some(
        rect =>
          event.clientX >= rect.x &&
          event.clientX <= rect.x + rect.width &&
          event.clientY >= rect.y &&
          event.clientY <= rect.y + rect.height,
      )
    )
      return

    resources.uniforms.uPointer.value.set(event.clientX / window.innerWidth, 1 - event.clientY / window.innerHeight)
    pointerAnimationStartedAt = performance.now()

    const animatePointer = (timestamp: number) => {
      renderFrame(timestamp)
      const responseDuration = toValue(options.quality) === 'high' ? 520 : 360
      if (timestamp - pointerAnimationStartedAt < responseDuration && toValue(options.active)) {
        animationFrame = requestAnimationFrame(animatePointer)
      }
    }

    cancelScheduledFrame()
    animationFrame = requestAnimationFrame(animatePointer)
  }

  function handleScroll() {
    if (!tracksScrollingSurfaces || scrollSurfaceTimer !== null) return

    const elapsed = performance.now() - lastScrollSurfaceUpdateAt
    const delay = Math.max(0, SCROLL_SURFACE_UPDATE_INTERVAL_MS - elapsed)
    scrollSurfaceTimer = window.setTimeout(() => {
      scrollSurfaceTimer = null
      lastScrollSurfaceUpdateAt = performance.now()
      scheduleSurfaceUpdate()
    }, delay)
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') cancelScheduledFrame()
    else scheduleFrame()
  }

  function handleContextLost(event: Event) {
    event.preventDefault()
    cancelScheduledFrame()
    state.value = 'fallback'
  }

  function handleContextRestored() {
    if (contextRestoreAttempts >= 1) return

    contextRestoreAttempts += 1
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
    window.addEventListener('resize', resizeRenderer, { passive: true })
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    document.addEventListener('visibilitychange', handleVisibilityChange)
    options.canvas.value?.addEventListener('webglcontextlost', handleContextLost)
    options.canvas.value?.addEventListener('webglcontextrestored', handleContextRestored)
  }

  function removeEvents() {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('resize', resizeRenderer)
    window.removeEventListener('scroll', handleScroll, true)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    options.canvas.value?.removeEventListener('webglcontextlost', handleContextLost)
    options.canvas.value?.removeEventListener('webglcontextrestored', handleContextRestored)
  }

  function disposeRenderer(releaseContext = true) {
    loadVersion += 1
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
    activeTexture?.dispose()
    activeTexture = null
    activeTextureHeight = 1
    activeTextureWidth = 1

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
    state.value = 'fallback'
    document.documentElement.dataset.glassRendererState = 'fallback'
  }

  async function loadWallpaper(url: string, version: number) {
    if (!resources || !three || !url) return

    const profile = getGlassOpticalRenderProfile(toValue(options.quality), toValue(options.routeKey))
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

      state.value = 'ready'
      document.documentElement.dataset.glassRendererState = 'ready'
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

    state.value = 'ready'
    document.documentElement.dataset.glassRendererState = 'ready'
    scheduleFrame()
  }

  async function initializeRenderer(releaseContext = true) {
    disposeRenderer(releaseContext)
    if (!toValue(options.active) || !options.canvas.value) return

    if (!window.WebGLRenderingContext || reducedTransparencyQuery.matches || !toValue(options.wallpaperUrl)) {
      state.value = 'fallback'
      document.documentElement.dataset.glassRendererState = 'fallback'
      return
    }

    state.value = 'loading'
    document.documentElement.dataset.glassRendererState = 'loading'
    const version = ++loadVersion

    try {
      three = await import('three')
      if (version !== loadVersion || !options.canvas.value) return
      const Vector4Class = three.Vector4

      const renderer = new three.WebGLRenderer({
        alpha: true,
        antialias: false,
        canvas: options.canvas.value,
        powerPreference: 'low-power',
        premultipliedAlpha: true,
      })
      renderer.setClearColor(0x000000, 0)
      renderer.setPixelRatio(1)

      const geometry = new three.BufferGeometry()
      geometry.setAttribute('position', new three.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
      const uniforms: GlassRendererUniforms = {
        uAppearance: { value: getGlassAppearanceUniformValue(toValue(options.appearance)) },
        uCoverScale: { value: new three.Vector2(1, 1) },
        uHasWallpaperTexture: { value: 0 },
        uPointer: { value: new three.Vector2(0.5, 0.5) },
        uQuality: { value: toValue(options.quality) === 'high' ? 1 : 0 },
        uRadii: { value: Array.from({ length: 8 }, () => 0) },
        uRectCount: { value: 0 },
        uRects: { value: Array.from({ length: 8 }, () => new Vector4Class()) },
        uTexture: { value: null },
        uTintColor: { value: new three.Color(toValue(options.tintColor)) },
        uTime: { value: 0 },
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
      state.value = 'fallback'
      document.documentElement.dataset.glassRendererState = 'fallback'
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
        const version = ++loadVersion
        state.value = 'loading'
        document.documentElement.dataset.glassRendererState = 'loading'

        try {
          await loadWallpaper(wallpaperUrl, version)
        } catch (error) {
          fallbackFromCurrentLoad(version, '玻璃光学壁纸纹理加载失败，已回退标准材质:', error)
        }
      }
    },
    { immediate: true },
  )

  watch(
    () => toValue(options.appearance),
    appearance => {
      if (!resources) return

      resources.uniforms.uAppearance.value = getGlassAppearanceUniformValue(appearance)
      scheduleFrame()
    },
  )

  watch(
    () => toValue(options.quality),
    async quality => {
      if (!resources) return

      resources.uniforms.uQuality.value = quality === 'high' ? 1 : 0
      resizeRenderer()
      const version = ++loadVersion
      state.value = 'loading'
      document.documentElement.dataset.glassRendererState = 'loading'

      try {
        await loadWallpaper(toValue(options.wallpaperUrl), version)
      } catch (error) {
        fallbackFromCurrentLoad(version, '玻璃质量纹理切换失败，已回退标准材质:', error)
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
    () => toValue(options.routeKey),
    async (routeKey, previousRouteKey) => {
      await nextTick()
      if (resources) {
        const previousProfile = getGlassOpticalRenderProfile(toValue(options.quality), previousRouteKey ?? '')
        const nextProfile = getGlassOpticalRenderProfile(toValue(options.quality), routeKey)
        resizeRenderer()

        if (
          previousProfile.bufferQuality !== nextProfile.bufferQuality ||
          previousProfile.textureLimit !== nextProfile.textureLimit ||
          previousProfile.textureSource !== nextProfile.textureSource
        ) {
          const version = ++loadVersion
          state.value = 'loading'
          document.documentElement.dataset.glassRendererState = 'loading'

          try {
            await loadWallpaper(toValue(options.wallpaperUrl), version)
          } catch (error) {
            fallbackFromCurrentLoad(version, '玻璃场景纹理切换失败，已回退标准材质:', error)
          }
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
