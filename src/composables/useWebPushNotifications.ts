import { onScopeDispose, toValue, watch, type MaybeRefOrGetter } from 'vue'
import api from '@/api'
import { urlBase64ToUint8Array } from '@/@core/utils/navigator'

const SUBSCRIPTION_REFRESH_INTERVAL_MS = 5 * 60 * 1000

/** 在管理员会话内恢复浏览器订阅，补齐后端重启后丢失的内存登记。 */
export function useWebPushNotifications(session: MaybeRefOrGetter<string | null>) {
  let pending: AbortController | null = null
  let disposed = false

  /** 复用浏览器已有订阅；仅在已授权时创建订阅，不在后台弹出权限请求。 */
  async function syncSubscription() {
    const currentSession = toValue(session)
    if (disposed || !currentSession || pending || !('serviceWorker' in navigator) || !('PushManager' in window)) return

    const controller = new AbortController()
    pending = controller
    try {
      // ready 在没有活动 worker 时可能永不完成；安装完成后由 controllerchange 或定时检查补登记。
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration?.active) return
      let subscription = await registration.pushManager.getSubscription()
      if (controller.signal.aborted || currentSession !== toValue(session)) return

      if (!subscription) {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_PUBLIC_VAPID_KEY),
        })
      }
      if (controller.signal.aborted || currentSession !== toValue(session)) return

      await api.post('/message/webpush/subscribe', subscription.toJSON(), {
        feedback: 'silent',
        skipNavigationCancellation: true,
        signal: controller.signal,
        timeout: 10_000,
      })
    } catch (error) {
      if (!controller.signal.aborted) console.warn('WebPush subscription failed:', error)
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
}
