import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativePasskeySession } from '../session'
import { parsePasskeyRequest } from '../protocol'
import { assertionCredential, requestURL } from './fixtures'

/** 为凭证请求提供手动完成点，以测试关闭、超时和返回的竞态。 */
function pendingCredential() {
  let resolve!: (value: Credential | null) => void
  const promise = new Promise<Credential | null>(done => {
    resolve = done
  })
  return { promise, resolve }
}

/** 解码一次回调结果，验证其不包含原始异常或额外请求。 */
function result(url: string) {
  const encoded = new URLSearchParams(new URL(url).hash.slice(1)).get('result')!
  return JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')))
}

afterEach(() => vi.useRealTimers())

describe('native passkey session lifecycle', () => {
  it('starts on request and suppresses repeated authentication attempts', async () => {
    const pending = pendingCredential()
    const get = vi.fn().mockReturnValue(pending.promise)
    const navigate = vi.fn()
    const session = new NativePasskeySession(parsePasskeyRequest(requestURL()), { get }, navigate, vi.fn())
    expect(get).not.toHaveBeenCalled()
    const task = session.authenticate()
    await session.authenticate()
    expect(get).toHaveBeenCalledTimes(1)
    pending.resolve(assertionCredential())
    await task
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(result(navigate.mock.calls[0][0])).toHaveProperty('credential.rawId', 'AQID')
    await session.authenticate()
    session.cancel()
    expect(get).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('aborts a canceled request and ignores a browser result that arrives afterward', async () => {
    const pending = pendingCredential()
    const get = vi.fn().mockReturnValue(pending.promise)
    const navigate = vi.fn()
    const session = new NativePasskeySession(parsePasskeyRequest(requestURL()), { get }, navigate, vi.fn())
    const task = session.authenticate()
    session.cancel()
    expect(get.mock.calls[0][0].signal.aborted).toBe(true)
    pending.resolve(assertionCredential())
    await task
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(result(navigate.mock.calls[0][0])).toHaveProperty('error', 'canceled')
  })

  it('does not redirect after the page has closed', async () => {
    const pending = pendingCredential()
    const navigate = vi.fn()
    const session = new NativePasskeySession(
      parsePasskeyRequest(requestURL()),
      { get: vi.fn().mockReturnValue(pending.promise) },
      navigate,
      vi.fn(),
    )
    const task = session.authenticate()
    session.dispose()
    pending.resolve(assertionCredential())
    await task
    expect(navigate).not.toHaveBeenCalled()
  })

  it('expires a session that has not started and rejects a late request', async () => {
    vi.useFakeTimers()
    const get = vi.fn()
    const navigate = vi.fn()
    const session = new NativePasskeySession(parsePasskeyRequest(requestURL()), { get }, navigate, vi.fn())
    vi.advanceTimersByTime(120_000)
    await session.authenticate()
    expect(get).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(result(navigate.mock.calls[0][0])).toHaveProperty('error', 'expired')
  })

  it.each([
    ['NotAllowedError', 'canceled'],
    ['NotSupportedError', 'unsupported'],
    ['SecurityError', 'failed'],
  ])('maps %s without leaking browser exception details', async (name, code) => {
    const navigate = vi.fn()
    const get = vi.fn().mockRejectedValue(new DOMException('private device details', name))
    const session = new NativePasskeySession(parsePasskeyRequest(requestURL()), { get }, navigate, vi.fn())
    await session.authenticate()
    expect(result(navigate.mock.calls[0][0])).toHaveProperty('error', code)
    expect(navigate.mock.calls[0][0]).not.toContain('private')
  })
})
