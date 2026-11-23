import { onScopeDispose, ref, watch } from 'vue'
import { useDisplay, useTheme } from 'vuetify'
import { useI18n } from 'vue-i18n'
import api from '@/api'
import type { MediaSourceInfo } from '@/api/types'
import { listDownloadDirectories, listStorageOptions, listTransferDirectories } from '@/api/storage'
import { listFilterRuleGroups } from '@/api/rule'
import { getCurrentLocale } from '@/plugins/i18n'
import { sseManagerSingleton } from '@/utils/sseManager'
import type {
  PluginCatalogServices,
  PluginEnvironmentServices,
  PluginEventServices,
  PluginPreferenceServices,
} from '@/sdk/plugin'
import type { PluginSDKScope } from './usePluginSDKScope'

/** 查询只返回公开选择器字段；权限和晚到响应均在宿主重新检查。 */
export function usePluginDataServices(scope: PluginSDKScope) {
  const { locale } = useI18n()
  const display = useDisplay()
  const theme = useTheme()
  const online = ref(navigator.onLine)
  const updateOnline = () => {
    online.value = navigator.onLine
  }
  window.addEventListener('online', updateOnline)
  window.addEventListener('offline', updateOnline)
  onScopeDispose(() => {
    window.removeEventListener('online', updateOnline)
    window.removeEventListener('offline', updateOnline)
  })
  const environment: PluginEnvironmentServices = {
    getSnapshot: () =>
      Object.freeze({
        locale: String(locale.value),
        theme: theme.global.current.value.dark ? ('dark' as const) : ('light' as const),
        isMobile: display.mobile.value,
        online: online.value,
        user: Object.freeze({ id: scope.user.userID, name: scope.user.userName, isAdmin: scope.user.superUser }),
        permissions: Object.freeze(
          Object.fromEntries(
            (['discovery', 'search', 'subscribe', 'manage', 'admin'] as const).map(key => [key, scope.can(key)]),
          ),
        ) as ReturnType<PluginEnvironmentServices['getSnapshot']>['permissions'],
        features: Object.freeze({ ...scope.user.permissions.features }),
      }),
    hasPermission: (permission, feature) => scope.can(permission, feature),
    subscribe(listener) {
      const check = scope.capture()
      check()
      listener(environment.getSnapshot())
      return scope.track(
        watch(
          () => environment.getSnapshot(),
          value => {
            check()
            listener(value)
          },
          { deep: true },
        ),
      )
    },
  }
  async function read<T>(loader: () => Promise<T>, permission?: 'manage' | 'subscribe') {
    const check = scope.capture(permission)
    const data = await loader()
    check()
    return data
  }
  const catalogs: PluginCatalogServices = {
    mediaSources: () =>
      read(async () =>
        (await api.get<MediaSourceInfo[]>('media/source', { feedback: 'silent' })).map(item => ({
          id: item.media_source,
          name: item.name,
          mediaTypes: [...item.media_types],
        })),
      ),
    storages: () => read(async () => (await listStorageOptions()).map(item => ({ id: item.type, name: item.name }))),
    downloadDirectories: () =>
      read(async () =>
        (await listDownloadDirectories()).map((item, index) => ({
          id: `${item.storage || 'local'}:${item.save_path || item.download_path || item.name || index}`,
          name: item.name || item.save_path || '',
          storage: item.storage,
          path: item.save_path,
          downloadPath: item.download_path,
          mediaType: item.media_type,
          priority: item.priority,
        })),
      ),
    directories: query =>
      read(
        async () =>
          (await listTransferDirectories(query)).map((item, index) => ({
            id: `${item.storage}:${item.download_path || item.library_path || item.name || index}`,
            name: item.name,
            storage: item.storage,
            downloadPath: item.download_path,
            libraryPath: item.library_path,
            mediaType: item.media_type,
            priority: item.priority,
          })),
        'manage',
      ),
    ruleGroups: () =>
      read(async () => (await listFilterRuleGroups()).map(item => ({ id: item.name, name: item.name }))),
  }
  function preferencePath(key: string) {
    if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(key)) scope.fail('INVALID_REQUEST')
    return `user/config/${encodeURIComponent(`PluginFrontend.${scope.pluginId()}.${key}`)}`
  }
  const preferences: PluginPreferenceServices = {
    async get<T = unknown>(key: string) {
      const check = scope.capture()
      const result = await api.get<{ value?: T }>(preferencePath(key), { feedback: 'silent' })
      check()
      return result.value ?? null
    },
    async set(key, value) {
      const check = scope.capture()
      let serialized: string
      try {
        serialized = JSON.stringify(value ?? null)
      } catch {
        scope.fail('INVALID_REQUEST')
        return
      }
      if (typeof serialized !== 'string') scope.fail('INVALID_REQUEST')
      if (new TextEncoder().encode(serialized).length > 16 * 1024) scope.fail('INVALID_REQUEST')
      const path = preferencePath(key)
      check()
      await api.post(path, JSON.parse(serialized), { feedback: 'silent' })
      check()
    },
    async remove(key) {
      await preferences.set(key, null)
    },
  }
  const events: PluginEventServices = {
    subscribe(options) {
      const check = scope.capture()
      const root = new URL(import.meta.env.VITE_API_BASE_URL, window.location.origin)
      const path = options.path
      if (
        typeof path !== 'string' ||
        !path ||
        path.startsWith('/') ||
        path.includes('\\') ||
        path.includes(':') ||
        /(^|\/)\.\.?($|\/)/.test(path)
      )
        scope.fail('INVALID_REQUEST')
      const url = new URL(path, root)
      if (
        url.origin !== root.origin ||
        !url.pathname.startsWith(root.pathname) ||
        url.hash ||
        [...url.searchParams.keys()].some(key => /token|authorization|password/i.test(key))
      )
        scope.fail('INVALID_REQUEST')
      // 与 scoped API 相同，源插件动态路由映射到实例；调用方不能把其他实例作为自己的流。
      if (url.pathname.startsWith(`${root.pathname}plugin/`)) {
        const parts = url.pathname.slice(root.pathname.length).split('/')
        parts[1] = encodeURIComponent(scope.pluginId())
        url.pathname = root.pathname + parts.join('/')
      }
      url.searchParams.set('locale', getCurrentLocale())
      const listenerId = `plugin-sdk:${crypto.randomUUID()}`
      const address = url.toString()
      const manager = sseManagerSingleton.getIndependentManager(address, listenerId)
      let closed = false
      const stop = scope.track(() => {
        if (closed) return
        closed = true
        manager.removeStatusListener(listenerId)
        manager.removeMessageListener(listenerId)
        sseManagerSingleton.closeIndependentManager(address, listenerId)
      })
      manager.addStatusListener(listenerId, status => {
        if (!closed) {
          check()
          options.onStatus?.(status)
        }
      })
      manager.addMessageListener(listenerId, event => {
        if (!closed) {
          check()
          options.onMessage({ data: event.data, type: event.type, lastEventId: event.lastEventId })
        }
      })
      return {
        close: stop,
        reconnect: () => {
          check()
          if (!closed) manager.forceReconnect()
        },
      }
    },
    progress(options) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(options.type)) scope.fail('INVALID_REQUEST')
      return events.subscribe({
        path: `system/progress/${options.type}`,
        onMessage(event) {
          try {
            const progress = JSON.parse(event.data)
            options.onProgress({
              text: progress.text_i18n || progress.text || '',
              value: typeof progress.value === 'number' ? progress.value : undefined,
            })
          } catch (error) {
            console.error('Plugin SDK progress:', error)
          }
        },
      })
    },
  }
  return { catalogs, environment, preferences, events }
}
