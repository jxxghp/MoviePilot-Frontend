import {
  collectGlassOpticalRects,
  containsGlassOpticalSurface,
  createGlassWallpaperSourceCache,
  prepareGlassWebGLContext,
  resolveGlassOpticalSurfaceMode,
  setGlassRendererState,
  useGlassOpticalInteractionSource,
  useGlassOpticalRenderer,
  type GlassRendererState,
} from '@/composables/useGlassOpticalRenderer'
import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_ACTIVITY_SUSPEND_DELAY_MS } from '@/utils/appActivityLifecycle'
import type { Object3D, ShaderMaterial, Vector2, WebGLRenderTarget } from 'three'

const wallpaperToneMocks = vi.hoisted(() => ({
  load: vi.fn(),
  takeDecodedSource: vi.fn(),
}))

vi.mock('@/utils/glassWallpaperTone', async importOriginal => {
  const actual = await importOriginal<typeof import('@/utils/glassWallpaperTone')>()

  return {
    ...actual,
    loadGlassWallpaperTone: wallpaperToneMocks.load,
    takeGlassWallpaperDecodedSource: wallpaperToneMocks.takeDecodedSource,
  }
})

vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>()
  return {
    ...actual,
    TextureLoader: class {
      loadAsync() {
        const texture = new actual.Texture()
        texture.image = { height: 1, naturalHeight: 1, naturalWidth: 1, width: 1 }
        return Promise.resolve(texture)
      }

      setCrossOrigin() {}
    },
    WebGLRenderer: class {
      compileAsync() {
        return Promise.resolve()
      }

      clear() {}
      dispose() {}
      forceContextLoss() {}
      getRenderTarget() {
        return null
      }
      render() {}
      setClearColor() {}
      setPixelRatio() {}
      initTexture() {}
      setRenderTarget() {}
      setScissor() {}
      setScissorTest() {}
      setSize() {}
    },
  }
})

/** 提供 renderer 单元测试所需的最小 ResizeObserver 实现。 */
class ResizeObserverMock {
  static instances: ResizeObserverMock[] = []

  readonly targets = new Set<Element>()

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this)
  }

  /** 断开观察时无需执行额外逻辑。 */
  disconnect() {
    this.targets.clear()
  }

  /** 记录观察目标，供尺寸生命周期用例触发回调。 */
  observe(target: Element) {
    this.targets.add(target)
  }

  /** 模拟观察目标的内容框发生变化。 */
  trigger() {
    const entries = [...this.targets].map(target => ({ target }) as ResizeObserverEntry)
    this.callback(entries, this as unknown as ResizeObserver)
  }
}

/** 创建带稳定视口边界的光学表面元素。 */
function appendOpticalSurface(className: string, bounds: Pick<DOMRect, 'height' | 'width' | 'x' | 'y'>) {
  const surface = document.createElement('section')
  surface.className = className
  surface.getBoundingClientRect = () =>
    ({
      ...bounds,
      bottom: bounds.y + bounds.height,
      left: bounds.x,
      right: bounds.x + bounds.width,
      top: bounds.y,
      toJSON: () => ({}),
    }) as DOMRect
  document.body.append(surface)

  return surface
}

/** 为元素提供可由 renderer 读取的稳定视口边界。 */
function setOpticalSurfaceBounds(element: HTMLElement, bounds: Pick<DOMRect, 'height' | 'width' | 'x' | 'y'>) {
  element.getBoundingClientRect = () =>
    ({
      ...bounds,
      bottom: bounds.y + bounds.height,
      left: bounds.x,
      right: bounds.x + bounds.width,
      top: bounds.y,
      toJSON: () => ({}),
    }) as DOMRect
}

function stubMediaPreferences({ coarsePointer = false, reducedMotion = false, reducedTransparency = false } = {}) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      matches:
        (query === '(pointer: coarse)' && coarsePointer) ||
        (query === '(prefers-reduced-motion: reduce)' && reducedMotion) ||
        (query === '(prefers-reduced-transparency: reduce)' && reducedTransparency),
      media: query,
      removeEventListener: vi.fn(),
    })),
  )
}

function createTouchList(points: Array<{ clientX: number; clientY: number; identifier: number }>) {
  const touches = points.map(point => point as Touch)

  return Object.assign(touches, {
    item(index: number) {
      return touches[index] ?? null
    },
  }) as unknown as TouchList
}

/** 构造浏览器在 detached 子树交付前保留的 child-list 移除记录。 */
function createRemovalRecord(target: Element, removedNodes: Element[]): MutationRecord {
  const toNodeList = (nodes: Node[]) =>
    Object.assign(nodes, {
      item(index: number) {
        return nodes[index] ?? null
      },
    }) as unknown as NodeList

  return {
    addedNodes: toNodeList([]),
    attributeName: null,
    attributeNamespace: null,
    nextSibling: null,
    oldValue: null,
    previousSibling: null,
    removedNodes: toNodeList(removedNodes),
    target,
    type: 'childList',
  }
}

function dispatchTouchEvent(
  type: 'touchcancel' | 'touchend' | 'touchmove' | 'touchstart',
  touches: Array<{ clientX: number; clientY: number; identifier: number }>,
  changedTouches = touches,
) {
  const event = new Event(type) as TouchEvent
  Object.defineProperties(event, {
    changedTouches: { value: createTouchList(changedTouches) },
    touches: { value: createTouchList(touches) },
  })
  window.dispatchEvent(event)

  return event
}

