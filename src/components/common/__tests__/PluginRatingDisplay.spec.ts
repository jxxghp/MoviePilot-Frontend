import PluginRatingDisplay from '@/components/common/PluginRatingDisplay.vue'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

describe('PluginRatingDisplay', () => {
  it('rounds the visual stars to half increments while keeping the exact score text', async () => {
    const { container } = await renderWithProviders(PluginRatingDisplay, {
      props: {
        rating: 4.3,
        count: 12,
      },
    })

    expect(container.querySelectorAll('[data-rating-icon="mdi-star"]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-rating-icon="mdi-star-half-full"]')).toHaveLength(1)
    expect(container.querySelector('[aria-label="4.3 / 5"]')).toHaveTextContent('4.3(12)')
  })
})
