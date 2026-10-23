import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { footerDockGeometry, usePublishFooterDockGeometry } from '@/composables/useFooterDockGeometry'

/** 给元素指定视口矩形；width 为 0 的卡片模拟收起的附属按钮。 */
function placeAt(element: Element, x: number, y: number, width: number, height: number) {
  const rect = { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height, toJSON: () => ({}) }
  element.getBoundingClientRect = () => rect as DOMRect
  element.getClientRects = () => (width || height ? [rect] : []) as unknown as DOMRectList
}

const FooterProbe = defineComponent({
  setup() {
    const container = ref<HTMLElement | null>(null)
    const group = ref<HTMLElement | null>(null)
    usePublishFooterDockGeometry(container, group)
    return () =>
      h('div', { ref: container, 'data-probe': 'container' }, [
        h('div', { ref: group }, [
          h('div', { 'data-footer-nav-role': 'accessory' }),
          h('div', { 'data-footer-nav-role': 'primary' }),
        ]),
      ])
  },
})

async function flushFrame() {
  await nextTick()
  vi.runAllTimers()
}

describe('footer Dock geometry', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.documentElement.removeAttribute('data-agent-assistant-open')
  })

  it('publishes only visible cards and clears the area when hidden or unmounted', async () => {
    vi.useFakeTimers()
    const wrapper = mount(FooterProbe, { attachTo: document.body })
    const container = wrapper.find('[data-probe="container"]').element
    const [accessory, primary] = wrapper.findAll('[data-footer-nav-role]').map(item => item.element)
    placeAt(container, 0, 700, 400, 70)
    placeAt(primary, 80, 710, 240, 56)
    placeAt(accessory, 322, 714, 0, 48)

    window.dispatchEvent(new Event('resize'))
    await flushFrame()
    expect(footerDockGeometry.value).toEqual({
      bounds: { x: 80, y: 710, width: 240, height: 56 },
      items: [{ x: 80, y: 710, width: 240, height: 56 }],
    })

    // 附属按钮展开后按从左到右排列，外框覆盖两张卡片。
    placeAt(accessory, 322, 714, 48, 48)
    window.dispatchEvent(new Event('resize'))
    await flushFrame()
    expect(footerDockGeometry.value).toEqual({
      bounds: { x: 80, y: 710, width: 290, height: 56 },
      items: [
        { x: 80, y: 710, width: 240, height: 56 },
        { x: 322, y: 714, width: 48, height: 48 },
      ],
    })

    // 全屏助手面板打开时 Dock 被 visibility 隐藏，属性变化本身就会触发重新测量。
    container.setAttribute('style', 'visibility: hidden')
    document.documentElement.setAttribute('data-agent-assistant-open', 'true')
    await Promise.resolve()
    await flushFrame()
    expect(footerDockGeometry.value).toBeNull()

    container.removeAttribute('style')
    window.dispatchEvent(new Event('resize'))
    await flushFrame()
    expect(footerDockGeometry.value).not.toBeNull()

    // v-show 隐藏时容器没有布局矩形。
    placeAt(container, 0, 0, 0, 0)
    window.dispatchEvent(new Event('resize'))
    await flushFrame()
    expect(footerDockGeometry.value).toBeNull()

    placeAt(container, 0, 700, 400, 70)
    window.dispatchEvent(new Event('resize'))
    await flushFrame()
    expect(footerDockGeometry.value).not.toBeNull()
    wrapper.unmount()
    expect(footerDockGeometry.value).toBeNull()
  })
})
