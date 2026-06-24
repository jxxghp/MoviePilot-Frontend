import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute, setCatchHandler } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import * as navigationPreload from 'workbox-navigation-preload'

// Service Worker 类型声明
declare let self: ServiceWorkerGlobalScope & {
  readonly __WB_MANIFEST: Array<{ url: string; revision?: string }>
}

// 缓存版本控制
const RESOURCE_VERSION = 'V2'
// 开发态 dev-sw 可能拿不到 Vite define 注入；仅在开发环境做 dev 兜底
const hasAppVersion = typeof __APP_VERSION__ !== 'undefined'
const hasBuildTime = typeof __BUILD_TIME__ !== 'undefined'
const isDev = import.meta.env.DEV

if (!isDev && (!hasAppVersion || !hasBuildTime)) {
  throw new Error('[SW] Missing __APP_VERSION__ or __BUILD_TIME__ in production build')
}

const appVersion = hasAppVersion ? __APP_VERSION__ : 'dev'
const buildTime = hasBuildTime ? __BUILD_TIME__ : 'dev'
const CACHE_VERSION = `${appVersion}-${buildTime}`

// 启用导航预载
navigationPreload.enable()

// 自动清理旧的预缓存
cleanupOutdatedCaches()

// 预缓存并路由
precacheAndRoute(self.__WB_MANIFEST)

// 监听安装事件
self.addEventListener('install', () => {
  // 强制等待中的 Service Worker 立即激活
  self.skipWaiting()
})

// 监听激活事件
self.addEventListener('activate', event => {
  // 让 Service Worker 立即接管页面
  event.waitUntil(
    (async () => {
      await self.clients.claim()
      // 清理旧版本的运行时缓存
      await cleanupRuntimeCaches(true)
    })(),
  )
})

// 通知选项
const options = {
  icon: '/logo.png',
  vibrate: [100, 50, 100],
  actions: [{ action: 'close', title: '关闭' }],
}

// 存储未读消息数量的键名
const UNREAD_COUNT_KEY = 'mp_unread_count'

// --- 缓存策略配置 ---

// 导航请求与 App Shell - 优先网络
registerRoute(
  ({ request, url }) => request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html',
  new NetworkFirst({
    cacheName: `app-shell-${CACHE_VERSION}`,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7天
      }),
    ],
  }),
)

// 静态资源 (JS, CSS, HTML) - 优先缓存
registerRoute(
  ({ request }) => ['style', 'script', 'worker'].includes(request.destination),
  new StaleWhileRevalidate({
    cacheName: `static-resources-${CACHE_VERSION}`,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  }),
)

// 图片资源 - 优先缓存
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: `image-cache-${RESOURCE_VERSION}`,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30天
      }),
    ],
  }),
)

// 字体资源 - 优先缓存
registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: `font-cache-${RESOURCE_VERSION}`,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1年
      }),
    ],
  }),
)

// TMDB 图片 - 优先缓存
registerRoute(
  ({ url }) => url.hostname === 'image.tmdb.org',
  new CacheFirst({
    cacheName: `tmdb-image-cache-${RESOURCE_VERSION}`,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 300,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7天
      }),
    ],
  }),
)

// API GET 请求 - 优先网络
registerRoute(
  ({ url, request }) =>
    url.pathname.includes('/api/v1/') &&
    request.method === 'GET' &&
    !url.pathname.includes('/api/v1/search/') && // 搜索接口结果动态变化，避免缓存导致重复搜索失效
    !url.pathname.includes('/api/v1/site/cookie/') && // 站点 Cookie 更新是副作用请求，不能缓存
    !url.pathname.includes('/api/v1/system/message') && // SSE实时消息流
    !url.pathname.includes('/api/v1/system/progress/') && // SSE实时进度流
    !url.pathname.includes('/api/v1/system/logging') && // SSE实时日志流
    !url.pathname.includes('/api/v1/message/') && // 用户消息接口
    !url.pathname.includes('/api/v1/system/global') && // 系统配置接口
    !url.pathname.includes('/api/v1/mfa/') && // 多因素认证接口
    !url.pathname.includes('/api/v1/auth/') && // 登录认证入口与票据交换
    !url.pathname.includes('/api/v1/dashboard/') && // Dashboard实时监控数据
    !url.pathname.includes('/api/v1/plugin/')&& // 插件接口
    !url.pathname.includes('/api/v1/subscribe/'), // 订阅接口
  new NetworkFirst({
    cacheName: `api-cache-${CACHE_VERSION}`,
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 500,
        maxAgeSeconds: 24 * 60 * 60, // 24小时
      }),
    ],
  }),
)

