import { afterEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { createRouter, createMemoryHistory, isNavigationFailure } from 'vue-router'
import { createApiClients } from '@/api/client'
import { NativeWidgetAdapter, endNativeWidgetSession, type NativeWidgetContent } from '../widgets'

const owner = 'a'.repeat(32)
const otherOwner = 'b'.repeat(32)
const installationId = '00000000-0000-4000-8000-000000000001'
const registrationId = '00000000-0000-4000-8000-000000000002'
const now = 1792850000
const secret = `mpw_${registrationId}.${'A'.repeat(43)}`

/** 后端协议的合成当前账号，不使用任何真实用户或网络。 */
function context(availableContents: NativeWidgetContent[] = ['downloads', 'tvSubscriptions']) {
  return { version: 1, owner, availableContents }
}

/** 合成专用密钥与主登录使用不同格式，便于检查跨桥字段。 */
function registration() {
  return { ...context(), installationId, registrationId, secret, expiresAt: now + 30 * 24 * 60 * 60 }
}

/** 真实 API 客户端只替换 HTTP 适配器，保留序列化、认证头和标准响应解包。 */
function harness() {
  const state = { token: 'web-main-token' as string | null, active: true }
  const calls: InternalAxiosRequestConfig[] = []
  const reply = vi.fn(async (config: InternalAxiosRequestConfig): Promise<unknown> => {
    if (config.url === 'widget/context') return context()
    if (config.url === 'widget/registrations') return registration()
    if (config.method === 'delete') return null
    throw new Error('unexpected_test_request')
  })
  const { api } = createApiClients({
    baseURL: `${location.origin}/api/v1/`,
    setupInstance(instance) {
      instance.interceptors.request.use(config => {
        config.headers.Authorization = `Bearer ${state.token}`
        return config
      })
    },
    adapter: async config => {
      calls.push(config)
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data: { success: true, message: '', data: await reply(config) },
      }
    },
  })
  const options = {
    api,
    apiBase: new URL('/api/v1/', location.origin),
    origin: location.origin,
    readToken: () => state.token,
    isActive: () => state.active,
    canNavigate: () => true,
    navigate: vi.fn<(path: string) => Promise<boolean>>().mockResolvedValue(true),
    now: () => now,
  }
  return { adapter: new NativeWidgetAdapter(options), options, state, calls, reply }
}

/** 使用真正的 HTTP 错误外壳检查固定原因映射，正文不能跨桥回显。 */
function httpFailure(status: number, config: InternalAxiosRequestConfig): never {
  throw new AxiosError(
    'private backend detail',
    undefined,
    config,
    {},
    {
      status,
      statusText: 'Error',
      headers: {},
      config,
      data: { detail: secret },
    },
  )
}

afterEach(() => {
  delete window.MoviePilotNative
  vi.restoreAllMocks()
})

