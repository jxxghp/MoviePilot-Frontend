import { onScopeDispose, ref, toValue, watch, type InjectionKey, type MaybeRefOrGetter } from 'vue'
import api, { isApiBusinessFailure } from '@/api'
import { urlBase64ToUint8Array } from '@/@core/utils/navigator'
import {
  BROWSER_PUSH_LOGIN_EVENT,
  BROWSER_PUSH_OWNER_KEY,
  claimBrowserPushOwner,
  finishBrowserPushRotation,
  ownsBrowserPush,
  readBrowserPushOwner,
  sendBrowserPushSubscription,
  withBrowserPushLock,
  type BrowserPushOwner,
  type BrowserPushSession,
} from '@/utils/browserPush'

const SUBSCRIPTION_REFRESH_INTERVAL_MS = 5 * 60 * 1000

const WEBPUSH_PUBLIC_KEY_ENDPOINT = '/message/webpush/public-key'

/** 后端返回的 Web Push VAPID 公钥载荷。 */
interface WebPushPublicKeyPayload {
  public_key?: string
}

type ApplicationServerKey = ReturnType<typeof urlBase64ToUint8Array>

/** 用户点击通知设置时调用，返回真实权限或未完成登记的 null。 */
export type WebPushPermissionRequester = () => Promise<NotificationPermission | null>
/** App 和设置弹窗共用一个订阅生命周期，避免后台重复申请权限。 */
export const WEB_PUSH_PERMISSION_REQUEST_KEY: InjectionKey<WebPushPermissionRequester> =
  Symbol('web-push-permission-request')

/** 浏览器授权弹窗可在 await 期间修改权限，不能复用调用前收窄的类型。 */
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

