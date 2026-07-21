import type { Plugin } from 'vite'

const PWA_DEVELOPMENT_SCRIPT = 'dev:pwa'
export const DEV_SW_CLEANUP_PATH = '/__moviepilot_dev_sw_cleanup__'

const moviePilotWorkerPaths = ['/dev-sw.js', '/service-worker.js']
const moviePilotCachePrefixes = [
  'app-shell-',
  'static-resources-',
  'image-cache-',
  'font-cache-',
  'api-cache-',
  'tmdb-image-cache-',
  'workbox-precache-',
]

/** 普通 development mode 仅在显式 dev:pwa 脚本中启用开发 Service Worker。 */
export const isPwaDevelopmentEnabled = (mode: string, lifecycleEvent?: string) =>
  mode === 'development' && lifecycleEvent === PWA_DEVELOPMENT_SCRIPT

/** 普通开发服务器才执行历史 Service Worker 清理，production preview 保持构建产物行为。 */
export const shouldEnableDevServiceWorkerCleanup = (
  command: 'build' | 'serve',
  mode: string,
  isPreview: boolean | undefined,
  lifecycleEvent?: string,
) =>
  command === 'serve' && mode === 'development' && isPreview !== true && !isPwaDevelopmentEnabled(mode, lifecycleEvent)

/** 判断脚本 URL 是否属于当前 origin 的 MoviePilot Service Worker。 */
export function isManagedServiceWorkerUrl(scriptUrl: string, origin: string): boolean {
  const url = new URL(scriptUrl)
  return url.origin === origin && moviePilotWorkerPaths.some(path => url.pathname.endsWith(path))
}

/** 判断 Cache Storage 名称是否属于 MoviePilot 管理的缓存。 */
export const isManagedCacheName = (name: string): boolean =>
  moviePilotCachePrefixes.some(prefix => name.startsWith(prefix))

/** 清理完成后只允许返回当前 origin，避免开发中间页形成开放重定向。 */
export function resolveDevCleanupReturnUrl(requested: string | null, origin: string): URL {
  if (!requested) return new URL('/', origin)
  const target = new URL(requested, origin)
  return target.origin === origin ? target : new URL('/', origin)
}

/**
 * 普通开发服务器不应被历史 Service Worker 控制；受控页面先进入独立清理页，避免旧缓存模块抢先执行。
 */
export function createDevServiceWorkerCleanupPlugin(): Plugin {
  const workerPaths = JSON.stringify(moviePilotWorkerPaths)
  const cachePrefixes = JSON.stringify(moviePilotCachePrefixes)
  const cleanupPath = JSON.stringify(DEV_SW_CLEANUP_PATH)
  const cleanupAttemptKey = JSON.stringify('moviepilot:dev-sw-cleanup-attempted')

  const redirectScript = `
(() => {
  if (!('serviceWorker' in navigator)) return

  const workerPaths = ${workerPaths}
  const cachePrefixes = ${cachePrefixes}
  const cleanupPath = ${cleanupPath}
  const cleanupAttemptKey = ${cleanupAttemptKey}
  const cleanupState = sessionStorage.getItem(cleanupAttemptKey)
  const isManagedWorker = worker => {
    if (!worker) return false
    const url = new URL(worker.scriptURL)
    return url.origin === location.origin && workerPaths.some(path => url.pathname.endsWith(path))
  }
  const redirectToCleanup = () => {
    if (cleanupState) return
    sessionStorage.setItem(cleanupAttemptKey, '1')
    const target = new URL(cleanupPath, location.origin)
    target.searchParams.set('return', location.href)
    location.replace(target.href)
  }

  // unregister 不会立即解除当前 document 的 controller；应用模块加载前需再导航一次以脱离旧 Worker。
  if (cleanupState === 'complete') {
    sessionStorage.removeItem(cleanupAttemptKey)
    location.reload()
    return
  }

  if (isManagedWorker(navigator.serviceWorker.controller)) {
    redirectToCleanup()
    return
  }

  void navigator.serviceWorker.getRegistrations().then(registrations => {
    const hasManagedRegistration = registrations.some(registration =>
      [registration.installing, registration.waiting, registration.active].some(isManagedWorker),
    )
    if (hasManagedRegistration) {
      redirectToCleanup()
      return
    }

    if ('caches' in window) {
      void caches.keys().then(cacheNames =>
        Promise.allSettled(
          cacheNames.filter(name => cachePrefixes.some(prefix => name.startsWith(prefix))).map(name => caches.delete(name)),
        ),
      )
    }
  })
})()
`

  const cleanupDocument = `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8"><title>MoviePilot Dev Cleanup</title></head>
  <body>
    <script>
      (() => {
        const workerPaths = ${workerPaths}
        const cachePrefixes = ${cachePrefixes}
        const cleanupAttemptKey = ${cleanupAttemptKey}
        const isManagedWorker = worker => {
          if (!worker) return false
          const url = new URL(worker.scriptURL)
          return url.origin === location.origin && workerPaths.some(path => url.pathname.endsWith(path))
        }
        const resolveReturnUrl = () => {
          const requested = new URLSearchParams(location.search).get('return')
          if (!requested) return new URL('/', location.origin)
          const target = new URL(requested, location.origin)
          return target.origin === location.origin ? target : new URL('/', location.origin)
        }
        const cleanup = async () => {
          const registrations = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : []
          const managedRegistrations = registrations.filter(registration =>
            [registration.installing, registration.waiting, registration.active].some(isManagedWorker),
          )
          await Promise.allSettled(managedRegistrations.map(registration => registration.unregister()))

          if ('caches' in window) {
            const cacheNames = await caches.keys()
            const managedCacheNames = cacheNames.filter(name => cachePrefixes.some(prefix => name.startsWith(prefix)))
            await Promise.allSettled(managedCacheNames.map(name => caches.delete(name)))
          }

          // 回跳入口后由 head-prepend 脚本完成第二次导航，避免同一 client 继续复用旧模块响应。
          sessionStorage.setItem(cleanupAttemptKey, 'complete')
          location.replace(resolveReturnUrl().href)
        }

        void cleanup().catch(error => {
          console.error('[PWA] Failed to clean stale development Service Worker state', error)
          document.body.textContent = 'Failed to clean stale development Service Worker state. Reload to retry.'
        })
      })()
    </script>
  </body>
</html>`

  return {
    name: 'moviepilot:dev-service-worker-cleanup',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://localhost').pathname
        if (pathname !== DEV_SW_CLEANUP_PATH) {
          next()
          return
        }

        response.statusCode = 200
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.end(cleanupDocument)
      })
    },
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [{ tag: 'script', children: redirectScript, injectTo: 'head-prepend' }]
      },
    },
  }
}
