import { CanceledError, type AxiosRequestConfig } from 'axios'
import type { DataApiClient } from '@/api/client'

/** 仅由已接管的原生会话提供身份范围，不接收或保存令牌。 */
export interface NativeCacheScope {
  apiBase: string
  userId: number
  locale: string
}

type ListClient = Pick<DataApiClient, 'get'> & { defaults: Pick<DataApiClient['defaults'], 'baseURL'> }
interface CacheEntry {
  json: string
  bytes: number
  savedAt: number
}

const TTL = 60_000
const MAX_ENTRIES = 32
const MAX_BYTES = 4 * 1024 * 1024
const MAX_ENTRY_BYTES = 256 * 1024
const MAX_KEY_BYTES = 4 * 1024
const MAX_PENDING = 8
const encoder = new TextEncoder()
const pageOnly = { page: '1' }
const standard = { page: '1', count: '30' }
const anilist = { page: '1', count: '20' }
const douban = { ...standard, sort: 'R', tags: '' }
const tmdb = {
  ...pageOnly,
  sort_by: 'popularity.desc',
  with_genres: '',
  with_original_language: '',
  with_keywords: '',
  with_watch_providers: '',
  vote_average: '0',
  vote_count: '0',
  release_date: '',
}

// 封闭名单只覆盖现有内置榜单；插件、自定义来源和新增端点不会自动获得缓存。
const endpoints = new Map<string, Record<string, string>>([
  ['recommend/tmdb_trending', pageOnly],
  ['recommend/douban_showing', standard],
  ['recommend/bangumi_calendar', standard],
  ['anilist/trending', anilist],
  ['anilist/popular-this-season', anilist],
  ['recommend/music_weekly', standard],
  ['recommend/music_douban', standard],
  ['recommend/tmdb_movies', tmdb],
  ['recommend/tmdb_tvs', tmdb],
  ['recommend/douban_movie_hot', standard],
  ['recommend/douban_tv_hot', standard],
  ['recommend/douban_tv_animation', standard],
  ['recommend/douban_movies', douban],
  ['recommend/douban_tvs', douban],
  ['recommend/douban_movie_top250', standard],
  ['recommend/douban_tv_weekly_chinese', standard],
  ['recommend/douban_tv_weekly_global', standard],
])

/** 规范 API 根以隔离实例；含凭据、查询或非 HTTP 来源时不启用。 */
function normalizeBase(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return
    url.pathname = `${url.pathname.replace(/\/$/, '')}/`
    return url.href
  } catch {
    return
  }
}

