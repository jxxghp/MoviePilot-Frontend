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
    surface.className = 'dashboard-grid-item-content'

    expect(containsGlassOpticalSurface(surface)).toBe(true)
  })

  it('detects a target surface inside an asynchronously added subtree', () => {
    const wrapper = document.createElement('div')
    wrapper.innerHTML = '<div><section class="dashboard-grid-item-content"></section></div>'

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
    appendOpticalSurface('dashboard-grid-item-content', { height: 200, width: 350, x: 20, y: 120 })

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
})
