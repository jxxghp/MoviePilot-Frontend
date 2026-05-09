type SiteIconCacheEntry = {
  expiresAt: number
  value: string
}

const SITE_ICON_CACHE_TTL = 10 * 60 * 1000
const siteIconCache = new Map<string, SiteIconCacheEntry>()
const siteIconRequests = new Map<string, Promise<string>>()

function readCachedSiteIcon(key: string): string | undefined {
  const entry = siteIconCache.get(key)
  if (!entry) {
    return undefined
  }

  if (entry.expiresAt <= Date.now()) {
    siteIconCache.delete(key)
    return undefined
  }

  return entry.value
}

export async function getCachedSiteIcon(siteId: string | number, loader: () => Promise<string>): Promise<string> {
  const cacheKey = String(siteId)
  const cachedIcon = readCachedSiteIcon(cacheKey)
  if (cachedIcon !== undefined) {
    return cachedIcon
  }

  const currentRequest = siteIconRequests.get(cacheKey)
  if (currentRequest) {
    return currentRequest
  }

  const request = loader()
    .then(icon => {
      siteIconCache.set(cacheKey, {
        expiresAt: Date.now() + SITE_ICON_CACHE_TTL,
        value: icon,
      })

      return icon
    })
    .finally(() => {
      siteIconRequests.delete(cacheKey)
    })

  siteIconRequests.set(cacheKey, request)

  return request
}
