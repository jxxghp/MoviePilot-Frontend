import {
  collectGlassOpticalRects,
  containsGlassOpticalSurface,
  setGlassRendererState,
  useGlassOpticalRenderer,
  type GlassRendererState,
} from '@/composables/useGlassOpticalRenderer'
import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

      dispose() {}
      forceContextLoss() {}
      render() {}
      setClearColor() {}
      setPixelRatio() {}
      setRenderTarget() {}
      setSize() {}
    },
  }
})

/** 提供 renderer 单元测试所需的最小 ResizeObserver 实现。 */
class ResizeObserverMock {
  /** 断开观察时无需执行额外逻辑。 */
  disconnect() {}

  /** 测试不需要追踪具体被观察元素。 */
  observe() {}
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
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  vi.stubGlobal('WebGLRenderingContext', class {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  delete document.documentElement.dataset.glassRendererState
})

describe('glass optical surface discovery', () => {
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

  it('detects an optical surface when the overlay root is created lazily', () => {
    const overlayRoot = document.createElement('div')
    overlayRoot.className = 'v-overlay-container'
    overlayRoot.innerHTML = `
      <div class="v-overlay v-overlay--active">
        <div class="v-overlay__content"><div class="v-card"></div></div>
      </div>
    `

    expect(containsGlassOpticalSurface(overlayRoot)).toBe(true)
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
    expect(countListenerAdds(addWindowListener.mock.calls, 'scroll')).toBe(1)
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
    expect(cancelFrame).toHaveBeenCalledTimes(2)

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
    expect(countListenerAdds(addWindowListener.mock.calls, 'scroll')).toBe(1)
    expect(countListenerAdds(addDocumentListener.mock.calls, 'visibilitychange')).toBe(1)
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
    expect(cancelFrame).toHaveBeenCalledTimes(4)

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
    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))

    expect(rendererDispose).not.toHaveBeenCalled()
    expect(contextLoss).not.toHaveBeenCalled()
    expect(renderTargetDispose).toHaveBeenCalledTimes(2)

    quality.value = 'high'
    await nextTick()
    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))

    expect(rendererDispose).not.toHaveBeenCalled()
    expect(contextLoss).not.toHaveBeenCalled()
    expect(renderTargetDispose).toHaveBeenCalledTimes(4)

    scope.stop()
  })

  it('keeps the active renderer visible while a replacement wallpaper loads', async () => {
    const three = await import('three')
    const canvas = document.createElement('canvas')
    const wallpaperUrl = ref('https://example.com/wallpaper-1.jpg')
    const scope = effectScope()
    const renderer = scope.run(() =>
      useGlassOpticalRenderer({
        active: ref(true),
        appearance: ref('frosted'),
        canvas: ref(canvas),
        quality: ref('high'),
        routeKey: ref('/dashboard'),
        tintColor: ref('#8D51F9'),
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

    wallpaperUrl.value = 'https://example.com/wallpaper-2.jpg'
    await nextTick()

    expect(renderer?.state.value).toBe('ready')

    resolveTexture(replacementTexture)
    await vi.waitFor(() => expect(renderer?.state.value).toBe('ready'))
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

  it('drives and settles the mobile liquid response from scrolling', async () => {
    stubMediaPreferences({ coarsePointer: true })
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844)
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

    surface.scrollTop = 0
    surface.dispatchEvent(new Event('scroll', { bubbles: true }))
    surface.scrollTop = 120
    surface.dispatchEvent(new Event('scroll', { bubbles: true }))
    expect(callbacks.size).toBeGreaterThanOrEqual(1)

    const interactionFrames = [...callbacks.values()]
    callbacks.clear()
    interactionFrames.forEach(interactionFrame => interactionFrame(performance.now() + 1_000))

    expect(callbacks.size).toBe(0)
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
            uRects: { value: Array<{ x: number }> }
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
    expect(scene.children[0].material.fragmentShader).not.toContain('clamp(uMotion +')
    expect(scene.children[0].material.fragmentShader).toContain(
      'materialEnergy = max(materialEnergy, liquidEnergy * rectMask)',
    )
    expect(scene.children[0].material.fragmentShader).toContain('softLimitDynamicRefraction')
    expect(scene.children[0].material.fragmentShader).toContain('getContentProtection')
    expect(scene.children[0].material.fragmentShader).toContain('sampleHighQualityDiffuse')
    expect(scene.children[0].material.fragmentShader).toContain('surfaceCurvature')
    expect(scene.children[0].material.fragmentShader).toContain('mix(0.06, 0.12, liquidPresence)')
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
        material: { uniforms: { uPointerVelocity: { value: { x: number; y: number } } } }
      }>
    }
    const firstVelocity = firstScene.children[0].material.uniforms.uPointerVelocity.value
    const stableDirection = { x: firstVelocity.x, y: firstVelocity.y }

    const [secondInteractionFrame] = callbacks.values()
    callbacks.clear()
    secondInteractionFrame(pointerMove.timeStamp + 300)
    const secondScene = render.mock.calls.at(-1)?.[0] as unknown as {
      children: Array<{
        material: { uniforms: { uPointerVelocity: { value: { x: number; y: number } } } }
      }>
    }
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
})
