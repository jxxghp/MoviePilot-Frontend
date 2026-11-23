import { onScopeDispose, toValue, watch, type InjectionKey, type MaybeRefOrGetter } from 'vue'
import api, { isApiBusinessFailure } from '@/api'
import { urlBase64ToUint8Array } from '@/@core/utils/navigator'

const SUBSCRIPTION_REFRESH_INTERVAL_MS = 5 * 60 * 1000
const WEBPUSH_PUBLIC_KEY_ENDPOINT = '/message/webpush/public-key'
const WEBPUSH_SUBSCRIBE_ENDPOINT = '/message/webpush/subscribe'

/** 后端返回的 Web Push VAPID 公钥载荷。 */
interface WebPushPublicKeyPayload {
  public_key?: string
}

type ApplicationServerKey = ReturnType<typeof urlBase64ToUint8Array>

export type WebPushPermissionRequester = () => Promise<NotificationPermission | null>

/** App 向设置弹窗提供用户手势授权入口，保持权限请求与订阅生命周期由同一实例管理。 */
export const WEB_PUSH_PERMISSION_REQUEST_KEY: InjectionKey<WebPushPermissionRequester> =
  Symbol('web-push-permission-request')

/** 订阅失败后重新读取系统权限，浏览器弹窗可能已在异步期间将其改为拒绝。 */
function currentNotificationPermission(): NotificationPermission {
  return Notification.permission
}

/** 逐字节比较两个 VAPID 公钥，判断浏览器现有订阅是否仍绑定当前服务端公钥。 */
function sameApplicationServerKey(existing: ArrayBuffer | null | undefined, expected: ApplicationServerKey): boolean {
  if (!existing) return false
  const existingBytes = new Uint8Array(existing)
  if (existingBytes.length !== expected.length) return false
  for (let index = 0; index < expected.length; index += 1) {
    if (existingBytes[index] !== expected[index]) return false
  }
  return true
}

/** 浏览器暴露了订阅公钥且与服务端不一致时，需要退订并按新公钥重建订阅。 */
function isSubscriptionKeyMismatched(subscription: PushSubscription, expected: ApplicationServerKey): boolean {
  const existingKey = subscription.options?.applicationServerKey
  if (existingKey === undefined) return false
  return !sameApplicationServerKey(existingKey, expected)
}

/** 判断浏览器是否因现有订阅使用了旧公钥而拒绝直接重新订阅。 */
function isInvalidStateError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'InvalidStateError'
}

