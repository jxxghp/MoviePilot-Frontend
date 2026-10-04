import VirtualSlideView from '@/components/slide/VirtualSlideView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vuetify', async importOriginal => {
  const actual = await importOriginal<typeof import('vuetify')>()
  return {
    ...actual,
    useDisplay: () => ({ mobile: { value: false } }),
  }
})

let resizeCallbacks: ResizeObserverCallback[] = []
let resizeObservers: ResizeObserverMock[] = []
let originalRootFontSize = ''

/** 保留布局变化回调，供测试模拟字体缩放引发的容器尺寸变化。 */
class ResizeObserverMock implements ResizeObserver {
  readonly disconnect = vi.fn()
  readonly observe = vi.fn()
  readonly unobserve = vi.fn()

  /** 记录观察实例及其回调，避免依赖 jsdom 不支持的真实布局。 */
  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback)
    resizeObservers.push(this)
  }
}

const items = Array.from({ length: 20 }, (_, index) => ({ id: index, label: `项目 ${index}` }))

/** 挂载带固定数据的轨道，并允许覆盖尺寸契约。 */
async function renderSlide(overrides: Record<string, unknown> = {}) {
  return renderWithProviders(VirtualSlideView, {
    props: {
      getItemKey: (item: { id: number }) => item.id,
      itemGap: 10,
      itemWidth: 100,
      items,
      overscanItems: 1,
      ...overrides,
    },
    slots: {
      empty: '<p>没有内容</p>',
      item: '<template #item="{ item, index }"><article :data-index="index">{{ item.label }}</article></template>',
      loading: '<p>正在加载</p>',
      title: '<h2>测试轨道</h2>',
    },
  })
}

/** 为 jsdom 提供浏览器实际测量得到的滚动区域尺寸。 */
function configureScroller(container: Element, clientWidth = 220, scrollWidth = 2190) {
  const scroller = container.querySelector<HTMLElement>('.slider-content')
  expect(scroller).not.toBeNull()
  Object.defineProperties(scroller, {
    clientWidth: { configurable: true, value: clientWidth },
    scrollWidth: { configurable: true, value: scrollWidth },
  })
  return scroller as HTMLElement
}

