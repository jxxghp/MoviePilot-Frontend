import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWebPushNotifications } from '@/composables/useWebPushNotifications'
import { initializeRequestOptimizer, setNavigatingState } from '@/utils/requestOptimizer'
import axios from 'axios'

const mocks = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('@/api', () => ({ default: { post: mocks.post } }))

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
  const subscription = { toJSON: () => payload }
  let worker: EventTarget & { getRegistration: ReturnType<typeof vi.fn> }
  let registration: {
    active: object | null
    pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> }
  }

  /** 在独立作用域启动真实订阅生命周期，模拟 App 恢复管理员登录态。 */
  function start(value: string | null = 'admin:token') {
    session.value = value
    scope.run(() => useWebPushNotifications(session))
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_PUBLIC_VAPID_KEY', 'AQID')
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

  it('未登录或非管理员时不登记，管理员登录后立即登记', async () => {
    start(null)
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(worker.getRegistration).not.toHaveBeenCalled()
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
