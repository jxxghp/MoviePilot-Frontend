import { useVisualViewportHeight } from '@/composables/useVisualViewportHeight'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** 在真实组件生命周期内挂载，同时覆盖监听注册与卸载释放路径。 */
function mountHeight() {
  return mount(
    defineComponent({
      setup() {
        return useVisualViewportHeight()
      },
      render() {
        return h('div')
      },
    }),
  )
}

describe('useVisualViewportHeight', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the visual viewport height when the page is zoomed', () => {
    vi.stubGlobal('visualViewport', Object.assign(new EventTarget(), { height: 987, scale: 0.37 }))
    const wrapper = mountHeight()
    expect(wrapper.vm.height).toBe(987)
    wrapper.unmount()
  })

  it('follows visual viewport resize and scroll events', () => {
    const viewport = Object.assign(new EventTarget(), { height: 700, scale: 1 })
    vi.stubGlobal('visualViewport', viewport)
    const wrapper = mountHeight()
    viewport.height = 420
    viewport.dispatchEvent(new Event('resize'))
    expect(wrapper.vm.height).toBe(420)
    viewport.height = 380
    viewport.dispatchEvent(new Event('scroll'))
    expect(wrapper.vm.height).toBe(380)
    wrapper.unmount()
  })

  it('releases viewport listeners when the component unmounts', () => {
    const viewport = Object.assign(new EventTarget(), { height: 700, scale: 1 })
    const removeEventListener = vi.spyOn(viewport, 'removeEventListener')
    vi.stubGlobal('visualViewport', viewport)
    const wrapper = mountHeight()
    wrapper.unmount()
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function))
  })

  it('falls back to innerHeight when the environment has no visual viewport', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 640, writable: true })
    vi.stubGlobal('visualViewport', undefined)
    const wrapper = mountHeight()
    expect(wrapper.vm.height).toBe(640)
    wrapper.unmount()
  })
})
