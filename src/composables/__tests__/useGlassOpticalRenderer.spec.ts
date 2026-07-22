import { containsGlassOpticalSurface } from '@/composables/useGlassOpticalRenderer'
import { describe, expect, it } from 'vitest'

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
})
