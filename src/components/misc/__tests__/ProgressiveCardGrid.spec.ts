import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { render, waitFor } from '@testing-library/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('ProgressiveCardGrid scroll target lifecycle', () => {
  afterEach(() => {
    document.documentElement.classList.remove('v-overlay-scroll-blocked')
  })

  it('recomputes the scroll target after an overlay unlocks', async () => {
    const scrollParent = document.createElement('div')
    const addScrollListener = vi.spyOn(scrollParent, 'addEventListener')
    scrollParent.style.overflowY = 'hidden'
    document.body.append(scrollParent)
    document.documentElement.classList.add('v-overlay-scroll-blocked')

    render(ProgressiveCardGrid, {
      container: scrollParent,
      props: {
        items: [{ id: 1 }],
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: {
        default: '<div>item</div>',
      },
    })

    expect(addScrollListener).not.toHaveBeenCalledWith('scroll', expect.any(Function), expect.anything())

    scrollParent.style.overflowY = 'auto'
    document.documentElement.classList.remove('v-overlay-scroll-blocked')

    await waitFor(() => {
      expect(addScrollListener).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })
    })
  })
})
