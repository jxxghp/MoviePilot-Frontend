import { onScopeDispose, ref, shallowRef, type MaybeRefOrGetter } from 'vue'
import type { DynamicHeaderTabConfig } from '@/composables/useDynamicHeaderTab'
import type { NativePanel, NativePanelItem } from './protocol'

/** 面板项目保存本地回调；投影到原生时主动移除函数。 */
export interface NativePanelEntry extends Omit<NativePanelItem, 'children'> {
  children?: NativePanelEntry[]
  /** 选择时执行当前业务组件已有的方法。 */
  invoke?(): void | Promise<unknown>
}

/** 原生面板提供者复用组件状态，不单独请求另一套业务 API。 */
export interface NativePanelSource extends Omit<NativePanel, 'sections'> {
  sections: Array<{ id: string; title?: string; items: NativePanelEntry[] }>
  /** 只在连续列表中保留当前会话已经展示且仍有效的行回调，不重复发送正文。 */
  retainedItems?: NativePanelEntry[]
  /** 打开时刷新现有组件的数据。 */
  onOpen?(): void | Promise<unknown>
  /** 输入只更新组件原有搜索词。 */
  onQuery?(text: string): void
  /** 分页继续使用现有加载方法。 */
  onLoadMore?(): void | Promise<unknown>
}

/** 保留原始回调的全局导航动作，不穿过原生桥接。
 */
export interface NativeGlobalAction {
  id: string
  title: MaybeRefOrGetter<string>
  icon: string
  dataAttr?: string
  visible?: MaybeRefOrGetter<boolean>
  panel?: () => NativePanelSource | undefined
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
/** 通知深链接等网页入口可请求宿主打开当前原生面板。 */
export const nativeRequestedPanel = ref<string>()

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
