type StatusCacheEntry = {
  expiresAt: number
  value: boolean
}

const STATUS_CACHE_TTL = 3 * 60 * 1000

const existsStatusCache = new Map<string, StatusCacheEntry>()
const existsStatusRequests = new Map<string, Promise<boolean>>()
const subscribeStatusCache = new Map<string, StatusCacheEntry>()
const subscribeStatusRequests = new Map<string, Promise<boolean>>()

function getCachedValue(cache: Map<string, StatusCacheEntry>, key: string): boolean | undefined {
  const entry = cache.get(key)
  if (!entry) {
    return undefined
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return undefined
  }

  return entry.value
}

function setCachedValue(cache: Map<string, StatusCacheEntry>, key: string, value: boolean) {
  cache.set(key, {
    expiresAt: Date.now() + STATUS_CACHE_TTL,
    value,
  })
}

async function resolveCachedStatus(
  cache: Map<string, StatusCacheEntry>,
  requests: Map<string, Promise<boolean>>,
  key: string,
  loader: () => Promise<boolean>,
): Promise<boolean> {
  const cachedValue = getCachedValue(cache, key)
  if (cachedValue !== undefined) {
    return cachedValue
  }

  const currentRequest = requests.get(key)
  if (currentRequest) {
    return currentRequest
  }

  const request = loader()
    .then(value => {
      setCachedValue(cache, key, value)
      return value
    })
    .finally(() => {
      requests.delete(key)
    })

  requests.set(key, request)
  return request
}

export function getCachedMediaExistsStatus(key: string, loader: () => Promise<boolean>) {
  return resolveCachedStatus(existsStatusCache, existsStatusRequests, key, loader)
}

export function setCachedMediaExistsStatus(key: string, value: boolean) {
  setCachedValue(existsStatusCache, key, value)
}

export function getCachedMediaSubscribeStatus(key: string, loader: () => Promise<boolean>) {
  return resolveCachedStatus(subscribeStatusCache, subscribeStatusRequests, key, loader)
}

export function setCachedMediaSubscribeStatus(key: string, value: boolean) {
  setCachedValue(subscribeStatusCache, key, value)
}
