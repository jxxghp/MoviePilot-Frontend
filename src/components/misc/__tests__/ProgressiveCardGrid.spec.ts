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

  it('reveals a target below the fixed navbar on the current viewport', async () => {
    const navbar = document.createElement('header')
    navbar.className = 'layout-navbar'
    navbar.style.position = 'fixed'
    navbar.getBoundingClientRect = () =>
      ({
        bottom: 80,
        height: 80,
        left: 0,
        right: 1024,
        top: 0,
        width: 1024,
      }) as DOMRect
    document.body.append(navbar)

    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(4000)
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    render(ProgressiveCardGrid, {
      props: {
        columns: 1,
        estimatedItemHeight: 100,
        items: Array.from({ length: 10 }, (_, id) => ({ id })),
        scrollToIndex: 3,
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: {
        default: '<div>item</div>',
      },
    })

    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ behavior: 'auto', top: 252 }))
    navbar.remove()
  })

  it('keeps a target near the end of a list within the maximum scroll position', async () => {
    const navbar = document.createElement('header')
    navbar.className = 'layout-navbar'
    navbar.style.position = 'fixed'
    navbar.getBoundingClientRect = () =>
      ({
        bottom: 112,
        height: 112,
        left: 0,
        right: 1024,
        top: 0,
        width: 1024,
      }) as DOMRect
    document.body.append(navbar)

    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(1500)
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    render(ProgressiveCardGrid, {
      props: {
        columns: 1,
        estimatedItemHeight: 100,
        items: Array.from({ length: 10 }, (_, id) => ({ id })),
        scrollToIndex: 9,
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: {
        default: '<div>item</div>',
      },
    })

    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ behavior: 'auto', top: 700 }))
    navbar.remove()
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

  it('keeps the rendered window when the same items are reordered', async () => {
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

    const flushFrame = async () => {
      const frameCallbacks = [...callbacks.values()]
      callbacks.clear()
      frameCallbacks.forEach(callback => callback(performance.now()))
      await nextTick()
    }

    const items = Array.from({ length: 100 }, (_, id) => ({ id }))
    const { container, rerender } = render(ProgressiveCardGrid, {
      props: {
        batchSize: 4,
        columns: 4,
        estimatedItemHeight: 100,
        gap: 0,
        initialCount: 4,
        items,
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: {
        default: '<div>item</div>',
      },
    })

    await flushFrame()
    const renderedBefore = container.querySelectorAll('[data-progressive-grid-index]').length
    expect(renderedBefore).toBeGreaterThan(0)

    await rerender({
      batchSize: 4,
      columns: 4,
      estimatedItemHeight: 100,
      gap: 0,
      initialCount: 4,
      items: [...items].reverse(),
      getItemKey: (item: { id: number }) => item.id,
    })

    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(renderedBefore)
  })

  it('keeps existing nodes when items are truncated from the end', async () => {
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

    const flushFrame = async () => {
      const frameCallbacks = [...callbacks.values()]
      callbacks.clear()
      frameCallbacks.forEach(callback => callback(performance.now()))
      await nextTick()
    }

    const items = Array.from({ length: 20 }, (_, id) => ({ id }))
    const { container, rerender } = render(ProgressiveCardGrid, {
      props: {
        batchSize: 4,
        columns: 4,
        estimatedItemHeight: 100,
        gap: 0,
        initialCount: 4,
        items,
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: {
        default: '<div>item</div>',
      },
    })

    await flushFrame()
    await flushFrame()
    await flushFrame()
    const nodesBefore = Array.from(container.querySelectorAll('[data-progressive-grid-index]'))
    expect(nodesBefore).toHaveLength(16)

    await rerender({
      batchSize: 4,
      columns: 4,
      estimatedItemHeight: 100,
      gap: 0,
      initialCount: 4,
      items: items.slice(0, 16),
      getItemKey: (item: { id: number }) => item.id,
    })

    const nodesAfter = Array.from(container.querySelectorAll('[data-progressive-grid-index]'))
    expect(nodesAfter).toHaveLength(16)
    expect(nodesAfter.every((node, index) => node === nodesBefore[index])).toBe(true)

    await rerender({
      batchSize: 4,
      columns: 4,
      estimatedItemHeight: 100,
      gap: 0,
      initialCount: 4,
      items: items.slice(0, 4),
      getItemKey: (item: { id: number }) => item.id,
    })
    const truncatedCount = container.querySelectorAll('[data-progressive-grid-index]').length
    expect(truncatedCount).toBeLessThanOrEqual(8)

    await rerender({
      batchSize: 4,
      columns: 4,
      estimatedItemHeight: 100,
      gap: 0,
      initialCount: 4,
      items,
      getItemKey: (item: { id: number }) => item.id,
    })
    expect(container.querySelectorAll('[data-progressive-grid-index]').length).toBeLessThanOrEqual(truncatedCount + 4)
    await flushFrame()
    expect(container.querySelectorAll('[data-progressive-grid-index]').length).toBe(truncatedCount + 8)
  })
})
