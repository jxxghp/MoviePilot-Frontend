import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppDialog from '../AppDialog'
import { NativeLayoutAdapter } from '@/native/layout'

vi.mock('vuetify', () => ({ useDisplay: () => ({ width: { value: 402 } }) }))
vi.mock('vuetify/components/VDialog', () => ({
  VDialog: { name: 'VuetifyDialog', props: ['transition', 'fullscreen'], template: '<div><slot /></div>' },
}))

const layout = new NativeLayoutAdapter(document, window)
afterEach(() => {
  layout.setActive(false)
  delete window.MoviePilotNative
})

describe('弹窗转场的展示所有权', () => {
  it('普通网页、旧容器及降级后保留业务转场，只有已协商的原生 Sheet 关闭网页动画', () => {
    const wrapper = mount(AppDialog, { attrs: { transition: 'mp-dialog-transition', fullscreen: true } })
    expect(wrapper.findComponent({ name: 'VuetifyDialog' }).props('transition')).toBe('mp-dialog-transition')
    layout.setActive(true)
    expect(wrapper.findComponent({ name: 'VuetifyDialog' }).props('transition')).toBe('mp-dialog-transition')
    wrapper.unmount()
    window.MoviePilotNative = { transportVersion: 1, panelsVersion: 1, sheetsVersion: 1, postMessage: vi.fn() }
    const native = mount(AppDialog, { attrs: { transition: 'mp-dialog-transition', fullscreen: true } })
    expect(native.findComponent({ name: 'VuetifyDialog' }).props()).toMatchObject({
      transition: false,
      fullscreen: true,
    })
    native.unmount()
    layout.setActive(false)
    const fallback = mount(AppDialog, { attrs: { transition: 'mp-dialog-transition' } })
    expect(fallback.findComponent({ name: 'VuetifyDialog' }).props('transition')).toBe('mp-dialog-transition')
    fallback.unmount()
  })
})