// 设置默认离线页面
setCatchHandler(async ({ request }) => {
  if (request?.destination === 'document') {
    return (await caches.match('/offline.html')) || Response.error()
  }
  return Response.error()
})

// --- 辅助函数 (通知与徽章) ---

// 清理运行时缓存
async function cleanupRuntimeCaches(onlyOld: boolean = false) {
  const cacheNames = await caches.keys()
  const runtimeCachePrefixes = [
    'app-shell',
    'static-resources',
    'image-cache',
    'font-cache',
    'api-cache',
    'tmdb-image-cache',
  ]

  // 当前版本的缓存全名
  const currentCacheNames = [
    `app-shell-${CACHE_VERSION}`,
    `static-resources-${CACHE_VERSION}`,
    `image-cache-${RESOURCE_VERSION}`,
    `font-cache-${RESOURCE_VERSION}`,
    `tmdb-image-cache-${RESOURCE_VERSION}`,
    `api-cache-${CACHE_VERSION}`,
  ]

  await Promise.all(
    cacheNames.map(cacheName => {
      const isRuntimeCache = runtimeCachePrefixes.some(prefix => cacheName.startsWith(prefix))
      if (isRuntimeCache) {
        if (!onlyOld || !currentCacheNames.includes(cacheName)) {
          console.log('[SW] Deleting runtime cache:', cacheName)
          return caches.delete(cacheName)
        }
      }
      return Promise.resolve()
    }),
  )
}

// 简单的 IndexedDB 包装器 (用于未读计数)
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('mp_badge_db', 2)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = event => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('badge')) {
        db.createObjectStore('badge')
      }
    }
  })
}

async function get(key: string, storeName: string = 'badge'): Promise<any> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(storeName)) {
        resolve(null)
        return
      }
      const tx = db.transaction([storeName], 'readonly')
      const store = tx.objectStore(storeName)
      const request = store.get(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  } catch (e) {
    return null
  }
}

async function set(key: string, value: any, storeName: string = 'badge'): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(storeName)) {
        console.warn(`Store ${storeName} not found`)
        resolve()
        return
      }
      const tx = db.transaction([storeName], 'readwrite')
      const store = tx.objectStore(storeName)
      store.put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.error(`[SW] Failed to set IndexedDB key "${key}" in store "${storeName}":`, e)
  }
}

async function getStoredUnreadCount(): Promise<number> {
  const count = await get(UNREAD_COUNT_KEY)
  return typeof count === 'number' ? count : 0
}

async function setStoredUnreadCount(count: number): Promise<void> {
  await set(UNREAD_COUNT_KEY, count)
}

// 通知已打开的页面同步未读计数，保证前台通知中心能感知 PWA badge 的变化。
async function broadcastUnreadCount(count: number) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
  clients.forEach(client => {
    client.postMessage({
      type: 'UNREAD_COUNT_UPDATE',
      count,
    })
  })
}

async function updateBadge(count: number) {
  if ('setAppBadge' in self.navigator) {
    try {
      if (count > 0) {
        await self.navigator.setAppBadge(count)
      } else {
        await self.navigator.clearAppBadge()
      }
    } catch (error) {
      console.error('Failed to update app badge:', error)
    }
  }
}

// 清除桌面角标和本地未读计数，确保不支持 Badge API 时也能归零。
async function clearBadge() {
  if ('clearAppBadge' in self.navigator) {
    try {
      await self.navigator.clearAppBadge()
    } catch (error) {
      console.error('Failed to clear native app badge:', error)
    }
  }

  try {
    await setStoredUnreadCount(0)
    await broadcastUnreadCount(0)
  } catch (error) {
    console.error('Failed to clear unread count:', error)
  }
}

