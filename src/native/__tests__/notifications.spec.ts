import { afterEach, describe, expect, it, vi } from 'vitest'
import { revokeNativeNotificationBinding } from '../notifications'

afterEach(() => {
  delete window.MoviePilotNative
  vi.unstubAllGlobals()
})

describe('原生通知退出边界', () => {
  it('普通网页不会额外调用通知接口', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    revokeNativeNotificationBinding('existing-token')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('退出请求复用原登录态且仅撤销当前安装，不允许客户端指定账号', () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetch)
    window.MoviePilotNative = {
      transportVersion: 1,
      postMessage: vi.fn(),
      notificationInstallation: 'installation-0001',
    }
    revokeNativeNotificationBinding('existing-token')
    expect(fetch).toHaveBeenCalledOnce()
    const [url, request] = fetch.mock.calls[0]
    expect(url.pathname).toMatch(/\/notification\/app$/)
    expect(url.origin).toBe(location.origin)
    expect(request.headers.Authorization).toBe('Bearer existing-token')
    expect(request.keepalive).toBe(true)
    expect(JSON.parse(request.body)).toEqual({
      action: 'unregister',
      installation: 'installation-0001',
      origin: location.origin,
    })
  })
})
