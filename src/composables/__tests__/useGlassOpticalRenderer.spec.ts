import {
  collectGlassOpticalRects,
  containsGlassOpticalSurface,
  resolveGlassOpticalSurfaceMode,
  setGlassRendererState,
  useGlassOpticalInteractionSource,
  useGlassOpticalRenderer,
  type GlassRendererState,
} from '@/composables/useGlassOpticalRenderer'
import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_ACTIVITY_SUSPEND_DELAY_MS } from '@/utils/appActivityLifecycle'
import type { ShaderMaterial, Vector2, WebGLRenderTarget } from 'three'

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
        <div class="v-overlay__content"><div class="v-card"></div></div>
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
    const opacity = ref(1)
    const revision = ref(0)
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('clear'),
        canvas: ref(canvas),
        pageMotion: { active, opacity, revision },
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

  it('recovers after consecutive WebGL context loss cycles', async () => {
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

    for (let cycle = 0; cycle < 2; cycle += 1) {
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
      expect(renderer?.state.value).toBe('fallback')

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
    expect(warn).toHaveBeenCalledWith(
      '玻璃磨砂壁纸预滤失败，继续使用实时扩散采样:',
      expect.any(Error),
    )

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

  it('releases renderer resources before restoring a single active instance', async () => {
    const three = await import('three')
    const canvas = document.createElement('canvas')
    const active = ref(true)
    const scope = effectScope()
    let frameId = 0
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => ++frameId)
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame')
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
    expect(requestFrame).toHaveBeenCalled()
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
    const frameCancellationsBeforeFirstRelease = cancelFrame.mock.calls.length
    active.value = false
    await nextTick()

    expect(rendererDispose).toHaveBeenCalledTimes(1)
    expect(renderTargetDispose).toHaveBeenCalledTimes(renderTargetDisposalsBeforeFirstRelease + 3)
    expect(contextLoss).toHaveBeenCalledTimes(1)
    expect(resizeDisconnect).toHaveBeenCalledTimes(1)
    expect(mutationDisconnect).toHaveBeenCalledTimes(1)
    expect(cancelFrame.mock.calls.length).toBeGreaterThan(frameCancellationsBeforeFirstRelease)

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
    const frameCancellationsBeforeSecondRelease = cancelFrame.mock.calls.length
    active.value = false
    await nextTick()

    expect(rendererDispose).toHaveBeenCalledTimes(2)
    expect(renderTargetDispose).toHaveBeenCalledTimes(renderTargetDisposalsBeforeSecondRelease + 3)
    expect(contextLoss).toHaveBeenCalledTimes(2)
    expect(resizeDisconnect).toHaveBeenCalledTimes(2)
    expect(mutationDisconnect).toHaveBeenCalledTimes(2)
    expect(cancelFrame.mock.calls.length).toBeGreaterThan(frameCancellationsBeforeSecondRelease)

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
    await vi.waitFor(() => expect(renderTargetDispose).toHaveBeenCalledTimes(4))

    expect(rendererDispose).not.toHaveBeenCalled()
    expect(contextLoss).not.toHaveBeenCalled()

    quality.value = 'high'
    await nextTick()
    await vi.waitFor(() => expect(renderTargetDispose).toHaveBeenCalledTimes(6))

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

  it('clips nested hover-card dynamics on shared page surfaces without allocating another material slot', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    const three = await import('three')
    const render = vi.spyOn(three.WebGLRenderer.prototype, 'render')
    const pageContent = document.createElement('main')
    pageContent.className = 'layout-page-content'
    const outerSurface = document.createElement('section')
    outerSurface.className = 'v-card'
    setOpticalSurfaceBounds(outerSurface, { height: 420, width: 900, x: 40, y: 80 })
    const nestedCard = document.createElement('article')
    nestedCard.className = 'app-hover-lift-card'
    nestedCard.style.borderTopLeftRadius = '16px'
    nestedCard.style.borderTopRightRadius = '16px'
    nestedCard.style.borderBottomRightRadius = '16px'
    nestedCard.style.borderBottomLeftRadius = '16px'
    setOpticalSurfaceBounds(nestedCard, { height: 160, width: 280, x: 80, y: 140 })
    outerSurface.append(nestedCard)
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
            uHasInteractionClip: { value: number }
            uInteractionRadii: { value: { toArray: () => number[] } }
            uInteractionRect: { value: { toArray: () => number[] } }
            uRectCount: { value: number }
          }
        }
      }>
    }
    const material = scene.children[0].material

    expect(material.uniforms.uRectCount.value).toBe(1)
    expect(material.uniforms.uHasInteractionClip.value).toBe(1)
    expect(material.uniforms.uInteractionRect.value.toArray()).toEqual([
      80 / 1200,
      1 - (140 + 160) / 800,
      280 / 1200,
      160 / 800,
    ])
    expect(material.uniforms.uInteractionRadii.value.toArray()).toEqual([16, 16, 16, 16])
    expect(material.fragmentShader).toContain('uniform vec4 uInteractionRect')
    expect(material.fragmentShader).toContain('surfaceDynamic * interactionMask')
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

  it('refreshes visible surface slots after scrolling settles', async () => {
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

    scrollY = 1000
    setOpticalSurfaceBounds(firstSurface, { height: 240, width: 360, x: 80, y: -900 })
    setOpticalSurfaceBounds(secondSurface, { height: 240, width: 360, x: 80, y: 100 })
    window.dispatchEvent(new Event('scroll'))
    for (let pass = 0; pass < 3 && callbacks.size > 0; pass += 1) {
      const scheduledCallbacks = [...callbacks.values()]
      callbacks.clear()
      scheduledCallbacks.forEach(callback => callback(performance.now() + 100 + pass * 16))
    }
    expect(callbacks.size).toBe(0)

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
    expect(uniforms.uTranslationStrength.value).toBe(1)
    expect(uniforms.uDeformationStrength.value).toBe(1)
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
    expect(scene.children[0].material.fragmentShader).toContain('uniform float uFlowStrength')
    expect(scene.children[0].material.fragmentShader).toContain('uniform float uReflectionStrength')
    expect(scene.children[0].material.fragmentShader).not.toContain('uWakeProgress')
    expect(scene.children[0].material.fragmentShader).not.toContain('temporalEnergy')
    expect(scene.children[0].material.fragmentShader).toContain('const float dynamicRangeScale = 0.45')
    expect(scene.children[0].material.fragmentShader).toContain('const float dynamicRangeDensity = 4.938')
    expect(scene.children[0].material.fragmentShader).toContain(
      'float wakeTravel =\n      0.014 * dynamicRangeScale *',
    )
    expect(scene.children[0].material.fragmentShader).toContain(
      'max(min(1.0, trailEnergy) * 0.68, wakeEnergy * 0.82)',
    )
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
    expect(scene.children[0].material.fragmentShader).toContain(
      '1.0 + frostedDensity * mix(1.15, 1.55, uQuality)',
    )
    expect(scene.children[0].material.fragmentShader).toContain(
      'clearBaseAlpha * mix(1.0, 2.5, liquidPresence)',
    )
    expect(scene.children[0].material.fragmentShader).toContain(
      'frostedBaseAlpha * mix(0.9, 1.0, liquidPresence)',
    )
    expect(scene.children[0].material.fragmentShader).toContain(
      'tintedBaseAlpha * mix(1.0, 1.8, liquidPresence)',
    )
    expect(scene.children[0].material.fragmentShader).not.toContain('opticalCoverage')
    expect(scene.children[0].material.fragmentShader).toContain('texture2DGradEXT(')
    expect(scene.children[0].material.fragmentShader).toContain(
      'float frostLod = (1.0 - uFrostDetailLevel) * 6.0',
    )
    expect(scene.children[0].material.fragmentShader).toContain(
      'float frostGradientScale = exp2(frostLod)',
    )
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
    expect(scene.children[0].material.fragmentShader).not.toContain(
      'materialAlpha = uBackgroundVisibility * mix(',
    )
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
})