// 监控缓存大小
async function monitorCacheSize() {
  const cacheSizes: Record<string, number> = {}
  let calculatedTotalSize = 0

  try {
    const cacheNames = await caches.keys()

    // 并行处理所有缓存
    await Promise.all(
      cacheNames.map(async cacheName => {
        const cache = await caches.open(cacheName)
        const requests = await cache.keys()
        let cacheSize = 0

        // 遍历请求以获取响应头部，避免 matchAll 一次性加载大量响应对象到内存
        for (const request of requests) {
          const response = await cache.match(request)
          if (response) {
            const contentLength = response.headers.get('content-length')
            if (contentLength) {
              cacheSize += parseInt(contentLength, 10)
            }
          }
        }
        cacheSizes[cacheName] = cacheSize
      }),
    )

    calculatedTotalSize = Object.values(cacheSizes).reduce((acc, size) => acc + size, 0)

    // 获取系统级存储估算
    let quota = 0
    let usage = 0
    if (self.navigator.storage && self.navigator.storage.estimate) {
      const estimate = await self.navigator.storage.estimate()
      quota = estimate.quota || 0
      usage = estimate.usage || 0
    }

    // 构造结果：满足 useCacheManager.ts 的需求
    const result = {
      cacheSizes,
      // 优先使用准确的 usage (真实磁盘占用)，如果不可用则退回到计算值
      totalSize: usage || calculatedTotalSize,
      totalSizeMB: ((usage || calculatedTotalSize) / 1024 / 1024).toFixed(2),
      // 额外信息保留，供未来扩展
      quota,
      usage,
      quotaMB: (quota / 1024 / 1024).toFixed(2),
      usageMB: (usage / 1024 / 1024).toFixed(2),
      calculatedTotalSize,
    }

    // 发送缓存统计信息给客户端
    const clients = await self.clients.matchAll()
    clients.forEach(client => {
      client.postMessage({
        type: 'CACHE_SIZE_UPDATE',
        data: result,
      })
    })

    return result
  } catch (error) {
    console.error('Failed to monitor cache size:', error)
    return {
      cacheSizes: {},
      totalSize: 0,
      totalSizeMB: '0.00',
      quota: 0,
      usage: 0,
      quotaMB: '0.00',
      usageMB: '0.00',
    }
  }
}

// --- 事件监听 ---

// 监听 push 事件
self.addEventListener('push', function (event) {
  if (!event.data) {
    return
  }
  let payload
  try {
    payload = event.data?.json()
  } catch (err) {
    payload = {
      title: event.data?.text(),
    }
  }

  try {
    const content = {
      body: payload.body || '',
      icon: payload.icon || options.icon,
      vibrate: [100, 50, 100],
      data: { url: payload.url },
      actions: options.actions,
    }

    event.waitUntil(
      (async () => {
        const currentCount = await getStoredUnreadCount()
        const newCount = currentCount + 1
        await setStoredUnreadCount(newCount)
        await Promise.all([
          self.registration.showNotification(payload.title, content),
          updateBadge(newCount),
          broadcastUnreadCount(newCount),
        ])
      })(),
    )
  } catch (e) {
    // 忽略错误
  }
})

// 监听通知点击
self.addEventListener('notificationclick', function (event) {
  const info = event.notification
  if (event.action === 'close') {
    info.close()
  } else if (info.data?.url) {
    event.waitUntil(self.clients.openWindow(info.data?.url))
  }
})

// 监听消息
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'CLEAR_BADGE') {
    clearBadge()
      .then(() => {
        event.ports[0]?.postMessage({ success: true })
      })
      .catch(error => {
        event.ports[0]?.postMessage({ success: false, error: error instanceof Error ? error.message : String(error) })
      })
  } else if (event.data && event.data.type === 'UPDATE_BADGE') {
    const count = event.data.count || 0
    setStoredUnreadCount(count)
      .then(() => updateBadge(count))
      .then(() => broadcastUnreadCount(count))
      .then(() => {
        event.ports[0]?.postMessage({ success: true })
      })
      .catch(error => {
        event.ports[0]?.postMessage({ success: false, error: error instanceof Error ? error.message : String(error) })
      })
  } else if (event.data && event.data.type === 'GET_UNREAD_COUNT') {
    getStoredUnreadCount()
      .then(count => {
        event.ports[0]?.postMessage({ count })
      })
      .catch(() => {
        event.ports[0]?.postMessage({ count: 0 })
      })
  } else if (event.data && event.data.type === 'CLEANUP_CACHES') {
    // 手动清理: 清理所有运行时缓存
    const performCleanup = async () => {
      await cleanupRuntimeCaches(false)
      return await monitorCacheSize()
    }
    performCleanup()
      .then(cacheInfo => {
        event.ports[0]?.postMessage({ success: true, cacheInfo })
      })
      .catch(error => {
        event.ports[0]?.postMessage({ success: false, error: error instanceof Error ? error.message : String(error) })
      })
  } else if (event.data && event.data.type === 'GET_CACHE_INFO') {
    monitorCacheSize()
      .then(cacheInfo => {
        event.ports[0]?.postMessage({ success: true, cacheInfo })
      })
      .catch(error => {
        event.ports[0]?.postMessage({ success: false, error: error instanceof Error ? error.message : String(error) })
      })
  } else if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
