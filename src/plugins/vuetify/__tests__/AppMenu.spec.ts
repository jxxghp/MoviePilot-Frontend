import { mount } from '@vue/test-utils'
import { h, nextTick, reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createVuetify } from 'vuetify'
import AppMenu from '../AppMenu'
import { NativeLayoutAdapter } from '@/native/layout'
import { NativeSheetAdapter } from '@/native/sheet'
import { closeNativeMenus } from '@/native/menu'
import { NativeConfirmationAdapter } from '@/native/confirmation'
import { nativeStandaloneMenus, type NativeStandaloneMenuBinding } from '@/native/standalone'

const layout = new NativeLayoutAdapter(document, window)
const wrappers: ReturnType<typeof mount>[] = []

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 140, 44))
})

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  layout.setActive(false)
  nativeStandaloneMenus.setContext(undefined)
  vi.restoreAllMocks()
  delete window.MoviePilotNative
  document.body.innerHTML = ''
})

/** 渲染真实 Vuetify 菜单，验证模型、激活器和卸载行为均能维持原契约。 */
function menu(controlled = false, nativeMenu?: NativeStandaloneMenuBinding) {
  const model = ref(true)
  const wrapper = mount(
    {
      setup: () => () =>
        h(
          AppMenu,
          {
            nativeMenu,
            ...(controlled
              ? { modelValue: model.value, 'onUpdate:modelValue': (value: boolean) => (model.value = value) }
              : {}),
          },
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
  it('来源声明默认关闭，原激活器仍打开原菜单且不泄漏对象属性到 DOM', async () => {
    const items = vi.fn(() => [])
    const { wrapper } = menu(false, { key: 'sort', items })
    await wrapper.get('button').trigger('click')
    await nextTick()
    expect(document.querySelector('.v-menu.v-overlay--active')).not.toBeNull()
    expect(document.querySelector('[native-menu]')).toBeNull()
    expect(items).not.toHaveBeenCalled()
  })

  it('实际 VMenu 卸载时注销来源，异步返回的旧选择不可执行', async () => {
    const bind = vi.spyOn(nativeStandaloneMenus, 'bind')
    const invoke = vi.fn()
    const { wrapper } = menu(false, { key: 'sort', items: action => [action('title', { title: '标题', invoke })] })
    await nextTick()
    const token = bind.mock.calls.at(-1)![0]
    nativeStandaloneMenus.setContext({ sessionId: 'menu-component', routeRevision: 1 })
    nativeStandaloneMenus.synchronize()
    const target = nativeStandaloneMenus.targetFor(token)!
    const snapshot = nativeStandaloneMenus.menus.open(target.ownerId, target.menuId)!
    wrapper.unmount()
    expect(nativeStandaloneMenus.targetFor(token)).toBeUndefined()
    expect(await nativeStandaloneMenus.menus.select(snapshot.presentationId, snapshot.items[0].id, vi.fn())).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('同一个响应式绑定更换业务键时撤销旧选择并建立新菜单身份', async () => {
    const bind = vi.spyOn(nativeStandaloneMenus, 'bind')
    const invoke = vi.fn()
    const binding = reactive<NativeStandaloneMenuBinding>({
      key: 'first',
      items: action => [action('title', { title: '标题', invoke })],
    })
    menu(false, binding)
    await nextTick()
    const token = bind.mock.calls.at(-1)![0]
    nativeStandaloneMenus.setContext({ sessionId: 'menu-component', routeRevision: 1 })
    nativeStandaloneMenus.synchronize()
    const before = nativeStandaloneMenus.targetFor(token)!
    const snapshot = nativeStandaloneMenus.menus.open(before.ownerId, before.menuId)!
    binding.key = 'second'
    await nextTick()
    const after = nativeStandaloneMenus.targetFor(token)!
    expect(after.ownerId).not.toBe(before.ownerId)
    expect(await nativeStandaloneMenus.menus.select(snapshot.presentationId, snapshot.items[0].id, vi.fn())).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
    expect(nativeStandaloneMenus.menus.open(after.ownerId, after.menuId)?.items[0].title).toBe('标题')
  })
  it('普通网页未绑定 v-model 的菜单保留 Vuetify 内部状态和原激活器', async () => {
    const { wrapper } = menu()
    await wrapper.get('button').trigger('click')
    await nextTick()
    expect(document.querySelector('.v-menu.v-overlay--active')).not.toBeNull()
    closeNativeMenus()
    await nextTick()
    expect(document.querySelector('.v-menu.v-overlay--active')).not.toBeNull()
  })

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
