/** 浏览器通知当前账号及代次；仅协调同源标签页，不参与服务端认证。 */
export interface BrowserPushOwner {
  /** 当前通知账号；null 表示用户主动退出，旧标签页不能自动夺回。 */
  account: string | null
  /** 随机浏览器代次，不是服务端授权或数据库版本。 */
  epoch: string
  /** 新账号登记前是否必须取消旧浏览器端点。 */
  rotate: boolean
}

/** 当前网页认证，只在内存中冻结请求身份，不写入浏览器通知标记。 */
export interface BrowserPushSession {
  account: string
  token: string
}

export const BROWSER_PUSH_OWNER_KEY = 'moviepilot:webpush-owner:v1'
export const BROWSER_PUSH_LOGIN_EVENT = 'moviepilot:webpush-login'
export const BROWSER_PUSH_REVOKE_WARNING_EVENT = 'moviepilot:webpush-revocation-unconfirmed'

/** 标记真实登录选择；恢复持久化会话和刷新令牌不自动夺回其他标签页的通知。 */
export function notifyBrowserPushLogin() {
  window.dispatchEvent(new Event(BROWSER_PUSH_LOGIN_EVENT))
}

/** 存储不可用时返回 undefined，不能假定拥有其他标签页的订阅。 */
export function readBrowserPushOwner(): BrowserPushOwner | null | undefined {
  try {
    const raw = localStorage.getItem(BROWSER_PUSH_OWNER_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return undefined
    const owner = value as Partial<BrowserPushOwner>
    if (
      (typeof owner.account !== 'string' && owner.account !== null) ||
      typeof owner.epoch !== 'string' ||
      !owner.epoch ||
      typeof owner.rotate !== 'boolean'
    )
      return undefined
    return owner as BrowserPushOwner
  } catch {
    return undefined
  }
}

/** 只有用户登录或明确启用时切换账号，保留未完成的旧订阅轮换要求。 */
export function claimBrowserPushOwner(account: string): BrowserPushOwner | null {
  const previous = readBrowserPushOwner()
  if (previous === undefined) return null
  if (previous?.account === account) return previous
  const owner = { account, epoch: crypto.randomUUID(), rotate: previous !== null }
  try {
    localStorage.setItem(BROWSER_PUSH_OWNER_KEY, JSON.stringify(owner))
    return owner
  } catch {
    return null
  }
}

/** 每次 await 后重新核对共享代次，不接受旧标签页的迟到查询和登记。 */
export function ownsBrowserPush(owner: BrowserPushOwner): boolean {
  const current = readBrowserPushOwner()
  return current?.epoch === owner.epoch && current.account === owner.account
}

/** 取消旧订阅后比较代次再清除轮换标记，不能覆盖刚切换的新账号。 */
export function finishBrowserPushRotation(owner: BrowserPushOwner): boolean {
  if (!ownsBrowserPush(owner)) return false
  try {
    localStorage.setItem(BROWSER_PUSH_OWNER_KEY, JSON.stringify({ ...owner, rotate: false }))
    return true
  } catch {
    return false
  }
}

/** 支持 Web Locks 时串行同源标签页；其余浏览器仍逐步复核共享代次与端点隔离。 */
export function withBrowserPushLock<T>(action: () => Promise<T>): Promise<T> {
  return navigator.locks ? navigator.locks.request('moviepilot:webpush', action) : action()
}

/** 冻结请求账号，避免全局 HTTP 拦截器在异步期间把身份替换成新账号。 */
export async function sendBrowserPushSubscription(
  action: 'subscribe' | 'unsubscribe',
  token: string,
  subscription: PushSubscriptionJSON,
  signal?: AbortSignal,
): Promise<void> {
  const base = new URL(import.meta.env.VITE_API_BASE_URL, document.baseURI)
  if (!base.pathname.endsWith('/')) base.pathname += '/'
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = window.setTimeout(abort, 10_000)
  try {
    const response = await fetch(new URL(`message/webpush/${action}`, base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(subscription),
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: action === 'unsubscribe',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`浏览器通知登记失败（HTTP ${response.status}）`)
    const result: unknown = await response.json()
    if (!result || typeof result !== 'object' || !('success' in result) || result.success !== true)
      throw new Error('浏览器通知登记未确认')
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

/** 主动退出立即撤销代次；本机取消不依赖服务器在线，注销请求保留旧账号身份。 */
export async function revokeBrowserPushBinding(token: string | null, account: string): Promise<boolean> {
  if (!token || !('serviceWorker' in navigator)) return true
  const previous = readBrowserPushOwner()
  if (previous === undefined || (previous && previous.account !== account)) return true
  const revoked: BrowserPushOwner = { account: null, epoch: crypto.randomUUID(), rotate: true }
  try {
    localStorage.setItem(BROWSER_PUSH_OWNER_KEY, JSON.stringify(revoked))
    return await withBrowserPushLock(async () => {
      if (!ownsBrowserPush(revoked)) return true
      const registration = await navigator.serviceWorker.getRegistration()
      if (!ownsBrowserPush(revoked)) return true
      const subscription = await registration?.pushManager.getSubscription()
      if (!subscription || !ownsBrowserPush(revoked)) return true
      const payload = subscription.toJSON()
      const results = await Promise.allSettled([
        subscription.unsubscribe(),
        sendBrowserPushSubscription('unsubscribe', token, payload),
      ])
      return results[0].status === 'fulfilled' && results[0].value && results[1].status === 'fulfilled'
    })
  } catch {
    return false
  }
}
