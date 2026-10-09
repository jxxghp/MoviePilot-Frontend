import { useFileBrowserHeight } from '@/composables/useFileBrowserHeight'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/usePWA', () => ({ usePWA: () => ({ appMode: ref(false) }) }))

/** 可控的布局观察器，验证变化合并与卸载释放。 */
class LayoutObserver implements ResizeObserver {
  static instances: LayoutObserver[] = []
  readonly targets = new Set<Element>()
  /** 保存通知入口，供测试模拟实际导航高度变化。 */
  constructor(private readonly callback: ResizeObserverCallback) {
    LayoutObserver.instances.push(this)
  }
  /** 注册要监听的布局元素。 */
  observe(target: Element) {
    this.targets.add(target)
  }
  /** 取消单一元素监听。 */
  unobserve(target: Element) {
    this.targets.delete(target)
  }
  /** 释放所有监听。 */
  disconnect() {
    this.targets.clear()
  }
  /** 发出一轮实际尺寸变更通知。 */
  trigger() {
    this.callback([], this)
  }
}

/** 为 JSDOM 提供真实浏览器的可见矩形。 */
function geometry(element: Element, top: number, height = 72) {
  vi.spyOn(element, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ top, height } as DOMRect)
}

/** 在真实 Shell 父容器内挂载高度计算器。 */
function mountHeight(padding = 24) {
  const layout = document.createElement('main')
  layout.className = 'layout-page-content'
  layout.style.paddingBottom = `${padding}px`
  layout.style.setProperty('--layout-footer-dock-height', '72px')
  document.body.append(layout)
  const wrapper = mount(
    defineComponent({
      setup() {
        const target = ref<HTMLElement | null>(null)
        return { target, ...useFileBrowserHeight(target) }
      },
      render() {
        return h('div', { ref: 'target' })
      },
    }),
    { attachTo: layout },
  )
  geometry(wrapper.element, 72)
  return wrapper
}

describe('file workspace available height', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    LayoutObserver.instances = []
    vi.stubGlobal('ResizeObserver', LayoutObserver)
    vi.stubGlobal('innerHeight', 844)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 16))
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  })
  afterEach(() => {
    document.body.replaceChildren()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
  it('subtracts page spacing once, then deducts the real PWA dock without double reservation', async () => {
    const wrapper = mountHeight()
    await nextTick()
    vi.advanceTimersByTime(20)
    expect(wrapper.vm.height).toBe(748)
    const dock = document.createElement('footer')
    dock.className = 'footer-nav-container'
    geometry(dock, 772)
    document.body.append(dock)
    const layout = wrapper.element.closest('.layout-page-content') as HTMLElement
    layout.style.paddingBottom = '96px'
    await nextTick()
    LayoutObserver.instances[0].trigger()
    vi.advanceTimersByTime(20)
    expect(wrapper.vm.height).toBe(676)
    wrapper.unmount()
    expect(LayoutObserver.instances[0].targets.size).toBe(0)
  })
  it('reserves the theme surface border and does not grow when the document has scrolled', async () => {
    const wrapper = mountHeight()
    wrapper.element.classList.add('file-browser-view')
    ;(wrapper.element as HTMLElement).style.borderBottomWidth = '2px'
    vi.stubGlobal('scrollY', 3)
    await nextTick()
    vi.advanceTimersByTime(20)
    expect(wrapper.vm.height).toBe(743)
    wrapper.unmount()
  })
  it('uses the shortened visual viewport for a keyboard and clamps tiny screens to zero', async () => {
    const viewport = Object.assign(new EventTarget(), { height: 420, offsetTop: 0 })
    vi.stubGlobal('visualViewport', viewport)
    const wrapper = mountHeight()
    await nextTick()
    vi.advanceTimersByTime(20)
    expect(wrapper.vm.height).toBe(324)
    viewport.height = 80
    viewport.dispatchEvent(new Event('resize'))
    vi.advanceTimersByTime(20)
    expect(wrapper.vm.height).toBe(0)
    wrapper.unmount()
    viewport.height = 800
    viewport.dispatchEvent(new Event('resize'))
    expect(vi.getTimerCount()).toBe(0)
  })
})
