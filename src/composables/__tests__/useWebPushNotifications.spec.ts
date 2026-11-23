import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWebPushNotifications } from '@/composables/useWebPushNotifications'
import { initializeRequestOptimizer, setNavigatingState } from '@/utils/requestOptimizer'
import axios from 'axios'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  isApiBusinessFailure: vi.fn(() => false),
}))
vi.mock('@/api', () => ({
  default: {
    get: mocks.get,
    post: mocks.post,
  },
  isApiBusinessFailure: mocks.isApiBusinessFailure,
}))

/** 控制浏览器查询和请求的完成时机，验证会话切换及并发行为。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

/** 构造模拟 PushSubscription，便于验证不同公钥下的复用与自动重建。 */
function createSubscription(
  payload: { endpoint: string; keys: { p256dh: string; auth: string } },
  applicationServerKey?: Uint8Array | null,
) {
  return {
    options:
      applicationServerKey === undefined
        ? undefined
        : {
            applicationServerKey: applicationServerKey ? applicationServerKey.slice().buffer : null,
          },
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: () => payload,
  }
}

describe('useWebPushNotifications', () => {
  let scope: EffectScope
  const session = ref<string | null>(null)
  const payload = { endpoint: 'https://push.invalid/device', keys: { p256dh: 'key', auth: 'auth' } }
  let subscription: ReturnType<typeof createSubscription>
  let worker: EventTarget & { getRegistration: ReturnType<typeof vi.fn> }
  let registration: {
    active: object | null
    pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> }
  }

  /** 在独立作用域启动真实订阅生命周期，模拟 App 恢复管理员登录态。 */
  function start(value: string | null = 'admin:token') {
    session.value = value
    return scope.run(() => useWebPushNotifications(session))!
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('PushManager', class PushManagerStub {})
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
    subscription = createSubscription(payload, new Uint8Array([1, 2, 3]))
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
    mocks.get.mockReset().mockResolvedValue({ public_key: 'AQID' })
    mocks.post.mockReset().mockResolvedValue(null)
    mocks.isApiBusinessFailure.mockReset().mockReturnValue(false)
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

  it('保留登录态打开页面时从后端拉取公钥并复用匹配订阅，定期重新登记', async () => {
    start()
    await flushPromises()
    expect(mocks.get).toHaveBeenCalledWith('/message/webpush/public-key', {
      feedback: 'silent',
      skipNavigationCancellation: true,
      signal: expect.any(AbortSignal),
      timeout: 10_000,
    })
    expect(mocks.post).toHaveBeenCalledWith('/message/webpush/subscribe', payload, {
      feedback: 'silent',
      skipNavigationCancellation: true,
      signal: expect.any(AbortSignal),
      timeout: 10_000,
    })
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(mocks.post).toHaveBeenCalledTimes(2)
  })

  it('服务端 VAPID 公钥轮换后自动退订旧订阅并按新公钥重建', async () => {
    const rotatedPayload = { endpoint: 'https://push.invalid/rotated', keys: { p256dh: 'new-key', auth: 'new-auth' } }
    const oldSubscription = createSubscription(payload, new Uint8Array([1, 2, 3]))
    const newSubscription = createSubscription(rotatedPayload, new Uint8Array([4, 5, 6]))
    registration.pushManager.getSubscription.mockResolvedValue(oldSubscription)
    registration.pushManager.subscribe.mockResolvedValue(newSubscription)
    mocks.get.mockResolvedValue({ public_key: 'BAUG' })

    start()
    await flushPromises()

    expect(oldSubscription.unsubscribe).toHaveBeenCalledOnce()
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([4, 5, 6]),
    })
    expect(mocks.post).toHaveBeenCalledWith('/message/webpush/subscribe', rotatedPayload, expect.any(Object))
  })

  it('未登录或非管理员时不登记，管理员登录后立即登记', async () => {
    start(null)
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(worker.getRegistration).not.toHaveBeenCalled()
    expect(mocks.get).not.toHaveBeenCalled()
    session.value = 'admin:token'
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

  it('后端未返回有效公钥时跳过订阅与登记', async () => {
    registration.pushManager.getSubscription.mockResolvedValue(null)
    mocks.get.mockResolvedValue({ public_key: '' })
    start()
    await flushPromises()
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('用户点击时使用已预取公钥同步发起订阅，再异步登记到后端', async () => {
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
    expect(mocks.post).toHaveBeenCalledWith('/message/webpush/subscribe', payload, expect.any(Object))
  })

  it('点击时遇到旧公钥冲突错误应退订后按最新公钥重建', async () => {
    const oldSubscription = createSubscription(payload, new Uint8Array([1, 2, 3]))
    const rotatedPayload = { endpoint: 'https://push.invalid/retry', keys: { p256dh: 'p2', auth: 'a2' } }
    const newSubscription = createSubscription(rotatedPayload, new Uint8Array([4, 5, 6]))
    registration.pushManager.getSubscription.mockResolvedValue(oldSubscription)
    registration.pushManager.subscribe
      .mockRejectedValueOnce(
        new DOMException('A subscription with a different applicationServerKey already exists', 'InvalidStateError'),
      )
      .mockResolvedValueOnce(newSubscription)
    mocks.get.mockResolvedValueOnce({ public_key: 'AQID' }).mockResolvedValueOnce({ public_key: 'BAUG' })
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() })

    const lifecycle = start()
    await flushPromises()

    await expect(lifecycle.requestPermissionAndSync()).resolves.toBe('granted')
    expect(oldSubscription.unsubscribe).toHaveBeenCalledOnce()
    expect(registration.pushManager.subscribe).toHaveBeenLastCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([4, 5, 6]),
    })
    expect(mocks.post).toHaveBeenLastCalledWith('/message/webpush/subscribe', rotatedPayload, expect.any(Object))
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
    const client = axios.create({
      adapter: async config => {
        await request.promise
        return { data: null, config, status: 200, statusText: 'OK', headers: {} }
      },
    })
    initializeRequestOptimizer(client)
    mocks.post.mockImplementation((url, data, config) => client.post(url, data, config))
    start()
    await flushPromises()
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(mocks.post).toHaveBeenCalledTimes(1)
    const signal = mocks.post.mock.calls[0][2].signal as AbortSignal
    setNavigatingState(true)
    expect(signal.aborted).toBe(false)
    session.value = null
    await nextTick()
    expect(signal.aborted).toBe(true)
    request.resolve(null)
    await flushPromises()
  })

  it('切换会话后丢弃旧浏览器查询结果，并登记新管理员会话', async () => {
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
})
