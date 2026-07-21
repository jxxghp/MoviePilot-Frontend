import type { Plugin } from 'vite'

const PWA_DEVELOPMENT_SCRIPT = 'dev:pwa'
export const DEV_SW_CLEANUP_PATH = '/__moviepilot_dev_sw_cleanup__'

const devEntryScriptTag = '<script type="module" src="/src/main.ts"></script>'
const devEntryScriptUrl = '/src/main.ts'
const moviePilotWorkerScripts = ['dev-sw.js?dev-sw', 'service-worker.js']
const moviePilotIdentityMessage = 'GET_UNREAD_COUNT'
const moviePilotIdentityTimeoutMs = 1500
const moviePilotIdentityAttempts = 2

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

/** 解析当前页面所属的应用根目录，兼容根路径和子路径部署。 */
export function resolveDevAppScope(pageUrl: string): URL {
  return new URL('./', new URL(pageUrl))
}

/** Worker 的 scope 和脚本 URL 都必须精确落在当前应用根目录。 */
export function isManagedServiceWorkerRegistration(
  scriptUrl: string,
  registrationScope: string,
  pageUrl: string,
): boolean {
  const appScope = resolveDevAppScope(pageUrl)
  const scope = new URL(registrationScope)
  const script = new URL(scriptUrl)

  return (
    scope.href === appScope.href &&
    moviePilotWorkerScripts.some(workerScript => script.href === new URL(workerScript, appScope).href)
  )
}

/** 复用现有轻量消息协议确认 Worker 确由 MoviePilot 提供。 */
export function isMoviePilotServiceWorkerIdentityResponse(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false

  return typeof (value as { count?: unknown }).count === 'number'
}

/** 身份探测允许有限次重试；持续失败时保持现有注册，避免误清理未知 Worker。 */
export async function retryMoviePilotIdentityVerification(
  verifyOnce: () => Promise<boolean>,
  attempts: number,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await verifyOnce()) return true
  }
  return false
}

