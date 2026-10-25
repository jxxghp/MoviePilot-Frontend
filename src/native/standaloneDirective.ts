import { watchPostEffect, type ObjectDirective, type WatchStopHandle } from 'vue'
import { nativeStandaloneMenus, type NativeStandaloneMenuBinding } from './standalone'

/** 独立按钮与 VMenu 共用显式来源；未协商时保留原点击及共享表单。 */
const effects = new WeakMap<HTMLElement, WatchStopHandle>()

/** 只绑定实际按钮，不创建隐藏 VMenu，也不从文案推断菜单或业务动作。 */
export const vNativeStandaloneMenu: ObjectDirective<HTMLElement, NativeStandaloneMenuBinding | undefined> = {
  /** 挂载后读取最新响应式状态，文档范围改变时由现有注册表重新同步。 */
  mounted(element, binding) {
    nativeStandaloneMenus.bind(element, binding.value, () => element)
    effects.set(
      element,
      watchPostEffect(() => {
        void nativeStandaloneMenus.revision.value
        nativeStandaloneMenus.track(element)
      }),
    )
  },
  /** 同一按钮换业务范围时撤销旧来源，普通选择状态刷新仍使用原业务回调。 */
  updated(element, binding) {
    nativeStandaloneMenus.bind(element, binding.value, () => element)
  },
  /** 卸载后释放响应式观察和选择票据，迟到动作不能进入新页面。 */
  unmounted(element) {
    effects.get(element)?.()
    effects.delete(element)
    nativeStandaloneMenus.unbind(element)
  },
}
