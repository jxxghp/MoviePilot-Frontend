import { onScopeDispose, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasItemPermission } from '@/utils/permission'
import type { PluginPermission } from '@/sdk/plugin'

/** 所有扩展共用实例及账号代际，迟到请求不能回写新实例。 */
export function usePluginSDKScope(pluginId: MaybeRefOrGetter<string | null | undefined>) {
  const user = useUserStore()
  const cleanups = new Set<() => void>()
  let generation = 0
  let disposed = false
  const clear = () => {
    generation++
    for (const cleanup of [...cleanups]) {
      try {
        cleanup()
      } catch (error) {
        console.error(error)
      }
    }
    cleanups.clear()
  }
  watch(() => [toValue(pluginId), user.userID, user.userName], clear, { flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    clear()
  })
  const fail = (code: string) => {
    throw Object.assign(new Error(code), { code })
  }
  const can = (permission?: PluginPermission, feature?: string) =>
    hasItemPermission({ permission, feature }, buildUserPermissionContext(user.superUser, user.permissions))
  const capture = (permission?: PluginPermission, feature?: string) => {
    const current = generation
    const check = () => {
      if (disposed || current !== generation || !toValue(pluginId)) fail('HOST_DISPOSED')
      if (!can(permission, feature)) fail('PERMISSION_DENIED')
    }
    check()
    return check
  }
  const track = (cleanup: () => void) => {
    let stopped = false
    const stop = () => {
      if (stopped) return
      stopped = true
      cleanups.delete(stop)
      cleanup()
    }
    cleanups.add(stop)
    return stop
  }
  return { user, pluginId: () => toValue(pluginId) || '', capture, can, track, fail }
}
export type PluginSDKScope = ReturnType<typeof usePluginSDKScope>
