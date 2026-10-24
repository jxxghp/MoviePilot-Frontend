import { mount } from '@vue/test-utils'
import { h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVuetify } from 'vuetify'
import AppMenu from '../AppMenu'
import { NativeLayoutAdapter } from '@/native/layout'
import { NativeSheetAdapter } from '@/native/sheet'
import { closeNativeMenus } from '@/native/menu'
import { NativeConfirmationAdapter } from '@/native/confirmation'

const layout = new NativeLayoutAdapter(document, window)
const wrappers: ReturnType<typeof mount>[] = []

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  layout.setActive(false)
  delete window.MoviePilotNative
  document.body.innerHTML = ''
})

/** 渲染真实 Vuetify 菜单，验证模型、激活器和卸载行为均能维持原契约。 */
function menu(controlled = false) {
  const model = ref(true)
  const wrapper = mount(
    {
      setup: () => () =>
        h(
          AppMenu,
          controlled
            ? { modelValue: model.value, 'onUpdate:modelValue': (value: boolean) => (model.value = value) }
            : {},
          {
            activator: ({ props }: { props: Record<string, unknown> }) => h('button', props, '打开菜单'),
            default: () => h('button', '菜单项'),
          },
        ),
    },
    { attachTo: document.body, global: { plugins: [createVuetify()] } },
  )
  wrappers.push(wrapper)
  return { wrapper, model }
}

describe('原生 Sheet 前结束网页菜单', () => {
  it('普通网页保留原展开状态，协商后的新弹窗同步关闭原模型', async () => {
    const { model } = menu(true)
    await nextTick()
    closeNativeMenus()
    expect(model.value).toBe(true)
    layout.setActive(true)
    window.MoviePilotNative = { transportVersion: 1, sheetsVersion: 1, postMessage: vi.fn() }
    const root = document.createElement('div')
    root.className = 'v-dialog v-overlay--active'
    document.body.append(root)
    new NativeSheetAdapter(document).read('版本历史')
    await nextTick()
    expect(model.value).toBe(false)
    expect(document.querySelector('.v-menu.v-overlay--active')).toBeNull()
  })

  it('未绑定 v-model 的菜单仍能由原激活器打开，接管关闭后可以再次打开', async () => {
    layout.setActive(true)
    window.MoviePilotNative = { transportVersion: 1, sheetsVersion: 1, postMessage: vi.fn() }
    const { wrapper } = menu()
    await wrapper.get('button').trigger('click')
    await nextTick()
    expect(document.querySelector('.v-menu.v-overlay--active')).not.toBeNull()
    closeNativeMenus()
    await nextTick()
    expect(document.querySelector('.v-menu.v-overlay--active')).toBeNull()
    await wrapper.get('button').trigger('click')
    await nextTick()
    expect(document.querySelector('.v-menu.v-overlay--active')).not.toBeNull()
  })

  it('系统确认框接管时也关闭原菜单，不遗留背景菜单状态', async () => {
    layout.setActive(true)
    window.MoviePilotNative = { transportVersion: 1, sheetsVersion: 1, postMessage: vi.fn() }
    const { model } = menu(true)
    await nextTick()
    const adapter = new NativeConfirmationAdapter(document)
    adapter.setActive(true)
    const root = document.createElement('div')
    root.className = 'v-dialog v-overlay--active'
    root.setAttribute('data-native-confirm-dialog', '')
    root.innerHTML = '<button data-native-confirm-accept>确认</button><button data-native-confirm-cancel>取消</button>'
    document.body.append(root)
    expect(adapter.read()).toMatchObject({ confirmText: '确认', cancelText: '取消' })
    await nextTick()
    expect(model.value).toBe(false)
    expect(document.querySelector('.v-menu.v-overlay--active')).toBeNull()
  })
})
