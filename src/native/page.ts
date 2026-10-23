import { onActivated, onBeforeMount, onDeactivated, onScopeDispose, shallowRef, type MaybeRefOrGetter } from 'vue'
import { useRoute } from 'vue-router'
import type { DynamicHeaderTabButton } from '@/composables/useDynamicHeaderTab'

/** 页面标题和附属操作共用原业务回调，只有当前激活路由的声明能够进入原生导航。 */
export interface NativePageHeader {
  title?: MaybeRefOrGetter<string | undefined>
  actions?: MaybeRefOrGetter<DynamicHeaderTabButton[]>
}

/** 每份声明保留组件 owner 和实际路径，避免 KeepAlive 后台页面占用当前导航。 */
interface OwnedPageHeader extends NativePageHeader {
  ownerId: string
  routePath: string
}

/** 按组件作用域保存声明；原生模式之外没有可见布局或业务副作用。 */
export const nativePageHeaders = shallowRef<ReadonlyMap<string, OwnedPageHeader>>(new Map())
let sequence = 0

/** 将页面标题及其原有操作交给原生框架，失活或卸载时立即撤销对应 owner。 */
export function useNativePageHeader(header: NativePageHeader) {
  const route = useRoute()
  const entry: OwnedPageHeader = { ...header, ownerId: `page-${++sequence}`, routePath: route.path }

  /** 激活时绑定当前页面，不把缓存组件的旧路径带入新路由。 */
  function activate() {
    entry.routePath = route.path
    nativePageHeaders.value = new Map(nativePageHeaders.value).set(entry.ownerId, entry)
  }

  /** 只撤销本组件的声明，其他页面或新实例的同名动作不受影响。 */
  function release() {
    const next = new Map(nativePageHeaders.value)
    if (!next.delete(entry.ownerId)) return
    nativePageHeaders.value = next
  }

  onBeforeMount(activate)
  onActivated(activate)
  onDeactivated(release)
  onScopeDispose(release)
}
