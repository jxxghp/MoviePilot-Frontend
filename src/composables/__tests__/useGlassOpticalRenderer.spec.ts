import {
  containsGlassOpticalSurface,
  setGlassRendererState,
  type GlassRendererState,
} from '@/composables/useGlassOpticalRenderer'
import { ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
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
})