beforeEach(() => {
  ResizeObserverMock.instances = []
  wallpaperToneMocks.load.mockReset()
  wallpaperToneMocks.load.mockResolvedValue({
    corsReady: false,
    profile: {
      exposure: 1,
      highlightLuminance: 0.82,
      medianLuminance: 0.38,
    },
  })
  wallpaperToneMocks.takeDecodedSource.mockReset()
  wallpaperToneMocks.takeDecodedSource.mockReturnValue(undefined)
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  vi.stubGlobal('WebGLRenderingContext', class {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  delete document.documentElement.dataset.glassRendererState
})

describe('glass optical surface discovery', () => {
  it('resets incompatible unpack flags before Three initializes 3D placeholder textures', () => {
    vi.stubGlobal('WebGL2RenderingContext', class {})
    const pixelStorei = vi.fn()
    const context = {
      isContextLost: () => false,
      pixelStorei,
      UNPACK_FLIP_Y_WEBGL: 0x9240,
      UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    } as unknown as WebGL2RenderingContext
    const getContext = vi.fn().mockReturnValue(context)
    const canvas = { getContext } as unknown as HTMLCanvasElement

    expect(prepareGlassWebGLContext(canvas)).toBe(context)
    expect(getContext).toHaveBeenCalledWith('webgl2', {
      alpha: true,
      antialias: false,
      depth: true,
      failIfMajorPerformanceCaveat: false,
      powerPreference: 'high-performance',
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      stencil: false,
    })
    expect(pixelStorei.mock.calls).toEqual([
      [context.UNPACK_FLIP_Y_WEBGL, false],
      [context.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false],
    ])
  })

  it('does not inject shared optical input while an overlay is active', () => {
    const overlay = document.createElement('div')
    overlay.className = 'v-overlay v-overlay--active'
    document.body.append(overlay)
    const fixedListener = vi.fn()
    const scrollListener = vi.fn()
    const scope = effectScope()
    scope.run(() => {
      const source = useGlassOpticalInteractionSource()
      source.subscribe('fixed', fixedListener)
      source.subscribe('scroll', scrollListener)
    })

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 400 }))

    expect(fixedListener).not.toHaveBeenCalled()
    expect(scrollListener).not.toHaveBeenCalled()
    scope.stop()
  })

  it('routes login-card input to the scroll presentation context', () => {
    const loginRoot = document.createElement('div')
    loginRoot.className = 'login-root'
    const loginCard = document.createElement('section')
    loginCard.className = 'login-card'
    setOpticalSurfaceBounds(loginCard, { height: 600, width: 420, x: 200, y: 100 })
    loginRoot.append(loginCard)
    document.body.append(loginRoot)
    const fixedListener = vi.fn()
    const scrollListener = vi.fn()
    const scope = effectScope()
    scope.run(() => {
      const source = useGlassOpticalInteractionSource()
      source.subscribe('fixed', fixedListener)
      source.subscribe('scroll', scrollListener)
    })

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 400 }))

    expect(scrollListener).toHaveBeenCalledOnce()
    expect(fixedListener).not.toHaveBeenCalled()
    scope.stop()
  })

  it('routes desktop pointer input when the browser does not expose TouchEvent', () => {
    vi.stubGlobal('TouchEvent', undefined)
    const scrollListener = vi.fn()
    const scope = effectScope()
    scope.run(() => {
      const source = useGlassOpticalInteractionSource()
      source.subscribe('scroll', scrollListener)
    })

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 400 }))

    expect(scrollListener).toHaveBeenCalledOnce()
    scope.stop()
  })

  it('keeps touch ownership when the browser does not expose TouchEvent', () => {
    vi.stubGlobal('TouchEvent', undefined)
    const scrollListener = vi.fn()
    const scope = effectScope()
    scope.run(() => {
      const source = useGlassOpticalInteractionSource()
      source.subscribe('scroll', scrollListener)
    })

    dispatchTouchEvent('touchstart', [{ clientX: 400, clientY: 400, identifier: 7 }])
    dispatchTouchEvent('touchmove', [{ clientX: 420, clientY: 420, identifier: 7 }])

    expect(scrollListener).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('attaches shared input only while a dynamic presentation is active', async () => {
    const active = ref(false)
    const scrollListener = vi.fn()
    const scope = effectScope()
    scope.run(() => {
      const source = useGlassOpticalInteractionSource(active)
      source.subscribe('scroll', scrollListener)
    })

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 400, clientY: 400 }))
    expect(scrollListener).not.toHaveBeenCalled()

    active.value = true
    await nextTick()
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 420, clientY: 420 }))
    expect(scrollListener).toHaveBeenCalledOnce()

    active.value = false
    await nextTick()
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 440, clientY: 440 }))
    expect(scrollListener).toHaveBeenCalledOnce()
    scope.stop()
  })

  it('detects a target surface added directly', () => {
    const surface = document.createElement('section')
    surface.dataset.glassOpticalSurface = ''

    expect(containsGlassOpticalSurface(surface)).toBe(true)
  })

  it('detects a target surface inside an asynchronously added subtree', () => {
    const wrapper = document.createElement('div')
    wrapper.innerHTML = '<div><section data-glass-optical-surface></section></div>'

    expect(containsGlassOpticalSurface(wrapper)).toBe(true)
    expect(containsGlassOpticalSurface(document.createElement('div'))).toBe(false)
  })

  it('does not treat a lazily created overlay as a wallpaper optical surface', () => {
    const overlayRoot = document.createElement('div')
    overlayRoot.className = 'v-overlay-container'
    overlayRoot.innerHTML = `
      <div class="v-overlay v-overlay--active">
        <div class="v-overlay__content"><div class="v-card" data-glass-optical-surface></div></div>
      </div>
    `

    expect(containsGlassOpticalSurface(overlayRoot)).toBe(false)
  })

  it('keeps regular fixed surfaces and excludes overlay surfaces while an overlay is active', () => {
    appendOpticalSurface('layout-navbar', { height: 64, width: 1200, x: 0, y: 0 })
    const overlay = document.createElement('div')
    overlay.className = 'v-overlay v-overlay--active'
    const content = document.createElement('div')
    content.className = 'v-overlay__content'
    const card = appendOpticalSurface('v-card', { height: 480, width: 560, x: 320, y: 140 })
    content.append(card)
    overlay.append(content)
    document.body.append(overlay)

    expect(collectGlassOpticalRects(1200, 800, 'frosted', undefined, 'fixed')).toEqual([
      expect.objectContaining({ height: 64, width: 1200, x: 0, y: 0 }),
    ])
    expect(collectGlassOpticalRects(1200, 800, 'frosted', undefined, 'scroll')).toEqual([])
  })

  it('keeps the renderer state used by components and global CSS in sync', () => {
    const state = ref<GlassRendererState>('ready')

    setGlassRendererState(state, 'fallback')

    expect(state.value).toBe('fallback')
    expect(document.documentElement.dataset.glassRendererState).toBe('fallback')
  })

  it('excludes the navbar from mobile clear optical surfaces', () => {
    appendOpticalSurface('layout-navbar', { height: 64, width: 390, x: 0, y: 0 })
    const content = appendOpticalSurface('dashboard-content', { height: 200, width: 350, x: 20, y: 120 })
    content.dataset.glassOpticalSurface = ''

    const rects = collectGlassOpticalRects(390, 800, 'clear')

    expect(rects).toHaveLength(1)
    expect(rects[0]).toMatchObject({ height: 200, width: 350, x: 20, y: 120 })
  })

  it('keeps the navbar in mobile frosted optical surfaces', () => {
    appendOpticalSurface('layout-navbar', { height: 64, width: 390, x: 0, y: 0 })

    expect(collectGlassOpticalRects(390, 800, 'frosted')).toEqual([
      expect.objectContaining({ height: 64, width: 390, x: 0, y: 0 }),
    ])
  })

  it('keeps the navbar in desktop clear optical surfaces', () => {
    appendOpticalSurface('layout-navbar', { height: 64, width: 1000, x: 0, y: 0 })

    expect(collectGlassOpticalRects(1000, 800, 'clear')).toEqual([
      expect.objectContaining({ height: 64, width: 1000, x: 0, y: 0 }),
    ])
  })

  it('uses the actual dashboard card boundary and all four corner radii', () => {
    const shell = document.createElement('section')
    shell.className = 'dashboard-grid-item-content'
    shell.innerHTML = `
      <div class="dashboard-grid-auto-size">
        <div class="dashboard-grid-content-measure">
          <article class="v-card"></article>
        </div>
      </div>
    `
    const card = shell.querySelector<HTMLElement>('.v-card')!
    card.style.borderTopLeftRadius = '24px'
    card.style.borderTopRightRadius = '20px'
    card.style.borderBottomRightRadius = '16px'
    card.style.borderBottomLeftRadius = '12px'
    setOpticalSurfaceBounds(shell, { height: 220, width: 360, x: 20, y: 100 })
    setOpticalSurfaceBounds(card, { height: 200, width: 340, x: 30, y: 110 })
    document.body.append(shell)

    expect(collectGlassOpticalRects(390, 844, 'clear')).toEqual([
      expect.objectContaining({
        height: 200,
        radii: [24, 20, 16, 12],
        width: 340,
        x: 30,
        y: 110,
      }),
    ])
  })

  it('discovers explicit optical surfaces without component-specific selectors', () => {
    const surface = appendOpticalSurface('custom-surface', { height: 180, width: 300, x: 40, y: 120 })
    surface.dataset.glassOpticalSurface = ''
    surface.style.borderTopLeftRadius = '18px'
    surface.style.borderTopRightRadius = '18px'
    surface.style.borderBottomRightRadius = '18px'
    surface.style.borderBottomLeftRadius = '18px'

    expect(collectGlassOpticalRects(390, 844, 'clear')).toEqual([
      expect.objectContaining({ height: 180, radii: [18, 18, 18, 18], width: 300, x: 40, y: 120 }),
    ])
  })

  it('inherits the optical mode from a container and permits an explicit child override', () => {
    const container = document.createElement('div')
    container.dataset.glassOpticalMode = 'static-material'
    const inherited = document.createElement('section')
    const overridden = document.createElement('section')
    overridden.dataset.glassOpticalMode = 'dynamic'
    container.append(inherited, overridden)
    document.body.append(container)

    expect(resolveGlassOpticalSurfaceMode(inherited)).toBe('static-material')
    expect(resolveGlassOpticalSurfaceMode(overridden)).toBe('dynamic')
  })

  it('excludes direct surfaces and descendants even when a child requests dynamic mode', () => {
    const direct = appendOpticalSurface('app-hover-lift-card', { height: 220, width: 150, x: 24, y: 96 })
    direct.dataset.glassOpticalMode = 'excluded'
    const excludedContainer = document.createElement('section')
    excludedContainer.dataset.glassOpticalMode = 'excluded'
    const overridden = document.createElement('article')
    overridden.className = 'app-hover-lift-card'
    overridden.dataset.glassOpticalMode = 'dynamic'
    setOpticalSurfaceBounds(overridden, { height: 220, width: 150, x: 200, y: 96 })
    excludedContainer.append(overridden)
    document.body.append(excludedContainer)

    expect(containsGlassOpticalSurface(direct)).toBe(false)
    expect(containsGlassOpticalSurface(excludedContainer)).toBe(false)
    expect(resolveGlassOpticalSurfaceMode(overridden)).toBe('dynamic')
    expect(collectGlassOpticalRects(390, 844, 'clear')).toEqual([])
  })

  it('discovers the shared interactive card contract used across routes', () => {
    const surface = appendOpticalSurface('app-hover-lift-card', { height: 220, width: 150, x: 24, y: 96 })
    surface.style.borderTopLeftRadius = '20px'
    surface.style.borderTopRightRadius = '20px'
    surface.style.borderBottomRightRadius = '20px'
    surface.style.borderBottomLeftRadius = '20px'

    expect(collectGlassOpticalRects(390, 844, 'clear')).toEqual([
      expect.objectContaining({ height: 220, radii: [20, 20, 20, 20], width: 150, x: 24, y: 96 }),
    ])
  })

  it('discovers top-level business cards without route-specific selectors', () => {
    const main = document.createElement('main')
    main.className = 'layout-page-content'
    const surface = document.createElement('section')
    surface.className = 'v-card'
    setOpticalSurfaceBounds(surface, { height: 360, width: 720, x: 120, y: 140 })
    main.append(surface)
    document.body.append(main)

    expect(collectGlassOpticalRects(1200, 900, 'clear')).toEqual([
      expect.objectContaining({ height: 360, width: 720, x: 120, y: 140 }),
    ])
  })

  it('keeps frosted fixed surfaces on dynamics-only GPU composition', async () => {
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const canvas = document.createElement('canvas')
    const appearance = ref<'clear' | 'frosted' | 'tinted'>('clear')
    appendOpticalSurface('layout-vertical-nav', { height: 800, width: 260, x: 0, y: 0 })
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance,
        canvas: ref(canvas),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'fixed',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const scene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          uniforms: {
            uDynamicsOnly: { value: number }
          }
        }
      }>
    }
    const dynamicsOnly = scene.children[0].material.uniforms.uDynamicsOnly
    expect(dynamicsOnly.value).toBe(0)

    appearance.value = 'frosted'
    await vi.waitFor(() => expect(dynamicsOnly.value).toBe(1))

    appearance.value = 'tinted'
    await vi.waitFor(() => expect(dynamicsOnly.value).toBe(0))
    scope.stop()
  })

  it('re-samples scroll surfaces and material weight on a shared page motion revision', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const three = await import('three')
    const root = document.createElement('div')
    const canvas = document.createElement('canvas')
    let presentationHeight = 800
    Object.defineProperty(root, 'scrollHeight', {
      configurable: true,
      get: () => presentationHeight,
    })
    root.append(canvas)
    document.body.append(root)
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const setSize = vi.spyOn(three.WebGLRenderer.prototype, 'setSize')
    const bounds = { height: 240, width: 360, x: 80, y: 100 }
    appendOpticalSurface('app-hover-lift-card', bounds)
    const active = ref(true)
    const acknowledgeGeometryReady = vi.fn()
    const epoch = ref(1)
    const opacity = ref(1)
    const revision = ref(0)
    const appearance = ref<'clear' | 'frosted'>('clear')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance,
        canvas: ref(canvas),
        pageMotion: { acknowledgeGeometryReady, active, epoch, opacity, revision },
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const initialScene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          uniforms: {
            uRects: { value: Array<{ y: number }> }
            uSurfaceWeights: { value: number[] }
          }
        }
      }>
    }
    const initialY = initialScene.children[0].material.uniforms.uRects.value[0].y
    render.mockClear()
    setSize.mockClear()

    bounds.y = 140
    presentationHeight = 1200
    opacity.value = 0.42
    revision.value += 1

    expect(setSize).toHaveBeenCalledOnce()
    expect(setSize).toHaveBeenCalledWith(1200, 1200, false)
    expect(render).toHaveBeenCalled()
    const motionScene = render.mock.calls.at(-1)?.[0] as unknown as typeof initialScene
    const uniforms = motionScene.children[0].material.uniforms
    expect(uniforms.uRects.value[0].y).not.toBe(initialY)
    expect(uniforms.uSurfaceWeights.value[0]).toBeCloseTo(0.42)

    appearance.value = 'frosted'
    opacity.value = 0.18
    revision.value += 1
    const frostedScene = render.mock.calls.at(-1)?.[0] as unknown as typeof initialScene
    expect(frostedScene.children[0].material.uniforms.uSurfaceWeights.value[0]).toBe(1)

    const observer = ResizeObserverMock.instances.find(instance => instance.targets.has(root))
    expect(observer).toBeDefined()
    setSize.mockClear()
    render.mockClear()
    presentationHeight = 1400
    observer?.trigger()

    expect(setSize).toHaveBeenCalledOnce()
    expect(setSize).toHaveBeenCalledWith(1200, 1400, false)
    expect(render).toHaveBeenCalled()
    scope.stop()
  })

  it('acknowledges the current page motion only after route surfaces remain stable', async () => {
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)
      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      callbacks.delete(id)
    })
    const canvas = document.createElement('canvas')
    const root = document.createElement('div')
    root.append(canvas)
    document.body.append(root)
    appendOpticalSurface('app-hover-lift-card', { height: 240, width: 360, x: 80, y: 100 })
    const acknowledgeGeometryReady = vi.fn()
    const active = ref(true)
    const epoch = ref(7)
    const routeKey = ref('/dashboard')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        pageMotion: {
          acknowledgeGeometryReady,
          active,
          epoch,
          opacity: ref(0),
          revision: ref(1),
        },
        quality: ref('balanced'),
        routeKey,
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    routeKey.value = '/discover'
    await nextTick()
    epoch.value = 8
    routeKey.value = '/dashboard'
    await nextTick()
    await nextTick()

    for (let pass = 0; pass < 8 && !acknowledgeGeometryReady.mock.calls.length; pass += 1) {
      const queued = [...callbacks.entries()]
      callbacks.clear()
      queued.forEach(([, callback]) => callback(1000 + pass * 16))
      await nextTick()
    }

    expect(acknowledgeGeometryReady).toHaveBeenCalledOnce()
    expect(acknowledgeGeometryReady).toHaveBeenCalledWith(8, expect.any(Number))
    scope.stop()
  })

  it('recovers after consecutive WebGL context loss cycles', async () => {
    const three = await import('three')
    const canvas = document.createElement('canvas')
    const rendererDispose = vi.spyOn(three.WebGLRenderer.prototype, 'dispose')
    const contextLoss = vi.spyOn(three.WebGLRenderer.prototype, 'forceContextLoss')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))

    for (let cycle = 0; cycle < 2; cycle += 1) {
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
      expect(renderer?.state.value).toBe('fallback')
      expect(rendererDispose).toHaveBeenCalledTimes(cycle + 1)
      expect(contextLoss).not.toHaveBeenCalled()

      canvas.dispatchEvent(new Event('webglcontextrestored'))
      await nextTick()
      await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    }

    scope.stop()
  })

  it('keeps the renderer ready when the optional frosted prefilter fails', async () => {
    const three = await import('three')
    const canvas = document.createElement('canvas')
    const compile = vi
      .spyOn(three.WebGLRenderer.prototype, 'compileAsync')
      .mockRejectedValueOnce(new Error('prefilter unavailable'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('frosted'),
        canvas: ref(canvas),
        quality: ref('high'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    expect(compile).toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('玻璃磨砂壁纸预滤失败，继续使用实时扩散采样:', expect.any(Error))

    scope.stop()
  })

  it('draws the first stable frame before publishing the ready state', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    const canvas = document.createElement('canvas')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    expect(renderer?.renderedFrames.value).toBeGreaterThan(0)

    scope.stop()
  })

  it('keeps both prefilter axes in source-pixel space and generates mipmaps only for the retained target', async () => {
    const three = await import('three')
    const texture = new three.Texture<HTMLImageElement>()
    texture.image = {
      height: 600,
      naturalHeight: 600,
      naturalWidth: 800,
      width: 800,
    } as HTMLImageElement
    vi.spyOn(three.TextureLoader.prototype, 'loadAsync').mockResolvedValue(texture)
    const prefilterPasses: Array<{
      direction: [number, number]
      textureSize: [number, number]
    }> = []
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render').mockImplementation(scene => {
      const material = (scene as unknown as { children?: Array<{ material?: ShaderMaterial }> }).children?.[0]?.material
      if (!material?.fragmentShader.includes('uniform vec2 uDirection')) return

      const direction = material.uniforms.uDirection.value as Vector2
      const textureSize = material.uniforms.uTextureSize.value as Vector2
      prefilterPasses.push({
        direction: [direction.x, direction.y],
        textureSize: [textureSize.x, textureSize.y],
      })
    })
    const setRenderTarget = vi.spyOn(three.WebGLRenderer.prototype, 'setRenderTarget')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('frosted'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('high'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    expect(prefilterPasses).toEqual([
      { direction: [1, 0], textureSize: [800, 600] },
      { direction: [0, 1], textureSize: [800, 600] },
    ])

    const targets = setRenderTarget.mock.calls
      .map(([target]) => target)
      .filter(
        (target): target is WebGLRenderTarget =>
          target instanceof three.WebGLRenderTarget && target.width === 100 && target.height === 75,
      )
    expect(targets).toHaveLength(2)
    expect(targets[0].texture.generateMipmaps).toBe(false)
    expect(targets[0].texture.minFilter).toBe(three.LinearFilter)
    expect(targets[1].texture.generateMipmaps).toBe(true)
    expect(targets[1].texture.minFilter).toBe(three.LinearMipmapLinearFilter)
    expect(render).toHaveBeenCalled()

    scope.stop()
  })

  it('keeps frosted prefilter targets at one eighth of the bounded source', async () => {
    const three = await import('three')
    const texture = new three.Texture<HTMLImageElement>()
    texture.image = {
      height: 2160,
      naturalHeight: 2160,
      naturalWidth: 4096,
      width: 4096,
    } as HTMLImageElement
    vi.spyOn(three.TextureLoader.prototype, 'loadAsync').mockResolvedValue(texture)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    const prefilterTextureSizes: Array<[number, number]> = []
    vi.spyOn(three.WebGLRenderer.prototype, 'render').mockImplementation(scene => {
      const material = (scene as unknown as { children?: Array<{ material?: ShaderMaterial }> }).children?.[0]?.material
      if (!material?.fragmentShader.includes('uniform vec2 uDirection')) return

      const textureSize = material.uniforms.uTextureSize.value as Vector2
      prefilterTextureSizes.push([textureSize.x, textureSize.y])
    })
    const setRenderTarget = vi.spyOn(three.WebGLRenderer.prototype, 'setRenderTarget')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('frosted'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    expect(prefilterTextureSizes).toEqual([
      [1536, 810],
      [1536, 810],
    ])
    const retainedResolutionTargets = setRenderTarget.mock.calls
      .map(([target]) => target)
      .filter(
        (target): target is WebGLRenderTarget =>
          target instanceof three.WebGLRenderTarget && target.width === 192 && target.height === 101,
      )
    expect(retainedResolutionTargets).toHaveLength(2)

    scope.stop()
  })

  it.each([
    ['balanced', 1536, 810],
    ['high', 2048, 1080],
  ] as const)('limits %s wallpaper uploads to the renderer output footprint', async (quality, width, height) => {
    const three = await import('three')
    const texture = new three.Texture<HTMLImageElement>()
    texture.image = {
      height: 2160,
      naturalHeight: 2160,
      naturalWidth: 4096,
      width: 4096,
    } as HTMLImageElement
    vi.spyOn(three.TextureLoader.prototype, 'loadAsync').mockResolvedValue(texture)
    const textureCanvasSizes: Array<[number, number]> = []
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      if (this.width > 64 || this.height > 64) textureCanvasSizes.push([this.width, this.height])

      return {
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D
    })
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref(quality),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    expect(textureCanvasSizes).toContainEqual([width, height])

    scope.stop()
  })

  it('shares and bounds prepared wallpaper sources across renderer contexts', async () => {
    const wallpaperSourceCache = createGlassWallpaperSourceCache()
    const source = {
      height: 810,
      image: document.createElement('canvas'),
      toneProfile: { exposure: 1, highlightLuminance: 0.82, medianLuminance: 0.38 },
      width: 1536,
    }
    const prepare = vi.fn().mockResolvedValue(source)
    const [fixedSource, scrollSource] = await Promise.all([
      wallpaperSourceCache.get('1536:wallpaper-a', prepare),
      wallpaperSourceCache.get('1536:wallpaper-a', prepare),
    ])

    expect(prepare).toHaveBeenCalledOnce()
    expect(fixedSource).toBe(source)
    expect(scrollSource).toBe(source)

    for (const key of ['wallpaper-b', 'wallpaper-c', 'wallpaper-d']) {
      await wallpaperSourceCache.get(key, vi.fn().mockResolvedValue(source))
    }
    await wallpaperSourceCache.get('1536:wallpaper-a', prepare)
    expect(prepare).toHaveBeenCalledTimes(2)
  })

  it('reuses the tone decoder source without loading the wallpaper a second time', async () => {
    const three = await import('three')
    const textureLoad = vi.spyOn(three.TextureLoader.prototype, 'loadAsync')
    const image = {
      height: 1080,
      naturalHeight: 1080,
      naturalWidth: 1920,
      width: 1920,
    } as HTMLImageElement
    wallpaperToneMocks.load.mockResolvedValueOnce({
      corsReady: true,
      profile: {
        exposure: 0.96,
        highlightLuminance: 0.76,
        medianLuminance: 0.34,
      },
    })
    wallpaperToneMocks.takeDecodedSource.mockReturnValueOnce({
      image,
      profile: {
        exposure: 0.96,
        highlightLuminance: 0.76,
        medianLuminance: 0.34,
      },
    })
    const canvas = document.createElement('canvas')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://image.example/decoded.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    expect(wallpaperToneMocks.takeDecodedSource).toHaveBeenCalledWith('https://image.example/decoded.jpg')
    expect(textureLoad).not.toHaveBeenCalled()
    scope.stop()
  })

  it('releases renderer resources before restoring a single active instance', async () => {
    const three = await import('three')
    const canvas = document.createElement('canvas')
    const active = ref(true)
    const scope = effectScope()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => ++frameId)
    const rendererDispose = vi.spyOn(three.WebGLRenderer.prototype, 'dispose')
    const renderTargetDispose = vi.spyOn(three.WebGLRenderTarget.prototype, 'dispose')
    const contextLoss = vi.spyOn(three.WebGLRenderer.prototype, 'forceContextLoss')
    const resizeDisconnect = vi.spyOn(ResizeObserverMock.prototype, 'disconnect')
    const mutationDisconnect = vi.spyOn(MutationObserver.prototype, 'disconnect')
    const addWindowListener = vi.spyOn(window, 'addEventListener')
    const addDocumentListener = vi.spyOn(document, 'addEventListener')
    const addCanvasListener = vi.spyOn(canvas, 'addEventListener')
    const countListenerAdds = (calls: readonly (readonly unknown[])[], eventName: string) =>
      calls.filter(([event]) => String(event) === eventName).length
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active,
        appearance: ref('clear'),
        canvas: ref(canvas),
        quality: ref('high'),
        routeKey: ref('/recommend'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    expect(renderer?.renderedFrames.value).toBeGreaterThan(0)
    expect(countListenerAdds(addWindowListener.mock.calls, 'pointermove')).toBe(1)
    expect(countListenerAdds(addWindowListener.mock.calls, 'touchstart')).toBe(1)
    expect(countListenerAdds(addWindowListener.mock.calls, 'touchmove')).toBe(1)
    expect(countListenerAdds(addWindowListener.mock.calls, 'touchend')).toBe(1)
    expect(countListenerAdds(addWindowListener.mock.calls, 'touchcancel')).toBe(1)
    expect(countListenerAdds(addWindowListener.mock.calls, 'resize')).toBe(1)
    expect(countListenerAdds(addWindowListener.mock.calls, 'scroll')).toBe(0)
    expect(countListenerAdds(addWindowListener.mock.calls, 'focus')).toBe(1)
    expect(countListenerAdds(addWindowListener.mock.calls, 'pageshow')).toBe(1)
    expect(countListenerAdds(addDocumentListener.mock.calls, 'visibilitychange')).toBe(1)
    expect(countListenerAdds(addCanvasListener.mock.calls, 'webglcontextlost')).toBe(1)
    expect(countListenerAdds(addCanvasListener.mock.calls, 'webglcontextrestored')).toBe(1)

    const renderTargetDisposalsBeforeFirstRelease = renderTargetDispose.mock.calls.length
    active.value = false
    await nextTick()

    expect(rendererDispose).toHaveBeenCalledTimes(1)
    expect(renderTargetDispose).toHaveBeenCalledTimes(renderTargetDisposalsBeforeFirstRelease + 2)
    expect(contextLoss).toHaveBeenCalledTimes(1)
    expect(resizeDisconnect).toHaveBeenCalledTimes(1)
    expect(mutationDisconnect).toHaveBeenCalledTimes(1)

    addWindowListener.mockClear()
    addDocumentListener.mockClear()
    addCanvasListener.mockClear()
    active.value = true
    await nextTick()
    await vi.waitFor(() => expect(countListenerAdds(addWindowListener.mock.calls, 'pointermove')).toBe(1))

    expect(renderer?.state.value).toBe('ready')
    expect(countListenerAdds(addWindowListener.mock.calls, 'pointermove')).toBe(1)
    expect(countListenerAdds(addWindowListener.mock.calls, 'touchstart')).toBe(1)
    expect(countListenerAdds(addWindowListener.mock.calls, 'touchmove')).toBe(1)
    expect(countListenerAdds(addWindowListener.mock.calls, 'touchend')).toBe(1)
    expect(countListenerAdds(addWindowListener.mock.calls, 'touchcancel')).toBe(1)
    expect(countListenerAdds(addWindowListener.mock.calls, 'resize')).toBe(1)
    expect(countListenerAdds(addWindowListener.mock.calls, 'scroll')).toBe(0)
    expect(countListenerAdds(addWindowListener.mock.calls, 'focus')).toBe(0)
    expect(countListenerAdds(addWindowListener.mock.calls, 'pageshow')).toBe(0)
    expect(countListenerAdds(addDocumentListener.mock.calls, 'visibilitychange')).toBe(0)
    expect(countListenerAdds(addCanvasListener.mock.calls, 'webglcontextlost')).toBe(1)
    expect(countListenerAdds(addCanvasListener.mock.calls, 'webglcontextrestored')).toBe(1)

    const renderTargetDisposalsBeforeSecondRelease = renderTargetDispose.mock.calls.length
    active.value = false
    await nextTick()

    expect(rendererDispose).toHaveBeenCalledTimes(2)
    expect(renderTargetDispose).toHaveBeenCalledTimes(renderTargetDisposalsBeforeSecondRelease + 2)
    expect(contextLoss).toHaveBeenCalledTimes(2)
    expect(resizeDisconnect).toHaveBeenCalledTimes(2)
    expect(mutationDisconnect).toHaveBeenCalledTimes(2)

    scope.stop()
  })

  it('reuses the renderer context while switching quality profiles', async () => {
    const three = await import('three')
    const canvas = document.createElement('canvas')
    const quality = ref<'balanced' | 'high'>('high')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        quality,
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const rendererDispose = vi.spyOn(three.WebGLRenderer.prototype, 'dispose')
    const contextLoss = vi.spyOn(three.WebGLRenderer.prototype, 'forceContextLoss')
    const renderTargetDispose = vi.spyOn(three.WebGLRenderTarget.prototype, 'dispose')

    quality.value = 'balanced'
    await nextTick()
    await vi.waitFor(() => expect(renderTargetDispose).toHaveBeenCalledTimes(2))

    expect(rendererDispose).not.toHaveBeenCalled()
    expect(contextLoss).not.toHaveBeenCalled()

    quality.value = 'high'
    await nextTick()
    await vi.waitFor(() => expect(renderTargetDispose).toHaveBeenCalledTimes(4))

    expect(rendererDispose).not.toHaveBeenCalled()
    expect(contextLoss).not.toHaveBeenCalled()

    scope.stop()
  })

  it('keeps the loaded same-origin texture while leaving the login route', async () => {
    const three = await import('three')
    const canvas = document.createElement('canvas')
    const routeKey = ref('/login')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        quality: ref('high'),
        routeKey,
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('/api/v1/login/wallpapers/opaque-id'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const textureLoad = vi.spyOn(three.TextureLoader.prototype, 'loadAsync')
    const rendererDispose = vi.spyOn(three.WebGLRenderer.prototype, 'dispose')

    routeKey.value = '/dashboard'
    await nextTick()

    expect(renderer?.state.value).toBe('ready')
    expect(textureLoad).not.toHaveBeenCalled()
    expect(rendererDispose).not.toHaveBeenCalled()

    scope.stop()
  })

  it('clears a removed fixed surface during a route transition without waiting for pointer input', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1800)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const setRenderTarget = vi.spyOn(three.WebGLRenderer.prototype, 'setRenderTarget')
    const renderedRectCounts: number[] = []
    render.mockImplementation(scene => {
      const uniforms = (
        scene as unknown as {
          children: Array<{
            material?: {
              uniforms?: {
                uRectCount?: { value: number }
              }
            }
          }>
        }
      ).children[0]?.material?.uniforms
      if (uniforms?.uRectCount) renderedRectCounts.push(uniforms.uRectCount.value)
    })
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => callbacks.delete(id))
    const wrapper = document.createElement('div')
    wrapper.className = 'app-wrapper'
    const nav = document.createElement('aside')
    nav.className = 'layout-vertical-nav'
    setOpticalSurfaceBounds(nav, { height: 900, width: 260, x: 0, y: 0 })
    wrapper.append(nav)
    document.body.append(wrapper)
    const routeKey = ref('/dashboard')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('high'),
        routeKey,
        surfaceSpace: 'fixed',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    for (let pass = 0; pass < 5 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + pass * 16))
    }
    render.mockClear()
    setRenderTarget.mockClear()
    renderedRectCounts.length = 0

    nav.remove()
    routeKey.value = '/login'
    await nextTick()
    await vi.waitFor(() => expect(callbacks.size).toBeGreaterThan(0))
    for (let pass = 0; pass < 5 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + 100 + pass * 16))
    }

    expect(render).toHaveBeenCalled()
    expect(renderedRectCounts.at(-1)).toBe(0)
    expect(setRenderTarget).not.toHaveBeenCalled()
    expect(callbacks.size).toBe(0)
    scope.stop()
  })

  it('keeps old and new wallpaper textures in the same renderer during the shared transition', async () => {
    const three = await import('three')
    const canvas = document.createElement('canvas')
    const wallpaperUrl = ref('https://example.com/wallpaper-1.jpg')
    const previousWallpaperUrl = ref('')
    const transitionStartedAt = ref(0)
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('frosted'),
        canvas: ref(canvas),
        quality: ref('high'),
        previousWallpaperUrl,
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        transitionDuration: ref(1500),
        transitionStartedAt,
        wallpaperUrl,
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))

    const replacementTexture = new three.Texture<HTMLImageElement>()
    replacementTexture.image = {
      height: 1,
      naturalHeight: 1,
      naturalWidth: 1,
      width: 1,
    } as HTMLImageElement
    let resolveTexture!: (texture: typeof replacementTexture) => void
    vi.spyOn(three.TextureLoader.prototype, 'loadAsync').mockReturnValueOnce(
      new Promise<typeof replacementTexture>(resolve => {
        resolveTexture = resolve
      }),
    )

    previousWallpaperUrl.value = wallpaperUrl.value
    transitionStartedAt.value = performance.now()
    wallpaperUrl.value = 'https://example.com/wallpaper-2.jpg'
    await nextTick()

    expect(renderer?.state.value).toBe('ready')
    await vi.waitFor(() => expect(document.documentElement.dataset.glassWallpaperLoading).toBe('true'))

    resolveTexture(replacementTexture)
    await vi.waitFor(() => expect(document.documentElement.dataset.glassWallpaperLoading).toBeUndefined())
    await vi.waitFor(() => expect(render).toHaveBeenCalled())
    expect(renderer?.state.value).toBe('ready')
    const scene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          fragmentShader: string
          uniforms: {
            uFrostedTexture: { value: unknown }
            uHasFrostedTexture: { value: number }
            uPreviousFrostedTexture: { value: unknown }
            uPreviousTexture: { value: unknown }
            uPreviousWallpaperExposure: { value: number }
            uTexture: { value: unknown }
            uTextureMix: { value: number }
            uWallpaperExposure: { value: number }
          }
        }
      }>
    }
    const uniforms = scene.children[0].material.uniforms
    expect(uniforms.uPreviousTexture.value).not.toBe(uniforms.uTexture.value)
    expect(uniforms.uPreviousFrostedTexture.value).not.toBe(uniforms.uFrostedTexture.value)
    expect(uniforms.uHasFrostedTexture.value).toBe(1)
    expect(uniforms.uTextureMix.value).toBeGreaterThanOrEqual(0)
    expect(uniforms.uTextureMix.value).toBeLessThan(1)
    expect(scene.children[0].material.fragmentShader).toContain(
      'toneMapWallpaper(previous, viewportUv, uPreviousWallpaperExposure)',
    )
    expect(scene.children[0].material.fragmentShader).toContain(
      'toneMapWallpaper(current, viewportUv, uWallpaperExposure)',
    )
    expect(scene.children[0].material.fragmentShader).toContain('return mix(previousTone, currentTone, uTextureMix)')
    expect(scene.children[0].material.fragmentShader).not.toContain(
      'toneMapWallpaper(mix(previous, current, uTextureMix), viewportUv)',
    )

    previousWallpaperUrl.value = ''
    await nextTick()

    expect(uniforms.uPreviousTexture.value).toBe(uniforms.uTexture.value)
    expect(uniforms.uPreviousFrostedTexture.value).toBe(uniforms.uFrostedTexture.value)
    expect(uniforms.uPreviousWallpaperExposure.value).toBe(uniforms.uWallpaperExposure.value)
    expect(uniforms.uTextureMix.value).toBe(1)
    scope.stop()
  })

  it('retains a prepared transaction until it becomes the rendered active wallpaper', async () => {
    const three = await import('three')
    const wallpaperUrl = ref('https://example.com/wallpaper-1.jpg')
    const pendingWallpaperUrl = ref('')
    const pendingWallpaperRevision = ref(0)
    const previousWallpaperUrl = ref('')
    const transitionStartedAt = ref(0)
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const textureLoad = vi.spyOn(three.TextureLoader.prototype, 'loadAsync')
    const initTexture = vi.spyOn(three.WebGLRenderer.prototype, 'initTexture')
    const textureDispose = vi.spyOn(three.Texture.prototype, 'dispose')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('frosted'),
        canvas: ref(document.createElement('canvas')),
        pendingWallpaperRevision,
        pendingWallpaperUrl,
        previousWallpaperUrl,
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        transitionDuration: ref(1500),
        transitionStartedAt,
        wallpaperUrl,
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    textureLoad.mockClear()
    initTexture.mockClear()
    textureDispose.mockClear()

    pendingWallpaperRevision.value = 11
    pendingWallpaperUrl.value = 'https://example.com/wallpaper-2.jpg'
    await vi.waitFor(() => expect(renderer?.preparedWallpaperRevision.value).toBe(11))
    const preparedTexture = initTexture.mock.calls.at(-1)?.[0]

    expect(renderer?.preparedWallpaperUrl.value).toBe('https://example.com/wallpaper-2.jpg')
    expect(preparedTexture).toBeDefined()
    expect(textureDispose.mock.contexts).not.toContain(preparedTexture)

    const preparationKey = renderer?.preparedWallpaperPreparationKey.value ?? ''
    const startedAt = performance.now()
    expect(renderer?.canActivatePreparedWallpaper('https://example.com/wallpaper-2.jpg', 11, preparationKey)).toBe(true)
    expect(
      renderer?.activatePreparedWallpaper('https://example.com/wallpaper-2.jpg', 11, preparationKey, startedAt),
    ).toBe(true)
    const activatedScene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          uniforms: {
            uPreviousTexture: { value: unknown }
            uTexture: { value: unknown }
            uTextureMix: { value: number }
          }
        }
      }>
    }
    const activatedUniforms = activatedScene.children[0].material.uniforms
    expect(activatedUniforms.uPreviousTexture.value).not.toBe(activatedUniforms.uTexture.value)
    expect(activatedUniforms.uTextureMix.value).toBe(0)
    expect(textureDispose.mock.contexts).not.toContain(activatedUniforms.uPreviousTexture.value)
    previousWallpaperUrl.value = wallpaperUrl.value
    transitionStartedAt.value = startedAt
    wallpaperUrl.value = 'https://example.com/wallpaper-2.jpg'
    pendingWallpaperUrl.value = ''
    pendingWallpaperRevision.value = 0
    await nextTick()

    expect(renderer?.activeWallpaperUrl.value).toBe('https://example.com/wallpaper-2.jpg')
    expect(renderer?.activeWallpaperRevision.value).toBe(11)
    expect(textureLoad).toHaveBeenCalledOnce()
    expect(textureDispose.mock.contexts).not.toContain(preparedTexture)

    scope.stop()
    expect(textureDispose.mock.contexts).toContain(preparedTexture)
  })

  it('rolls a partially committed prepared wallpaper back without reloading the previous texture', async () => {
    const three = await import('three')
    const pendingWallpaperUrl = ref('')
    const pendingWallpaperRevision = ref(0)
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const initTexture = vi.spyOn(three.WebGLRenderer.prototype, 'initTexture')
    const textureDispose = vi.spyOn(three.Texture.prototype, 'dispose')
    const textureLoad = vi.spyOn(three.TextureLoader.prototype, 'loadAsync')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        pendingWallpaperRevision,
        pendingWallpaperUrl,
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        transitionDuration: ref(1500),
        transitionStartedAt: ref(0),
        wallpaperUrl: ref('https://example.com/wallpaper-current.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const initialScene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          uniforms: {
            uTexture: { value: unknown }
            uTextureMix: { value: number }
          }
        }
      }>
    }
    const initialTexture = initialScene.children[0].material.uniforms.uTexture.value
    initTexture.mockClear()
    textureLoad.mockClear()
    textureDispose.mockClear()
    pendingWallpaperRevision.value = 13
    pendingWallpaperUrl.value = 'https://example.com/wallpaper-next.jpg'
    await vi.waitFor(() => expect(renderer?.preparedWallpaperRevision.value).toBe(13))
    const preparationKey = renderer?.preparedWallpaperPreparationKey.value ?? ''
    const preparedTexture = initTexture.mock.calls.at(-1)?.[0]

    expect(renderer?.activatePreparedWallpaper('https://example.com/wallpaper-next.jpg', 13, preparationKey, 400)).toBe(
      true,
    )
    const activatedTexture = initialScene.children[0].material.uniforms.uTexture.value
    expect(activatedTexture).toBe(preparedTexture)
    expect(renderer?.rollbackPreparedWallpaperActivation('https://example.com/wallpaper-next.jpg', 13)).toBe(true)

    expect(renderer?.activeWallpaperUrl.value).toBe('https://example.com/wallpaper-current.jpg')
    expect(renderer?.activeWallpaperRevision.value).toBe(0)
    expect(initialScene.children[0].material.uniforms.uTexture.value).toBe(initialTexture)
    expect(initialScene.children[0].material.uniforms.uTextureMix.value).toBe(1)
    expect(textureDispose.mock.contexts).toContain(activatedTexture)
    expect(textureDispose.mock.contexts).not.toContain(initialTexture)
    expect(textureLoad).toHaveBeenCalledOnce()
    scope.stop()
  })

  it('releases a canceled prepared transaction without replacing the active wallpaper', async () => {
    const three = await import('three')
    const pendingWallpaperUrl = ref('')
    const pendingWallpaperRevision = ref(0)
    const initTexture = vi.spyOn(three.WebGLRenderer.prototype, 'initTexture')
    const textureDispose = vi.spyOn(three.Texture.prototype, 'dispose')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        pendingWallpaperRevision,
        pendingWallpaperUrl,
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper-1.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    initTexture.mockClear()
    textureDispose.mockClear()
    pendingWallpaperRevision.value = 12
    pendingWallpaperUrl.value = 'https://example.com/wallpaper-2.jpg'
    await vi.waitFor(() => expect(renderer?.preparedWallpaperRevision.value).toBe(12))
    const preparedTexture = initTexture.mock.calls.at(-1)?.[0]

    pendingWallpaperUrl.value = ''
    pendingWallpaperRevision.value = 0
    await vi.waitFor(() => expect(renderer?.preparedWallpaperUrl.value).toBe(''))

    expect(renderer?.activeWallpaperUrl.value).toBe('https://example.com/wallpaper-1.jpg')
    expect(textureDispose.mock.contexts.filter(context => context === preparedTexture)).toHaveLength(1)
    scope.stop()
  })

  it('ignores a late prepared result after a newer wallpaper revision is ready', async () => {
    const three = await import('three')
    const pendingWallpaperUrl = ref('')
    const pendingWallpaperRevision = ref(0)
    const textureLoad = vi.spyOn(three.TextureLoader.prototype, 'loadAsync')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        pendingWallpaperRevision,
        pendingWallpaperUrl,
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper-current.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    textureLoad.mockClear()
    let resolveFirstTone: ((value: unknown) => void) | null = null
    wallpaperToneMocks.load.mockImplementation((url: string) => {
      if (url.endsWith('/wallpaper-a.jpg')) {
        return new Promise(resolve => {
          resolveFirstTone = resolve
        })
      }

      return Promise.resolve({
        corsReady: false,
        profile: {
          exposure: 1,
          highlightLuminance: 0.82,
          medianLuminance: 0.38,
        },
      })
    })

    pendingWallpaperRevision.value = 21
    pendingWallpaperUrl.value = 'https://example.com/wallpaper-a.jpg'
    await vi.waitFor(() => expect(wallpaperToneMocks.load).toHaveBeenCalledWith('https://example.com/wallpaper-a.jpg'))
    pendingWallpaperRevision.value = 22
    pendingWallpaperUrl.value = 'https://example.com/wallpaper-b.jpg'
    await vi.waitFor(() => expect(renderer?.preparedWallpaperRevision.value).toBe(22))
    const secondPreparationKey = renderer?.preparedWallpaperPreparationKey.value ?? ''

    ;(resolveFirstTone as ((value: unknown) => void) | null)?.({
      corsReady: false,
      profile: {
        exposure: 1,
        highlightLuminance: 0.82,
        medianLuminance: 0.38,
      },
    })
    await vi.waitFor(() => expect(textureLoad).toHaveBeenCalledTimes(2))

    expect(renderer?.preparedWallpaperUrl.value).toBe('https://example.com/wallpaper-b.jpg')
    expect(renderer?.preparedWallpaperRevision.value).toBe(22)
    expect(
      renderer?.canActivatePreparedWallpaper('https://example.com/wallpaper-a.jpg', 21, secondPreparationKey),
    ).toBe(false)
    expect(
      renderer?.canActivatePreparedWallpaper('https://example.com/wallpaper-b.jpg', 22, secondPreparationKey),
    ).toBe(true)
    scope.stop()
  })

  it('publishes only the current pending preparation failure identity', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const three = await import('three')
    const pendingWallpaperUrl = ref('')
    const pendingWallpaperRevision = ref(0)
    const textureLoad = vi.spyOn(three.TextureLoader.prototype, 'loadAsync')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('frosted'),
        canvas: ref(document.createElement('canvas')),
        pendingWallpaperRevision,
        pendingWallpaperUrl,
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper-current.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    textureLoad.mockRejectedValueOnce(new Error('pending source failed'))
    pendingWallpaperRevision.value = 51
    pendingWallpaperUrl.value = 'https://example.com/wallpaper-next.jpg'
    await vi.waitFor(() => expect(renderer?.failedWallpaperRevision.value).toBe(51))

    expect(consoleWarn).toHaveBeenCalledWith(
      '玻璃光学壁纸预备失败，继续使用当前纹理:',
      expect.objectContaining({ message: 'pending source failed' }),
    )
    expect(renderer?.failedWallpaperUrl.value).toBe('https://example.com/wallpaper-next.jpg')
    expect(renderer?.failedWallpaperPreparationKey.value).toContain('frosted:balanced:')

    pendingWallpaperRevision.value = 0
    pendingWallpaperUrl.value = ''
    await vi.waitFor(() => expect(renderer?.failedWallpaperRevision.value).toBe(0))
    expect(renderer?.failedWallpaperUrl.value).toBe('')
    expect(renderer?.failedWallpaperPreparationKey.value).toBe('')
    scope.stop()
  })

  it('retains plain prepared bundles but rebuilds them for frosted and quality capability changes', async () => {
    const three = await import('three')
    const appearance = ref<'clear' | 'frosted' | 'tinted'>('clear')
    const quality = ref<'balanced' | 'high'>('balanced')
    const pendingWallpaperUrl = ref('')
    const pendingWallpaperRevision = ref(0)
    const initTexture = vi.spyOn(three.WebGLRenderer.prototype, 'initTexture')
    const textureDispose = vi.spyOn(three.Texture.prototype, 'dispose')
    const textureLoad = vi.spyOn(three.TextureLoader.prototype, 'loadAsync')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance,
        canvas: ref(document.createElement('canvas')),
        pendingWallpaperRevision,
        pendingWallpaperUrl,
        quality,
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper-current.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    initTexture.mockClear()
    textureDispose.mockClear()
    textureLoad.mockClear()
    pendingWallpaperRevision.value = 31
    pendingWallpaperUrl.value = 'https://example.com/wallpaper-next.jpg'
    await vi.waitFor(() => expect(renderer?.preparedWallpaperRevision.value).toBe(31))
    const plainTexture = initTexture.mock.calls.at(-1)?.[0]
    const plainPreparationKey = renderer?.preparedWallpaperPreparationKey.value ?? ''
    const loadsAfterPlainPreparation = textureLoad.mock.calls.length

    appearance.value = 'tinted'
    await nextTick()
    expect(renderer?.preparedWallpaperPreparationKey.value).toBe(plainPreparationKey)
    expect(textureLoad).toHaveBeenCalledTimes(loadsAfterPlainPreparation)
    expect(textureDispose.mock.contexts).not.toContain(plainTexture)

    appearance.value = 'frosted'
    await vi.waitFor(() => expect(renderer?.preparedWallpaperPreparationKey.value).not.toBe(plainPreparationKey))
    const frostedTexture = initTexture.mock.calls.at(-1)?.[0]
    const frostedPreparationKey = renderer?.preparedWallpaperPreparationKey.value ?? ''
    expect(textureDispose.mock.contexts).toContain(plainTexture)
    expect(frostedPreparationKey).toContain('frosted:balanced:')

    quality.value = 'high'
    await vi.waitFor(() => expect(renderer?.preparedWallpaperPreparationKey.value).not.toBe(frostedPreparationKey))
    expect(textureDispose.mock.contexts).toContain(frostedTexture)
    expect(renderer?.preparedWallpaperPreparationKey.value).toContain('frosted:high:')
    expect(renderer?.preparedWallpaperRevision.value).toBe(31)
    scope.stop()
  })

  it('re-prepares the same pending revision after WebGL context recovery', async () => {
    const canvas = document.createElement('canvas')
    const pendingWallpaperUrl = ref('')
    const pendingWallpaperRevision = ref(0)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('frosted'),
        canvas: ref(canvas),
        pendingWallpaperRevision,
        pendingWallpaperUrl,
        quality: ref('high'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper-current.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    pendingWallpaperRevision.value = 41
    pendingWallpaperUrl.value = 'https://example.com/wallpaper-next.jpg'
    await vi.waitFor(() => expect(renderer?.preparedWallpaperRevision.value).toBe(41))
    const preparationKey = renderer?.preparedWallpaperPreparationKey.value ?? ''

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    expect(renderer?.state.value).toBe('fallback')
    expect(renderer?.preparedWallpaperRevision.value).toBe(0)
    expect(renderer?.activeWallpaperRevision.value).toBe(0)

    canvas.dispatchEvent(new Event('webglcontextrestored'))
    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    await vi.waitFor(() => expect(renderer?.preparedWallpaperRevision.value).toBe(41))

    expect(renderer?.preparedWallpaperPreparationKey.value).toBe(preparationKey)
    expect(renderer?.canActivatePreparedWallpaper('https://example.com/wallpaper-next.jpg', 41, preparationKey)).toBe(
      true,
    )
    scope.stop()
  })

  it('reallocates a changed buffer once and renders its stable surface in the same frame', async () => {
    const three = await import('three')
    let viewportWidth = 1200
    vi.spyOn(window, 'innerWidth', 'get').mockImplementation(() => viewportWidth)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900)
    appendOpticalSurface('app-hover-lift-card', { height: 220, width: 320, x: 40, y: 80 })
    const setSize = vi.spyOn(three.WebGLRenderer.prototype, 'setSize')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    setSize.mockClear()
    render.mockClear()

    viewportWidth = 960
    window.dispatchEvent(new Event('resize'))

    expect(setSize).toHaveBeenCalledOnce()
    expect(render).toHaveBeenCalled()

    setSize.mockClear()
    window.dispatchEvent(new Event('resize'))

    expect(setSize).not.toHaveBeenCalled()
    scope.stop()
  })

  it('keeps the route first frame while transient scroll presentation heights settle', async () => {
    vi.useFakeTimers()
    const three = await import('three')
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844)
    let presentationHeight = 844
    const root = document.createElement('div')
    const canvas = document.createElement('canvas')
    Object.defineProperty(root, 'scrollHeight', {
      configurable: true,
      get: () => presentationHeight,
    })
    root.append(canvas)
    document.body.append(root)
    const routeKey = ref('/resource')
    const setSize = vi.spyOn(three.WebGLRenderer.prototype, 'setSize')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        quality: ref('balanced'),
        routeKey,
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const observer = ResizeObserverMock.instances.find(instance => instance.targets.has(root))
    expect(observer).toBeDefined()
    setSize.mockClear()
    render.mockClear()

    presentationHeight = 1744
    routeKey.value = '/dashboard'
    await nextTick()
    await nextTick()
    expect(setSize).toHaveBeenCalledOnce()
    expect(setSize).toHaveBeenCalledWith(390, 1744, false)

    setSize.mockClear()
    presentationHeight = 2320
    window.dispatchEvent(new Event('resize'))
    expect(setSize).not.toHaveBeenCalled()

    observer?.trigger()
    presentationHeight = 2170
    observer?.trigger()
    presentationHeight = 1744
    observer?.trigger()

    expect(setSize).not.toHaveBeenCalled()
    vi.advanceTimersByTime(159)
    expect(setSize).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(setSize).not.toHaveBeenCalled()
    scope.stop()
  })

  it('resizes a scroll buffer after an asynchronous page height becomes stable', async () => {
    vi.useFakeTimers()
    const three = await import('three')
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844)
    let presentationHeight = 844
    const root = document.createElement('div')
    const canvas = document.createElement('canvas')
    Object.defineProperty(root, 'scrollHeight', {
      configurable: true,
      get: () => presentationHeight,
    })
    root.append(canvas)
    document.body.append(root)
    const setSize = vi.spyOn(three.WebGLRenderer.prototype, 'setSize')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        quality: ref('balanced'),
        routeKey: ref('/history'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const observer = ResizeObserverMock.instances.find(instance => instance.targets.has(root))
    expect(observer).toBeDefined()
    setSize.mockClear()
    render.mockClear()

    presentationHeight = 5000
    observer?.trigger()
    vi.advanceTimersByTime(159)
    expect(setSize).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(setSize).toHaveBeenCalledOnce()
    expect(setSize).toHaveBeenCalledWith(390, 3072, false)
    expect(render).toHaveBeenCalled()
    scope.stop()
  })

  it('updates surface geometry when the presentation root shares a resize delivery', async () => {
    const three = await import('three')
    const root = document.createElement('div')
    const canvas = document.createElement('canvas')
    const surface = appendOpticalSurface('app-hover-lift-card', { height: 220, width: 320, x: 40, y: 80 })
    root.append(canvas)
    document.body.append(root)
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const observer = ResizeObserverMock.instances.find(
      instance => instance.targets.has(root) && instance.targets.has(surface),
    )
    expect(observer).toBeDefined()
    render.mockClear()

    observer?.trigger()

    expect(render).toHaveBeenCalled()
    scope.stop()
  })

  it('writes static-material surfaces into the shader without dynamic optical energy', async () => {
    const three = await import('three')
    const surface = appendOpticalSurface('app-hover-lift-card', { height: 220, width: 320, x: 40, y: 80 })
    surface.dataset.glassOpticalMode = 'static-material'
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/plugins'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    await vi.waitFor(() => expect(render).toHaveBeenCalled())
    const scene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          fragmentShader: string
          uniforms: {
            uSurfaceDynamics: { value: number[] }
          }
        }
      }>
    }
    const material = scene.children[0].material

    expect(material.uniforms.uSurfaceDynamics.value[0]).toBe(0)
    expect(material.fragmentShader).toContain('uniform float uSurfaceDynamics[8]')
    expect(material.fragmentShader).toContain('float surfaceDynamic = uSurfaceDynamics[i]')
    scope.stop()
  })

  it('shares dynamics across nested hover cards without allocating another material slot', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const pageContent = document.createElement('main')
    pageContent.className = 'layout-page-content'
    const outerSurface = document.createElement('section')
    outerSurface.className = 'v-card'
    setOpticalSurfaceBounds(outerSurface, { height: 420, width: 900, x: 40, y: 80 })
    const nestedCardSpecs = [
      { radius: 16, x: 80 },
      { radius: 20, x: 400 },
    ]
    nestedCardSpecs.forEach(({ radius, x }) => {
      const nestedCard = document.createElement('article')
      nestedCard.className = 'app-hover-lift-card'
      nestedCard.style.borderTopLeftRadius = `${radius}px`
      nestedCard.style.borderTopRightRadius = `${radius}px`
      nestedCard.style.borderBottomRightRadius = `${radius}px`
      nestedCard.style.borderBottomLeftRadius = `${radius}px`
      setOpticalSurfaceBounds(nestedCard, { height: 160, width: 280, x, y: 140 })
      outerSurface.append(nestedCard)
    })
    pageContent.append(outerSurface)
    document.body.append(pageContent)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('frosted'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/sites'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    render.mockClear()
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 200 }))
    await vi.waitFor(() => expect(render).toHaveBeenCalled())
    const scene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          fragmentShader: string
          uniforms: {
            uInteractionRadii: { value: Array<{ toArray: () => number[] }> }
            uInteractionRectCount: { value: number }
            uInteractionRects: { value: Array<{ toArray: () => number[] }> }
            uRectCount: { value: number }
          }
        }
      }>
    }
    const material = scene.children[0].material

    expect(material.uniforms.uRectCount.value).toBe(1)
    expect(material.uniforms.uInteractionRectCount.value).toBe(2)
    expect(material.uniforms.uInteractionRects.value[0].toArray()).toEqual([
      80 / 1200,
      1 - (140 + 160) / 800,
      280 / 1200,
      160 / 800,
    ])
    expect(material.uniforms.uInteractionRects.value[1].toArray()).toEqual([
      400 / 1200,
      1 - (140 + 160) / 800,
      280 / 1200,
      160 / 800,
    ])
    expect(material.uniforms.uInteractionRadii.value[0].toArray()).toEqual([16, 16, 16, 16])
    expect(material.uniforms.uInteractionRadii.value[1].toArray()).toEqual([20, 20, 20, 20])
    expect(material.fragmentShader).toContain('uniform vec4 uInteractionRects[8]')
    expect(material.fragmentShader).toContain('interactionMask = max(')
    expect(material.fragmentShader).toContain('surfaceDynamic * interactionMask')
    scope.stop()
  })

  it('keeps a parent material static when all nested interaction clips are excluded', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const pageContent = document.createElement('main')
    pageContent.className = 'app-wrapper layout-page-content'
    const outerSurface = document.createElement('section')
    outerSurface.className = 'v-card'
    setOpticalSurfaceBounds(outerSurface, { height: 420, width: 900, x: 40, y: 80 })
    const nestedCards = [80, 400].map(x => {
      const nestedCard = document.createElement('article')
      nestedCard.className = 'app-hover-lift-card'
      nestedCard.dataset.glassOpticalMode = 'excluded'
      setOpticalSurfaceBounds(nestedCard, { height: 160, width: 280, x, y: 140 })
      outerSurface.append(nestedCard)

      return nestedCard
    })
    pageContent.append(outerSurface)
    document.body.append(pageContent)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/search'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    await vi.waitFor(() => expect(render).toHaveBeenCalled())
    const getUniforms = () => {
      const scene = render.mock.calls.at(-1)?.[0] as unknown as {
        children: Array<{
          material: {
            uniforms: {
              uInteractionRectCount: { value: number }
              uRectCount: { value: number }
              uSurfaceDynamics: { value: number[] }
            }
          }
        }>
      }

      return scene.children[0].material.uniforms
    }

    expect(getUniforms().uRectCount.value).toBe(1)
    expect(getUniforms().uInteractionRectCount.value).toBe(0)
    expect(getUniforms().uSurfaceDynamics.value[0]).toBe(0)

    nestedCards[0].removeAttribute('data-glass-optical-mode')
    await vi.waitFor(() => expect(getUniforms().uInteractionRectCount.value).toBe(1))
    expect(getUniforms().uSurfaceDynamics.value[0]).toBe(1)
    scope.stop()
  })

  it('refreshes excluded interaction clip membership across direct and nested mutations', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const pageContent = document.createElement('main')
    pageContent.className = 'app-wrapper layout-page-content'
    const surfaces = [40, 520].map(x => {
      const surface = document.createElement('section')
      surface.className = 'v-card'
      setOpticalSurfaceBounds(surface, { height: 420, width: 400, x, y: 80 })
      pageContent.append(surface)

      return surface
    })
    document.body.append(pageContent)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/search'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    await vi.waitFor(() => expect(render).toHaveBeenCalled())
    const getInteractionState = () => {
      const scene = render.mock.calls.at(-1)?.[0] as unknown as {
        children: Array<{
          material: {
            uniforms: {
              uInteractionRectCount: { value: number }
              uInteractionRects: { value: Array<{ toArray: () => number[] }> }
              uRectCount: { value: number }
              uSurfaceDynamics: { value: number[] }
            }
          }
        }>
      }
      const uniforms = scene.children[0].material.uniforms

      return {
        interactionCount: uniforms.uInteractionRectCount.value,
        interactionXs: uniforms.uInteractionRects.value
          .slice(0, uniforms.uInteractionRectCount.value)
          .map(rect => rect.toArray()[0])
          .sort((left, right) => left - right),
        surfaceCount: uniforms.uRectCount.value,
        surfaceDynamics: uniforms.uSurfaceDynamics.value.slice(0, 2).sort((left, right) => left - right),
      }
    }

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 180 }))
    await vi.waitFor(() =>
      expect(getInteractionState()).toEqual({
        interactionCount: 2,
        interactionXs: [40 / 1200, 520 / 1200],
        surfaceCount: 2,
        surfaceDynamics: [1, 1],
      }),
    )

    const excludedClip = document.createElement('article')
    excludedClip.className = 'app-hover-lift-card'
    excludedClip.dataset.glassOpticalMode = 'excluded'
    surfaces[0].append(excludedClip)
    await vi.waitFor(() =>
      expect(getInteractionState()).toEqual({
        interactionCount: 1,
        interactionXs: [520 / 1200],
        surfaceCount: 2,
        surfaceDynamics: [0, 1],
      }),
    )

    surfaces[1].append(excludedClip)
    await vi.waitFor(() =>
      expect(getInteractionState()).toEqual({
        interactionCount: 1,
        interactionXs: [40 / 1200],
        surfaceCount: 2,
        surfaceDynamics: [0, 1],
      }),
    )

    excludedClip.remove()
    await vi.waitFor(() =>
      expect(getInteractionState()).toEqual({
        interactionCount: 2,
        interactionXs: [40 / 1200, 520 / 1200],
        surfaceCount: 2,
        surfaceDynamics: [1, 1],
      }),
    )

    const excludedContainer = document.createElement('div')
    excludedContainer.dataset.glassOpticalMode = 'excluded'
    surfaces[0].append(excludedContainer)
    const nestedExcludedClip = document.createElement('article')
    nestedExcludedClip.className = 'app-hover-lift-card'
    excludedContainer.append(nestedExcludedClip)
    await vi.waitFor(() =>
      expect(getInteractionState()).toEqual({
        interactionCount: 1,
        interactionXs: [520 / 1200],
        surfaceCount: 2,
        surfaceDynamics: [0, 1],
      }),
    )

    nestedExcludedClip.remove()
    await vi.waitFor(() =>
      expect(getInteractionState()).toEqual({
        interactionCount: 2,
        interactionXs: [40 / 1200, 520 / 1200],
        surfaceCount: 2,
        surfaceDynamics: [1, 1],
      }),
    )

    excludedContainer.append(nestedExcludedClip)
    await vi.waitFor(() =>
      expect(getInteractionState()).toEqual({
        interactionCount: 1,
        interactionXs: [520 / 1200],
        surfaceCount: 2,
        surfaceDynamics: [0, 1],
      }),
    )

    nestedExcludedClip.remove()
    excludedContainer.remove()
    await vi.waitFor(() =>
      expect(getInteractionState()).toEqual({
        interactionCount: 2,
        interactionXs: [40 / 1200, 520 / 1200],
        surfaceCount: 2,
        surfaceDynamics: [1, 1],
      }),
    )

    scope.stop()
  })

  it('propagates a managed owner through deeply nested removals in one observer batch', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const mutationObservers: Array<MutationObserver & { trigger: (records: MutationRecord[]) => void }> = []
    class MutationObserverMock implements MutationObserver {
      constructor(private readonly callback: MutationCallback) {
        mutationObservers.push(this)
      }

      disconnect() {}
      observe() {}
      takeRecords() {
        return []
      }
      trigger(records: MutationRecord[]) {
        this.callback(records, this)
      }
    }
    vi.stubGlobal('MutationObserver', MutationObserverMock)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const pageContent = document.createElement('main')
    pageContent.className = 'app-wrapper layout-page-content'
    const surface = document.createElement('section')
    surface.className = 'v-card'
    setOpticalSurfaceBounds(surface, { height: 420, width: 900, x: 40, y: 80 })
    const outerExcludedContainer = document.createElement('div')
    outerExcludedContainer.dataset.glassOpticalMode = 'excluded'
    const innerExcludedContainer = document.createElement('div')
    innerExcludedContainer.dataset.glassOpticalMode = 'excluded'
    const deeplyNestedClip = document.createElement('article')
    deeplyNestedClip.className = 'app-hover-lift-card'
    innerExcludedContainer.append(deeplyNestedClip)
    outerExcludedContainer.append(innerExcludedContainer)
    surface.append(outerExcludedContainer)
    pageContent.append(surface)
    document.body.append(pageContent)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/search'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    await vi.waitFor(() => expect(render).toHaveBeenCalled())
    const getInteractionState = () => {
      const scene = render.mock.calls.at(-1)?.[0] as unknown as {
        children: Array<{
          material: {
            uniforms: {
              uInteractionRectCount: { value: number }
              uSurfaceDynamics: { value: number[] }
            }
          }
        }>
      }
      const uniforms = scene.children[0].material.uniforms

      return {
        interactionCount: uniforms.uInteractionRectCount.value,
        surfaceDynamics: uniforms.uSurfaceDynamics.value[0],
      }
    }

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 180 }))
    await vi.waitFor(() => expect(getInteractionState()).toEqual({ interactionCount: 0, surfaceDynamics: 0 }))

    outerExcludedContainer.remove()
    innerExcludedContainer.remove()
    deeplyNestedClip.remove()
    mutationObservers[0].trigger([
      createRemovalRecord(surface, [outerExcludedContainer]),
      createRemovalRecord(outerExcludedContainer, [innerExcludedContainer]),
      createRemovalRecord(innerExcludedContainer, [deeplyNestedClip]),
    ])

    await vi.waitFor(() => expect(getInteractionState()).toEqual({ interactionCount: 1, surfaceDynamics: 1 }))
    scope.stop()
  })

  it('removes and restores an active surface and interaction clip when exclusion changes', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const appWrapper = document.createElement('main')
    appWrapper.className = 'app-wrapper'
    const surface = document.createElement('article')
    surface.className = 'app-hover-lift-card'
    setOpticalSurfaceBounds(surface, { height: 180, width: 360, x: 100, y: 140 })
    appWrapper.append(surface)
    document.body.append(appWrapper)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/search'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 180 }))
    await vi.waitFor(() => expect(render).toHaveBeenCalled())
    const getCounts = () => {
      const scene = render.mock.calls.at(-1)?.[0] as unknown as {
        children: Array<{
          material: {
            uniforms: {
              uInteractionRectCount: { value: number }
              uRectCount: { value: number }
            }
          }
        }>
      }
      const uniforms = scene.children[0].material.uniforms

      return [uniforms.uRectCount.value, uniforms.uInteractionRectCount.value]
    }

    expect(getCounts()).toEqual([1, 1])

    surface.dataset.glassOpticalMode = 'excluded'
    await vi.waitFor(() => expect(getCounts()).toEqual([0, 0]))

    surface.removeAttribute('data-glass-optical-mode')
    await vi.waitFor(() => expect(getCounts()).toEqual([1, 1]))
    scope.stop()
  })

  it('ignores child-list churn inside an excluded surface after removed nodes lose their ancestor', async () => {
    const appWrapper = document.createElement('main')
    appWrapper.className = 'app-wrapper'
    const surface = document.createElement('article')
    surface.className = 'app-hover-lift-card'
    surface.dataset.glassOpticalMode = 'excluded'
    const imageContent = document.createElement('div')
    surface.append(imageContent)
    appWrapper.append(surface)
    document.body.append(appWrapper)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        dynamicsActive: ref(false),
        quality: ref('balanced'),
        routeKey: ref('/search'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const querySelectorAll = vi.spyOn(document, 'querySelectorAll')

    imageContent.remove()
    await nextTick()
    await new Promise(resolve => requestAnimationFrame(resolve))

    expect(querySelectorAll).not.toHaveBeenCalled()
    scope.stop()
  })

  it('removes and restores a managed surface when it moves across an excluded boundary', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const appWrapper = document.createElement('main')
    appWrapper.className = 'app-wrapper'
    const eligibleParent = document.createElement('section')
    const excludedParent = document.createElement('section')
    excludedParent.dataset.glassOpticalMode = 'excluded'
    const surface = document.createElement('article')
    surface.className = 'app-hover-lift-card'
    setOpticalSurfaceBounds(surface, { height: 180, width: 360, x: 100, y: 140 })
    eligibleParent.append(surface)
    appWrapper.append(eligibleParent, excludedParent)
    document.body.append(appWrapper)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/search'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const getCounts = () => {
      const scene = render.mock.calls.at(-1)?.[0] as unknown as {
        children: Array<{
          material: {
            uniforms: {
              uInteractionRectCount: { value: number }
              uRectCount: { value: number }
            }
          }
        }>
      }
      const uniforms = scene.children[0].material.uniforms

      return [uniforms.uRectCount.value, uniforms.uInteractionRectCount.value]
    }

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 180 }))
    await vi.waitFor(() => expect(getCounts()).toEqual([1, 1]))
    const querySelectorAll = vi.spyOn(document, 'querySelectorAll')
    excludedParent.append(surface)
    expect(surface.closest('[data-glass-optical-mode="excluded"]')).toBe(excludedParent)
    await vi.waitFor(() => expect(querySelectorAll).toHaveBeenCalled())
    await vi.waitFor(() => expect(getCounts()).toEqual([0, 0]))

    eligibleParent.append(surface)
    await vi.waitFor(() => expect(getCounts()).toEqual([1, 1]))
    scope.stop()
  })

  it('keeps an explicit optical boundary as the interaction clip without allocating nested slots', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const pageContent = document.createElement('main')
    pageContent.className = 'layout-page-content'
    const outerSurface = document.createElement('section')
    outerSurface.className = 'v-card'
    outerSurface.dataset.glassOpticalBoundary = ''
    outerSurface.style.borderTopLeftRadius = '24px'
    outerSurface.style.borderTopRightRadius = '24px'
    outerSurface.style.borderBottomRightRadius = '24px'
    outerSurface.style.borderBottomLeftRadius = '24px'
    setOpticalSurfaceBounds(outerSurface, { height: 420, width: 900, x: 40, y: 80 })
    for (const x of [80, 400]) {
      const nestedCard = document.createElement('article')
      nestedCard.className = 'app-hover-lift-card'
      setOpticalSurfaceBounds(nestedCard, { height: 160, width: 280, x, y: 140 })
      outerSurface.append(nestedCard)
    }
    pageContent.append(outerSurface)
    document.body.append(pageContent)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    render.mockClear()
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 200 }))
    await vi.waitFor(() => expect(render).toHaveBeenCalled())
    const scene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          uniforms: {
            uInteractionRadii: { value: Array<{ toArray: () => number[] }> }
            uInteractionRectCount: { value: number }
            uInteractionRects: { value: Array<{ toArray: () => number[] }> }
            uRectCount: { value: number }
          }
        }
      }>
    }
    const material = scene.children[0].material

    expect(material.uniforms.uRectCount.value).toBe(1)
    expect(material.uniforms.uInteractionRectCount.value).toBe(1)
    expect(material.uniforms.uInteractionRects.value[0].toArray()).toEqual([
      40 / 1200,
      1 - (80 + 420) / 800,
      900 / 1200,
      420 / 800,
    ])
    expect(material.uniforms.uInteractionRadii.value[0].toArray()).toEqual([24, 24, 24, 24])
    scope.stop()
  })

  it('keeps the active and nearby visible clips when a long list exceeds the shader budget', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const outerSurface = appendOpticalSurface('v-card', { height: 2200, width: 900, x: 80, y: -1200 })
    outerSurface.dataset.glassOpticalSurface = ''
    const cards = Array.from({ length: 12 }, (_, index) => {
      const card = document.createElement('article')
      card.className = 'app-hover-lift-card'
      setOpticalSurfaceBounds(card, {
        height: 120,
        width: 360,
        x: index % 2 === 0 ? 100 : 500,
        y: -1100 + Math.floor(index / 2) * 180,
      })
      outerSurface.append(card)

      return card
    })
    setOpticalSurfaceBounds(cards[10], { height: 120, width: 360, x: 100, y: 620 })
    setOpticalSurfaceBounds(cards[11], { height: 120, width: 360, x: 500, y: 620 })
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 560, clientY: 680 }))
    await vi.waitFor(() => expect(render).toHaveBeenCalled())
    const scene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          uniforms: {
            uInteractionRectCount: { value: number }
            uInteractionRects: { value: Array<{ toArray: () => number[] }> }
          }
        }
      }>
    }
    const rects = scene.children[0].material.uniforms.uInteractionRects.value
      .slice(0, scene.children[0].material.uniforms.uInteractionRectCount.value)
      .map(rect => rect.toArray())

    expect(rects[0][0]).toBeCloseTo(500 / 1200)
    expect(rects.some(rect => Math.abs(rect[0] - 100 / 1200) < 0.001 && Math.abs(rect[1] - 60 / 800) < 0.001)).toBe(
      true,
    )
    expect(rects.every(rect => rect[1] >= -96 / 800)).toBe(true)
    scope.stop()
  })

  it('hits cached interaction clips without rescanning nested cards on pointermove', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const outerSurface = appendOpticalSurface('v-card', { height: 500, width: 900, x: 80, y: 100 })
    outerSurface.dataset.glassOpticalSurface = ''
    const card = document.createElement('article')
    card.className = 'app-hover-lift-card'
    setOpticalSurfaceBounds(card, { height: 180, width: 360, x: 100, y: 140 })
    outerSurface.append(card)
    const querySelectorAll = vi.spyOn(outerSurface, 'querySelectorAll')
    const measureCard = vi.spyOn(card, 'getBoundingClientRect')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    querySelectorAll.mockClear()
    measureCard.mockClear()

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 180 }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 180, clientY: 200 }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 220 }))

    expect(querySelectorAll).not.toHaveBeenCalled()
    expect(measureCard).not.toHaveBeenCalled()

    ResizeObserverMock.instances.forEach(observer => observer.trigger())
    expect(querySelectorAll).not.toHaveBeenCalled()
    scope.stop()
  })

  it('restores a temporarily collapsed interaction clip without rebuilding registry membership', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const outerSurface = appendOpticalSurface('v-card', { height: 500, width: 900, x: 80, y: 100 })
    outerSurface.dataset.glassOpticalSurface = ''
    const card = document.createElement('article')
    card.className = 'app-hover-lift-card'
    setOpticalSurfaceBounds(card, { height: 180, width: 360, x: 100, y: 140 })
    outerSurface.append(card)
    const querySelectorAll = vi.spyOn(outerSurface, 'querySelectorAll')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 180 }))
    await vi.waitFor(() => expect(render).toHaveBeenCalled())
    const getInteractionRectCount = () => {
      const scene = render.mock.calls.at(-1)?.[0] as unknown as {
        children: Array<{
          material: {
            uniforms: {
              uInteractionRectCount: { value: number }
            }
          }
        }>
      }

      return scene.children[0].material.uniforms.uInteractionRectCount.value
    }

    expect(getInteractionRectCount()).toBe(1)
    querySelectorAll.mockClear()

    setOpticalSurfaceBounds(card, { height: 12, width: 12, x: 100, y: 140 })
    ResizeObserverMock.instances.forEach(observer => observer.trigger())
    await vi.waitFor(() => expect(getInteractionRectCount()).toBe(0))

    setOpticalSurfaceBounds(card, { height: 180, width: 360, x: 100, y: 140 })
    ResizeObserverMock.instances.forEach(observer => observer.trigger())
    await vi.waitFor(() => expect(getInteractionRectCount()).toBe(1))

    expect(querySelectorAll).not.toHaveBeenCalled()
    scope.stop()
  })

  it('keeps the active texture and ready state when a replacement wallpaper fails', async () => {
    const three = await import('three')
    const canvas = document.createElement('canvas')
    const wallpaperUrl = ref('https://example.com/wallpaper-1.jpg')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl,
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const rendererDispose = vi.spyOn(three.WebGLRenderer.prototype, 'dispose')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(three.TextureLoader.prototype, 'loadAsync').mockRejectedValueOnce(new Error('replacement failed'))

    wallpaperUrl.value = 'https://example.com/wallpaper-2.jpg'
    await nextTick()
    await vi.waitFor(() => expect(document.documentElement.dataset.glassWallpaperLoading).toBeUndefined())

    expect(renderer?.state.value).toBe('ready')
    expect(rendererDispose).not.toHaveBeenCalled()
    scope.stop()
  })

  it('pauses briefly hidden renderers and resumes a stable frame without disposing resources', async () => {
    const three = await import('three')
    const canvas = document.createElement('canvas')
    let visibilityState: DocumentVisibilityState = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const dispose = vi.spyOn(three.WebGLRenderer.prototype, 'dispose')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    vi.useFakeTimers()

    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(APP_ACTIVITY_SUSPEND_DELAY_MS - 1)
    expect(dispose).not.toHaveBeenCalled()

    visibilityState = 'visible'
    window.dispatchEvent(new Event('focus'))
    await nextTick()
    await Promise.resolve()
    expect(dispose).not.toHaveBeenCalled()
    expect(render).toHaveBeenCalled()
    scope.stop()
  })

  it('clears an expired ripple field before the first resumed frame', async () => {
    const three = await import('three')
    let visibilityState: DocumentVisibilityState = 'visible'
    let now = 0
    let interactionListener: ((event: PointerEvent | TouchEvent) => void) | null = null
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState)
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)
      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => callbacks.delete(id))
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const surface = appendOpticalSurface('app-hover-lift-card', { height: 320, width: 520, x: 40, y: 80 })
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        dynamicsMode: ref('ripple'),
        interactionSource: {
          subscribe: vi.fn((_space, listener) => {
            interactionListener = listener
            return vi.fn()
          }),
        },
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    for (let pass = 0; pass < 4 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      now = 16 + pass * 16
      scheduledCallbacks.forEach(callback => callback(now))
    }
    const mainScene = render.mock.calls
      .map(call => call[0] as unknown as { children: Array<{ material?: ShaderMaterial }> })
      .find(scene => scene.children[0]?.material?.uniforms.uDynamicsMode)
    if (!mainScene) throw new Error('main optical scene was not rendered')
    const uniforms = mainScene.children[0].material!.uniforms

    ;(interactionListener as ((event: PointerEvent) => void) | null)?.({
      clientX: 200,
      clientY: 180,
      pointerType: 'mouse',
      timeStamp: 100,
      type: 'pointermove',
    } as PointerEvent)
    const [interactionFrame] = callbacks.values()
    callbacks.clear()
    interactionFrame(116.667)
    expect(uniforms.uHasRippleTexture.value).toBe(1)

    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(callbacks.size).toBe(0)

    now = 1000
    visibilityState = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(uniforms.uHasRippleTexture.value).toBe(0))
    expect(uniforms.uRippleTexture.value).toBeNull()
    for (let pass = 0; pass < 8 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      now = 1016 + pass * 16
      scheduledCallbacks.forEach(callback => callback(now))
      expect(uniforms.uHasRippleTexture.value).toBe(0)
    }
    expect(callbacks.size).toBe(0)
    scope.stop()
    surface.remove()
  })

  it('coalesces visibility, focus, and pageshow into one renderer resume', async () => {
    const three = await import('three')
    const canvas = document.createElement('canvas')
    let visibilityState: DocumentVisibilityState = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    render.mockClear()

    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    visibilityState = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('pageshow'))
    await nextTick()
    await Promise.resolve()

    expect(render).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('releases renderer resources after the long background timeout', async () => {
    const three = await import('three')
    const canvas = document.createElement('canvas')
    let visibilityState: DocumentVisibilityState = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        quality: ref('high'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const dispose = vi.spyOn(three.WebGLRenderer.prototype, 'dispose')
    const contextLoss = vi.spyOn(three.WebGLRenderer.prototype, 'forceContextLoss')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    vi.useFakeTimers()
    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))

    await vi.advanceTimersByTimeAsync(APP_ACTIVITY_SUSPEND_DELAY_MS)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(contextLoss).not.toHaveBeenCalled()

    render.mockClear()
    visibilityState = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    await vi.waitFor(() => expect(render).toHaveBeenCalled())
    expect(renderer?.state.value).toBe('ready')
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(contextLoss).not.toHaveBeenCalled()
    scope.stop()
  })

  it('releases a paused renderer after the visible window remains unfocused', async () => {
    const three = await import('three')
    const canvas = document.createElement('canvas')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        quality: ref('high'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const dispose = vi.spyOn(three.WebGLRenderer.prototype, 'dispose')
    const contextLoss = vi.spyOn(three.WebGLRenderer.prototype, 'forceContextLoss')
    vi.useFakeTimers()
    window.dispatchEvent(new Event('blur'))

    await vi.advanceTimersByTimeAsync(APP_ACTIVITY_SUSPEND_DELAY_MS)

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(contextLoss).not.toHaveBeenCalled()
    scope.stop()
  })

  it('uses the CSS fallback when reduced transparency is active', async () => {
    stubMediaPreferences({ reducedTransparency: true })
    const canvas = document.createElement('canvas')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        quality: ref('high'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('fallback'))
    expect(document.documentElement.dataset.glassRendererState).toBe('fallback')
    scope.stop()
  })

  it('tracks the actual passive touch coordinate without restoring press magnification', async () => {
    stubMediaPreferences({ coarsePointer: true })
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      callbacks.delete(id)
    })
    const surface = appendOpticalSurface('app-hover-lift-card', { height: 500, width: 350, x: 20, y: 100 })
    surface.style.borderRadius = '20px'
    const canvas = document.createElement('canvas')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('frosted'),
        canvas: ref(canvas),
        quality: ref('balanced'),
        routeKey: ref('/recommend'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    for (let pass = 0; pass < 3 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now()))
    }
    render.mockClear()

    dispatchTouchEvent('touchstart', [{ clientX: 80, clientY: 180, identifier: 7 }])
    const startFrames = [...callbacks.values()]
    callbacks.clear()
    startFrames.forEach(callback => callback(performance.now()))
    render.mockClear()

    const moveEvent = dispatchTouchEvent('touchmove', [{ clientX: 180, clientY: 320, identifier: 7 }])
    const interactionFrames = [...callbacks.values()]
    callbacks.clear()
    interactionFrames.forEach(callback => callback(moveEvent.timeStamp + 16))

    const scene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          uniforms: {
            uPointer: { value: { x: number; y: number } }
            uTrail: { value: Array<{ x: number; y: number; z: number }> }
          }
        }
      }>
    }
    const pointer = scene.children[0].material.uniforms.uPointer.value
    const trail = scene.children[0].material.uniforms.uTrail.value
    expect(pointer.x).toBeCloseTo(180 / 390)
    expect(pointer.y).toBeCloseTo(1 - 320 / 844)
    expect(trail[0]).toMatchObject({ z: 1 })
    expect(trail[0].x).toBeCloseTo(180 / 390)
    expect(trail[0].y).toBeCloseTo(1 - 320 / 844)
    expect(trail[1]).toMatchObject({ z: 0.72 })
    expect(trail[1].x).toBeCloseTo(80 / 390)
    expect(trail[1].y).toBeCloseTo(1 - 180 / 844)

    dispatchTouchEvent('touchend', [], [{ clientX: 180, clientY: 320, identifier: 7 }])
    scope.stop()
  })

  it('keeps high-quality material rendering while mobile dynamics are disabled', async () => {
    stubMediaPreferences({ coarsePointer: true })
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const canvas = document.createElement('canvas')
    const deformationStrength = ref(80)
    const dynamicsActive = ref(false)
    const flowStrength = ref(80)
    const reflectionStrength = ref(80)
    const translationStrength = ref(80)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('frosted'),
        canvas: ref(canvas),
        deformationStrength,
        dynamicsActive,
        flowStrength,
        quality: ref('high'),
        reflectionStrength,
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        transmissionStrength: ref(80),
        translationStrength,
        transparencyStrength: ref(80),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const scene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          uniforms: {
            uDeformationStrength: { value: number }
            uFlowStrength: { value: number }
            uHasFlowTexture: { value: number }
            uReflectionStrength: { value: number }
            uTrailCount: { value: number }
            uTranslationStrength: { value: number }
          }
        }
      }>
    }
    const uniforms = scene.children[0].material.uniforms
    expect(uniforms.uTranslationStrength.value).toBe(0)
    expect(uniforms.uDeformationStrength.value).toBe(0)
    expect(uniforms.uFlowStrength.value).toBe(0)
    expect(uniforms.uTrailCount.value).toBe(0)
    expect(uniforms.uHasFlowTexture.value).toBe(0)
    expect(uniforms.uReflectionStrength.value).toBeGreaterThan(0)

    const renderedFrames = renderer?.renderedFrames.value
    dispatchTouchEvent('touchstart', [{ clientX: 80, clientY: 180, identifier: 7 }])
    dispatchTouchEvent('touchmove', [{ clientX: 180, clientY: 320, identifier: 7 }])
    await nextTick()
    expect(renderer?.renderedFrames.value).toBe(renderedFrames)

    translationStrength.value = 100
    deformationStrength.value = 100
    flowStrength.value = 100
    reflectionStrength.value = 100
    await nextTick()
    expect(uniforms.uTranslationStrength.value).toBe(0)
    expect(uniforms.uDeformationStrength.value).toBe(0)
    expect(uniforms.uFlowStrength.value).toBe(0)
    expect(uniforms.uReflectionStrength.value).toBeGreaterThan(1)

    dynamicsActive.value = true
    await nextTick()
    expect(uniforms.uTranslationStrength.value).toBeGreaterThan(0)
    expect(uniforms.uDeformationStrength.value).toBeGreaterThan(0)
    expect(uniforms.uFlowStrength.value).toBeGreaterThan(0)
    expect(uniforms.uTrailCount.value).toBe(4)
    expect(uniforms.uHasFlowTexture.value).toBe(1)
    scope.stop()
  })

  it('keeps off mode static, unsubscribed and reversible without changing material rendering', async () => {
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const dynamicsMode = ref<'fluid' | 'off' | 'ripple'>('off')
    const unsubscribe = vi.fn()
    const interactionSource = {
      subscribe: vi.fn(() => unsubscribe),
    }
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        deformationStrength: ref(80),
        dynamicsMode,
        flowStrength: ref(80),
        interactionSource,
        quality: ref('high'),
        reflectionStrength: ref(80),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        transmissionStrength: ref(80),
        translationStrength: ref(80),
        transparencyStrength: ref(80),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    expect(interactionSource.subscribe).not.toHaveBeenCalled()
    const mainScene = [...render.mock.calls]
      .reverse()
      .map(
        call =>
          call[0] as unknown as {
            children?: Array<{ material?: { uniforms?: Record<string, { value: unknown }> } }>
          },
      )
      .find(scene => scene.children?.[0]?.material?.uniforms?.uDynamicsMode)
    const uniforms = mainScene?.children?.[0]?.material?.uniforms
    expect(uniforms?.uDynamicsMode.value).toBe(2)
    expect(uniforms?.uTranslationStrength.value).toBe(0)
    expect(uniforms?.uDeformationStrength.value).toBe(0)
    expect(uniforms?.uFlowStrength.value).toBe(0)
    expect(uniforms?.uTrailCount.value).toBe(0)
    expect(uniforms?.uHasFlowTexture.value).toBe(0)
    expect(uniforms?.uHasRippleTexture.value).toBe(0)
    expect(uniforms?.uReflectionStrength.value).toBeGreaterThan(0)

    const renderedFrames = renderer?.renderedFrames.value
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 300 }))
    dispatchTouchEvent('touchstart', [{ clientX: 300, clientY: 300, identifier: 7 }])
    dispatchTouchEvent('touchmove', [{ clientX: 320, clientY: 320, identifier: 7 }])
    expect(renderer?.renderedFrames.value).toBe(renderedFrames)

    dynamicsMode.value = 'fluid'
    await vi.waitFor(() => expect(interactionSource.subscribe).toHaveBeenCalledOnce())
    dynamicsMode.value = 'off'
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce())
    expect(interactionSource.subscribe).toHaveBeenCalledOnce()
    scope.stop()
  })

  it('preserves the baseline first fluid velocity but suppresses the first velocity after a mode reset', async () => {
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const dynamicsMode = ref<'fluid' | 'off' | 'ripple'>('fluid')
    const surface = appendOpticalSurface('app-hover-lift-card', { height: 320, width: 520, x: 40, y: 80 })
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        dynamicsMode,
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const mainScene = render.mock.calls
      .map(call => call[0] as unknown as { children: Array<{ material?: ShaderMaterial }> })
      .find(scene => scene.children[0]?.material?.uniforms.uDynamicsMode)
    if (!mainScene) throw new Error('main optical scene was not rendered')
    const uniforms = mainScene.children[0].material!.uniforms

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 160 }))
    expect(Math.hypot(uniforms.uPointerVelocity.value.x, uniforms.uPointerVelocity.value.y)).toBeGreaterThan(0)

    dynamicsMode.value = 'off'
    await vi.waitFor(() => expect(uniforms.uDynamicsMode.value).toBe(2))
    dynamicsMode.value = 'fluid'
    await vi.waitFor(() => expect(uniforms.uDynamicsMode.value).toBe(0))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 260, clientY: 180 }))
    expect(uniforms.uPointerVelocity.value).toMatchObject({ x: 0, y: 0 })
    scope.stop()
    surface.remove()
  })

  it('allocates only the selected temporal field and releases it on every mode change', async () => {
    const three = await import('three')
    const compileAsync = vi.spyOn(three.WebGLRenderer.prototype, 'compileAsync')
    const disposeTarget = vi.spyOn(three.WebGLRenderTarget.prototype, 'dispose')
    const dynamicsMode = ref<'fluid' | 'off' | 'ripple'>('fluid')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        dynamicsMode,
        quality: ref('high'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const baselineCompileCalls = compileAsync.mock.calls.length
    const baselineDisposeCalls = disposeTarget.mock.calls.length
    expect(baselineCompileCalls).toBeGreaterThan(0)

    dynamicsMode.value = 'off'
    await vi.waitFor(() => expect(disposeTarget).toHaveBeenCalledTimes(baselineDisposeCalls + 2))
    expect(compileAsync).toHaveBeenCalledTimes(baselineCompileCalls)

    dynamicsMode.value = 'ripple'
    await vi.waitFor(() => expect(compileAsync).toHaveBeenCalledTimes(baselineCompileCalls + 1))
    expect(disposeTarget).toHaveBeenCalledTimes(baselineDisposeCalls + 4)

    dynamicsMode.value = 'off'
    await vi.waitFor(() => expect(disposeTarget).toHaveBeenCalledTimes(baselineDisposeCalls + 6))
    scope.stop()
  })

  it('reinitializes a disposed fallback once under the latest mode when explicitly retried', async () => {
    const three = await import('three')
    const compileAsync = vi.spyOn(three.WebGLRenderer.prototype, 'compileAsync')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dynamicsMode = ref<'fluid' | 'off' | 'ripple'>('off')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        dynamicsMode,
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const baselineCompileCalls = compileAsync.mock.calls.length
    compileAsync.mockRejectedValueOnce(new Error('ripple unavailable'))
    dynamicsMode.value = 'ripple'
    await vi.waitFor(() => expect(compileAsync).toHaveBeenCalledTimes(baselineCompileCalls + 1))
    await vi.waitFor(() => expect(renderer?.state.value).toBe('fallback'))

    dynamicsMode.value = 'fluid'
    await nextTick()
    expect(renderer?.state.value).toBe('fallback')

    await renderer?.retryAfterFailure()
    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    expect(compileAsync).toHaveBeenCalledTimes(baselineCompileCalls + 2)
    expect(warn).toHaveBeenCalledWith('玻璃动态策略切换失败，已回退标准材质:', expect.any(Error))
    scope.stop()
  })

  it('disposes a late ripple compilation result after a newer off selection wins', async () => {
    const three = await import('three')
    let finishCompilation: ((result: Object3D) => void) | null = null
    const compileAsync = vi.spyOn(three.WebGLRenderer.prototype, 'compileAsync')
    const disposeTarget = vi.spyOn(three.WebGLRenderTarget.prototype, 'dispose')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const dynamicsMode = ref<'fluid' | 'off' | 'ripple'>('off')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        dynamicsMode,
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const baselineCompileCalls = compileAsync.mock.calls.length
    compileAsync.mockImplementationOnce(
      () =>
        new Promise<Object3D>(resolve => {
          finishCompilation = resolve
        }),
    )
    dynamicsMode.value = 'ripple'
    await vi.waitFor(() => expect(compileAsync).toHaveBeenCalledTimes(baselineCompileCalls + 1))
    const baselineDisposeCalls = disposeTarget.mock.calls.length
    dynamicsMode.value = 'off'
    await nextTick()
    ;(finishCompilation as ((result: Object3D) => void) | null)?.({} as Object3D)
    await vi.waitFor(() => expect(disposeTarget).toHaveBeenCalledTimes(baselineDisposeCalls + 2))

    const mainScene = [...render.mock.calls]
      .reverse()
      .map(
        call =>
          call[0] as unknown as {
            children?: Array<{ material?: { uniforms?: Record<string, { value: unknown }> } }>
          },
      )
      .find(scene => scene.children?.[0]?.material?.uniforms?.uDynamicsMode)
    const uniforms = mainScene?.children?.[0]?.material?.uniforms
    expect(uniforms?.uDynamicsMode.value).toBe(2)
    expect(uniforms?.uRippleTexture.value).toBeNull()
    expect(uniforms?.uHasRippleTexture.value).toBe(0)
    scope.stop()
  })

  it('ignores a late ripple compilation failure after a newer off selection wins', async () => {
    const three = await import('three')
    let rejectCompilation: ((error: Error) => void) | null = null
    const compileAsync = vi.spyOn(three.WebGLRenderer.prototype, 'compileAsync')
    const disposeTarget = vi.spyOn(three.WebGLRenderTarget.prototype, 'dispose')
    const dynamicsMode = ref<'fluid' | 'off' | 'ripple'>('off')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        dynamicsMode,
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const baselineCompileCalls = compileAsync.mock.calls.length
    compileAsync.mockImplementationOnce(
      () =>
        new Promise<never>((_, reject) => {
          rejectCompilation = reject
        }),
    )
    dynamicsMode.value = 'ripple'
    await vi.waitFor(() => expect(compileAsync).toHaveBeenCalledTimes(baselineCompileCalls + 1))
    const baselineDisposeCalls = disposeTarget.mock.calls.length
    dynamicsMode.value = 'off'
    await nextTick()
    ;(rejectCompilation as ((error: Error) => void) | null)?.(new Error('stale ripple compile failed'))

    await vi.waitFor(() => expect(disposeTarget).toHaveBeenCalledTimes(baselineDisposeCalls + 2))
    expect(renderer?.state.value).toBe('ready')
    scope.stop()
  })

  it('does not attach renderer observers or events after initial ripple compilation outlives its scope', async () => {
    const three = await import('three')
    const canvas = document.createElement('canvas')
    let finishCompilation: ((result: Object3D) => void) | null = null
    const compileAsync = vi.spyOn(three.WebGLRenderer.prototype, 'compileAsync').mockImplementationOnce(
      () =>
        new Promise<Object3D>(resolve => {
          finishCompilation = resolve
        }),
    )
    const disposeTarget = vi.spyOn(three.WebGLRenderTarget.prototype, 'dispose')
    const addWindowListener = vi.spyOn(window, 'addEventListener')
    const addCanvasListener = vi.spyOn(canvas, 'addEventListener')
    const countListenerAdds = (calls: readonly (readonly unknown[])[], eventName: string) =>
      calls.filter(([event]) => String(event) === eventName).length
    const scope = effectScope()
    scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        dynamicsMode: ref('ripple'),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(compileAsync).toHaveBeenCalledOnce())
    expect(countListenerAdds(addWindowListener.mock.calls, 'resize')).toBe(0)
    expect(countListenerAdds(addWindowListener.mock.calls, 'pointermove')).toBe(0)
    expect(countListenerAdds(addCanvasListener.mock.calls, 'webglcontextlost')).toBe(1)
    const baselineDisposeCalls = disposeTarget.mock.calls.length

    scope.stop()
    ;(finishCompilation as ((result: Object3D) => void) | null)?.({} as Object3D)
    await vi.waitFor(() => expect(disposeTarget).toHaveBeenCalledTimes(baselineDisposeCalls + 2))

    expect(ResizeObserverMock.instances).toHaveLength(0)
    expect(countListenerAdds(addWindowListener.mock.calls, 'resize')).toBe(0)
    expect(countListenerAdds(addWindowListener.mock.calls, 'pointermove')).toBe(0)
    expect(countListenerAdds(addCanvasListener.mock.calls, 'webglcontextlost')).toBe(1)
    expect(countListenerAdds(addCanvasListener.mock.calls, 'webglcontextrestored')).toBe(1)
  })

  it('recovers once when context loss occurs during initial ripple compilation', async () => {
    const three = await import('three')
    const canvas = document.createElement('canvas')
    let finishFirstCompilation: ((result: Object3D) => void) | null = null
    const compileAsync = vi.spyOn(three.WebGLRenderer.prototype, 'compileAsync').mockImplementationOnce(
      () =>
        new Promise<Object3D>(resolve => {
          finishFirstCompilation = resolve
        }),
    )
    const disposeTarget = vi.spyOn(three.WebGLRenderTarget.prototype, 'dispose')
    const addWindowListener = vi.spyOn(window, 'addEventListener')
    const addCanvasListener = vi.spyOn(canvas, 'addEventListener')
    const countListenerAdds = (calls: readonly (readonly unknown[])[], eventName: string) =>
      calls.filter(([event]) => String(event) === eventName).length
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        dynamicsMode: ref('ripple'),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(compileAsync).toHaveBeenCalledOnce())
    expect(countListenerAdds(addCanvasListener.mock.calls, 'webglcontextlost')).toBe(1)
    expect(countListenerAdds(addWindowListener.mock.calls, 'resize')).toBe(0)
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    expect(renderer?.state.value).toBe('fallback')

    canvas.dispatchEvent(new Event('webglcontextrestored'))
    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    expect(compileAsync).toHaveBeenCalledTimes(3)
    const listenerCountsBeforeLateResult = {
      contextLost: countListenerAdds(addCanvasListener.mock.calls, 'webglcontextlost'),
      pointerMove: countListenerAdds(addWindowListener.mock.calls, 'pointermove'),
      resize: countListenerAdds(addWindowListener.mock.calls, 'resize'),
    }
    const baselineDisposeCalls = disposeTarget.mock.calls.length

    ;(finishFirstCompilation as ((result: Object3D) => void) | null)?.({} as Object3D)
    await vi.waitFor(() => expect(disposeTarget).toHaveBeenCalledTimes(baselineDisposeCalls + 2))

    expect(renderer?.state.value).toBe('ready')
    expect(ResizeObserverMock.instances).toHaveLength(1)
    expect(countListenerAdds(addCanvasListener.mock.calls, 'webglcontextlost')).toBe(
      listenerCountsBeforeLateResult.contextLost,
    )
    expect(countListenerAdds(addWindowListener.mock.calls, 'pointermove')).toBe(
      listenerCountsBeforeLateResult.pointerMove,
    )
    expect(countListenerAdds(addWindowListener.mock.calls, 'resize')).toBe(listenerCountsBeforeLateResult.resize)
    scope.stop()
  })

  it('restores the latest off mode after an active ripple renderer loses context', async () => {
    const three = await import('three')
    const canvas = document.createElement('canvas')
    const compileAsync = vi.spyOn(three.WebGLRenderer.prototype, 'compileAsync')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const unsubscribe = vi.fn()
    const subscribe = vi.fn(() => unsubscribe)
    const dynamicsMode = ref<'fluid' | 'off' | 'ripple'>('ripple')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        dynamicsMode,
        interactionSource: { subscribe },
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    expect(subscribe).toHaveBeenCalledOnce()
    const compileCallsBeforeLoss = compileAsync.mock.calls.length

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    expect(renderer?.state.value).toBe('fallback')
    expect(unsubscribe).toHaveBeenCalledOnce()

    dynamicsMode.value = 'off'
    await nextTick()
    await renderer?.retryAfterFailure()
    expect(renderer?.state.value).toBe('fallback')
    expect(compileAsync).toHaveBeenCalledTimes(compileCallsBeforeLoss)

    canvas.dispatchEvent(new Event('webglcontextrestored'))
    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))

    expect(compileAsync).toHaveBeenCalledTimes(compileCallsBeforeLoss + 1)
    expect(subscribe).toHaveBeenCalledOnce()
    const mainScene = [...render.mock.calls]
      .reverse()
      .map(call => call[0] as unknown as { children: Array<{ material?: ShaderMaterial }> })
      .find(candidate => candidate.children[0]?.material?.uniforms.uDynamicsMode)
    if (!mainScene) throw new Error('main optical scene was not rendered')
    const uniforms = mainScene.children[0].material!.uniforms
    expect(uniforms.uDynamicsMode.value).toBe(2)
    expect(uniforms.uRippleTexture.value).toBeNull()
    expect(uniforms.uHasRippleTexture.value).toBe(0)

    const framesBeforePointer = renderer?.renderedFrames.value
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 160 }))
    await nextTick()
    expect(renderer?.renderedFrames.value).toBe(framesBeforePointer)
    scope.stop()
  })

  it('keeps scroll-space surface geometry stable while updating the visible viewport offset', async () => {
    stubMediaPreferences({ coarsePointer: true })
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      callbacks.delete(id)
    })
    const surface = appendOpticalSurface('test-surface', { height: 500, width: 350, x: 20, y: 100 })
    surface.dataset.glassOpticalSurface = ''
    const canvas = document.createElement('canvas')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('frosted'),
        canvas: ref(canvas),
        quality: ref('high'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    for (let pass = 0; pass < 3 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now()))
    }
    expect(callbacks.size).toBe(0)

    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(120)
    setOpticalSurfaceBounds(surface, { height: 500, width: 350, x: 20, y: -20 })
    window.dispatchEvent(new Event('scroll'))
    for (let pass = 0; pass < 3 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + 160 + pass * 16))
    }

    const settledScene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          uniforms: {
            uMotion: { value: number }
            uRects: { value: Array<{ y: number }> }
            uScrollOffset: { value: { y: number } }
            uTrail: { value: Array<{ z: number }> }
          }
        }
      }>
    }
    const settledUniforms = settledScene.children[0].material.uniforms
    expect(settledUniforms.uMotion.value).toBe(0)
    expect(settledUniforms.uTrail.value.every(trail => trail.z === 0)).toBe(true)
    expect(settledUniforms.uRects.value[0].y).toBeCloseTo(1 - (100 + 500) / 844)
    expect(settledUniforms.uScrollOffset.value.y).toBe(120)
    expect(callbacks.size).toBe(0)
    scope.stop()
  })

  it('coalesces scroll updates and renders two stable tail frames without injecting motion', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    let scrollY = 0
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      callbacks.delete(id)
    })
    const surface = appendOpticalSurface('test-surface', { height: 300, width: 400, x: 40, y: 120 })
    surface.dataset.glassOpticalSurface = ''
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    for (let pass = 0; pass < 4 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + pass * 16))
    }
    expect(callbacks.size).toBe(0)
    render.mockClear()

    scrollY = 80
    window.dispatchEvent(new Event('scroll'))
    scrollY = 160
    window.dispatchEvent(new Event('scroll'))
    expect(callbacks.size).toBe(1)

    const renderedScrollOffsets: number[] = []
    for (let pass = 0; pass < 3; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => {
        callback(performance.now() + 100 + pass * 16)
        const scene = render.mock.calls.at(-1)?.[0] as unknown as {
          children: Array<{
            material: {
              uniforms: {
                uMotion: { value: number }
                uScrollOffset: { value: { y: number } }
                uTrail: { value: Array<{ z: number }> }
              }
            }
          }>
        }
        const uniforms = scene.children[0].material.uniforms
        renderedScrollOffsets.push(uniforms.uScrollOffset.value.y)
        expect(uniforms.uMotion.value).toBe(0)
        expect(uniforms.uTrail.value.every(trail => trail.z === 0)).toBe(true)
      })
    }

    expect(renderedScrollOffsets).toEqual([160, 160, 160])
    expect(callbacks.size).toBe(0)

    render.mockClear()
    window.dispatchEvent(new Event('scrollend'))
    for (let pass = 0; pass < 2; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + 200 + pass * 16))
    }
    expect(render).toHaveBeenCalledTimes(2)
    expect(callbacks.size).toBe(0)

    window.dispatchEvent(new Event('scroll'))
    expect(callbacks.size).toBe(1)
    scope.stop()
    expect(callbacks.size).toBe(0)
  })

  it('hands wallpaper sampling to the native scroll material before wheel movement and restores it after settling', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    let scrollY = 0
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const wallpaperSampling: number[] = []
    render.mockImplementation(scene => {
      const uniforms = (
        scene as unknown as {
          children: Array<{
            material?: {
              uniforms?: {
                uHasWallpaperTexture?: { value: number }
              }
            }
          }>
        }
      ).children[0]?.material?.uniforms
      if (uniforms?.uHasWallpaperTexture) wallpaperSampling.push(uniforms.uHasWallpaperTexture.value)
    })
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => callbacks.delete(id))
    appendOpticalSurface('app-hover-lift-card', { height: 300, width: 400, x: 40, y: 120 })
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('high'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('/api/v1/login/wallpapers/opaque-id'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    for (let pass = 0; pass < 4 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + pass * 16))
    }
    expect(wallpaperSampling.at(-1)).toBe(1)

    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 80 }))

    expect(wallpaperSampling.at(-1)).toBe(0)
    expect(document.documentElement.dataset.glassScrollPresentation).toBe('native')

    scrollY = 240
    window.dispatchEvent(new Event('scroll'))
    for (let pass = 0; pass < 3 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + 100 + pass * 16))
    }

    expect(wallpaperSampling.at(-1)).toBe(1)
    expect(document.documentElement).not.toHaveAttribute('data-glass-scroll-presentation')
    expect(callbacks.size).toBe(0)

    scope.stop()
  })

  it('clears ripple state before native scroll presentation takes ownership', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => callbacks.delete(id))
    appendOpticalSurface('app-hover-lift-card', { height: 300, width: 400, x: 40, y: 120 })
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        dynamicsMode: ref('ripple'),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('/api/v1/login/wallpapers/opaque-id'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    for (let pass = 0; pass < 4 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + pass * 16))
    }
    const mainScene = render.mock.calls
      .map(call => call[0] as unknown as { children: Array<{ material?: ShaderMaterial }> })
      .find(scene => scene.children[0]?.material?.uniforms.uDynamicsMode)
    if (!mainScene) throw new Error('main optical scene was not rendered')
    const uniforms = mainScene.children[0].material!.uniforms
    expect(uniforms.uDynamicsMode.value).toBe(1)
    expect(uniforms.uHasRippleTexture.value).toBe(0)

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 180 }))
    expect(callbacks.size).toBe(1)
    const rippleFrames = [...callbacks.values()]
    callbacks.clear()
    rippleFrames.forEach(callback => callback(performance.now() + 16))
    expect(uniforms.uHasRippleTexture.value).toBe(1)
    expect(callbacks.size).toBe(1)

    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 80 }))

    expect(callbacks.size).toBe(0)
    expect(uniforms.uHasRippleTexture.value).toBe(0)
    expect(uniforms.uRippleTexture.value).toBeNull()
    expect(document.documentElement.dataset.glassScrollPresentation).toBe('native')
    scope.stop()
  })

  it('ignores scroll intent and movement that cannot move a managed glass surface', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    appendOpticalSurface('app-hover-lift-card', { height: 300, width: 400, x: 40, y: 120 })
    const unrelatedScroller = document.createElement('div')
    unrelatedScroller.style.overflowY = 'auto'
    Object.defineProperties(unrelatedScroller, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 600 },
      scrollTop: { configurable: true, value: 0, writable: true },
    })
    document.body.append(unrelatedScroller)
    const unrelatedContent = document.createElement('div')
    unrelatedScroller.append(unrelatedContent)
    const overlay = document.createElement('div')
    overlay.className = 'v-overlay'
    const overlayScroller = unrelatedScroller.cloneNode() as HTMLElement
    overlay.append(overlayScroller)
    document.body.append(overlay)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('high'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    unrelatedContent.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 80 }))
    unrelatedContent.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'PageDown' }))
    unrelatedScroller.dispatchEvent(new Event('scroll', { bubbles: false }))
    overlayScroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 80 }))
    overlayScroller.dispatchEvent(new Event('scroll', { bubbles: false }))

    expect(document.documentElement).not.toHaveAttribute('data-glass-scroll-presentation')
    scope.stop()
  })

  it('starts native scroll presentation for a nested scroller that moves managed surfaces', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 900 },
      scrollTop: { configurable: true, value: 0, writable: true },
    })
    document.body.append(scroller)
    const surface = appendOpticalSurface('app-hover-lift-card', { height: 300, width: 400, x: 40, y: 120 })
    scroller.append(surface)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('high'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    surface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 80 }))

    expect(document.documentElement.dataset.glassScrollPresentation).toBe('native')
    scope.stop()
  })

  it('redraws a high-quality scroll layer without advancing its flow targets', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const three = await import('three')
    const setRenderTarget = vi.spyOn(three.WebGLRenderer.prototype, 'setRenderTarget')
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)
      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => callbacks.delete(id))
    const surface = appendOpticalSurface('app-hover-lift-card', { height: 300, width: 400, x: 40, y: 120 })
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('high'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    for (let pass = 0; pass < 4 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + pass * 16))
    }
    setRenderTarget.mockClear()

    window.dispatchEvent(new Event('scroll'))
    for (let pass = 0; pass < 3 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + 100 + pass * 16))
    }

    expect(setRenderTarget).not.toHaveBeenCalled()
    scope.stop()
    surface.remove()
  })

  it('reuses the committed presentation size throughout pointer animation frames', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    let presentationReads = 0
    const root = document.createElement('div')
    Object.defineProperties(root, {
      scrollHeight: {
        configurable: true,
        get: () => {
          presentationReads += 1
          return 1600
        },
      },
      scrollWidth: {
        configurable: true,
        get: () => {
          presentationReads += 1
          return 1200
        },
      },
    })
    const canvas = document.createElement('canvas')
    root.append(canvas)
    document.body.append(root)
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)
      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => callbacks.delete(id))
    const surface = appendOpticalSurface('app-hover-lift-card', { height: 300, width: 400, x: 40, y: 120 })
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        quality: ref('high'),
        routeKey: ref('/plugins'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    for (let pass = 0; pass < 6 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + pass * 16))
    }
    presentationReads = 0

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 180, clientY: 220 }))
    for (let pass = 0; pass < 5 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + 100 + pass * 16))
    }

    expect(presentationReads).toBe(0)
    scope.stop()
    surface.remove()
  })

  it('tracks transformed card geometry during a bounded hover transition without advancing flow', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const three = await import('three')
    const setRenderTarget = vi.spyOn(three.WebGLRenderer.prototype, 'setRenderTarget')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => callbacks.delete(id))
    const surface = appendOpticalSurface('app-hover-lift-card', { height: 300, width: 400, x: 40, y: 120 })
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('high'),
        routeKey: ref('/plugins'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    for (let pass = 0; pass < 6 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + pass * 16))
    }
    render.mockClear()
    setRenderTarget.mockClear()

    setOpticalSurfaceBounds(surface, { height: 300, width: 400, x: 40, y: 116 })
    const transitionRun = new Event('transitionrun', { bubbles: true }) as TransitionEvent
    Object.defineProperty(transitionRun, 'propertyName', { value: 'transform' })
    surface.dispatchEvent(transitionRun)
    expect(callbacks.size).toBeGreaterThan(0)
    window.dispatchEvent(new Event('scroll'))
    expect(callbacks.size).toBe(1)

    const scheduledCallbacks = [...callbacks.values()]
    callbacks.clear()
    scheduledCallbacks.forEach(callback => callback(performance.now() + 100))

    expect(render).toHaveBeenCalled()
    expect(setRenderTarget).not.toHaveBeenCalled()

    const transitionEnd = new Event('transitionend', { bubbles: true }) as TransitionEvent
    Object.defineProperty(transitionEnd, 'propertyName', { value: 'transform' })
    surface.dispatchEvent(transitionEnd)
    scope.stop()
    expect(callbacks.size).toBe(0)
    surface.remove()
  })

  it('refreshes visible surface slots in the first scroll frame', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    let scrollY = 0
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY)
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(2000)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      callbacks.delete(id)
    })
    const firstSurface = appendOpticalSurface('app-hover-lift-card', {
      height: 240,
      width: 360,
      x: 80,
      y: 100,
    })
    const secondSurface = appendOpticalSurface('app-hover-lift-card', {
      height: 240,
      width: 360,
      x: 80,
      y: 1100,
    })
    const querySelectorAll = vi.spyOn(document, 'querySelectorAll')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    for (let pass = 0; pass < 4 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + pass * 16))
    }
    expect(callbacks.size).toBe(0)
    querySelectorAll.mockClear()

    scrollY = 1000
    setOpticalSurfaceBounds(firstSurface, { height: 240, width: 360, x: 80, y: -900 })
    setOpticalSurfaceBounds(secondSurface, { height: 240, width: 360, x: 80, y: 100 })
    window.dispatchEvent(new Event('scroll'))
    expect(callbacks.size).toBe(1)
    const firstScrollFrame = [...callbacks.values()]
    callbacks.clear()
    firstScrollFrame.forEach(callback => callback(performance.now() + 100))
    const firstScrollScene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          uniforms: {
            uRects: { value: Array<{ y: number }> }
          }
        }
      }>
    }
    expect(firstScrollScene.children[0].material.uniforms.uRects.value[0].y).toBeCloseTo(1 - (1100 + 240) / 2000)
    expect(querySelectorAll).not.toHaveBeenCalled()

    for (let pass = 0; pass < 3 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + 116 + pass * 16))
    }
    expect(callbacks.size).toBe(0)
    window.dispatchEvent(new Event('scrollend'))
    for (let pass = 0; pass < 2 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + 164 + pass * 16))
    }
    expect(querySelectorAll).not.toHaveBeenCalled()

    render.mockClear()
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 160 }))
    const interactionFrames = [...callbacks.values()]
    callbacks.clear()
    interactionFrames.forEach(callback => callback(performance.now() + 200))

    const scene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          uniforms: {
            uMotion: { value: number }
            uRects: { value: Array<{ y: number }> }
          }
        }
      }>
    }
    const uniforms = scene.children[0].material.uniforms
    expect(uniforms.uMotion.value).toBeGreaterThan(0)
    expect(uniforms.uRects.value[0].y).toBeCloseTo(1 - (1100 + 240) / 2000)
    scope.stop()
  })

  it('refreshes affected surface geometry in the first nested scroll frame', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(1200)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => callbacks.delete(id))
    const scroller = document.createElement('div')
    document.body.append(scroller)
    const surface = appendOpticalSurface('app-hover-lift-card', {
      height: 300,
      width: 400,
      x: 40,
      y: 100,
    })
    scroller.append(surface)
    const querySelectorAll = vi.spyOn(document, 'querySelectorAll')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    for (let pass = 0; pass < 4 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + pass * 16))
    }
    expect(callbacks.size).toBe(0)
    querySelectorAll.mockClear()

    setOpticalSurfaceBounds(surface, { height: 300, width: 400, x: 40, y: 180 })
    scroller.dispatchEvent(new Event('scroll'))
    expect(callbacks.size).toBe(1)
    const firstScrollFrame = [...callbacks.values()]
    callbacks.clear()
    firstScrollFrame.forEach(callback => callback(performance.now() + 100))

    const firstScrollScene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          uniforms: {
            uRects: { value: Array<{ y: number }> }
          }
        }
      }>
    }
    expect(firstScrollScene.children[0].material.uniforms.uRects.value[0].y).toBeCloseTo(1 - (180 + 300) / 1200)
    expect(querySelectorAll).toHaveBeenCalled()

    scope.stop()
  })

  it('coalesces virtual-list replacements into one scroll geometry pass', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    let scrollY = 0
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY)
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(2400)
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => callbacks.delete(id))
    const surface = appendOpticalSurface('app-hover-lift-card', {
      height: 300,
      width: 400,
      x: 40,
      y: 100,
    })
    const querySelectorAll = vi.spyOn(document, 'querySelectorAll')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/resource'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    for (let pass = 0; pass < 4 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + pass * 16))
    }
    expect(callbacks.size).toBe(0)
    querySelectorAll.mockClear()

    scrollY = 400
    window.dispatchEvent(new Event('scroll'))
    surface.remove()
    appendOpticalSurface('app-hover-lift-card', {
      height: 300,
      width: 400,
      x: 40,
      y: 100,
    })
    await nextTick()

    expect(callbacks.size).toBe(1)
    const firstScrollFrame = [...callbacks.values()]
    callbacks.clear()
    firstScrollFrame.forEach(callback => callback(performance.now() + 100))
    expect(querySelectorAll).toHaveBeenCalledTimes(5)

    scope.stop()
  })

  it('commits a virtual-list replacement that lands after the scroll frame before the next paint', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    let scrollY = 0
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY)
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(2400)
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => callbacks.delete(id))
    const surface = appendOpticalSurface('app-hover-lift-card', {
      height: 300,
      width: 400,
      x: 40,
      y: 100,
    })
    const querySelectorAll = vi.spyOn(document, 'querySelectorAll')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        quality: ref('balanced'),
        routeKey: ref('/resource'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    for (let pass = 0; pass < 4 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + pass * 16))
    }
    expect(callbacks.size).toBe(0)

    scrollY = 400
    window.dispatchEvent(new Event('scroll'))
    const firstScrollFrame = [...callbacks.values()]
    callbacks.clear()
    firstScrollFrame.forEach(callback => callback(performance.now() + 100))
    expect(callbacks.size).toBe(1)
    querySelectorAll.mockClear()

    surface.remove()
    appendOpticalSurface('app-hover-lift-card', {
      height: 300,
      width: 400,
      x: 40,
      y: 100,
    })
    await nextTick()

    expect(querySelectorAll).toHaveBeenCalledTimes(5)
    expect(callbacks.size).toBe(1)

    scope.stop()
  })

  it('keeps local material response stable while moving from card A through a gap to card B', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(700)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      callbacks.delete(id)
    })
    const surfaces = [
      { x: 100, name: 'A' },
      { x: 400, name: 'B' },
    ]
    surfaces.forEach(({ name, x }) => {
      const surface = appendOpticalSurface('app-hover-lift-card', {
        height: 180,
        width: 180,
        x,
        y: 100,
      })
      surface.dataset.testSurface = name
    })
    const canvas = document.createElement('canvas')
    const deformationStrength = ref(50)
    const flowStrength = ref(50)
    const reflectionStrength = ref(50)
    const transmissionStrength = ref(50)
    const translationStrength = ref(50)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        deformationStrength,
        flowStrength,
        quality: ref('balanced'),
        reflectionStrength,
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        transmissionStrength,
        translationStrength,
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    for (let pass = 0; pass < 3 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now()))
    }
    render.mockClear()

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 160 }))
    const [cardAFrame] = callbacks.values()
    callbacks.clear()
    cardAFrame(performance.now() + 16)
    const scene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          uniforms: {
            uDeformationStrength: { value: number }
            uDynamicsOnly: { value: number }
            uFlowStrength: { value: number }
            uMaxRefractionPixels: { value: number }
            uMotionExpansion: { value: number }
            uRects: { value: Array<{ x: number }> }
            uReflectionStrength: { value: number }
            uBackgroundVisibility: { value: number }
            uFrostDetailLevel: { value: number }
            uSurfaceDensity: { value: number }
            uTintDensity: { value: number }
            uTransmissionStrength: { value: number }
            uTranslationStrength: { value: number }
            uInteractionRectCount: { value: number }
            uTrail: { value: Array<{ z: number }> }
            uSurfaceWeights: { value: number[] }
          }
          fragmentShader: string
        }
      }>
    }
    const uniforms = scene.children[0].material.uniforms
    const cardAX = 100 / 1200
    const cardBX = 400 / 1200
    expect(uniforms.uRects.value.some(rect => Math.abs(rect.x - cardAX) < 0.001)).toBe(true)

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 330, clientY: 160 }))
    expect(uniforms.uRects.value.some(rect => Math.abs(rect.x - cardAX) < 0.001)).toBe(true)

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 460, clientY: 160 }))
    const cardAIndex = uniforms.uRects.value.findIndex(rect => Math.abs(rect.x - cardAX) < 0.001)
    const cardBIndex = uniforms.uRects.value.findIndex(rect => Math.abs(rect.x - cardBX) < 0.001)
    expect(cardAIndex).toBeGreaterThanOrEqual(0)
    expect(cardBIndex).toBeGreaterThanOrEqual(0)
    expect(uniforms.uSurfaceWeights.value[cardAIndex]).toBe(1)
    expect(uniforms.uSurfaceWeights.value[cardBIndex]).toBe(1)
    expect(uniforms.uInteractionRectCount.value).toBe(2)
    expect(uniforms.uTrail.value[1].z).toBeGreaterThan(0)
    expect(uniforms.uTranslationStrength.value).toBe(1)
    expect(uniforms.uDeformationStrength.value).toBe(1)
    expect(uniforms.uDynamicsOnly.value).toBe(1)
    expect(uniforms.uFlowStrength.value).toBe(1)
    expect(uniforms.uMotionExpansion.value).toBeCloseTo(0.5 ** 1.4)
    expect(uniforms.uMaxRefractionPixels.value).toBe(6)
    expect(uniforms.uReflectionStrength.value).toBe(1)
    expect(uniforms.uBackgroundVisibility.value).toBeCloseTo(0.58)
    expect(uniforms.uFrostDetailLevel.value).toBeCloseTo(0.3)
    expect(uniforms.uSurfaceDensity.value).toBeCloseTo(0.62)
    expect(uniforms.uTintDensity.value).toBeCloseTo(0.65)
    expect(uniforms.uTransmissionStrength.value).toBeCloseTo(5 / 7)

    translationStrength.value = 100
    deformationStrength.value = 100
    flowStrength.value = 100
    reflectionStrength.value = 80
    transmissionStrength.value = 100
    await nextTick()
    expect(uniforms.uTranslationStrength.value).toBeCloseTo(1.7)
    expect(uniforms.uDeformationStrength.value).toBeCloseTo(1.55)
    expect(uniforms.uFlowStrength.value).toBeCloseTo(1.45)
    expect(uniforms.uMotionExpansion.value).toBe(1)
    expect(uniforms.uMaxRefractionPixels.value).toBe(6)
    expect(uniforms.uReflectionStrength.value).toBeGreaterThan(1)
    expect(uniforms.uTransmissionStrength.value).toBe(1.3)

    expect(scene.children[0].material.fragmentShader).not.toContain('clamp(uMotion +')
    expect(scene.children[0].material.fragmentShader).toContain(
      'materialEnergy = max(materialEnergy, liquidEnergy * rectMask * surfaceDynamic * interactionMask)',
    )
    expect(scene.children[0].material.fragmentShader).toContain('uniform vec4 uInteractionRects[8]')
    expect(scene.children[0].material.fragmentShader).toContain('softLimitDynamicRefraction')
    expect(scene.children[0].material.fragmentShader).toContain('getContentProtection')
    expect(scene.children[0].material.fragmentShader).toContain('sampleHighQualityDiffuse')
    expect(scene.children[0].material.fragmentShader).toContain('singleSpecular')
    expect(scene.children[0].material.fragmentShader).not.toContain('stableSample')
    expect(scene.children[0].material.fragmentShader).not.toContain('broadReflection')
    expect(scene.children[0].material.fragmentShader).toContain('flowSurfaceDetail * dynamicMask * 0.38')
    expect(scene.children[0].material.fragmentShader).not.toContain('pointerCurvature')
    expect(scene.children[0].material.fragmentShader).not.toContain('wakeCurvature')
    expect(scene.children[0].material.fragmentShader).not.toContain('surfaceCurvature')
    expect(scene.children[0].material.fragmentShader).toContain('uniform float uMotionExpansion')
    expect(scene.children[0].material.fragmentShader).toContain('uniform float uTranslationStrength')
    expect(scene.children[0].material.fragmentShader).toContain('uniform float uDeformationStrength')
    expect(scene.children[0].material.fragmentShader).toContain('uniform float uDynamicsOnly')
    expect(scene.children[0].material.fragmentShader).toContain(
      'float rippleGradientEnergy = smoothstep(0.003, 0.08, rippleGradientLength)',
    )
    expect(scene.children[0].material.fragmentShader).toContain(
      'rippleGradient * mix(230.0, 335.0, uQuality) * uRippleDeformationStrength',
    )
    expect(scene.children[0].material.fragmentShader).toContain(
      'uAppearance > 1.5 ? 1.25 : (uAppearance > 0.5 ? 0.86 : 0.72)',
    )
    expect(scene.children[0].material.fragmentShader).toContain('float sharedWaveDensity = mix(2.81, 1.63')
    expect(scene.children[0].material.fragmentShader).toContain(
      'float sharedDirectionality = smoothstep(0.015, 0.18, trailSpatialSpan)',
    )
    expect(scene.children[0].material.fragmentShader).toContain(
      'mix(radialPointerShape, directionalPointerShape, sharedDirectionality)',
    )
    expect(scene.children[0].material.fragmentShader).toContain(
      'mix(radialSharedWave, directionalSharedWave, sharedDirectionality)',
    )
    expect(scene.children[0].material.fragmentShader).toContain('mix(1.0, 0.78, sharedDirectionality)')
    expect(scene.children[0].material.fragmentShader).toContain('uMotion *\n      uMotion')
    expect(scene.children[0].material.fragmentShader).toContain(
      'float dynamicsPresence = max(materialEnergy, sharedMotionPresence * 0.36)',
    )
    expect(scene.children[0].material.fragmentShader).toContain('uniform float uFlowStrength')
    expect(scene.children[0].material.fragmentShader).toContain('uniform float uReflectionStrength')
    expect(scene.children[0].material.fragmentShader).not.toContain('uWakeProgress')
    expect(scene.children[0].material.fragmentShader).not.toContain('temporalEnergy')
    expect(scene.children[0].material.fragmentShader).toContain('const float dynamicRangeScale = 0.52')
    expect(scene.children[0].material.fragmentShader).toContain('const float dynamicRangeDensity = 3.698')
    expect(scene.children[0].material.fragmentShader).toContain('float pointerSpread = mix(26.0, 17.0, uQuality)')
    expect(scene.children[0].material.fragmentShader).not.toContain(
      'mix(mix(26.0, 17.0, uQuality), mix(12.0, 8.0, uQuality), frosted)',
    )
    expect(scene.children[0].material.fragmentShader).toContain('float wakeTravel =\n      0.014 * dynamicRangeScale *')
    expect(scene.children[0].material.fragmentShader).toContain('max(min(1.0, trailEnergy) * 0.68, wakeEnergy * 0.82)')
    expect(scene.children[0].material.fragmentShader).toContain('uniform float uBackgroundVisibility')
    expect(scene.children[0].material.fragmentShader).toContain('uniform float uFrostDetailLevel')
    expect(scene.children[0].material.fragmentShader).toContain('uniform float uSurfaceDensity')
    expect(scene.children[0].material.fragmentShader).toContain('uniform float uTintDensity')
    expect(scene.children[0].material.fragmentShader).toContain('uniform float uTransmissionStrength')
    expect(scene.children[0].material.fragmentShader).toContain('uniform float uPreviousWallpaperExposure')
    expect(scene.children[0].material.fragmentShader).toContain('uniform float uWallpaperExposure')
    expect(scene.children[0].material.fragmentShader).toContain('compressWallpaperLuminance')
    expect(scene.children[0].material.fragmentShader).toContain(
      'toneMapWallpaper(previous, viewportUv, uPreviousWallpaperExposure)',
    )
    expect(scene.children[0].material.fragmentShader).toContain(
      'toneMapWallpaper(current, viewportUv, uWallpaperExposure)',
    )
    expect(scene.children[0].material.fragmentShader).toContain('float transmissionResponse')
    expect(scene.children[0].material.fragmentShader).toContain('float referenceLiftProgress')
    expect(scene.children[0].material.fragmentShader).toContain('float highTransmissionProgress')
    expect(scene.children[0].material.fragmentShader).toContain('float frostedDensity')
    expect(scene.children[0].material.fragmentShader).toContain('frosted * (1.0 - uFrostDetailLevel)')
    expect(scene.children[0].material.fragmentShader).toContain('1.0 + frostedDensity * mix(1.15, 1.55, uQuality)')
    expect(scene.children[0].material.fragmentShader).toContain('clearBaseAlpha * mix(1.0, 2.5, liquidPresence)')
    expect(scene.children[0].material.fragmentShader).toContain('frostedBaseAlpha * mix(0.9, 1.0, liquidPresence)')
    expect(scene.children[0].material.fragmentShader).toContain('tintedBaseAlpha * mix(1.0, 1.8, liquidPresence)')
    expect(scene.children[0].material.fragmentShader).not.toContain('opticalCoverage')
    expect(scene.children[0].material.fragmentShader).toContain('texture2DGradEXT(')
    expect(scene.children[0].material.fragmentShader).toContain('float frostLod = (1.0 - uFrostDetailLevel) * 6.0')
    expect(scene.children[0].material.fragmentShader).toContain('float frostGradientScale = exp2(frostLod)')
    expect(scene.children[0].material.fragmentShader).not.toContain('exp2(frostLod) / 0.125')
    expect(scene.children[0].material.fragmentShader).toContain('vec3 transmissionReference')
    expect(scene.children[0].material.fragmentShader).toContain('float referenceLift')
    expect(scene.children[0].material.fragmentShader).toContain('float highlightProtection')
    expect(scene.children[0].material.fragmentShader).toContain('protectedHighlightReference')
    expect(scene.children[0].material.fragmentShader).toContain('float compressedLuminance')
    expect(scene.children[0].material.fragmentShader).toContain('mix(0.58, 0.84, uQuality)')
    expect(scene.children[0].material.fragmentShader).toContain('uMotion *')
    expect(scene.children[0].material.fragmentShader).toContain('uTranslationStrength')
    expect(scene.children[0].material.fragmentShader).toContain('vec2 lightDirection = normalize(vec2(-0.68, 0.74))')
    expect(scene.children[0].material.fragmentShader).toContain('float highlightBudget')
    expect(scene.children[0].material.fragmentShader).toContain('float absorption')
    expect(scene.children[0].material.fragmentShader).toContain(
      'causticHighlightMix * uReflectionStrength * highlightBudget',
    )
    expect(scene.children[0].material.fragmentShader).not.toContain('materialAlpha = uBackgroundVisibility * mix(')
    expect(scene.children[0].material.fragmentShader).not.toContain('mix(0.035, 0.4')
    expect(scene.children[0].material.fragmentShader).not.toContain('sin(')

    scope.stop()
  })

  it('settles pointer feedback without leaving a continuous animation frame', async () => {
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      callbacks.delete(id)
    })
    const surface = appendOpticalSurface('test-surface', { height: 240, width: 320, x: 20, y: 80 })
    surface.dataset.glassOpticalSurface = ''
    const canvas = document.createElement('canvas')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    for (let pass = 0; pass < 3 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now()))
    }
    expect(callbacks.size).toBe(0)
    render.mockClear()

    const pointerMove = new MouseEvent('pointermove', { clientX: 160, clientY: 160 })
    window.dispatchEvent(pointerMove)
    expect(callbacks.size).toBe(1)

    const [firstInteractionFrame] = callbacks.values()
    callbacks.clear()
    firstInteractionFrame(pointerMove.timeStamp + 100)
    const firstScene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          uniforms: {
            uPointer: { value: { x: number; y: number } }
            uPointerVelocity: { value: { x: number; y: number } }
          }
        }
      }>
    }
    const firstPointer = firstScene.children[0].material.uniforms.uPointer.value
    const stablePointer = { x: firstPointer.x, y: firstPointer.y }
    const firstVelocity = firstScene.children[0].material.uniforms.uPointerVelocity.value
    const stableDirection = { x: firstVelocity.x, y: firstVelocity.y }

    const [secondInteractionFrame] = callbacks.values()
    callbacks.clear()
    secondInteractionFrame(pointerMove.timeStamp + 300)
    const secondScene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          uniforms: {
            uPointer: { value: { x: number; y: number } }
            uPointerVelocity: { value: { x: number; y: number } }
          }
        }
      }>
    }
    expect(secondScene.children[0].material.uniforms.uPointer.value).toMatchObject(stablePointer)
    expect(secondScene.children[0].material.uniforms.uPointerVelocity.value).toMatchObject(stableDirection)

    const [finalInteractionFrame] = callbacks.values()
    callbacks.clear()
    finalInteractionFrame(pointerMove.timeStamp + 500)
    const finalScene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: { uniforms: { uPointerVelocity: { value: { x: number; y: number } } } }
      }>
    }

    expect(callbacks.size).toBe(0)
    expect(finalScene.children[0].material.uniforms.uPointerVelocity.value).toMatchObject({ x: 0, y: 0 })
    scope.stop()
  })

  it('keeps immediate translation and deformation at zero flow without scheduling inertia', async () => {
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      callbacks.delete(id)
    })
    appendOpticalSurface('app-hover-lift-card', { height: 240, width: 320, x: 20, y: 80 })
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        deformationStrength: ref(70),
        flowStrength: ref(0),
        quality: ref('balanced'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        translationStrength: ref(70),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    for (let pass = 0; pass < 3 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now()))
    }
    render.mockClear()

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 160 }))
    expect(callbacks.size).toBe(1)
    const [frame] = callbacks.values()
    callbacks.clear()
    frame(performance.now() + 16)

    const scene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: {
          uniforms: {
            uDeformationStrength: { value: number }
            uFlowStrength: { value: number }
            uMotion: { value: number }
            uTranslationStrength: { value: number }
          }
        }
      }>
    }
    const uniforms = scene.children[0].material.uniforms
    expect(uniforms.uMotion.value).toBe(1)
    expect(uniforms.uTranslationStrength.value).toBeGreaterThan(1)
    expect(uniforms.uDeformationStrength.value).toBeGreaterThan(1)
    expect(uniforms.uFlowStrength.value).toBe(0)
    expect(callbacks.size).toBe(0)
    scope.stop()
  })

  it('keeps static material rendering while off owns no interaction subscription or dynamic output', async () => {
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const subscribe = vi.fn(() => vi.fn())
    const deformationStrength = ref(80)
    const dynamicsMode = ref<'fluid' | 'off' | 'ripple'>('off')
    const reflectionStrength = ref(40)
    appendOpticalSurface('app-hover-lift-card', { height: 240, width: 320, x: 20, y: 80 })
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        deformationStrength,
        dynamicsMode,
        flowStrength: ref(80),
        interactionSource: { subscribe },
        quality: ref('high'),
        reflectionStrength,
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        translationStrength: ref(80),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const scene = render.mock.calls
      .map(call => call[0] as unknown as { children: Array<{ material?: ShaderMaterial }> })
      .find(candidate => candidate.children[0]?.material?.uniforms.uDynamicsMode)
    if (!scene) throw new Error('main optical scene was not rendered')
    const uniforms = scene.children[0].material!.uniforms

    expect(subscribe).not.toHaveBeenCalled()
    expect(uniforms.uDynamicsMode.value).toBe(2)
    expect(uniforms.uTranslationStrength.value).toBe(0)
    expect(uniforms.uDeformationStrength.value).toBe(0)
    expect(uniforms.uFlowStrength.value).toBe(0)
    expect(uniforms.uRippleDeformationStrength.value).toBe(0)
    expect(uniforms.uTrailCount.value).toBe(0)
    expect(uniforms.uHasFlowTexture.value).toBe(0)
    expect(uniforms.uHasRippleTexture.value).toBe(0)
    expect(uniforms.uReflectionStrength.value).toBeGreaterThan(0)

    const framesBeforePointer = renderer?.renderedFrames.value
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 160 }))
    await nextTick()
    expect(renderer?.renderedFrames.value).toBe(framesBeforePointer)

    deformationStrength.value = 100
    reflectionStrength.value = 100
    await nextTick()
    expect(uniforms.uDeformationStrength.value).toBe(0)
    expect(uniforms.uRippleDeformationStrength.value).toBe(0)
    expect(uniforms.uReflectionStrength.value).toBeGreaterThan(1)
    scope.stop()
  })

  it('keeps fluid and ripple resources mutually exclusive across rapid mode switches', async () => {
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const subscribe = vi.fn(() => vi.fn())
    const dynamicsMode = ref<'fluid' | 'off' | 'ripple'>('fluid')
    appendOpticalSurface('app-hover-lift-card', { height: 240, width: 320, x: 20, y: 80 })
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(document.createElement('canvas')),
        deformationStrength: ref(70),
        dynamicsMode,
        flowStrength: ref(70),
        interactionSource: { subscribe },
        quality: ref('high'),
        routeKey: ref('/dashboard'),
        surfaceSpace: 'scroll',
        tintColor: ref('#8D51F9'),
        translationStrength: ref(70),
        wallpaperUrl: ref('https://example.com/wallpaper.jpg'),
      }),
    )

    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
    const scene = render.mock.calls
      .map(call => call[0] as unknown as { children: Array<{ material?: ShaderMaterial }> })
      .find(candidate => candidate.children[0]?.material?.uniforms.uDynamicsMode)
    if (!scene) throw new Error('main optical scene was not rendered')
    const uniforms = scene.children[0].material!.uniforms
    expect(uniforms.uDynamicsMode.value).toBe(0)
    expect(uniforms.uHasFlowTexture.value).toBe(1)
    expect(uniforms.uHasRippleTexture.value).toBe(0)

    dynamicsMode.value = 'ripple'
    await vi.waitFor(() => expect(uniforms.uDynamicsMode.value).toBe(1))
    expect(uniforms.uHasFlowTexture.value).toBe(0)
    expect(uniforms.uHasRippleTexture.value).toBe(0)
    expect(uniforms.uMaxRefractionPixels.value).toBeCloseTo(28)
    expect(
      render.mock.calls.some(call => {
        const rippleScene = call[0] as unknown as { children: Array<{ material?: ShaderMaterial }> }
        return rippleScene.children[0]?.material?.fragmentShader.includes('uImpulseSigma')
      }),
    ).toBe(true)

    dynamicsMode.value = 'off'
    dynamicsMode.value = 'fluid'
    await vi.waitFor(() => {
      expect(uniforms.uDynamicsMode.value).toBe(0)
      expect(uniforms.uHasFlowTexture.value).toBe(1)
    })
    expect(uniforms.uHasRippleTexture.value).toBe(0)
    expect(subscribe).toHaveBeenCalled()
    scope.stop()
  })
})
