import { onScopeDispose, toValue, watch, type InjectionKey, type MaybeRefOrGetter } from 'vue'
import api from '@/api'
import { urlBase64ToUint8Array } from '@/@core/utils/navigator'

const SUBSCRIPTION_REFRESH_INTERVAL_MS = 5 * 60 * 1000

export type WebPushPermissionRequester = () => Promise<NotificationPermission | null>

/** App 向设置弹窗提供用户手势授权入口，保持权限请求与订阅生命周期由同一实例管理。 */
export const WEB_PUSH_PERMISSION_REQUEST_KEY: InjectionKey<WebPushPermissionRequester> =
  Symbol('web-push-permission-request')

/** 订阅失败后重新读取系统权限，浏览器弹窗可能已在异步期间将其改为拒绝。 */
function currentNotificationPermission(): NotificationPermission {
  return Notification.permission
}

/** 在管理员会话内恢复浏览器订阅，补齐后端重启后丢失的内存登记。 */
export function useWebPushNotifications(session: MaybeRefOrGetter<string | null>) {
  let pending: AbortController | null = null
  let activeRegistration: ServiceWorkerRegistration | null = null
  let disposed = false

  /** 复用浏览器已有订阅；仅在已授权时创建订阅，不在后台弹出权限请求。 */
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
      let subscription = await registration.pushManager.getSubscription()
      if (controller.signal.aborted || currentSession !== toValue(session)) return false

      if (!subscription) {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_PUBLIC_VAPID_KEY),
        })
      }
      if (controller.signal.aborted || currentSession !== toValue(session)) return false

      await api.post('/message/webpush/subscribe', subscription.toJSON(), {
        feedback: 'silent',
        skipNavigationCancellation: true,
        signal: controller.signal,
        timeout: 10_000,
      })
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

    // subscribe 必须在首次 await 之前调用；浏览器会在此调用中请求通知权限。
    pending?.abort()
    const controller = new AbortController()
    pending = controller
    try {
      const subscription = await activeRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_PUBLIC_VAPID_KEY),
      })
      if (controller.signal.aborted || currentSession !== toValue(session)) return null

      await api.post('/message/webpush/subscribe', subscription.toJSON(), {
        feedback: 'silent',
        skipNavigationCancellation: true,
        signal: controller.signal,
        timeout: 10_000,
      })
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