/** 删除当前 origin 的全部 Cache Storage；调用方必须先确认该 dev origin 由 MoviePilot Worker 管理。 */
export async function deleteCurrentOriginCaches(cacheStorage: Pick<CacheStorage, 'delete' | 'keys'>): Promise<void> {
  const cacheNames = await cacheStorage.keys()
  await Promise.all(cacheNames.map(cacheName => cacheStorage.delete(cacheName)))
}

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
  const workerScripts = JSON.stringify(moviePilotWorkerScripts)
  const identityMessage = JSON.stringify(moviePilotIdentityMessage)
  const identityTimeoutMs = JSON.stringify(moviePilotIdentityTimeoutMs)
  const identityAttempts = JSON.stringify(moviePilotIdentityAttempts)
  const retryIdentityVerification = retryMoviePilotIdentityVerification.toString()
  const deleteOriginCaches = deleteCurrentOriginCaches.toString()
  const entryScriptUrl = JSON.stringify(devEntryScriptUrl)
  const cleanupPath = JSON.stringify(DEV_SW_CLEANUP_PATH)
  const cleanupAttemptKeyPrefix = JSON.stringify('moviepilot:dev-sw-cleanup')

  const redirectScript = `
(() => {
  const entryScriptUrl = ${entryScriptUrl}
  const deleteCurrentOriginCaches = ${deleteOriginCaches}
  let appStarted = false
  const startApp = () => {
    if (appStarted) return
    appStarted = true
    const entry = document.createElement('script')
    entry.type = 'module'
    entry.src = entryScriptUrl
    document.head.appendChild(entry)
  }
  if (!('serviceWorker' in navigator)) {
    startApp()
    return
  }

  const workerScripts = ${workerScripts}
  const identityMessage = ${identityMessage}
  const identityTimeoutMs = ${identityTimeoutMs}
  const identityAttempts = ${identityAttempts}
  const retryIdentityVerification = ${retryIdentityVerification}
  const cleanupPath = ${cleanupPath}
  const appScope = new URL('./', location.href)
  const cleanupAttemptKey = ${cleanupAttemptKeyPrefix} + ':' + encodeURIComponent(appScope.pathname)
  const cleanupState = sessionStorage.getItem(cleanupAttemptKey)
  const getCandidateWorker = registration => {
    if (new URL(registration.scope).href !== appScope.href) return null
    return [registration.active, registration.waiting, registration.installing].find(worker => {
      if (!worker) return false
      const scriptUrl = new URL(worker.scriptURL).href
      return workerScripts.some(workerScript => scriptUrl === new URL(workerScript, appScope).href)
    }) || null
  }
  const verifyMoviePilotWorkerOnce = worker => new Promise(resolve => {
    const channel = new MessageChannel()
    const finish = result => {
      window.clearTimeout(timeout)
      channel.port1.close()
      resolve(result)
    }
    const timeout = window.setTimeout(() => finish(false), identityTimeoutMs)
    channel.port1.onmessage = event => finish(typeof event.data?.count === 'number')
    try {
      worker.postMessage({ type: identityMessage }, [channel.port2])
    } catch {
      finish(false)
    }
  })
  const verifyMoviePilotWorker = worker =>
    retryIdentityVerification(() => verifyMoviePilotWorkerOnce(worker), identityAttempts)
  const hasVerifiedRegistration = async () => {
    const registrations = await navigator.serviceWorker.getRegistrations()
    for (const registration of registrations) {
      const worker = getCandidateWorker(registration)
      if (worker && await verifyMoviePilotWorker(worker)) return true
    }
    return false
  }
  const redirectToCleanup = () => {
    sessionStorage.setItem(cleanupAttemptKey, 'pending')
    const target = new URL(cleanupPath.slice(1), appScope)
    target.searchParams.set('return', location.href)
    location.replace(target.href)
  }

  // unregister 不会立即解除当前 document 的 controller；应用模块加载前需再导航一次以脱离旧 Worker。
  if (cleanupState === 'complete') {
    void (async () => {
      // 旧 Worker 可能在注销后的首次导航中重新创建缓存；脱离控制后再清理一次。
      if ('caches' in window) await deleteCurrentOriginCaches(caches)
      sessionStorage.removeItem(cleanupAttemptKey)
      location.reload()
    })().catch(error => {
      console.error('[PWA] Failed to finish stale development cache cleanup', error)
      document.body.textContent = 'Failed to finish stale development cache cleanup. Reload to retry.'
    })
    return
  }

  void hasVerifiedRegistration().then(hasRegistration => {
    if (hasRegistration) {
      redirectToCleanup()
      return
    }
    sessionStorage.removeItem(cleanupAttemptKey)
    startApp()
  }).catch(error => {
    console.warn('[PWA] Failed to inspect historical Service Worker state', error)
    startApp()
  })
})()
`

  const cleanupDocument = `<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8"><title>MoviePilot Dev Cleanup</title></head>
  <body>
    <script>
      (() => {
        const workerScripts = ${workerScripts}
        const identityMessage = ${identityMessage}
        const identityTimeoutMs = ${identityTimeoutMs}
        const identityAttempts = ${identityAttempts}
        const retryIdentityVerification = ${retryIdentityVerification}
        const deleteCurrentOriginCaches = ${deleteOriginCaches}
        const appScope = new URL('./', location.href)
        const cleanupAttemptKey = ${cleanupAttemptKeyPrefix} + ':' + encodeURIComponent(appScope.pathname)
        const resolveReturnUrl = () => {
          const requested = new URLSearchParams(location.search).get('return')
          if (!requested) return appScope
          const target = new URL(requested, appScope)
          return target.href.startsWith(appScope.href) ? target : appScope
        }
        const returnUrl = resolveReturnUrl()
        const getCandidateWorker = registration => {
          if (new URL(registration.scope).href !== appScope.href) return null
          return [registration.active, registration.waiting, registration.installing].find(worker => {
            if (!worker) return false
            const scriptUrl = new URL(worker.scriptURL).href
            return workerScripts.some(workerScript => scriptUrl === new URL(workerScript, appScope).href)
          }) || null
        }
        const verifyMoviePilotWorkerOnce = worker => new Promise(resolve => {
          const channel = new MessageChannel()
          const finish = result => {
            window.clearTimeout(timeout)
            channel.port1.close()
            resolve(result)
          }
          const timeout = window.setTimeout(() => finish(false), identityTimeoutMs)
          channel.port1.onmessage = event => finish(typeof event.data?.count === 'number')
          try {
            worker.postMessage({ type: identityMessage }, [channel.port2])
          } catch {
            finish(false)
          }
        })
        const verifyMoviePilotWorker = worker =>
          retryIdentityVerification(() => verifyMoviePilotWorkerOnce(worker), identityAttempts)
        const cleanup = async () => {
          if (sessionStorage.getItem(cleanupAttemptKey) !== 'pending') {
            throw new Error('Missing Service Worker cleanup context for current application scope')
          }
          const registrations = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : []
          const managedRegistrations = []
          for (const registration of registrations) {
            const worker = getCandidateWorker(registration)
            if (worker && await verifyMoviePilotWorker(worker)) managedRegistrations.push(registration)
          }
          if (!managedRegistrations.length) throw new Error('MoviePilot Service Worker identity verification failed')
          await Promise.allSettled(managedRegistrations.map(registration => registration.unregister()))

          // Vite dev server 使用独立 origin；仅在确认 MoviePilot Worker 后清除其遗留模块响应。
          if ('caches' in window) await deleteCurrentOriginCaches(caches)

          // 回跳入口后由 head-prepend 脚本完成第二次导航，避免同一 client 继续复用旧模块响应。
          sessionStorage.setItem(cleanupAttemptKey, 'complete')
          location.replace(returnUrl.href)
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
        if (!pathname.endsWith(DEV_SW_CLEANUP_PATH)) {
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
      handler(html) {
        if (!html.includes(devEntryScriptTag)) {
          throw new Error(`Expected development entry tag: ${devEntryScriptTag}`)
        }

        return {
          html: html.replace(devEntryScriptTag, ''),
          tags: [{ tag: 'script', children: redirectScript, injectTo: 'head-prepend' }],
        }
      },
    },
  }
}