/** 在管理员会话内恢复浏览器订阅，补齐后端重启后丢失的内存登记并跟踪服务端公钥轮换。 */
export function useWebPushNotifications(session: MaybeRefOrGetter<string | null>) {
  let pending: AbortController | null = null
  let activeRegistration: ServiceWorkerRegistration | null = null
  let activeApplicationServerKey: ApplicationServerKey | null = null
  let disposed = false

  /** 从后端拉取当前实例的 VAPID 公钥并更新内存缓存，避免在前端静态写死密钥。 */
  async function fetchApplicationServerKey(signal: AbortSignal): Promise<ApplicationServerKey | null> {
    try {
      const data = await api.get<WebPushPublicKeyPayload>(WEBPUSH_PUBLIC_KEY_ENDPOINT, {
        feedback: 'silent',
        skipNavigationCancellation: true,
        signal,
        timeout: 10_000,
      })
      const rawKey = typeof data?.public_key === 'string' ? data.public_key.trim() : ''
      if (!rawKey) {
        activeApplicationServerKey = null
        return null
      }
      const keyBytes = urlBase64ToUint8Array(rawKey)
      if (!keyBytes.length) {
        activeApplicationServerKey = null
        return null
      }
      activeApplicationServerKey = keyBytes
      return keyBytes
    } catch (error) {
      if (isApiBusinessFailure(error)) activeApplicationServerKey = null
      throw error
    }
  }

  /** 将当前浏览器订阅同步到后端。 */
  async function registerSubscription(subscription: PushSubscription, signal: AbortSignal): Promise<void> {
    await api.post(WEBPUSH_SUBSCRIBE_ENDPOINT, subscription.toJSON(), {
      feedback: 'silent',
      skipNavigationCancellation: true,
      signal,
      timeout: 10_000,
    })
  }

  /** 复用浏览器已有订阅；公钥变化或无订阅且已授权时自动重建，不在后台弹出权限请求。 */
  async function syncSubscription(): Promise<boolean> {
    const currentSession = toValue(session)
    if (disposed || !currentSession || pending || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return false
    }

    const controller = new AbortController()
    pending = controller
    try {
      // ready 在没有活动 worker 时可能永不完成；安装完成后由 controllerchange 或定时检查补登记。
      const registration = await navigator.serviceWorker.getRegistration()
      if (controller.signal.aborted || currentSession !== toValue(session)) return false
      activeRegistration = registration?.active ? registration : null
      if (!registration?.active) return false

      const applicationServerKey = await fetchApplicationServerKey(controller.signal)
      if (controller.signal.aborted || currentSession !== toValue(session) || !applicationServerKey) return false

      let subscription = await registration.pushManager.getSubscription()
      if (controller.signal.aborted || currentSession !== toValue(session)) return false

      if (subscription && isSubscriptionKeyMismatched(subscription, applicationServerKey)) {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
        if (typeof subscription.unsubscribe === 'function') await subscription.unsubscribe()
        if (controller.signal.aborted || currentSession !== toValue(session)) return false
        subscription = null
      }

      if (!subscription) {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        })
      }
      if (controller.signal.aborted || currentSession !== toValue(session)) return false

      await registerSubscription(subscription, controller.signal)
      return true
    } catch (error) {
      if (!controller.signal.aborted) console.warn('WebPush subscription failed:', error)
      return false
    } finally {
      if (pending === controller) pending = null
    }
  }

  /** 由用户点击直接发起订阅，避免 iOS 在异步查询或权限弹窗后丢失用户激活。 */
  async function requestPermissionAndSync(): Promise<NotificationPermission | null> {
    const currentSession = toValue(session)
    if (
      disposed ||
      !currentSession ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      typeof Notification === 'undefined'
    ) {
      return null
    }

    if (Notification.permission === 'denied') return 'denied'
    if (!activeRegistration?.active) return null

    // 已预取公钥时必须在首次 await 之前调用 subscribe；浏览器会在此调用中请求通知权限。
    pending?.abort()
    const controller = new AbortController()
    pending = controller
    try {
      const registration = activeRegistration
      let applicationServerKey = activeApplicationServerKey
      let subscribePromise: Promise<PushSubscription>
      if (applicationServerKey) {
        subscribePromise = registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        })
      } else {
        applicationServerKey = await fetchApplicationServerKey(controller.signal)
        if (controller.signal.aborted || currentSession !== toValue(session) || !applicationServerKey) return null
        subscribePromise = registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        })
      }

      let subscription: PushSubscription
      try {
        subscription = await subscribePromise
      } catch (subscribeError) {
        if (!isInvalidStateError(subscribeError)) throw subscribeError
        const existing = await registration.pushManager.getSubscription()
        if (existing && typeof existing.unsubscribe === 'function') await existing.unsubscribe()
        if (controller.signal.aborted || currentSession !== toValue(session)) return null
        const latestKey = (await fetchApplicationServerKey(controller.signal)) ?? applicationServerKey
        if (controller.signal.aborted || currentSession !== toValue(session) || !latestKey) return null
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: latestKey,
        })
      }
      if (controller.signal.aborted || currentSession !== toValue(session)) return null

      await registerSubscription(subscription, controller.signal)
      return 'granted'
    } catch (error) {
      if (!controller.signal.aborted) console.warn('WebPush permission request failed:', error)
      return currentNotificationPermission() === 'denied' ? 'denied' : null
    } finally {
      if (pending === controller) pending = null
    }
  }

  /** 页面恢复可见时重新登记，覆盖移动端挂起和离线期间的后端升级。 */
  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') void syncSubscription()
  }

  watch(
    () => toValue(session),
    () => {
      pending?.abort()
      pending = null
      activeApplicationServerKey = null
      void syncSubscription()
    },
    { immediate: true },
  )
  const interval = window.setInterval(() => void syncSubscription(), SUBSCRIPTION_REFRESH_INTERVAL_MS)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('online', syncSubscription)
  window.addEventListener('pageshow', syncSubscription)
  navigator.serviceWorker?.addEventListener('controllerchange', syncSubscription)

  onScopeDispose(() => {
    disposed = true
    pending?.abort()
    window.clearInterval(interval)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('online', syncSubscription)
    window.removeEventListener('pageshow', syncSubscription)
    navigator.serviceWorker?.removeEventListener('controllerchange', syncSubscription)
  })

  return { requestPermissionAndSync }
}
