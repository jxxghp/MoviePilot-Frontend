import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { render, waitFor } from '@testing-library/vue'
import { nextTick } from 'vue'
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

  it('exposes the complete virtual track as a layout size source', () => {
    const { container } = render(ProgressiveCardGrid, {
      props: {
        items: [{ id: 1 }],
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: {
        default: '<div>item</div>',
      },
    })

    expect(container.querySelector('.progressive-card-grid__track')).toHaveAttribute('data-layout-size-source')
  })
})

describe('ProgressiveCardGrid mount scheduling', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mounts an appended visible range in frame-bounded batches', async () => {
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
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(100)

    const initialItems = Array.from({ length: 8 }, (_, id) => ({ id }))
    const { container, rerender } = render(ProgressiveCardGrid, {
      props: {
        batchSize: 4,
        columns: 4,
        estimatedItemHeight: 100,
        gap: 0,
        initialCount: 4,
        items: initialItems,
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: {
        default: '<div>item</div>',
      },
    })

    const flushFrame = async () => {
      const frameCallbacks = [...callbacks.values()]
      callbacks.clear()
      frameCallbacks.forEach(callback => callback(performance.now()))
      await nextTick()
    }

    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(4)
    expect(container.querySelector('.progressive-card-grid__spacer')).toHaveStyle({ blockSize: '100px' })
    await flushFrame()
    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(8)

    await rerender({
      batchSize: 4,
      columns: 4,
      estimatedItemHeight: 100,
      gap: 0,
      initialCount: 4,
      items: Array.from({ length: 20 }, (_, id) => ({ id })),
      getItemKey: (item: { id: number }) => item.id,
    })

    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(8)
    expect(container.querySelector('.progressive-card-grid__spacer')).toHaveStyle({ blockSize: '300px' })
    await flushFrame()
    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(12)
    await flushFrame()
    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(16)
  })

  it('resets the staged window around the viewport after forward and reverse jumps', async () => {
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    let scrollOffset = 0
    const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frameId += 1
      callbacks.set(frameId, callback)

      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
      callbacks.delete(id)
    })
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(100)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains('progressive-card-grid__track')) {
        return getBoundingClientRect.call(this)
      }

      return {
        bottom: 2500 - scrollOffset,
        height: 2500,
        left: 0,
        right: 400,
        toJSON: () => ({}),
        top: -scrollOffset,
        width: 400,
        x: 0,
        y: -scrollOffset,
      }
    })

    const { container } = render(ProgressiveCardGrid, {
      props: {
        batchSize: 4,
        columns: 4,
        estimatedItemHeight: 100,
        gap: 0,
        initialCount: 4,
        items: Array.from({ length: 100 }, (_, id) => ({ id })),
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: {
        default: '<div>item</div>',
      },
    })

    const flushFrame = async () => {
      const frameCallbacks = [...callbacks.values()]
      callbacks.clear()
      frameCallbacks.forEach(callback => callback(performance.now()))
      await nextTick()
    }
    const renderedIndices = () =>
      Array.from(container.querySelectorAll('[data-progressive-grid-index]'), element =>
        Number(element.getAttribute('data-progressive-grid-index')),
      )

    await flushFrame()
    scrollOffset = 2000
    window.dispatchEvent(new Event('scroll'))
    await flushFrame()
    expect(renderedIndices().length).toBeLessThanOrEqual(12)
    expect(renderedIndices()).toEqual(expect.arrayContaining([80, 81, 82, 83]))

    scrollOffset = 0
    window.dispatchEvent(new Event('scroll'))
    await flushFrame()
    expect(renderedIndices().length).toBeLessThanOrEqual(12)
    expect(renderedIndices()).toEqual(expect.arrayContaining([0, 1, 2, 3]))
  })

  it('mounts one complete overscan row when the column count exceeds the batch size', async () => {
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
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(99)

    const { container } = render(ProgressiveCardGrid, {
      props: {
        batchSize: 6,
        columns: 9,
        estimatedItemHeight: 100,
        gap: 0,
        initialCount: 6,
        items: Array.from({ length: 100 }, (_, id) => ({ id })),
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: {
        default: '<div>item</div>',
      },
    })

    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(9)
    const frameCallbacks = [...callbacks.values()]
    callbacks.clear()
    frameCallbacks.forEach(callback => callback(performance.now()))
    await nextTick()

    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(18)
  })
})
