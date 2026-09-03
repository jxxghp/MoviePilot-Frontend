import { useAvailableHeight } from '@/composables/useAvailableHeight'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pwaMocks = vi.hoisted(() => ({
  appMode: undefined as { value: boolean } | undefined,
}))

vi.mock('@/composables/usePWA', async () => {
  const { ref } = await import('vue')

  pwaMocks.appMode ??= ref(true)

  return {
    usePWA: () => ({ appMode: pwaMocks.appMode }),
  }
})

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

describe('useAvailableHeight', () => {
  let footerHeight = 72

  beforeEach(() => {
    ResizeObserverMock.instances = []
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.stubGlobal('innerHeight', 800)

    const layout = document.createElement('main')
    layout.className = 'layout-page-content'
    layout.style.paddingBlock = '72px 24px'
    document.body.append(layout)

    const footer = document.createElement('footer')
    footer.className = 'footer-nav-container'
    Object.defineProperty(footer, 'offsetHeight', { get: () => footerHeight })
    document.body.append(footer)
  })

  afterEach(() => {
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  })

  it('remeasures available space when a late Dock accessory changes Footer height', async () => {
    const harness = defineComponent({
      setup() {
        return useAvailableHeight(100, 300)
      },
      render: () => h('div'),
    })
    const wrapper = mount(harness)

    await nextTick()
    await nextTick()

    expect(wrapper.vm.availableHeight).toBe(532)
    const observer = ResizeObserverMock.instances.at(-1)
    expect(observer?.targets).toContain(document.querySelector('.footer-nav-container'))

    footerHeight = 124
    observer?.trigger()
    await nextTick()

    expect(wrapper.vm.availableHeight).toBe(480)
    wrapper.unmount()
    expect(observer?.targets.size).toBe(0)
  })
})
