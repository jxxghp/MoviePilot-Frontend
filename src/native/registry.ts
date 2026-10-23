import { onScopeDispose, ref, shallowRef, type MaybeRefOrGetter } from 'vue'
import type { DynamicHeaderTabConfig } from '@/composables/useDynamicHeaderTab'

/** 保留原始回调的全局导航动作，不穿过原生桥接。
 */
export interface NativeGlobalAction {
  id: string
  title: MaybeRefOrGetter<string>
  icon: string
  dataAttr?: string
  visible?: MaybeRefOrGetter<boolean>
  /** 原生入口直接打开既有业务组件，不合成另一套页面。
   */
  invoke(): void
}

/** 带 owner 的页内标签共享注册；布局仍持有原有 inject/global API。
 */
export const nativeHeaderRegistration = ref<DynamicHeaderTabConfig | null>(null)
/** 全局动作替换容器以便跨组件订阅，未接管时不影响原网页入口。
 */
export const nativeGlobalActions = shallowRef<ReadonlyMap<string, NativeGlobalAction>>(new Map())

/** 按组件作用域登记原回调；旧实例销毁不能注销新实例的同名动作。
 */
export function useNativeGlobalAction(action: NativeGlobalAction) {
  nativeGlobalActions.value = new Map(nativeGlobalActions.value).set(action.id, action)
  onScopeDispose(() => {
    if (nativeGlobalActions.value.get(action.id) !== action) return
    const next = new Map(nativeGlobalActions.value)
    next.delete(action.id)
    nativeGlobalActions.value = next
  })
}
