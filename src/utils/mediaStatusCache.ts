type StatusCacheEntry = {
  expiresAt: number
  value: boolean
}

type StatusCacheState = {
  entries: Map<string, StatusCacheEntry>
  explicitValues: Map<string, boolean>
  generation: number
  requests: Map<string, Promise<boolean>>
  versions: Map<string, number>
}

const STATUS_CACHE_TTL = 3 * 60 * 1000

const existsStatusState: StatusCacheState = {
  entries: new Map(),
  explicitValues: new Map(),
  generation: 0,
  requests: new Map(),
  versions: new Map(),
}

const subscribeStatusState: StatusCacheState = {
  entries: new Map(),
  explicitValues: new Map(),
  generation: 0,
  requests: new Map(),
  versions: new Map(),
}

function getCachedValue(state: StatusCacheState, key: string): boolean | undefined {
  const entry = state.entries.get(key)
  if (!entry) {
    return undefined
  }

  if (entry.expiresAt <= Date.now()) {
    state.entries.delete(key)
    return undefined
  }

  return entry.value
}

function writeCachedValue(state: StatusCacheState, key: string, value: boolean) {
  state.entries.set(key, {
    expiresAt: Date.now() + STATUS_CACHE_TTL,
    value,
  })
}

function setCachedValue(state: StatusCacheState, key: string, value: boolean) {
  if (state.requests.has(key)) {
    state.versions.set(key, (state.versions.get(key) ?? 0) + 1)
    state.explicitValues.set(key, value)
  }
  writeCachedValue(state, key, value)
}

async function resolveCachedStatus(
  state: StatusCacheState,
  key: string,
  loader: () => Promise<boolean>,
): Promise<boolean> {
  const cachedValue = getCachedValue(state, key)
  if (cachedValue !== undefined) {
    return cachedValue
  }

  const currentRequest = state.requests.get(key)
  if (currentRequest) {
    return currentRequest
  }

  const requestGeneration = state.generation
  const requestVersion = state.versions.get(key) ?? 0
  const requestRef: { current?: Promise<boolean> } = {}
  const request = loader()
    .then(value => {
      // 显式状态写入或会话切换发生后，旧请求只能返回当前状态，不能回写过期结果。
      if (state.generation !== requestGeneration) {
        const currentRequest = state.requests.get(key)
        if (currentRequest && currentRequest !== requestRef.current) {
          return currentRequest
        }

        return getCachedValue(state, key) ?? false
      }

      if ((state.versions.get(key) ?? 0) !== requestVersion) {
        return state.explicitValues.get(key) ?? value
      }

      writeCachedValue(state, key, value)
      return value
    })
    .finally(() => {
      if (state.requests.get(key) === requestRef.current) {
        state.requests.delete(key)
        state.versions.delete(key)
        state.explicitValues.delete(key)
      }
    })

  requestRef.current = request
  state.requests.set(key, request)
  return request
}

export function getCachedMediaExistsStatus(key: string, loader: () => Promise<boolean>) {
  return resolveCachedStatus(existsStatusState, key, loader)
}

export function setCachedMediaExistsStatus(key: string, value: boolean) {
  setCachedValue(existsStatusState, key, value)
}

export function getCachedMediaSubscribeStatus(key: string, loader: () => Promise<boolean>) {
  return resolveCachedStatus(subscribeStatusState, key, loader)
}

export function setCachedMediaSubscribeStatus(key: string, value: boolean) {
  setCachedValue(subscribeStatusState, key, value)
}

/** 清理当前登录会话拥有的订阅状态，并隔离仍在执行的旧会话请求。 */
export function clearCachedMediaSubscribeStatuses() {
  subscribeStatusState.generation += 1
  subscribeStatusState.entries.clear()
  subscribeStatusState.explicitValues.clear()
  subscribeStatusState.requests.clear()
  subscribeStatusState.versions.clear()
}
