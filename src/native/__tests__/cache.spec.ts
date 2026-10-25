import { describe, expect, it, vi, afterEach } from 'vitest'
import { AxiosError, CanceledError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'
import { createApiClients, isApiRequestCancellation, type DataApiClient } from '@/api/client'
import { initializeRequestOptimizer, setNavigatingState } from '@/utils/requestOptimizer'
import { NativeReadonlyCache, type NativeCacheScope } from '../cache'

const BASE = 'https://moviepilot.example/api/v1/'
const PATH = 'recommend/tmdb_trending'
const scope: NativeCacheScope = { apiBase: BASE, userId: 7, locale: 'zh-CN' }
const media = [{ title: '榜单媒体', media_id: '123', media_source: 'themoviedb', nested: { progress: 0 } }]

/** 用真实 GET 签名记录调用，不绕过待测缓存的路径、参数或代次检查。 */
function harness(load: (path: string, config?: AxiosRequestConfig) => Promise<unknown> = async () => media) {
  const read = vi.fn(load)
  const client = { defaults: { baseURL: BASE }, get: read as DataApiClient['get'] }
  const cache = new NativeReadonlyCache()
  cache.setScope(scope)
  cache.setEnabled(true)
  return { cache, client, read }
}

/** 延迟响应由测试显式结算，验证取消和换号都发生在网络返回之前。 */
function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<unknown>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

afterEach(() => {
  vi.restoreAllMocks()
  setNavigatingState(false)
})

describe('原生只读榜单缓存', () => {
  it('默认关闭、无身份和普通客户端配置都保留原 GET，不添加标记', async () => {
    const { cache, client, read } = harness()
    cache.setEnabled(false)
    const config = { params: { page: 1 }, feedback: 'silent' as const }
    await cache.get(client, PATH, config)
    await cache.get(client, PATH, config)
    expect(read).toHaveBeenCalledTimes(2)
    expect(read.mock.calls[0][1]).toBe(config)
    cache.setEnabled(true)
    cache.setScope(undefined)
    await cache.get(client, PATH)
    expect(read.mock.calls[2][1]).toBeUndefined()
  })

  it.each([
    'recommend/tmdb_trending',
    'recommend/douban_showing',
    'recommend/bangumi_calendar',
    'anilist/trending',
    'anilist/popular-this-season',
    'recommend/music_weekly',
    'recommend/music_douban',
    'recommend/tmdb_movies',
    'recommend/tmdb_tvs',
    'recommend/douban_movie_hot',
    'recommend/douban_tv_hot',
    'recommend/douban_tv_animation',
    'recommend/douban_movies',
    'recommend/douban_tvs',
    'recommend/douban_movie_top250',
    'recommend/douban_tv_weekly_chinese',
    'recommend/douban_tv_weekly_global',
  ])('仅明确登记的内置榜单 %s 共享一次请求', async path => {
    const { cache, client, read } = harness()
    await cache.get(client, path)
    await cache.get(client, path, { params: { page: '1', title: '仅页面标题' } })
    expect(read).toHaveBeenCalledOnce()
    expect(read.mock.calls[0][1]?.headers).toEqual({ 'X-MoviePilot-Native': '1', 'Cache-Control': 'no-store' })
    expect(read.mock.calls[0][1]).not.toHaveProperty('signal')
  })

  it.each([
    'dashboard/statistic',
    'download/',
    'subscribe/',
    'message/',
    'system/global',
    'site/',
    'file/list',
    'auth/token',
    'search/title',
    'media/search',
    'plugin/demo/list',
    'recommend/custom',
    '/recommend/tmdb_trending',
    '../recommend/tmdb_trending',
    `${BASE}${PATH}`,
    `//other.example/${PATH}`,
    `${PATH}#fragment`,
    `${PATH}?page=1&page=1`,
    `${PATH}?secret=value`,
  ])('拒绝来源或路径 %s，原调用保持两次', async path => {
    const { cache, client, read } = harness()
    await cache.get(client, path)
    await cache.get(client, path)
    expect(read).toHaveBeenCalledTimes(2)
    expect(read.mock.calls.every(([, config]) => config === undefined)).toBe(true)
  })

  it.each<AxiosRequestConfig>([
    { signal: new AbortController().signal },
    {
      adapter: async () => {
        throw new Error('unused')
      },
    },
    { paramsSerializer: { indexes: null } },
    { headers: { Authorization: 'synthetic' } },
    { timeout: 100 },
    { responseType: 'blob' },
    { params: new URLSearchParams('page=1') },
    { feedback: 'all' },
    { params: { page: [1] } },
    { params: { page: true } },
    { params: { page: 0 } },
    { params: { page: -1 } },
    { params: { page: 1.5 } },
    { params: { page: Infinity } },
    { params: { page: '' } },
    { params: { unknown: 'value' } },
    { params: { title: ['重复'] } },
  ])('显式传输及未知参数原样交回客户端 %#', async config => {
    const { cache, client, read } = harness()
    await cache.get(client, PATH, config)
    await cache.get(client, PATH, config)
    expect(read).toHaveBeenCalledTimes(2)
    expect(read.mock.calls[0][1]).toBe(config)
  })

  it('规范默认参数和顺序，同时隔离分页和实际筛选', async () => {
    const { cache, client, read } = harness()
    await cache.get(client, 'recommend/tmdb_tvs?with_original_language=zh%7Cen')
    await cache.get(client, 'recommend/tmdb_tvs', {
      params: { title: '热播', page: '01', with_original_language: 'zh|en', vote_average: '0.0' },
    })
    expect(read).toHaveBeenCalledOnce()
    await cache.get(client, 'recommend/tmdb_tvs', { params: { page: 2, with_original_language: 'zh|en' } })
    await cache.get(client, 'recommend/tmdb_tvs', { params: { with_original_language: 'ja' } })
    expect(read).toHaveBeenCalledTimes(3)
    await cache.get(client, `${PATH}?page=1`, { params: { page: 1 } })
    expect(read.mock.calls[3][1]).toEqual({ params: { page: 1 } })
  })

  it('有效期到点和时钟回退都重新请求，不用过期内容离线回退', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(100_000)
    const { cache, client, read } = harness()
    await cache.get(client, PATH)
    now.mockReturnValue(159_999)
    await cache.get(client, PATH)
    expect(read).toHaveBeenCalledOnce()
    now.mockReturnValue(160_000)
    await cache.get(client, PATH)
    now.mockReturnValue(159_000)
    await cache.get(client, PATH)
    expect(read).toHaveBeenCalledTimes(3)
    now.mockReturnValue(220_000)
    read.mockRejectedValueOnce(new Error('offline'))
    await expect(cache.get(client, PATH)).rejects.toThrow('offline')
    await cache.get(client, PATH)
    expect(read).toHaveBeenCalledTimes(5)
  })

  it('并发只读请求复用网络，但每位调用者与原数据都获得独立 JSON', async () => {
    const pending = deferred()
    const { cache, client, read } = harness(() => pending.promise)
    const first = cache.get<typeof media>(client, PATH)
    const second = cache.get<typeof media>(client, PATH)
    pending.resolve(media)
    const [a, b] = await Promise.all([first, second])
    a[0].nested.progress = 90
    expect(b[0].nested.progress).toBe(0)
    expect(media[0].nested.progress).toBe(0)
    expect((await cache.get<typeof media>(client, PATH))[0].nested.progress).toBe(0)
    expect(read).toHaveBeenCalledOnce()
  })

  it('并发合并索引上限为八条，超出时保留独立原请求', async () => {
    const pending = deferred()
    const { cache, client, read } = harness(() => pending.promise)
    const promises = Array.from({ length: 9 }, (_, i) => cache.get(client, PATH, { params: { page: i + 1 } }))
    promises.push(cache.get(client, PATH, { params: { page: 1 } }))
    promises.push(cache.get(client, PATH, { params: { page: 9 } }))
    expect(read).toHaveBeenCalledTimes(10)
    pending.resolve(media)
    await Promise.all(promises)
  })

  it('撤销后的旧请求晚于新请求返回，不能删除新代次的合并索引', async () => {
    const old = deferred()
    const current = deferred()
    const { cache, client, read } = harness(() => old.promise)
    const stale = cache.get(client, PATH)
    const cancelled = expect(stale).rejects.toSatisfy(isApiRequestCancellation)
    cache.clear()
    await cancelled
    read.mockImplementationOnce(() => current.promise)
    const first = cache.get(client, PATH)
    old.resolve([{ title: '旧内容' }])
    await Promise.resolve()
    await Promise.resolve()
    const second = cache.get(client, PATH)
    expect(read).toHaveBeenCalledTimes(2)
    current.resolve([{ title: '当前内容' }])
    expect(await first).toEqual([{ title: '当前内容' }])
    expect(await second).toEqual([{ title: '当前内容' }])
  })

  it.each(['clear', 'disabled', 'logout', 'user', 'same-user', 'locale', 'instance'])(
    '%s 同步撤销在途与命中交付，迟到请求不能复活旧值',
    async change => {
      const pending = deferred()
      const { cache, client, read } = harness(() => pending.promise)
      const waiting = cache.get(client, PATH)
      const outcome = expect(waiting).rejects.toSatisfy(isApiRequestCancellation)
      if (change === 'clear') cache.clear()
      if (change === 'disabled') cache.setEnabled(false)
      if (change === 'logout') cache.setScope(undefined)
      if (change === 'user') cache.setScope({ ...scope, userId: 8 })
      if (change === 'same-user') cache.setScope(scope)
      if (change === 'locale') cache.setScope({ ...scope, locale: 'en' })
      if (change === 'instance') cache.setScope({ ...scope, apiBase: 'https://another.example/api/v1/' })
      await outcome
      pending.resolve(media)
      await Promise.resolve()
      cache.setScope(scope)
      cache.setEnabled(true)
      read.mockResolvedValueOnce([{ title: '新会话' }])
      expect(await cache.get(client, PATH)).toEqual([{ title: '新会话' }])
      const hit = cache.get(client, PATH)
      const hitOutcome = expect(hit).rejects.toSatisfy(isApiRequestCancellation)
      cache.clear()
      await hitOutcome
      expect(read).toHaveBeenCalledTimes(2)
    },
  )

  it.each([[], {}, { success: false, message: '业务失败' }, [null], [1], [{}]])(
    '空页或无效媒体体 %# 不进入有效期缓存',
    async value => {
      const { cache, client, read } = harness(async () => value)
      await cache.get(client, PATH)
      await cache.get(client, PATH)
      expect(read).toHaveBeenCalledTimes(2)
    },
  )

  it.each([new Error('network'), new CanceledError('route')])('失败或取消不缓存且不改原错误 %#', async error => {
    const { cache, client, read } = harness(async () => {
      throw error
    })
    await expect(cache.get(client, PATH)).rejects.toBe(error)
    await expect(cache.get(client, PATH)).rejects.toBe(error)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('条目计数按 LRU 淘汰，读取旧条目会更新其使用顺序', async () => {
    const { cache, client, read } = harness()
    for (let page = 1; page <= 32; page++) await cache.get(client, PATH, { params: { page } })
    await cache.get(client, PATH, { params: { page: 1 } })
    await cache.get(client, PATH, { params: { page: 33 } })
    await cache.get(client, PATH, { params: { page: 1 } })
    expect(read).toHaveBeenCalledTimes(33)
    await cache.get(client, PATH, { params: { page: 2 } })
    expect(read).toHaveBeenCalledTimes(34)
  })

  it('总内存按 UTF-8 计量，在未达到条目上限前也会淘汰', async () => {
    const { cache, client, read } = harness(async () => [{ title: '内容', overview: 'a'.repeat(190_000) }])
    for (let page = 1; page <= 24; page++) await cache.get(client, PATH, { params: { page } })
    await cache.get(client, PATH, { params: { page: 24 } })
    expect(read).toHaveBeenCalledTimes(24)
    await cache.get(client, PATH, { params: { page: 1 } })
    expect(read).toHaveBeenCalledTimes(25)
  })

  it('单条 UTF-8 超限不保留，已合并调用仍返回独立副本', async () => {
    const pending = deferred()
    const { cache, client, read } = harness(() => pending.promise)
    const first = cache.get<Array<{ title: string }>>(client, PATH)
    const second = cache.get<Array<{ title: string }>>(client, PATH)
    pending.resolve([{ title: '中'.repeat(90_000) }])
    const [a, b] = await Promise.all([first, second])
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
    await cache.get(client, PATH)
    expect(read).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['https://moviepilot.example/#/recommend', 'api/v1/', 'https://moviepilot.example/api/v1/'],
    ['https://moviepilot.example/#/recommend', '/api/v1/', 'https://moviepilot.example/api/v1/'],
    ['https://moviepilot.example/moviepilot/#/recommend', 'api/v1/', 'https://moviepilot.example/moviepilot/api/v1/'],
  ])('文档 %s 的相对 API %s 与绝对范围 %s 一致时可以复用', async (documentBase, clientBase, apiBase) => {
    vi.spyOn(document, 'baseURI', 'get').mockReturnValue(documentBase)
    const { cache, client, read } = harness()
    cache.setScope({ ...scope, apiBase })
    client.defaults.baseURL = clientBase
    await cache.get(client, PATH)
    await cache.get(client, PATH)
    expect(read).toHaveBeenCalledOnce()
    expect(read.mock.calls[0][1]?.headers).toMatchObject({ 'X-MoviePilot-Native': '1', 'Cache-Control': 'no-store' })
    client.defaults.baseURL = '../other/api/v1/'
    await cache.get(client, PATH)
    expect(read).toHaveBeenCalledTimes(2)
    expect(read.mock.calls[1][1]).toBeUndefined()
  })

  it('键按 UTF-8 限制；不同客户端来源或非法身份不能命中', async () => {
    const { cache, client, read } = harness()
    await cache.get(client, 'recommend/tmdb_movies', { params: { sort_by: '中'.repeat(1500) } })
    expect(read.mock.calls[0][1]).not.toHaveProperty('headers')
    await cache.get(client, PATH)
    client.defaults.baseURL = 'https://other.example/api/v1/'
    await cache.get(client, PATH)
    expect(read.mock.calls[2][1]).toBeUndefined()
    cache.setScope({ ...scope, apiBase: 'https://user:secret@moviepilot.example/api/v1/' })
    client.defaults.baseURL = BASE
    await cache.get(client, PATH)
    expect(read.mock.calls[3][1]).toBeUndefined()
  })

  it('复用真实客户端的业务失败、401/403 与自动路由取消链', async () => {
    const unauthorized = vi.fn()
    const forbidden = vi.fn()
    let status = 200
    let businessFailure = true
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      const response = {
        data: { success: !businessFailure, message: businessFailure ? 'not ready' : '', data: media },
        status,
        statusText: String(status),
        config,
        headers: { 'content-type': 'application/json' },
      }
      if (status >= 400) throw new AxiosError('HTTP error', 'ERR_BAD_RESPONSE', config, undefined, response)
      return response
    })
    const { api } = createApiClients({
      baseURL: BASE,
      adapter,
      setupInstance: initializeRequestOptimizer,
      hooks: { onUnauthorized: unauthorized, onForbidden: forbidden },
    })
    const cache = new NativeReadonlyCache()
    cache.setScope(scope)
    cache.setEnabled(true)
    await expect(cache.get(api, PATH)).rejects.toMatchObject({ businessFailure: true })
    businessFailure = false
    status = 401
    await expect(cache.get(api, PATH)).rejects.toMatchObject({ status: 401 })
    expect(unauthorized).toHaveBeenCalledOnce()
    status = 403
    await expect(cache.get(api, PATH)).rejects.toMatchObject({ status: 403 })
    expect(forbidden).toHaveBeenCalledOnce()
    status = 200
    const waiting = deferred()
    adapter.mockImplementationOnce(async config => {
      await waiting.promise
      return {
        data: { success: true, message: '', data: media },
        status: 200,
        statusText: 'OK',
        config,
        headers: { 'content-type': 'application/json' },
      }
    })
    const request = cache.get(api, PATH)
    const cancelled = expect(request).rejects.toSatisfy(isApiRequestCancellation)
    await vi.waitFor(() => expect(adapter).toHaveBeenCalledTimes(4))
    setNavigatingState(true)
    waiting.resolve(null)
    await cancelled
    setNavigatingState(false)
    expect(await cache.get(api, PATH)).toEqual(media)
    expect(adapter).toHaveBeenCalledTimes(5)
  })
})