/** 当前网页登录账号恢复订阅，每次异步恢复均复核共享浏览器通知的账号和代次。 */
export function useWebPushNotifications(session: MaybeRefOrGetter<BrowserPushSession | null>) {
  let pending: AbortController | null = null
  let activeRegistration: ServiceWorkerRegistration | null = null
  let disposed = false
  let loginRequested = false
  const loginVersion = ref(0)

  function currentOwner(): BrowserPushOwner | null {
    const current = toValue(session)
    const owner = readBrowserPushOwner()
    return current && owner?.account === current.account ? owner : null
  }

  function valid(current: BrowserPushSession, owner: BrowserPushOwner, controller: AbortController): boolean {
    const latest = toValue(session)
    return (
      !disposed &&
      !controller.signal.aborted &&
      latest?.account === current.account &&
      latest.token === current.token &&
      ownsBrowserPush(owner)
    )
  }

  let activeApplicationServerKey: ApplicationServerKey | null = null

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
      if (signal.aborted) return null
      activeApplicationServerKey = keyBytes
      return keyBytes
    } catch (error) {
      if (isApiBusinessFailure(error)) activeApplicationServerKey = null
      throw error
    }
  }

  /** 切号先取消旧端点，迟到的旧账号请求只能登记已经失效的旧订阅。 */
  async function syncSubscription(): Promise<boolean> {
    const current = toValue(session)
    const owner = currentOwner()
    if (disposed || !current || pending || !('serviceWorker' in navigator) || !('PushManager' in window)) return false
    const controller = new AbortController()
    pending = controller
    try {
      return await withBrowserPushLock(async () => {
        if (!owner) {
          const registration = await navigator.serviceWorker.getRegistration()
          const latest = toValue(session)
          if (
            !disposed &&
            !controller.signal.aborted &&
            latest?.token === current.token &&
            latest.account === current.account
          )
            activeRegistration = registration?.active ? registration : null
          return false
        }
        if (!valid(current, owner, controller)) return false
        const registration = await navigator.serviceWorker.getRegistration()
        if (!valid(current, owner, controller)) return false
        activeRegistration = registration?.active ? registration : null
        if (!activeRegistration) return false
        const applicationServerKey = await fetchApplicationServerKey(controller.signal)
        if (!valid(current, owner, controller) || !applicationServerKey) return false
        let subscription = await activeRegistration.pushManager.getSubscription()
        if (!valid(current, owner, controller)) return false
        const rotateOwner = readBrowserPushOwner()?.rotate
        const rotateKey = subscription && isSubscriptionKeyMismatched(subscription, applicationServerKey)
        if (rotateKey && !rotateOwner && (typeof Notification === 'undefined' || Notification.permission !== 'granted'))
          return false
        if (rotateOwner || rotateKey) {
          if (subscription && !(await subscription.unsubscribe())) return false
          if (!valid(current, owner, controller) || (rotateOwner && !finishBrowserPushRotation(owner))) return false
          subscription = null
        }
        if (!subscription) {
          if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
          subscription = await activeRegistration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
        }
        if (!valid(current, owner, controller)) return false
        await sendBrowserPushSubscription('subscribe', current.token, subscription.toJSON(), controller.signal)
        return valid(current, owner, controller)
      })
    } catch {
      if (!controller.signal.aborted) console.warn('浏览器通知暂未完成登记，将在恢复连接后重试')
      return false
    } finally {
      if (pending === controller) pending = null
    }
  }

  /** 同步发起 subscribe 保留用户手势，切号准备尚未完成时先取消旧端点。 */
  async function requestPermissionAndSync(): Promise<NotificationPermission | null> {
    const current = toValue(session)
    if (disposed || !current || !activeRegistration?.active || typeof Notification === 'undefined') return null
    if (Notification.permission === 'denied') return 'denied'
    const owner = currentOwner() ?? claimBrowserPushOwner(current.account)
    if (!owner) return null
    if (owner.rotate) {
      pending?.abort()
      pending = null
      return (await syncSubscription()) ? 'granted' : null
    }
    pending?.abort()
    const controller = new AbortController()
    pending = controller
    try {
      const registration = activeRegistration
      let applicationServerKey = activeApplicationServerKey
      if (!applicationServerKey) {
        applicationServerKey = await fetchApplicationServerKey(controller.signal)
        if (!valid(current, owner, controller) || !applicationServerKey) return null
      }
      let subscription: PushSubscription
      try {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
      } catch (error) {
        if (!isInvalidStateError(error)) throw error
        const existing = await registration.pushManager.getSubscription()
        if (!valid(current, owner, controller)) return null
        if (existing && !(await existing.unsubscribe())) return null
        if (!valid(current, owner, controller)) return null
        const latestKey = await fetchApplicationServerKey(controller.signal)
        if (!valid(current, owner, controller) || !latestKey) return null
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: latestKey,
        })
      }
      if (!valid(current, owner, controller)) return null
      return await withBrowserPushLock(async () => {
        if (!valid(current, owner, controller)) return null
        await sendBrowserPushSubscription('subscribe', current.token, subscription.toJSON(), controller.signal)
        return valid(current, owner, controller) ? 'granted' : null
      })
    } catch {
      if (!controller.signal.aborted) console.warn('浏览器通知授权或登记尚未完成，请稍后重试')
      return currentNotificationPermission() === 'denied' ? 'denied' : null
    } finally {
      if (pending === controller) pending = null
    }
  }

  function invalidatePending() {
    activeApplicationServerKey = null
    pending?.abort()
    pending = null
  }

  function handleLogin() {
    loginRequested = true
    loginVersion.value += 1
  }

  function handleStorage(event: StorageEvent) {
    if (event.key !== null && event.key !== BROWSER_PUSH_OWNER_KEY) return
    invalidatePending()
    if (currentOwner()) void syncSubscription()
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') void syncSubscription()
  }

  window.addEventListener(BROWSER_PUSH_LOGIN_EVENT, handleLogin)
  watch(
    () => {
      const current = toValue(session)
      return current ? `${current.account}:${current.token}:${loginVersion.value}` : null
    },
    (_value, previous) => {
      invalidatePending()
      const current = toValue(session)
      if (!current) return
      const previousAccount = previous?.slice(0, previous.indexOf(':'))
      if (loginRequested || !readBrowserPushOwner() || (previousAccount && previousAccount !== current.account))
        claimBrowserPushOwner(current.account)
      loginRequested = false
      void syncSubscription()
    },
    { immediate: true },
  )
  const interval = window.setInterval(() => void syncSubscription(), SUBSCRIPTION_REFRESH_INTERVAL_MS)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('online', syncSubscription)
  window.addEventListener('pageshow', syncSubscription)
  window.addEventListener('storage', handleStorage)
  navigator.serviceWorker?.addEventListener('controllerchange', syncSubscription)

  onScopeDispose(() => {
    disposed = true
    invalidatePending()
    window.clearInterval(interval)
    window.removeEventListener(BROWSER_PUSH_LOGIN_EVENT, handleLogin)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('online', syncSubscription)
    window.removeEventListener('pageshow', syncSubscription)
    window.removeEventListener('storage', handleStorage)
    navigator.serviceWorker?.removeEventListener('controllerchange', syncSubscription)
  })
  return { requestPermissionAndSync }
}
