import { CanceledError } from 'axios'

/** 共享只读快照；每个调用方拿到独立副本，避免设置表单互相修改。 */
interface SharedEntry {
  value: unknown
  expiresAt: number
}

const values = new Map<string, SharedEntry>()
const pending = new Map<string, Promise<unknown>>()
const SHARED_DATA_TTL = 30_000
const SHARED_DATA_LIMIT = 64
let generation = 0
const scopeGenerations = new Map<string, number>()

/** 合并并发读取并短暂复用成功快照；失败允许重试，会话或写入变化后拒绝旧响应。 */
export async function getSharedData<T>(
  key: string,
  loader: () => Promise<T>,
  shouldCache: (value: T) => boolean = () => true,
  refresh = false,
): Promise<T> {
  if (refresh) values.delete(key)
  const cached = values.get(key)
  if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.value) as T
  const activeGeneration = generation
  const scope = key.split(':')[0]
  const scopeGeneration = scopeGenerations.get(scope) ?? 0
  let request = pending.get(key)
  if (!request) {
    request = loader().then(value => {
      if (generation !== activeGeneration || (scopeGenerations.get(scope) ?? 0) !== scopeGeneration) {
        throw new CanceledError('共享数据已失效')
      }
      if (shouldCache(value)) {
        values.delete(key)
        values.set(key, { value, expiresAt: Date.now() + SHARED_DATA_TTL })
        if (values.size > SHARED_DATA_LIMIT) values.delete(values.keys().next().value!)
      }
      return value
    })
    pending.set(key, request)
  }
  try {
    return structuredClone(await request) as T
  } finally {
    if (pending.get(key) === request) pending.delete(key)
  }
}

/** 登录身份变化或相关写操作成功后，清空快照并隔离仍在途的旧读取。 */
export function invalidateSharedData(scope?: 'configuration' | 'media-status') {
  if (!scope) {
    generation++
    values.clear()
    pending.clear()
    scopeGenerations.clear()
    return
  }
  scopeGenerations.set(scope, (scopeGenerations.get(scope) ?? 0) + 1)
  for (const key of values.keys()) if (key.startsWith(`${scope}:`)) values.delete(key)
  for (const key of pending.keys()) if (key.startsWith(`${scope}:`)) pending.delete(key)
}
