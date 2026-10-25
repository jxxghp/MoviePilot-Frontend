import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AxiosRequestConfig } from 'axios'
import { effectScope, ref, type EffectScope } from 'vue'
import { useAuthStore, useUserStore } from '@/stores'
import i18n from '@/plugins/i18n'
import { getMediaSourceCatalog } from '@/utils/mediaId'
import { getModuleCatalog } from '@/composables/useModuleCatalog'
import { isApiRequestCancellation, type DataApiClient } from '@/api/client'
import { NativeReadonlyCache } from '@/native/cache'
import { useNativeReadonlyCache } from '../useNativeReadonlyCache'

const BASE = 'http://localhost/api/v1/'
const PATH = 'recommend/tmdb_trending'
let scope: EffectScope | undefined

/** 使用真实 Pinia、语言和缓存引擎；前台接管由 NativeSession 的回调登记。 */
function harness() {
  const auth = useAuthStore()
  const user = useUserStore()
  auth.setToken('synthetic-token-a')
  user.setUserID(7)
  const cache = new NativeReadonlyCache()
  const negotiated = ref(false)
  const available = ref(true)
  const read = vi.fn<(path: string, config?: AxiosRequestConfig) => Promise<Array<{ title: string }>>>(async () => [
    { title: '当前公开榜单' },
  ])
  const client = { defaults: { baseURL: BASE }, get: read as DataApiClient['get'] }
  scope = effectScope()
  scope.run(() => useNativeReadonlyCache(negotiated, available, BASE, cache))
  return { cache, negotiated, available, auth, user, client, read }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  i18n.global.locale.value = 'zh-CN'
})

afterEach(() => {
  scope?.stop()
  scope = undefined
  getMediaSourceCatalog().value = []
  getModuleCatalog().value = []
  i18n.global.locale.value = 'zh-CN'
})

describe('原生缓存的认证与活动范围', () => {
  it('协商完成前不缓存，接管后复用；退出可用状态立即清除', async () => {
    const h = harness()
    await h.cache.get(h.client, PATH)
    await h.cache.get(h.client, PATH)
    expect(h.read).toHaveBeenCalledTimes(2)
    h.negotiated.value = true
    await h.cache.get(h.client, PATH)
    await h.cache.get(h.client, PATH)
    expect(h.read).toHaveBeenCalledTimes(3)
    h.available.value = false
    h.available.value = true
    await h.cache.get(h.client, PATH)
    expect(h.read).toHaveBeenCalledTimes(4)
  })

  it.each(['token', 'logout', 'user', 'permissions', 'superuser', 'locale', 'media-catalog', 'module-catalog'])(
    '%s 同步清掉已完成快照和排队的命中交付',
    async change => {
      const h = harness()
      h.negotiated.value = true
      await h.cache.get(h.client, PATH)
      const pending = h.cache.get(h.client, PATH)
      const cancelled = expect(pending).rejects.toSatisfy(isApiRequestCancellation)
      if (change === 'token') h.auth.setToken('synthetic-token-b')
      if (change === 'logout') h.auth.clearToken()
      if (change === 'user') h.user.setUserID(8)
      if (change === 'permissions') h.user.permissions.search = false
      if (change === 'superuser') h.user.setSuperUser(true)
      if (change === 'locale') i18n.global.locale.value = 'en-US'
      if (change === 'media-catalog')
        getMediaSourceCatalog().value = [{ name: 'TMDB', media_source: 'themoviedb', media_types: ['电影'] }]
      if (change === 'module-catalog')
        getModuleCatalog().value = [
          {
            id: 'TmdbModule',
            name: 'TMDB',
            name_i18n: '',
            name_key: '',
            description_i18n: '',
            description_key: '',
            type: 'media',
            subtype: '',
            enabled: true,
            active: true,
          },
        ]
      await cancelled
      if (change === 'logout') h.auth.setToken('synthetic-token-c')
      await h.cache.get(h.client, PATH)
      expect(h.read).toHaveBeenCalledTimes(2)
      await h.cache.get(h.client, PATH)
      expect(h.read).toHaveBeenCalledTimes(2)
    },
  )

  it('原生控件获得焦点不暂停已完成前台协商的缓存', async () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    const h = harness()
    h.negotiated.value = true
    await h.cache.get(h.client, PATH)
    window.dispatchEvent(new Event('blur'))
    await h.cache.get(h.client, PATH)
    expect(h.read).toHaveBeenCalledOnce()
    expect(h.read.mock.calls[0][1]?.headers).toMatchObject({ 'X-MoviePilot-Native': '1' })
  })

  it('原生会话撤销前台协商即暂停缓存，恢复后重新请求', async () => {
    const h = harness()
    h.negotiated.value = true
    await h.cache.get(h.client, PATH)
    h.negotiated.value = false
    await h.cache.get(h.client, PATH)
    expect(h.read.mock.calls[1][1]).toBeUndefined()
    h.negotiated.value = true
    await h.cache.get(h.client, PATH)
    await h.cache.get(h.client, PATH)
    expect(h.read).toHaveBeenCalledTimes(3)
  })

  it('容器卸载撤销旧交付并解除认证监听，不留下可用缓存', async () => {
    const h = harness()
    h.negotiated.value = true
    await h.cache.get(h.client, PATH)
    const hit = h.cache.get(h.client, PATH)
    const cancelled = expect(hit).rejects.toSatisfy(isApiRequestCancellation)
    scope!.stop()
    await cancelled
    await h.cache.get(h.client, PATH)
    expect(h.read.mock.calls[1][1]).toBeUndefined()
  })
})
