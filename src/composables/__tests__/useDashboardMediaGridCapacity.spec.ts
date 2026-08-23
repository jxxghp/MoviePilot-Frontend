import { useDashboardMediaGridCapacity } from '@/composables/useDashboardMediaGridCapacity'
import { fireEvent, render, screen } from '@testing-library/vue'
import { defineComponent, nextTick, ref, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

class ResizeObserverMock implements ResizeObserver {
  static instances: ResizeObserverMock[] = []

  readonly targets = new Set<Element>()
  readonly disconnect = vi.fn(() => this.targets.clear())
  readonly observe = vi.fn((target: Element) => this.targets.add(target))
  readonly unobserve = vi.fn((target: Element) => this.targets.delete(target))

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this)
  }

  trigger() {
    this.callback([], this)
  }
}

interface CapacityHarnessOptions {
  contentSelector?: string
  horizontalPadding?: number
  maxCount?: number
  minItemWidth: number
  rows?: Ref<number>
}

function createFrameHarness() {
  const callbacks = new Map<number, FrameRequestCallback>()
  let nextFrameId = 0

  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    nextFrameId += 1
    callbacks.set(nextFrameId, callback)
    return nextFrameId
  })
  const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(frameId => {
    callbacks.delete(frameId)
  })

  return {
    callbacks,
    cancelFrame,
    flush() {
      const queuedCallbacks = [...callbacks.values()]
      callbacks.clear()
      queuedCallbacks.forEach(callback => callback(performance.now()))
    },
  }
}

function renderCapacityHarness(options: CapacityHarnessOptions) {
  let capacity!: ReturnType<typeof useDashboardMediaGridCapacity>

  const Harness = defineComponent({
    setup() {
      capacity = useDashboardMediaGridCapacity(options)

      return {
        columnCount: capacity.columnCount,
        containerRef: capacity.containerRef,
        itemCount: capacity.itemCount,
      }
    },
    template: `
      <div ref="containerRef" data-testid="container">
        <div class="dashboard-media-content" data-testid="content" />
        <span data-testid="columns">{{ columnCount }}</span>
        <span data-testid="items">{{ itemCount }}</span>
      </div>
    `,
  })

  const rendered = render(Harness)

  return { capacity, ...rendered }
}

function setClientWidth(element: HTMLElement, width: number) {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: width })
}

function setBoundingWidth(element: HTMLElement, width: number) {
  element.getBoundingClientRect = () =>
    ({
      bottom: 0,
      height: 0,
      left: 0,
      right: width,
      toJSON: () => ({}),
      top: 0,
      width,
      x: 0,
      y: 0,
    }) as DOMRect
}

async function settleInitialMeasurement(frames: ReturnType<typeof createFrameHarness>) {
  await nextTick()
  frames.flush()
  await nextTick()
}

describe('dashboard media grid capacity', () => {
  beforeEach(() => {
    ResizeObserverMock.instances = []
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  })

  it('uses the selected content box and responsive row count to calculate the request size', async () => {
    const frames = createFrameHarness()
    const rows = ref(2)
    const { capacity } = renderCapacityHarness({
      contentSelector: '.dashboard-media-content',
      maxCount: 10,
      minItemWidth: 144,
      rows,
    })
    const content = screen.getByTestId('content')
    setClientWidth(content, 760)
    content.style.paddingLeft = '20px'
    content.style.paddingRight = '20px'

    capacity.refreshCapacity()
    await nextTick()
    expect(screen.getByTestId('columns')).toHaveTextContent('4')
    expect(screen.getByTestId('items')).toHaveTextContent('8')

    rows.value = 3
    await nextTick()
    expect(screen.getByTestId('items')).toHaveTextContent('10')

    await settleInitialMeasurement(frames)
  })

  it('falls back to the host width and subtracts the declared horizontal padding', async () => {
    const frames = createFrameHarness()
    const { capacity } = renderCapacityHarness({ horizontalPadding: 40, minItemWidth: 240 })
    const container = screen.getByTestId('container')
    setBoundingWidth(container, 760)

    capacity.refreshCapacity()
    await nextTick()

    expect(screen.getByTestId('columns')).toHaveTextContent('2')
    expect(screen.getByTestId('items')).toHaveTextContent('4')
    await settleInitialMeasurement(frames)
  })

  it('coalesces observer and window resize notifications into one measurement frame', async () => {
    const frames = createFrameHarness()
    renderCapacityHarness({ minItemWidth: 200 })
    const container = screen.getByTestId('container')
    setBoundingWidth(container, 640)
    await settleInitialMeasurement(frames)
    const observer = ResizeObserverMock.instances.at(-1)
    expect(observer?.targets.has(container)).toBe(true)

    observer?.trigger()
    window.dispatchEvent(new Event('resize'))

    expect(frames.callbacks).toHaveLength(1)
    frames.flush()
    await nextTick()
    expect(screen.getByTestId('columns')).toHaveTextContent('3')
    expect(screen.getByTestId('items')).toHaveTextContent('6')
  })

  it('refreshes after KeepAlive activation and releases observers, listeners, and queued frames on unmount', async () => {
    const frames = createFrameHarness()
    let capacity!: ReturnType<typeof useDashboardMediaGridCapacity>
    const Card = defineComponent({
      setup() {
        capacity = useDashboardMediaGridCapacity({ minItemWidth: 200 })
        return { containerRef: capacity.containerRef, itemCount: capacity.itemCount }
      },
      template: '<div ref="containerRef" data-testid="container">{{ itemCount }}</div>',
    })
    const Harness = defineComponent({
      components: { Card },
      setup() {
        const active = ref(true)
        return { active }
      },
      template: `
        <button type="button" @click="active = false">停用</button>
        <button type="button" @click="active = true">启用</button>
        <KeepAlive><Card v-if="active" /></KeepAlive>
      `,
    })
    const rendered = render(Harness)
    const container = screen.getByTestId('container')
    setBoundingWidth(container, 432)
    capacity.refreshCapacity()
    await nextTick()
    expect(container).toHaveTextContent('4')

    await fireEvent.click(screen.getByRole('button', { name: '停用' }))
    setBoundingWidth(container, 648)
    await fireEvent.click(screen.getByRole('button', { name: '启用' }))
    await nextTick()
    expect(screen.getByTestId('container')).toHaveTextContent('6')

    frames.flush()
    const observer = ResizeObserverMock.instances.at(-1)
    observer?.trigger()
    const queuedFrameId = [...frames.callbacks.keys()][0]
    rendered.unmount()

    expect(observer?.disconnect).toHaveBeenCalledOnce()
    expect(frames.cancelFrame).toHaveBeenCalledWith(queuedFrameId)
    expect(frames.callbacks).toHaveLength(0)

    window.dispatchEvent(new Event('resize'))
    expect(frames.callbacks).toHaveLength(0)
  })
})
