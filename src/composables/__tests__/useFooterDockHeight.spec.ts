import { useFooterDockHeight } from '@/composables/useFooterDockHeight'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class ResizeObserverMock implements ResizeObserver {
  static instances: ResizeObserverMock[] = []

  readonly targets = new Set<Element>()

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverMock.instances.push(this)
  }

  observe(target: Element) {
    this.targets.add(target)
  }

  unobserve(target: Element) {
    this.targets.delete(target)
  }

  disconnect() {
    this.targets.clear()
  }

  trigger() {
    const entries = [...this.targets].map(target => ({ target }) as ResizeObserverEntry)
    this.callback(entries, this)
  }
}

describe('useFooterDockHeight', () => {
  let footerHeight = 72

  beforeEach(() => {
    ResizeObserverMock.instances = []
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)

    const footer = document.createElement('footer')
    footer.className = 'footer-nav-container'
    Object.defineProperty(footer, 'offsetHeight', { get: () => footerHeight })
    document.body.append(footer)
  })

  afterEach(() => {
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  })

  it('tracks the visible Footer height and releases the observer on unmount', async () => {
    const harness = defineComponent({
      setup() {
        return useFooterDockHeight()
      },
      render: () => h('div'),
    })
    const wrapper = mount(harness)

    await nextTick()
    await nextTick()

    expect(wrapper.vm.footerDockHeight).toBe(72)
    const observer = ResizeObserverMock.instances.at(-1)
    expect(observer?.targets).toContain(document.querySelector('.footer-nav-container'))

    footerHeight = 124
    observer?.trigger()
    await nextTick()

    expect(wrapper.vm.footerDockHeight).toBe(124)
    wrapper.unmount()
    expect(observer?.targets.size).toBe(0)
  })

  it('falls back to null after the Footer is removed', async () => {
    const harness = defineComponent({
      setup() {
        return useFooterDockHeight()
      },
      render: () => h('div'),
    })
    const wrapper = mount(harness)

    await nextTick()
    await nextTick()
    document.querySelector('.footer-nav-container')?.remove()
    await nextTick()
    await Promise.resolve()

    expect(wrapper.vm.footerDockHeight).toBeNull()
    wrapper.unmount()
  })
})