/** 保留原客户端所有特殊传输语义，只接管默认 GET 和普通参数对象。 */
function requestKey(scope: NativeCacheScope, client: ListClient, path: string, config?: AxiosRequestConfig) {
  if (config && Object.keys(config).some(key => key !== 'params')) return
  const clientBase = normalizeBase(new URL(client.defaults.baseURL ?? scope.apiBase, scope.apiBase).href)
  if (clientBase !== scope.apiBase) return
  const match = /^([a-z][a-z0-9/_-]*)(?:\?([^#]*))?$/.exec(path)
  if (!match) return
  const defaults = endpoints.get(match[1])
  if (!defaults) return
  const values = { ...defaults }
  const supplied = new Map<string, unknown>()
  for (const [key, value] of new URLSearchParams(match[2])) {
    if (supplied.has(key)) return
    supplied.set(key, value)
  }
  const params: unknown = config?.params
  if (params != null) {
    if (typeof params !== 'object' || Object.getPrototypeOf(params) !== Object.prototype) return
    for (const [key, value] of Object.entries(params)) {
      if (value == null) continue
      if (supplied.has(key)) return
      supplied.set(key, value)
    }
  }
  for (const [key, value] of supplied) {
    if (typeof value !== 'string' && typeof value !== 'number') return
    // browse 的标题仅供页面展示，后端忽略；不让它阻断与横向榜单共享同一页。
    if (key === 'title' && typeof value === 'string' && value.length <= 512) continue
    if (!Object.hasOwn(defaults, key)) return
    let normalized = String(value)
    if (['page', 'count', 'vote_average', 'vote_count'].includes(key)) {
      const number = Number(value)
      if (!normalized.trim() || !Number.isFinite(number) || number < 0) return
      if (['page', 'count', 'vote_count'].includes(key) && !Number.isInteger(number)) return
      if (['page', 'count'].includes(key) && number < 1) return
      normalized = String(number)
    }
    values[key] = normalized
  }
  const key = JSON.stringify([
    scope.apiBase,
    scope.userId,
    scope.locale,
    match[1],
    Object.entries(values).sort(([a], [b]) => a.localeCompare(b)),
  ])
  return encoder.encode(key).length <= MAX_KEY_BYTES ? key : undefined
}

/** 只保存可独立复制的媒体 JSON；空页、坏体和过大响应沿用原调用结果但不缓存。 */
function serializeList(value: unknown): string | undefined {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every(item => item && typeof item === 'object' && !Array.isArray(item) && (item.title || item.media_id))
  )
    return
  try {
    return JSON.stringify(value)
  } catch {
    return
  }
}

/** App 专用、默认关闭的榜单快照；只在内存中保留有界、短时、可撤销的只读结果。 */
export class NativeReadonlyCache {
  private scope?: NativeCacheScope
  private enabled = false
  private generation = new AbortController()
  private readonly entries = new Map<string, CacheEntry>()
  private readonly pending = new Map<string, Promise<unknown>>()
  private bytes = 0

  /** 身份、权限、目录或语言发生变化时，即使账号 ID 相同也撤销上代结果。 */
  setScope(scope: NativeCacheScope | undefined) {
    this.clear()
    const apiBase = scope && normalizeBase(scope.apiBase)
    this.scope =
      scope &&
      apiBase &&
      Number.isSafeInteger(scope.userId) &&
      scope.userId >= 0 &&
      scope.locale.length > 0 &&
      scope.locale.length <= 64
        ? { ...scope, apiBase }
        : undefined
  }

  /** 仅在双向能力协商和前台接管完成后启用；退出前台立即撤销缓存与等待。 */
  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return
    this.clear()
    this.enabled = enabled
  }

  /** 手动刷新、换号或释放容器同步清理；内部通知信号绝不替换 API 的路由取消信号。 */
  clear() {
    this.generation.abort()
    this.generation = new AbortController()
    this.entries.clear()
    this.pending.clear()
    this.bytes = 0
  }

  /** 只包装两个现有媒体列表的 GET；未启用或不满足封闭边界时原样调用客户端。 */
  get<T = unknown>(client: ListClient, path: string, config?: AxiosRequestConfig): Promise<T> {
    let key: string | undefined
    if (this.enabled && this.scope) {
      try {
        key = requestKey(this.scope, client, path, config)
      } catch {
        // 不可规范化的外部参数交回原 API，不引入新的参数协议或容错行为。
      }
    }
    if (!key) return client.get<T>(path, config)
    return this.read<T>(client, path, config, key)
  }

  /** 命中和在途共享均在交付前再检查代次，阻止同一轮微任务里的换号竞态。 */
  private async read<T>(
    client: ListClient,
    path: string,
    config: AxiosRequestConfig | undefined,
    key: string,
  ): Promise<T> {
    const signal = this.generation.signal
    const cached = this.entries.get(key)
    if (cached) {
      const age = Date.now() - cached.savedAt
      if (age >= 0 && age < TTL) {
        await Promise.resolve()
        if (signal.aborted) throw new CanceledError('native_cache_invalidated')
        this.entries.delete(key)
        this.entries.set(key, cached)
        return JSON.parse(cached.json) as T
      }
      this.remove(key)
    }
    let result = this.pending.get(key)
    if (!result) {
      result = this.load(client, path, config, key, signal).finally(() => {
        if (this.pending.get(key) === result) this.pending.delete(key)
      })
      if (this.pending.size < MAX_PENDING) this.pending.set(key, result)
    }
    // 只撤销本层交付；请求自身继续由原 API 负责认证、反馈及路由取消。
    const value = await new Promise<unknown>((resolve, reject) => {
      const cancel = () => reject(new CanceledError('native_cache_invalidated'))
      signal.addEventListener('abort', cancel, { once: true })
      void result.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel))
    })
    if (signal.aborted) throw new CanceledError('native_cache_invalidated')
    const json = serializeList(value)
    return (json ? JSON.parse(json) : value) as T
  }

  /** 默认网络请求跳过 SW 的旧 API 落盘回退；HTTP 与业务错误仍由既有客户端抛出。 */
  private async load(
    client: ListClient,
    path: string,
    config: AxiosRequestConfig | undefined,
    key: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    const value = await client.get(path, {
      ...config,
      headers: { 'X-MoviePilot-Native': '1', 'Cache-Control': 'no-store' },
    })
    if (signal.aborted) throw new CanceledError('native_cache_invalidated')
    const json = serializeList(value)
    if (json && encoder.encode(json).length <= MAX_ENTRY_BYTES) {
      this.remove(key)
      const bytes = encoder.encode(json).length + encoder.encode(key).length
      this.entries.set(key, { json, bytes, savedAt: Date.now() })
      this.bytes += bytes
      while (this.entries.size > MAX_ENTRIES || this.bytes > MAX_BYTES) this.remove(this.entries.keys().next().value!)
    }
    return value
  }

  /** LRU 淘汰和过期删除共用字节账本，键与 UTF-8 内容一并计入总容量。 */
  private remove(key: string) {
    const entry = this.entries.get(key)
    if (!entry) return
    this.bytes -= entry.bytes
    this.entries.delete(key)
  }
}

export const nativeReadonlyCache = new NativeReadonlyCache()
