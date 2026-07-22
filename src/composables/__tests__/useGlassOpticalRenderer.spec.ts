import {
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

class ResizeObserverMock {
  disconnect() {}
  observe() {}
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  vi.stubGlobal('WebGLRenderingContext', class {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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