describe('VirtualSlideView', () => {
  beforeEach(() => {
    originalRootFontSize = document.documentElement.style.fontSize
    resizeCallbacks = []
    resizeObservers = []
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(0)
        return 1
      }),
    )
  })

  afterEach(() => {
    document.documentElement.style.fontSize = originalRootFontSize
  })

  it('renders loading and empty slots without virtual content', async () => {
    const loading = await renderSlide({ loading: true })
    expect(screen.getByText('正在加载')).toBeInTheDocument()
    expect(loading.container.querySelector('.virtual-track')).not.toBeInTheDocument()
    loading.unmount()

    const empty = await renderSlide({ items: [] })
    expect(screen.getByText('没有内容')).toBeInTheDocument()
    expect(empty.container.querySelector('.virtual-track')).not.toBeInTheDocument()
  })

  it('keeps total width while moving the rendered range with scroll position', async () => {
    const { container } = await renderSlide()
    const scroller = configureScroller(container)
    resizeCallbacks[0]?.([], resizeObservers[0])

    await waitFor(() => expect(container.querySelectorAll('.virtual-slide-item')).toHaveLength(3))
    expect(container.querySelector<HTMLElement>('.virtual-track')).toHaveStyle({ width: '2190px' })
    expect(screen.getByText('项目 0')).toHaveAttribute('data-index', '0')
    expect(screen.getByText('项目 2')).toHaveAttribute('data-index', '2')

    scroller.scrollLeft = 550
    await fireEvent.scroll(scroller)

    await waitFor(() => expect(screen.getByText('项目 4')).toHaveAttribute('data-index', '4'))
    expect(screen.getByText('项目 7')).toHaveAttribute('data-index', '7')
    expect(container.querySelectorAll('.virtual-spacer')).toHaveLength(2)
    expect(container.querySelector('.nav-button-left')).toBeVisible()
  })

  it('uses the scaled poster width for default slots, spacers and page navigation', async () => {
    document.documentElement.style.fontSize = '20px'
    const { container } = await renderSlide({ itemWidth: undefined })
    const scroller = configureScroller(container, 380, 3790)
    const scrollTo = vi.fn()
    scroller.scrollTo = scrollTo
    resizeCallbacks[0]?.([], resizeObservers[0])

    await waitFor(() => expect(container.querySelectorAll('.virtual-slide-item')).toHaveLength(3))
    expect(container.querySelector('.virtual-slide-item')).toHaveStyle({ width: '180px' })
    expect(container.querySelector('.virtual-track')).toHaveStyle({ width: '3790px' })

    await fireEvent.click(container.querySelector('.nav-button-right') as HTMLElement)
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', left: 380, top: 0 })

    scroller.scrollLeft = 950
    await fireEvent.scroll(scroller)
    expect(screen.getByText('项目 4')).toHaveAttribute('data-index', '4')
    expect(screen.getByText('项目 7')).toHaveAttribute('data-index', '7')
    expect(container.querySelector('.virtual-spacer')).toHaveStyle({ width: '760px' })
  })

  it('remeasures rem widths after a font change and preserves explicit pixel widths', async () => {
    document.documentElement.style.fontSize = '16px'
    const { container, rerender } = await renderSlide({ itemWidth: undefined })
    configureScroller(container, 440)
    resizeCallbacks[0]?.([], resizeObservers[0])
    await waitFor(() => expect(container.querySelector('.virtual-slide-item')).toHaveStyle({ width: '144px' }))

    document.documentElement.style.fontSize = '24px'
    resizeCallbacks[0]?.([], resizeObservers[0])
    await waitFor(() => expect(container.querySelector('.virtual-slide-item')).toHaveStyle({ width: '216px' }))
    expect(container.querySelector('.virtual-track')).toHaveStyle({ width: '4510px' })

    await rerender({ itemWidth: 100, itemGap: 20 })
    await waitFor(() => expect(container.querySelector('.virtual-slide-item')).toHaveStyle({ width: '100px' }))
    expect(container.querySelector('.virtual-track')).toHaveStyle({ width: '2380px' })
  })

  it('scrolls one viewport smoothly and updates navigation state', async () => {
    vi.useFakeTimers()
    const { container } = await renderSlide()
    const scroller = configureScroller(container)
    const scrollTo = vi.fn(({ left }: ScrollToOptions) => {
      scroller.scrollLeft = left ?? 0
    })
    scroller.scrollTo = scrollTo as typeof scroller.scrollTo
    resizeCallbacks[0]?.([], resizeObservers[0])

    await fireEvent.click(container.querySelector('.nav-button-right') as HTMLElement)
    expect(scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', left: 220, top: 0 })
    expect(container.querySelector('.slider-container')).toHaveClass('is-scrolling')

    await fireEvent.scroll(scroller)
    await nextTick()
    scroller.scrollLeft = 1970
    await fireEvent.scroll(scroller)
    await nextTick()
    expect(container.querySelector('.nav-button-right')).not.toBeVisible()

    await fireEvent.click(container.querySelector('.nav-button-left') as HTMLElement)
    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: 'smooth', left: 1760, top: 0 })
    vi.advanceTimersByTime(1500)
    await Promise.resolve()
    expect(container.querySelector('.slider-container')).not.toHaveClass('is-scrolling')
  })

  it('restores the saved offset after KeepAlive activation and releases resources on unmount', async () => {
    const Harness = defineComponent({
      components: { VirtualSlideView },
      /** 提供可停用及激活的轨道以验证 KeepAlive 滚动位置恢复。 */
      setup() {
        const active = ref(true)
        return { active, items }
      },
      template: `
        <button type="button" @click="active = false">停用轨道</button>
        <button type="button" @click="active = true">启用轨道</button>
        <KeepAlive>
          <VirtualSlideView v-if="active" :items="items" :item-width="100" :item-gap="10" :overscan-items="1">
            <template #title><h2>测试轨道</h2></template>
            <template #item="{ item }"><article>{{ item.label }}</article></template>
          </VirtualSlideView>
        </KeepAlive>
      `,
    })
    const removeListener = vi.spyOn(window, 'removeEventListener')
    const { container, unmount } = await renderWithProviders(Harness)
    let scroller = configureScroller(container)
    resizeCallbacks[0]?.([], resizeObservers[0])
    scroller.scrollLeft = 440
    await fireEvent.scroll(scroller)

    await fireEvent.click(screen.getByRole('button', { name: '停用轨道' }))
    scroller.scrollLeft = 0
    await fireEvent.click(screen.getByRole('button', { name: '启用轨道' }))
    scroller = configureScroller(container)

    await waitFor(() => expect(scroller.scrollLeft).toBe(440))
    unmount()
    expect(resizeObservers[0]?.disconnect).toHaveBeenCalledOnce()
    expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function))
  })
})
