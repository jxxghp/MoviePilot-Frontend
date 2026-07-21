/** Service Worker 在当前运行模式下的注册参数。 */
export interface ServiceWorkerRegistrationConfig {
  /** Worker 脚本的同源绝对地址。 */
  scriptUrl: string
  /** Worker 允许控制的应用路径。 */
  scope: string
  /** development Worker 使用 ESM，production Worker 保持 classic。 */
  type: WorkerType
}

/** Workbox coordinator 所需的最小客户端契约。 */
export interface ServiceWorkerClient {
  addEventListener(type: 'activated', listener: (event: { isExternal?: boolean; isUpdate?: boolean }) => void): void
  register(): Promise<ServiceWorkerRegistration | undefined>
  update(): Promise<void>
}

interface ServiceWorkerCoordinatorOptions {
  /** 普通 dev 返回 null；production 与显式 dev:pwa 返回实际注册参数。 */
  registration: ServiceWorkerRegistrationConfig | null
  /** 创建 Workbox 客户端，由 coordinator 保证全生命周期只调用一次。 */
  createClient: (registration: ServiceWorkerRegistrationConfig) => ServiceWorkerClient
  /** 已有 Worker 完成升级激活时通知 UI。 */
  onUpdateActivated: () => void
  /** 返回当前页面 controller，用于补偿注册期间完成的快速激活。 */
  getController?: () => ServiceWorker | null
  /** 注册失败不阻断应用启动，但必须保留诊断信息。 */
  onError?: (error: unknown) => void
}

/**
 * 根据 Vite base 和运行模式解析唯一的 Worker URL、scope 与脚本类型。
 */
export function resolveServiceWorkerRegistration(
  baseUrl: string,
  documentBaseUrl: string,
  isDevelopment: boolean,
  pwaDevelopmentEnabled: boolean,
): ServiceWorkerRegistrationConfig | null {
  if (isDevelopment && !pwaDevelopmentEnabled) return null

  const appBaseUrl = new URL(baseUrl, documentBaseUrl)
  const workerScript = isDevelopment ? 'dev-sw.js?dev-sw' : 'service-worker.js'

  return {
    scriptUrl: new URL(workerScript, appBaseUrl).href,
    scope: appBaseUrl.pathname,
    type: isDevelopment ? 'module' : 'classic',
  }
}

/**
 * 创建单 owner 的注册协调器；监听器先绑定，随后只执行一次 register。
 */
export function createServiceWorkerCoordinator(options: ServiceWorkerCoordinatorOptions) {
  let client: ServiceWorkerClient | null = null
  let registrationPromise: Promise<ServiceWorkerRegistration | undefined> | null = null
  let updateNotified = false

  const notifyUpdateActivated = (): void => {
    if (updateNotified) return
    updateNotified = true
    options.onUpdateActivated()
  }

  const initialize = (): Promise<ServiceWorkerRegistration | undefined> => {
    if (!options.registration) return Promise.resolve(undefined)
    if (registrationPromise) return registrationPromise

    const controllerBeforeRegistration = options.getController
      ? options.getController()
      : navigator.serviceWorker.controller
    client = options.createClient(options.registration)
    client.addEventListener('activated', event => {
      // 其他页签或注册 60 秒后发现的更新会被 Workbox 标为 external，仍代表当前页面需要刷新。
      if (event.isUpdate || event.isExternal) notifyUpdateActivated()
    })
    registrationPromise = client
      .register()
      .then(registration => {
        // skipWaiting + clients.claim 可能在 Workbox 接上底层监听前完成；active 已变化时仍需通知用户刷新。
        if (controllerBeforeRegistration && registration?.active !== controllerBeforeRegistration) {
          notifyUpdateActivated()
        }
        return registration
      })
      .catch(error => {
        options.onError?.(error)
        return undefined
      })

    return registrationPromise
  }

  const update = async (): Promise<void> => {
    await initialize()
    await client?.update()
  }

  return {
    initialize,
    update,
  }
}
