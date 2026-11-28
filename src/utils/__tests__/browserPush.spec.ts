import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BROWSER_PUSH_OWNER_KEY,
  claimBrowserPushOwner,
  finishBrowserPushRotation,
  ownsBrowserPush,
  readBrowserPushOwner,
  revokeBrowserPushBinding,
  sendBrowserPushSubscription,
} from '@/utils/browserPush'

const payload = { endpoint: 'https://push.invalid/secret-endpoint', keys: { p256dh: 'key', auth: 'secret-auth' } }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('browserPush', () => {
  const fetch = vi.fn()
  const unsubscribe = vi.fn()
  const getSubscription = vi.fn()
  const getRegistration = vi.fn()

  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', '/api/v1/')
    vi.stubGlobal('fetch', fetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }))
    unsubscribe.mockReset().mockResolvedValue(true)
    getSubscription.mockReset().mockResolvedValue({ toJSON: () => payload, unsubscribe })
    getRegistration.mockReset().mockResolvedValue({ pushManager: { getSubscription } })
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration } })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('标记只保存账号和代次，切号必须轮换，旧代次不能完成新账号轮换', () => {
    const alice = claimBrowserPushOwner('alice')!
    const bob = claimBrowserPushOwner('bob')!
    expect(bob.rotate).toBe(true)
    expect(ownsBrowserPush(alice)).toBe(false)
    expect(finishBrowserPushRotation(alice)).toBe(false)
    expect(readBrowserPushOwner()).toEqual(bob)
    expect(finishBrowserPushRotation(bob)).toBe(true)
    expect(readBrowserPushOwner()).toEqual({ ...bob, rotate: false })
    expect(Object.keys(JSON.parse(localStorage.getItem(BROWSER_PUSH_OWNER_KEY)!))).toEqual([
      'account',
      'epoch',
      'rotate',
    ])
  })

  it('登记请求冻结 Bearer，正文仅有浏览器订阅，不使用全局拦截器身份', async () => {
    await sendBrowserPushSubscription('subscribe', 'token-a', payload)
    expect(fetch.mock.calls[0][0].href).toBe(`${location.origin}/api/v1/message/webpush/subscribe`)
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token-a')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(payload)
    expect(fetch.mock.calls[0][1].cache).toBe('no-store')
  })

  it('退出同步撤销代次，离线仍取消本机订阅，服务器撤销不能谎报成功', async () => {
    const owner = claimBrowserPushOwner('alice')!
    fetch.mockRejectedValue(new Error('offline'))
    const result = revokeBrowserPushBinding('old-token', 'alice')
    expect(ownsBrowserPush(owner)).toBe(false)
    await expect(result).resolves.toBe(false)
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer old-token')
    expect(fetch.mock.calls[0][1].keepalive).toBe(true)
  })

  it('旧账号退出的迟到查询不能取消新账号端点', async () => {
    claimBrowserPushOwner('alice')
    const query = deferred<{ pushManager: { getSubscription: typeof getSubscription } }>()
    getRegistration.mockReturnValue(query.promise)
    const result = revokeBrowserPushBinding('token-a', 'alice')
    claimBrowserPushOwner('bob')
    query.resolve({ pushManager: { getSubscription } })
    await result
    expect(unsubscribe).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('旧后端不支持注销时仍取消本机订阅，并保留未确认结果', async () => {
    claimBrowserPushOwner('alice')
    fetch.mockResolvedValue({ ok: false, status: 404 })
    await expect(revokeBrowserPushBinding('old-token', 'alice')).resolves.toBe(false)
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('父请求取消会中断 fetch，网络未完成时到期也会取消', async () => {
    vi.useFakeTimers()
    fetch.mockImplementation(
      (_url, config: RequestInit) =>
        new Promise((_resolve, reject) => {
          config.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const controller = new AbortController()
    const first = sendBrowserPushSubscription('subscribe', 'token-a', payload, controller.signal)
    const firstCheck = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await firstCheck
    const second = sendBrowserPushSubscription('subscribe', 'token-a', payload)
    const secondCheck = expect(second).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(10_000)
    await secondCheck
    await flushPromises()
    expect(vi.getTimerCount()).toBe(0)
  })
})