describe('默认关闭的小组件前端边界', () => {
  it('普通网页、未接管容器、无主登录及跨源配置都不读取组件数据', async () => {
    const h = harness()
    const signal = new AbortController().signal
    h.state.active = false
    expect(await h.adapter.request({ operation: 'context' }, signal)).toEqual({ success: false, error: 'unsupported' })
    h.state.active = true
    h.state.token = null
    expect(await h.adapter.request({ operation: 'context' }, signal)).toEqual({ success: false, error: 'unauthorized' })
    h.state.token = 'web-main-token'
    for (const base of [
      'https://other.example/api/v1/',
      `${location.origin}/api/v1/?token=x`,
      `${location.origin}/wrong/`,
    ]) {
      const adapter = new NativeWidgetAdapter({ ...h.options, apiBase: new URL(base) })
      expect(await adapter.request({ operation: 'context' }, signal)).toEqual({ success: false, error: 'unsupported' })
    }
    expect(h.calls).toHaveLength(0)
    const logout = vi.fn()
    window.addEventListener('moviepilot:widget-logout', logout)
    try {
      endNativeWidgetSession()
      expect(logout).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('moviepilot:widget-logout', logout)
    }
  })

  it('上下文走已有主认证且只返回白名单，服务端附加字段不能进入原生', async () => {
    const h = harness()
    h.reply.mockResolvedValueOnce({ ...context(), secret, token: 'web-main-token', registrations: [registrationId] })
    expect(await h.adapter.request({ operation: 'context' }, new AbortController().signal)).toEqual({
      success: true,
      data: context(),
    })
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0].url).toBe('widget/context')
    expect(h.calls[0].headers.Authorization).toBe('Bearer web-main-token')
    expect(h.calls[0].headers['Cache-Control']).toBe('no-store')
    expect(h.calls[0].feedback).toBe('silent')
    expect(h.calls[0].signal).toBeDefined()
  })

  it('登记先核对当前账号，写入仅包含安装UUID，并投影一次性有界结果', async () => {
    const h = harness()
    const result = await h.adapter.request(
      { operation: 'register', owner, installationId },
      new AbortController().signal,
    )
    expect(result).toEqual({ success: true, data: registration() })
    expect(h.calls.map(call => [call.method, call.url])).toEqual([
      ['get', 'widget/context'],
      ['post', 'widget/registrations'],
    ])
    expect(JSON.parse(h.calls[1].data)).toEqual({ installationId })
    expect(JSON.stringify(result)).not.toContain('web-main-token')
    expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThan(2048)
  })

  it.each([
    { registrationId: installationId },
    { installationId: registrationId },
    { owner: otherOwner },
    { secret: 'main.jwt.token' },
    { expiresAt: now - 1 },
    { expiresAt: now + 31 * 24 * 60 * 60 },
    { version: 2 },
    { availableContents: ['downloads', 'downloads'] },
    { availableContents: ['unknown'] },
    { availableContents: [] },
  ])('拒绝与登记关联或有界协议不一致的响应 %j', async change => {
    const h = harness()
    h.reply.mockResolvedValueOnce(context()).mockResolvedValueOnce({ ...registration(), ...change })
    const result = await h.adapter.request(
      { operation: 'register', owner, installationId },
      new AbortController().signal,
    )
    expect(result).toEqual({ success: false, error: 'invalid_data' })
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  it.each([
    { operation: 'register', owner: otherOwner, installationId },
    { operation: 'revoke', owner: otherOwner, registrationId },
    { operation: 'open', owner: otherOwner, content: 'downloads' },
  ])('不同不可变账号不得登记、撤销或跳转 %j', async payload => {
    const h = harness()
    expect(await h.adapter.request(payload, new AbortController().signal)).toEqual({
      success: false,
      error: 'identity_changed',
    })
    expect(h.calls.map(call => call.method)).toEqual(['get'])
    expect(h.options.navigate).not.toHaveBeenCalled()
  })

  it('等待上下文或登记时切换主登录，不交付旧结果或继续写请求', async () => {
    for (const waitAtRegistration of [false, true]) {
      const h = harness()
      let finish!: (value: unknown) => void
      const pending = new Promise<unknown>(resolve => (finish = resolve))
      if (waitAtRegistration) h.reply.mockResolvedValueOnce(context())
      h.reply.mockImplementationOnce(() => pending)
      const work = h.adapter.request({ operation: 'register', owner, installationId }, new AbortController().signal)
      await vi.waitFor(() => expect(h.reply).toHaveBeenCalledTimes(waitAtRegistration ? 2 : 1))
      h.state.token = 'another-account-token'
      finish(waitAtRegistration ? registration() : context())
      expect(await work).toEqual({ success: false, error: 'identity_changed' })
      expect(h.calls).toHaveLength(waitAtRegistration ? 2 : 1)
    }
  })

  it('撤销固定本账号登记路径，不接受额外来源或主令牌参数', async () => {
    const h = harness()
    const signal = new AbortController().signal
    expect(await h.adapter.request({ operation: 'revoke', owner, registrationId }, signal)).toEqual({
      success: true,
      data: { completed: true },
    })
    expect(h.calls[1].method).toBe('delete')
    expect(h.calls[1].url).toBe(`widget/registrations/${registrationId}`)
    const before = h.calls.length
    for (const payload of [
      { operation: 'context', url: 'https://other.example' },
      { operation: 'register', owner, installationId, token: 'x' },
      { operation: 'revoke', owner, registrationId: '../other' },
      { operation: 'open', owner, content: 'toString' },
      { operation: 'open', owner, content: 'downloads', path: '/other' },
    ])
      expect(await h.adapter.request(payload, signal)).toEqual({ success: false, error: 'invalid_request' })
    expect(h.calls).toHaveLength(before)
  })

  it('跳转复核最新权限、弹层与真实Router守卫，不替网页裁决访问', async () => {
    const h = harness()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    })
    await router.push('/dashboard')
    const navigate = vi.fn(async (path: string) => !isNavigationFailure(await router.push(path)))
    const signal = new AbortController().signal
    const adapter = new NativeWidgetAdapter({ ...h.options, navigate })
    expect(await adapter.request({ operation: 'open', owner, content: 'overview' }, signal)).toEqual({
      success: false,
      error: 'forbidden',
    })
    const blocked = new NativeWidgetAdapter({ ...h.options, navigate, canNavigate: () => false })
    expect(await blocked.request({ operation: 'open', owner, content: 'downloads' }, signal)).toEqual({
      success: false,
      error: 'busy',
    })
    expect(navigate).not.toHaveBeenCalled()
    const remove = router.beforeEach(to => to.path !== '/downloading')
    expect(await adapter.request({ operation: 'open', owner, content: 'downloads' }, signal)).toEqual({
      success: false,
      error: 'unavailable',
    })
    expect(router.currentRoute.value.path).toBe('/dashboard')
    remove()
    expect(await adapter.request({ operation: 'open', owner, content: 'tvSubscriptions' }, signal)).toEqual({
      success: true,
      data: { completed: true },
    })
    expect(router.currentRoute.value.path).toBe('/subscribe/tv')
  })

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'unsupported'],
    [503, 'unavailable'],
  ])('HTTP %i 只传固定原因，不回显错误正文', async (status, error) => {
    const h = harness()
    h.reply.mockImplementationOnce(async config => httpFailure(Number(status), config))
    expect(await h.adapter.request({ operation: 'context' }, new AbortController().signal)).toEqual({
      success: false,
      error,
    })
  })

  it('取消后不继续登记，退出通知没有认证载荷', async () => {
    const h = harness()
    const controller = new AbortController()
    controller.abort()
    expect(await h.adapter.request({ operation: 'register', owner, installationId }, controller.signal)).toEqual({
      success: false,
      error: 'cancelled',
    })
    expect(h.calls).toHaveLength(0)
    const seen: Event[] = []
    const listener = (event: Event) => seen.push(event)
    window.addEventListener('moviepilot:widget-logout', listener)
    window.MoviePilotNative = { transportVersion: 1, widgetsVersion: 1, postMessage: vi.fn() }
    try {
      endNativeWidgetSession()
      expect(seen).toHaveLength(1)
      expect(seen[0]).not.toBeInstanceOf(CustomEvent)
    } finally {
      window.removeEventListener('moviepilot:widget-logout', listener)
    }
  })
})
