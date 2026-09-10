import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { render, waitFor } from '@testing-library/vue'
import { h, nextTick } from 'vue'
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

  it('allows an overlay consumer to opt into the virtual window', async () => {
    const items = Array.from({ length: 100 }, (_, id) => ({ id }))
    const host = document.createElement('div')
    host.className = 'v-overlay'
    document.body.append(host)
    const { container } = render(ProgressiveCardGrid, {
      container: host,
      props: {
        columns: 1,
        estimatedItemHeight: 220,
        initialCount: 6,
        batchSize: 6,
        virtualizeInOverlay: true,
        items,
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: {
        default: '<div>item</div>',
      },
    })

    await waitFor(() => {
      const count = container.querySelectorAll('[data-progressive-grid-index]').length
      expect(count).toBeGreaterThan(0)
      expect(count).toBeLessThan(items.length)
    })

    container.querySelector('.progressive-card-grid')?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    await waitFor(() => {
      expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(items.length)
    })
    host.remove()
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

  it('does not rerender settled cells while scrolling inside the same row range', async () => {
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    let scrollOffset = 0
    const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callbacks.set(++frameId, callback)
      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => callbacks.delete(id))
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(80)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('progressive-card-grid__track')
        ? new DOMRect(0, -scrollOffset, 400, 2500)
        : getBoundingClientRect.call(this)
    })
    const items = Array.from({ length: 100 }, (_, id) => ({ id, title: `item-${id}` }))
    const slot = vi.fn(({ item }: { item: { id: number; title: string } }) => h('div', item.title))
    const { container, rerender } = render(ProgressiveCardGrid, {
      props: {
        columns: 4,
        estimatedItemHeight: 100,
        gap: 0,
        initialCount: 4,
        batchSize: 4,
        items,
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: { default: slot },
    })
    const flushFrame = async () => {
      for (const id of [...callbacks.keys()]) {
        const callback = callbacks.get(id)
        if (!callback) continue
        callbacks.delete(id)
        callback(performance.now())
        await nextTick()
      }
    }
    for (let frame = 0; frame < 10 && callbacks.size; frame++) await flushFrame()
    expect(callbacks.size).toBe(0)
    const nodes = [...container.querySelectorAll('[data-progressive-grid-index]')]
    expect(nodes.length).toBe(20)
    slot.mockClear()

    for (const offset of [1, 5, 10, 15, 19]) {
      scrollOffset = offset
      window.dispatchEvent(new Event('scroll'))
      await flushFrame()
      const currentNodes = [...container.querySelectorAll('[data-progressive-grid-index]')]
      expect(currentNodes).toHaveLength(nodes.length)
      expect(currentNodes.every((node, index) => node === nodes[index])).toBe(true)
    }

    expect(slot).not.toHaveBeenCalled()

    scrollOffset = 21
    window.dispatchEvent(new Event('scroll'))
    await flushFrame()
    // 新的 overscan 行尚未提交时，已挂载范围不变，无需重新执行现有 slot。
    expect(slot).not.toHaveBeenCalled()
    for (let frame = 0; frame < 10 && callbacks.size; frame++) await flushFrame()
    expect(slot).toHaveBeenCalled()
    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(24)

    scrollOffset = 1
    window.dispatchEvent(new Event('scroll'))
    await flushFrame()
    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(20)
    expect(container.querySelector('[data-progressive-grid-index="0"]')).toBe(nodes[0])

    // 范围复用只约束窗口边界，同 key 的业务对象更新仍需传递到 slot。
    await rerender({ items: items.map(item => ({ ...item, title: `updated-${item.id}` })) })
    expect(container.querySelector('[data-progressive-grid-index="0"]')).toBe(nodes[0])
    expect(nodes[0]).toHaveTextContent('updated-0')

    // 可见行边界未变时，高度变化仍须更新列表的完整占位。
    await rerender({ estimatedItemHeight: 120 })
    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(20)
    expect(container.querySelector('.progressive-card-grid__spacer')).toHaveStyle({ blockSize: '2400px' })
  })

  it('keeps settled slots stable across visible rows covered by the same mounted range', async () => {
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    let scrollOffset = 0
    const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callbacks.set(++frameId, callback)
      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => callbacks.delete(id))
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(80)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('progressive-card-grid__track')
        ? new DOMRect(0, -scrollOffset, 400, 500)
        : getBoundingClientRect.call(this)
    })
    const items = Array.from({ length: 20 }, (_, id) => ({ id, title: `item-${id}` }))
    const slot = vi.fn(({ item }: { item: { id: number; title: string } }) => h('div', item.title))
    const { container, rerender } = render(ProgressiveCardGrid, {
      props: {
        columns: 4,
        estimatedItemHeight: 100,
        gap: 0,
        initialCount: 4,
        batchSize: 4,
        items,
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: { default: slot },
    })
    const settleFrames = async () => {
      for (let frame = 0; frame < 10 && callbacks.size; frame++) {
        for (const id of [...callbacks.keys()]) {
          const callback = callbacks.get(id)
          if (!callback) continue
          callbacks.delete(id)
          callback(performance.now())
          await nextTick()
        }
      }
      expect(callbacks.size).toBe(0)
    }
    await settleFrames()
    const nodes = [...container.querySelectorAll('[data-progressive-grid-index]')]
    expect(nodes).toHaveLength(20)
    slot.mockClear()

    for (const offset of [21, 101, 201, 101, 0]) {
      scrollOffset = offset
      window.dispatchEvent(new Event('scroll'))
      await settleFrames()
      const currentNodes = [...container.querySelectorAll('[data-progressive-grid-index]')]
      expect(currentNodes).toHaveLength(nodes.length)
      expect(currentNodes.every((node, index) => node === nodes[index])).toBe(true)
    }
    expect(slot).not.toHaveBeenCalled()

    await rerender({ items: items.map(item => ({ ...item, title: `updated-${item.id}` })) })
    expect(nodes[0]).toHaveTextContent('updated-0')
    expect(container.querySelector('[data-progressive-grid-index="0"]')).toBe(nodes[0])
  })

  it('uses the mounted track width before the first layout frame can observe a single-column spacer', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    const clientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')!.get!
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('progressive-card-grid__track') ? 1178 : clientWidth.call(this)
    })
    const { container } = render(ProgressiveCardGrid, {
      props: {
        items: Array.from({ length: 8 }, (_, id) => ({ id })),
        minItemWidth: 240,
        estimatedItemHeight: 160,
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: { default: '<div>item</div>' },
    })

    await nextTick()
    expect(container.querySelector('.progressive-card-grid__grid')).toHaveStyle({
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    })
    expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(8)
    expect(container.querySelector('.progressive-card-grid__spacer')).toBeNull()
  })

  it('updates the initially measured columns when the parent later supplies a different width', async () => {
    const callbacks = new Map<number, FrameRequestCallback>()
    let frameId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callbacks.set(++frameId, callback)
      return frameId
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => callbacks.delete(id))
    let width = 1178
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('progressive-card-grid__track') ? width : 0
    })
    const { container } = render(ProgressiveCardGrid, {
      props: { items: Array.from({ length: 8 }, (_, id) => id), minItemWidth: 240, estimatedItemHeight: 160 },
      slots: { default: '<div>item</div>' },
    })
    await nextTick()
    expect(container.querySelector('.progressive-card-grid__grid')).toHaveStyle({
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    })

    for (const [nextWidth, columns] of [
      [752, 3],
      [1178, 4],
    ]) {
      width = nextWidth
      window.dispatchEvent(new Event('resize'))
      const pending = [...callbacks.values()]
      callbacks.clear()
      pending.forEach(callback => callback(performance.now()))
      await nextTick()
      expect(container.querySelector('.progressive-card-grid__grid')).toHaveStyle({
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      })
      expect(container.querySelectorAll('[data-progressive-grid-index]')).toHaveLength(8)
    }
  })

  it('does not guess the viewport width for an initially unmeasurable track', async () => {
    const callbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callbacks.push(callback)
      return callbacks.length
    })
    let width = 0
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
      return this.classList.contains('progressive-card-grid__track') ? width : 0
    })
    const { container } = render(ProgressiveCardGrid, {
      props: {
        items: Array.from({ length: 8 }, (_, id) => ({ id })),
        minItemWidth: 240,
        estimatedItemHeight: 160,
        getItemKey: (item: { id: number }) => item.id,
      },
      slots: { default: '<div>item</div>' },
    })
    await nextTick()
    expect(container.querySelector('.progressive-card-grid__grid')).toHaveStyle({
      gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
    })
    width = 752
    callbacks.splice(0).forEach(callback => callback(performance.now()))
    await nextTick()
    expect(container.querySelector('.progressive-card-grid__grid')).toHaveStyle({
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    })
  })

  it('preserves explicit columns and overlay-lock scheduling during initial width measurement', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1178)
    const { container, unmount } = render(ProgressiveCardGrid, {
      props: { items: [1, 2, 3, 4], columns: 2 },
      slots: { default: '<div>item</div>' },
    })
    await nextTick()
    expect(container.querySelector('.progressive-card-grid__grid')).toHaveStyle({
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    })
    unmount()
    document.documentElement.classList.add('v-overlay-scroll-blocked')
    try {
      const locked = render(ProgressiveCardGrid, {
        props: { items: [1, 2, 3, 4], minItemWidth: 240 },
        slots: { default: '<div>item</div>' },
      })
      await nextTick()
      expect(locked.container.querySelector('.progressive-card-grid__grid')).toHaveStyle({
        gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
      })
    } finally {
      document.documentElement.classList.remove('v-overlay-scroll-blocked')
    }
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
