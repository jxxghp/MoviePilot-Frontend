import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWebPushNotifications } from '@/composables/useWebPushNotifications'
import { setNavigatingState } from '@/utils/requestOptimizer'
import { BROWSER_PUSH_OWNER_KEY, claimBrowserPushOwner, notifyBrowserPushLogin } from '@/utils/browserPush'

const mocks = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }))
vi.mock('@/api', () => ({ default: { get: mocks.get }, isApiBusinessFailure: () => false }))
vi.mock('@/utils/browserPush', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/browserPush')>()),
  sendBrowserPushSubscription: mocks.post,
}))

/** 控制浏览器查询和请求的完成时机，验证会话切换及并发行为。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('useWebPushNotifications', () => {
  let scope: EffectScope
  const session = ref<string | null>(null)
  const payload = { endpoint: 'https://push.invalid/device', keys: { p256dh: 'key', auth: 'auth' } }
  const subscription = { toJSON: () => payload, unsubscribe: vi.fn().mockResolvedValue(true) }
  let worker: EventTarget & { getRegistration: ReturnType<typeof vi.fn> }
  let registration: {
    active: object | null
    pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> }
  }

  /** 在独立作用域启动真实订阅生命周期，模拟 App 恢复管理员登录态。 */
  function start(value: string | null = 'admin:token') {
    session.value = value
    return scope.run(() =>
      useWebPushNotifications(() => {
        const value = session.value
        if (!value) return null
        const split = value.indexOf(':')
        return { account: value.slice(0, split), token: value.slice(split + 1) }
      }),
    )!
  }

  beforeEach(() => {
    vi.useFakeTimers()
    subscription.unsubscribe.mockClear().mockResolvedValue(true)
    mocks.get.mockReset().mockResolvedValue({ public_key: 'AQID' })
    vi.stubGlobal('PushManager', class PushManagerStub {})
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
    registration = {
      active: {},
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(subscription),
        subscribe: vi.fn().mockResolvedValue(subscription),
      },
    }
    worker = Object.assign(new EventTarget(), { getRegistration: vi.fn().mockResolvedValue(registration) })
    vi.stubGlobal('navigator', { serviceWorker: worker })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.post.mockReset().mockResolvedValue(null)
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    setNavigatingState(false)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('保留登录态打开页面时复用已有订阅，并在后端重启后定期重新登记', async () => {
    start()
    await flushPromises()
    expect(mocks.post).toHaveBeenCalledWith('subscribe', 'token', payload, expect.any(AbortSignal))
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(mocks.post).toHaveBeenCalledTimes(2)
  })

  it('未登录时不登记，普通账号登录后立即登记', async () => {
    start(null)
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(worker.getRegistration).not.toHaveBeenCalled()
    session.value = 'member:token'
    await flushPromises()
    expect(mocks.post).toHaveBeenCalledTimes(1)
  })

  it('仅在通知已授权且没有订阅时创建，不自动请求权限', async () => {
    registration.pushManager.getSubscription.mockResolvedValue(null)
    start()
    await flushPromises()
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3]),
    })
    expect(Notification.requestPermission).not.toHaveBeenCalled()
    expect(mocks.post).toHaveBeenCalledTimes(1)
  })

  it('用户点击时同步发起订阅，再异步登记到后端', async () => {
    registration.pushManager.getSubscription.mockResolvedValue(null)
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() })
    const lifecycle = start()
    await flushPromises()

    const result = lifecycle.requestPermissionAndSync()
    expect(registration.pushManager.subscribe).toHaveBeenCalledOnce()
    expect(Notification.requestPermission).not.toHaveBeenCalled()
    await expect(result).resolves.toBe('granted')

    expect(registration.pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3]),
    })
    expect(mocks.post).toHaveBeenCalledWith('subscribe', 'token', payload, expect.any(AbortSignal))
  })

  it('已有通知权限但静默订阅失败时仍可由点击重试', async () => {
    registration.pushManager.getSubscription.mockResolvedValue(null)
    registration.pushManager.subscribe.mockRejectedValueOnce(new Error('user gesture required'))
    const lifecycle = start()
    await flushPromises()
    expect(mocks.post).not.toHaveBeenCalled()

    const result = lifecycle.requestPermissionAndSync()
    expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(2)
    await expect(result).resolves.toBe('granted')
    expect(mocks.post).toHaveBeenCalledTimes(1)
  })

  it('未激活的 Worker 不尝试订阅，激活后点击可直接订阅', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() })
    registration.active = null
    const lifecycle = start()
    await flushPromises()
    await expect(lifecycle.requestPermissionAndSync()).resolves.toBeNull()
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()

    registration.active = {}
    worker.dispatchEvent(new Event('controllerchange'))
    await flushPromises()
    const result = lifecycle.requestPermissionAndSync()
    expect(registration.pushManager.subscribe).toHaveBeenCalledOnce()
    await expect(result).resolves.toBe('granted')
  })

  it('用户拒绝通知权限时不尝试订阅', async () => {
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() })
    const lifecycle = start()
    await flushPromises()
    await expect(lifecycle.requestPermissionAndSync()).resolves.toBe('denied')
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('订阅弹窗被拒绝后回报新的权限状态', async () => {
    const notification = { permission: 'default', requestPermission: vi.fn() }
    vi.stubGlobal('Notification', notification)
    registration.pushManager.getSubscription.mockResolvedValue(null)
    registration.pushManager.subscribe.mockImplementation(() => {
      notification.permission = 'denied'
      return Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
    })
    const lifecycle = start()
    await flushPromises()

    await expect(lifecycle.requestPermissionAndSync()).resolves.toBe('denied')
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it.each(['default', 'denied'])('权限为 %s 时不创建新订阅', async permission => {
    vi.stubGlobal('Notification', { permission, requestPermission: vi.fn() })
    registration.pushManager.getSubscription.mockResolvedValue(null)
    start()
    await flushPromises()
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()
    expect(Notification.requestPermission).not.toHaveBeenCalled()
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('无活动 worker 时不挂起，worker 激活后补登记', async () => {
    registration.active = null
    start()
    await flushPromises()
    expect(mocks.post).not.toHaveBeenCalled()
    registration.active = {}
    worker.dispatchEvent(new Event('controllerchange'))
    await flushPromises()
    expect(mocks.post).toHaveBeenCalledTimes(1)
  })

  it('发送失败后在联网、返回页面及恢复可见时重试', async () => {
    mocks.post.mockRejectedValueOnce(new Error('backend restarting'))
    start()
    await flushPromises()
    window.dispatchEvent(new Event('online'))
    await flushPromises()
    window.dispatchEvent(new Event('pageshow'))
    await flushPromises()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(mocks.post).toHaveBeenCalledTimes(4)
  })

  it('合并并发登记，路由切换不会取消请求，退出登录会取消', async () => {
    const request = deferred<null>()
    mocks.post.mockReturnValue(request.promise)
    start()
    await flushPromises()
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(mocks.post).toHaveBeenCalledTimes(1)
    const signal = mocks.post.mock.calls[0][3] as AbortSignal
    setNavigatingState(true)
    expect(signal.aborted).toBe(false)
    session.value = null
    await nextTick()
    expect(signal.aborted).toBe(true)
    request.resolve(null)
    await flushPromises()
  })

  it('切换会话后丢弃旧浏览器查询结果，并为新账号轮换订阅', async () => {
    const oldQuery = deferred<typeof subscription>()
    registration.pushManager.getSubscription.mockReturnValueOnce(oldQuery.promise)
    start()
    await flushPromises()
    session.value = 'other-admin:token'
    await flushPromises()
    oldQuery.resolve(subscription)
    await flushPromises()
    expect(mocks.post).toHaveBeenCalledTimes(1)
  })

  it('作用域销毁后取消未完成查询并清理重试监听和定时器', async () => {
    const query = deferred<typeof subscription>()
    registration.pushManager.getSubscription.mockReturnValueOnce(query.promise)
    start()
    await flushPromises()
    scope.stop()
    query.resolve(subscription)
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('pageshow'))
    worker.dispatchEvent(new Event('controllerchange'))
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    await flushPromises()
    expect(mocks.post).not.toHaveBeenCalled()
    expect(worker.getRegistration).toHaveBeenCalledTimes(1)
  })

  it('浏览器不支持 Web Push 时保持静默', async () => {
    vi.stubGlobal('navigator', {})
    start()
    await flushPromises()
    expect(mocks.post).not.toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('其他标签页切换账号后，旧标签页的定时刷新不会夺回订阅', async () => {
    start('alice:token-a')
    await flushPromises()
    claimBrowserPushOwner('bob')
    window.dispatchEvent(new StorageEvent('storage', { key: BROWSER_PUSH_OWNER_KEY }))
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    window.dispatchEvent(new Event('online'))
    await flushPromises()
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
  })

  it('恢复旧账号页面不会覆盖已有通知账号，明确登录才取消旧订阅并重新登记', async () => {
    claimBrowserPushOwner('bob')
    start('alice:old-token')
    await flushPromises()
    expect(mocks.post).not.toHaveBeenCalled()
    notifyBrowserPushLogin()
    session.value = 'alice:new-token'
    await flushPromises()
    expect(subscription.unsubscribe).toHaveBeenCalledOnce()
    expect(mocks.post).toHaveBeenCalledWith('subscribe', 'new-token', payload, expect.any(AbortSignal))
  })

  it('同账号令牌刷新复用当前端点，不反复取消订阅', async () => {
    start('alice:old-token')
    await flushPromises()
    session.value = 'alice:new-token'
    await flushPromises()
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
    expect(mocks.post).toHaveBeenLastCalledWith('subscribe', 'new-token', payload, expect.any(AbortSignal))
    expect(localStorage.getItem(BROWSER_PUSH_OWNER_KEY)).not.toContain('token')
  })

  it('旧标签页迟到的浏览器查询即使返回新账号订阅也不登记', async () => {
    const query = deferred<typeof subscription>()
    registration.pushManager.getSubscription.mockReturnValueOnce(query.promise)
    start('alice:token-a')
    await flushPromises()
    claimBrowserPushOwner('bob')
    query.resolve(subscription)
    await flushPromises()
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('取消旧端点失败时不登记新账号，恢复后重试取消并发送新端点', async () => {
    const next = { ...payload, endpoint: 'https://push.invalid/new-device' }
    registration.pushManager.subscribe.mockResolvedValue({ toJSON: () => next })
    start('alice:token-a')
    await flushPromises()
    subscription.unsubscribe.mockResolvedValueOnce(false)
    session.value = 'bob:token-b'
    await flushPromises()
    expect(mocks.post).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('online'))
    await flushPromises()
    expect(mocks.post).toHaveBeenLastCalledWith('subscribe', 'token-b', next, expect.any(AbortSignal))
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(2)
  })

  it('已发出的旧请求迟到完成时，新账号仍只登记取消后建立的新端点', async () => {
    const oldRequest = deferred<void>()
    mocks.post.mockReturnValueOnce(oldRequest.promise)
    start('alice:token-a')
    await flushPromises()
    const next = { ...payload, endpoint: 'https://push.invalid/new-device' }
    registration.pushManager.subscribe.mockResolvedValue({ toJSON: () => next })
    session.value = 'bob:token-b'
    await flushPromises()
    oldRequest.resolve()
    await flushPromises()
    expect(mocks.post.mock.calls.map(call => [call[1], call[2].endpoint])).toEqual([
      ['token-a', payload.endpoint],
      ['token-b', next.endpoint],
    ])
    expect(subscription.unsubscribe).toHaveBeenCalledOnce()
  })

  it('有 Web Locks 时旧请求完成后才取消旧端点并登记新账号', async () => {
    let queue: Promise<unknown> = Promise.resolve()
    const request = vi.fn((_name: string, action: () => Promise<unknown>) => {
      const result = queue.then(action)
      queue = result.catch(() => {})
      return result
    })
    Object.assign(navigator, { locks: { request } })
    const oldRequest = deferred<void>()
    mocks.post.mockReturnValueOnce(oldRequest.promise)
    start('alice:token-a')
    await flushPromises()
    const next = { ...payload, endpoint: 'https://push.invalid/new-device' }
    registration.pushManager.subscribe.mockResolvedValue({ toJSON: () => next })
    session.value = 'bob:token-b'
    await flushPromises()
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
    oldRequest.resolve()
    await flushPromises()
    expect(subscription.unsubscribe).toHaveBeenCalledOnce()
    expect(mocks.post).toHaveBeenLastCalledWith('subscribe', 'token-b', next, expect.any(AbortSignal))
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('明确重新登录即使令牌未变也能重新选择通知账号', async () => {
    claimBrowserPushOwner('bob')
    start('alice:token-a')
    await flushPromises()
    notifyBrowserPushLogin()
    await flushPromises()
    expect(subscription.unsubscribe).toHaveBeenCalledOnce()
    expect(mocks.post).toHaveBeenCalledWith('subscribe', 'token-a', payload, expect.any(AbortSignal))
  })
  it('普通账号从服务端读取当前 VAPID 公钥，保留账号隔离的登记接口', async () => {
    start('member:member-token')
    await flushPromises()
    expect(mocks.get).toHaveBeenCalledWith('/message/webpush/public-key', {
      feedback: 'silent',
      skipNavigationCancellation: true,
      signal: expect.any(AbortSignal),
      timeout: 10_000,
    })
    expect(mocks.post).toHaveBeenCalledWith('subscribe', 'member-token', payload, expect.any(AbortSignal))
  })

  it('当前服务端公钥轮换后取消旧订阅，并保留当前账号登记', async () => {
    const old = {
      toJSON: () => payload,
      options: { applicationServerKey: new Uint8Array([1, 2, 3]).buffer },
      unsubscribe: vi.fn().mockResolvedValue(true),
    }
    const next = {
      toJSON: () => ({ ...payload, endpoint: 'https://push.invalid/new-key' }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    }
    mocks.get.mockResolvedValue({ public_key: 'BAUG' })
    registration.pushManager.getSubscription.mockResolvedValue(old)
    registration.pushManager.subscribe.mockResolvedValue(next)
    start('member:member-token')
    await flushPromises()
    expect(old.unsubscribe).toHaveBeenCalledOnce()
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([4, 5, 6]),
    })
    expect(mocks.post).toHaveBeenCalledWith('subscribe', 'member-token', next.toJSON(), expect.any(AbortSignal))
  })

  it('切号期间丢弃旧公钥响应，不向旧账号登记或覆盖新会话公钥', async () => {
    const oldKey = deferred<{ public_key: string }>()
    mocks.get.mockReturnValueOnce(oldKey.promise).mockResolvedValue({ public_key: 'BAUG' })
    start('first:old-token')
    await flushPromises()
    session.value = 'second:new-token'
    await flushPromises()
    oldKey.resolve({ public_key: 'AQID' })
    await flushPromises()
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(mocks.post).toHaveBeenCalledWith('subscribe', 'new-token', payload, expect.any(AbortSignal))
  })

  it('手动订阅遇到旧公钥冲突后重建，重试仍绑定原确认会话', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() })
    registration.pushManager.getSubscription.mockResolvedValueOnce(null).mockResolvedValue(subscription)
    const lifecycle = start('member:member-token')
    await flushPromises()
    registration.pushManager.subscribe
      .mockRejectedValueOnce(new DOMException('old key', 'InvalidStateError'))
      .mockResolvedValue(subscription)
    await expect(lifecycle.requestPermissionAndSync()).resolves.toBe('granted')
    expect(subscription.unsubscribe).toHaveBeenCalledOnce()
    expect(mocks.post).toHaveBeenCalledWith('subscribe', 'member-token', payload, expect.any(AbortSignal))
  })
})
