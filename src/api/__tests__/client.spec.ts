import axios, {
  AxiosError,
  AxiosHeaders,
  CanceledError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { ApiRequestError, createApiClients, type ApiFeedbackNotifier } from '@/api/client'
import type { ApiResponse } from '@/api/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const notifier: ApiFeedbackNotifier = {
  error: vi.fn(),
  success: vi.fn(),
}

/** 构造 Axios 适配器响应，避免客户端单测依赖真实网络。 */
function createResponse<T>(
  config: InternalAxiosRequestConfig,
  data: T,
  status = 200,
  headers: Record<string, string> = {},
): AxiosResponse<T> {
  return {
    config,
    data,
    headers: new AxiosHeaders(headers),
    status,
    statusText: status >= 400 ? 'Error' : 'OK',
  }
}

/** 创建始终成功返回指定数据的 Axios 适配器。 */
function resolveWith<T>(data: T, headers: Record<string, string> = {}): AxiosAdapter {
  return async config => createResponse(config, data, 200, headers)
}

/** 创建带 Axios 响应元数据的 HTTP 失败适配器。 */
function rejectWith<T>(data: T, status: number, headers: Record<string, string> = {}): AxiosAdapter {
  return async config => {
    const response = createResponse(config, data, status, headers)
    throw new AxiosError('Request failed', AxiosError.ERR_BAD_RESPONSE, config, undefined, response)
  }
}

/** 断言并收窄统一 API 错误，避免测试绕过 unknown 错误边界。 */
function requireApiRequestError(reason: unknown): ApiRequestError {
  expect(reason).toBeInstanceOf(ApiRequestError)
  if (!(reason instanceof ApiRequestError)) throw reason
  return reason
}

describe('MoviePilot API client', () => {
  beforeEach(() => {
    vi.mocked(notifier.error).mockReset()
    vi.mocked(notifier.success).mockReset()
  })

  it.each([
    ['object', { id: 7 }],
    ['array', ['one', 'two']],
    ['scalar', 42],
    ['null', null],
  ])('仅向内部调用方返回成功 envelope 的 data：%s', async (_label, data) => {
    const envelope: ApiResponse<typeof data> = { success: true, message: '', data }
    const { api } = createApiClients({ adapter: resolveWith(envelope), notifier })

    await expect(api.get<typeof data>('/resource')).resolves.toEqual(data)
    expect(notifier.error).not.toHaveBeenCalled()
  })

  it('只在 feedback=all 时展示后端成功消息', async () => {
    const envelope: ApiResponse<{ saved: boolean }> = {
      success: true,
      message: 'Saved',
      data: { saved: true },
    }
    const { api } = createApiClients({ adapter: resolveWith(envelope), notifier })

    await api.post('/setting', {}, { feedback: 'default' })
    await api.post('/setting', {}, { feedback: 'all' })

    expect(notifier.success).toHaveBeenCalledOnce()
    expect(notifier.success).toHaveBeenCalledWith('Saved')
  })

  it('将 success=false 转为保留完整响应元数据的 ApiRequestError', async () => {
    const envelope: ApiResponse<{ reason: string }> = {
      success: false,
      message: 'Cannot save',
      data: { reason: 'locked' },
    }
    const { api } = createApiClients({
      adapter: resolveWith(envelope, { 'x-request-id': 'request-1' }),
      notifier,
    })

    const error = requireApiRequestError(await api.post('/setting', {}).catch(reason => reason))

    expect(axios.isAxiosError(error)).toBe(true)
    expect(error).toMatchObject({
      message: 'Cannot save',
      payload: envelope,
      status: 200,
    })
    expect(error.response?.data).toEqual(envelope)
    expect(AxiosHeaders.from(error.headers as AxiosHeaders | undefined).get('x-request-id')).toBe('request-1')
    expect(notifier.error).toHaveBeenCalledWith('Cannot save')
  })

  it('将 HTTP 错误统一转换为 ApiRequestError 并保留 payload、status 和 headers', async () => {
    const envelope: ApiResponse<{ mfa_methods: string[] }> = {
      success: false,
      message: 'Additional verification required',
      data: { mfa_methods: ['otp'] },
    }
    const { api } = createApiClients({
      adapter: rejectWith(envelope, 403, { 'x-mfa-required': 'true' }),
      notifier,
    })

    const error = requireApiRequestError(await api.post('/login/access-token', {}).catch(reason => reason))

    expect(error.message).toBe('Additional verification required')
    expect(error.status).toBe(403)
    expect(error.payload).toEqual(envelope)
    expect(error.response?.data).toEqual(envelope)
    expect(AxiosHeaders.from(error.response?.headers as AxiosHeaders | undefined).get('x-mfa-required')).toBe('true')
  })

  it('silent 关闭失败 Toast，但不丢失错误元数据', async () => {
    const envelope: ApiResponse<null> = { success: false, message: 'Invalid credentials', data: null }
    const { api } = createApiClients({ adapter: rejectWith(envelope, 401), notifier })

    const error = requireApiRequestError(
      await api.post('/login/access-token', {}, { feedback: 'silent' }).catch(reason => reason),
    )

    expect(error.status).toBe(401)
    expect(error.payload).toEqual(envelope)
    expect(notifier.error).not.toHaveBeenCalled()
  })

  it('插件客户端保留完整 envelope，同时沿用统一失败反馈', async () => {
    const envelope: ApiResponse<{ plugin: string }> = {
      success: false,
      message: 'Plugin rejected request',
      data: { plugin: 'demo' },
    }
    const { pluginApi } = createApiClients({ adapter: resolveWith(envelope), notifier })

    await expect(pluginApi.get<unknown, ApiResponse<{ plugin: string }>>('/plugin/demo')).resolves.toEqual(envelope)
    expect(notifier.error).toHaveBeenCalledWith('Plugin rejected request')
  })

  it.each([
    ['object', { plugin: 'demo', count: 2 }],
    ['array', [{ id: 1 }, { id: 2 }]],
    ['scalar', 'ready'],
    ['null', null],
  ])('插件客户端原样交付非 envelope payload：%s', async (_label, payload) => {
    const { pluginApi } = createApiClients({ adapter: resolveWith(payload), notifier })

    await expect(pluginApi.get('/plugin/demo')).resolves.toEqual(payload)
    expect(notifier.error).not.toHaveBeenCalled()
    expect(notifier.success).not.toHaveBeenCalled()
  })

  it('Blob 成功响应绕过 envelope 解包', async () => {
    const blob = new Blob(['moviepilot'], { type: 'application/octet-stream' })
    const { api } = createApiClients({ adapter: resolveWith(blob), notifier })

    await expect(api.get<Blob>('/download', { responseType: 'blob' })).resolves.toBe(blob)
  })

  it('解析 Blob 中的 JSON HTTP 错误后再构造 ApiRequestError', async () => {
    const envelope: ApiResponse<{ file: string }> = {
      success: false,
      message: 'File is unavailable',
      data: { file: 'movie.mkv' },
    }
    const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' })
    const { api } = createApiClients({
      adapter: rejectWith(blob, 404, { 'content-type': 'application/json' }),
      notifier,
    })

    const error = requireApiRequestError(await api.get('/download', { responseType: 'blob' }).catch(reason => reason))

    expect(error.message).toBe('File is unavailable')
    expect(error.payload).toEqual(envelope)
    expect(error.response?.data).toEqual(envelope)
  })

  it('相同技术错误在去重窗口内只提示一次，避免并发失败刷屏', async () => {
    const { api } = createApiClients({
      adapter: rejectWith({ message: 'Server exploded' }, 500),
      notifier,
    })

    await api.get('/a').catch(reason => reason)
    await api.get('/b').catch(reason => reason)

    expect(notifier.error).toHaveBeenCalledTimes(1)
    expect(notifier.error).toHaveBeenCalledWith('Server exploded')
  })

  it('去重窗口过期后相同技术错误可以再次提示', async () => {
    vi.useFakeTimers()
    try {
      const { api } = createApiClients({
        adapter: rejectWith({ message: 'Server exploded' }, 500),
        notifier,
      })

      await api.get('/a').catch(reason => reason)
      expect(notifier.error).toHaveBeenCalledTimes(1)

      // 窗口（15 秒）过后，新一轮相同错误应能再次提示。
      vi.advanceTimersByTime(15000)
      await api.get('/b').catch(reason => reason)
      expect(notifier.error).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('成功响应后清空去重缓存，让后续技术错误可以再次提示', async () => {
    vi.useFakeTimers()
    try {
      const { api } = createApiClients({
        adapter: rejectWith({ message: 'Server exploded' }, 500),
        notifier,
      })

      await api.get('/a').catch(reason => reason)
      expect(notifier.error).toHaveBeenCalledTimes(1)

      // 服务恢复后缓存应被清空，即使仍在窗口内，相同错误也可再次提示。
      api.defaults.adapter = resolveWith<ApiResponse<{ ok: boolean }>>({
        success: true,
        message: '',
        data: { ok: true },
      })
      await api.get('/ping')
      api.defaults.adapter = rejectWith({ message: 'Server exploded' }, 500)
      await api.get('/c').catch(reason => reason)

      expect(notifier.error).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('连续无效 envelope 响应只提示一次，避免坏缓存命中时刷屏', async () => {
    // 无效 envelope 是 HTTP 200 但响应体不是标准三键结构，模拟 SW 缓存回退出的坏响应。
    const { api } = createApiClients({
      adapter: resolveWith('<html>legacy app shell</html>'),
      notifier,
    })

    await api.get('/a').catch(reason => reason)
    await api.get('/b').catch(reason => reason)
    await api.get('/c').catch(reason => reason)

    expect(notifier.error).toHaveBeenCalledTimes(1)
    expect(notifier.error).toHaveBeenCalledWith('Invalid API response envelope')
  })

  it('无效 envelope 响应不清空去重缓存，窗口内其他技术错误保持收敛', async () => {
    const adapter: AxiosAdapter = async config => {
      if (config.url === '/bad') return createResponse(config, '<html></html>', 200)
      const response = createResponse(config, { message: 'Server exploded' }, 500)
      throw new AxiosError('Request failed', AxiosError.ERR_BAD_RESPONSE, config, undefined, response)
    }
    const { api } = createApiClients({ adapter, notifier })

    await api.get('/a').catch(reason => reason)
    await api.get('/bad').catch(reason => reason)
    await api.get('/b').catch(reason => reason)

    // 500 技术错误在窗口内只提示一次；无效 envelope 属于不同消息单独提示一次，
    // 且它不得清空去重缓存，否则第 3 个相同 500 错误会被再次弹出。
    expect(notifier.error).toHaveBeenCalledTimes(2)
    expect(notifier.error).toHaveBeenCalledWith('Server exploded')
    expect(notifier.error).toHaveBeenCalledWith('Invalid API response envelope')
  })

  it('不同消息的技术错误互不影响，分别提示', async () => {
    const adapter: AxiosAdapter = async config => {
      const message = config.url === '/a' ? 'First failure' : 'Second failure'
      const response = createResponse(config, { message }, 500)
      throw new AxiosError('Request failed', AxiosError.ERR_BAD_RESPONSE, config, undefined, response)
    }
    const { api } = createApiClients({ adapter, notifier })

    await api.get('/a').catch(reason => reason)
    await api.get('/b').catch(reason => reason)

    expect(notifier.error).toHaveBeenCalledTimes(2)
    expect(notifier.error).toHaveBeenCalledWith('First failure')
    expect(notifier.error).toHaveBeenCalledWith('Second failure')
  })

  it('业务失败不参与技术错误去重，始终逐条提示', async () => {
    const envelope: ApiResponse<null> = { success: false, message: 'Cannot save', data: null }
    const { api } = createApiClients({ adapter: resolveWith(envelope), notifier })

    await api.post('/setting', {}).catch(reason => reason)
    await api.post('/setting', {}).catch(reason => reason)

    expect(notifier.error).toHaveBeenCalledTimes(2)
    expect(notifier.error).toHaveBeenCalledWith('Cannot save')
  })

  it('取消请求保持原始 CanceledError，且不提示或触发离线探测', async () => {
    const reportConnectionFailure = vi.fn()
    const adapter: AxiosAdapter = async () => {
      throw new CanceledError('Request cancelled')
    }
    const { api } = createApiClients({ adapter, hooks: { reportConnectionFailure }, notifier })

    const error = await api.get('/slow').catch(reason => reason)

    expect(error).toBeInstanceOf(CanceledError)
    expect(error).not.toBeInstanceOf(ApiRequestError)
    expect(notifier.error).not.toHaveBeenCalled()
    expect(reportConnectionFailure).not.toHaveBeenCalled()
  })

  it.each([502, 503, 504])('网关错误 %d 上报连接失败且不弹请求层 Toast', async status => {
    const reportConnectionFailure = vi.fn()
    const { api } = createApiClients({
      adapter: rejectWith({ message: 'Gateway unavailable' }, status),
      hooks: { reportConnectionFailure },
      notifier,
    })

    const error = requireApiRequestError(await api.get('/resource').catch(reason => reason))

    expect(error.status).toBe(status)
    expect(reportConnectionFailure).toHaveBeenCalledWith('server-unreachable')
    expect(notifier.error).not.toHaveBeenCalled()
  })

  it('网络错误仅上报离线状态，不弹请求层 Toast', async () => {
    const reportConnectionFailure = vi.fn()
    const adapter: AxiosAdapter = async () => {
      throw new AxiosError('Network Error', AxiosError.ERR_NETWORK)
    }
    const { api } = createApiClients({ adapter, hooks: { reportConnectionFailure }, notifier })

    await api.get('/resource').catch(reason => reason)

    expect(reportConnectionFailure).toHaveBeenCalledWith('network-error')
    expect(notifier.error).not.toHaveBeenCalled()
  })

  it('网关错误不算服务在线证据，仅成功响应恢复在线状态', async () => {
    const markServerOnline = vi.fn()
    const reportConnectionFailure = vi.fn()
    const { api } = createApiClients({
      adapter: rejectWith({ message: 'Bad Gateway' }, 502),
      hooks: { markServerOnline, reportConnectionFailure },
      notifier,
    })

    await api.get('/resource').catch(reason => reason)

    expect(markServerOnline).not.toHaveBeenCalled()
    expect(reportConnectionFailure).toHaveBeenCalledWith('server-unreachable')
  })

  it('401 被 onUnauthorized 接管时不逐条弹请求层 Toast', async () => {
    const onUnauthorized = vi.fn(() => true)
    const { api } = createApiClients({
      adapter: rejectWith({ detail: 'Not authenticated' }, 401),
      hooks: { onUnauthorized },
      notifier,
    })

    const error = requireApiRequestError(await api.get('/resource').catch(reason => reason))

    expect(error.status).toBe(401)
    expect(onUnauthorized).toHaveBeenCalledWith(error)
    expect(notifier.error).not.toHaveBeenCalled()
  })

  it('401 未被 onUnauthorized 接管时保留逐条错误提示', async () => {
    const onUnauthorized = vi.fn(() => false)
    const { api } = createApiClients({
      adapter: rejectWith({ detail: 'Not authenticated' }, 401),
      hooks: { onUnauthorized },
      notifier,
    })

    const error = requireApiRequestError(await api.get('/resource').catch(reason => reason))

    expect(error.status).toBe(401)
    expect(notifier.error).toHaveBeenCalledWith('Not authenticated')
  })

  it('拒绝缺少标准字段的普通 JSON 响应', async () => {
    const { api } = createApiClients({ adapter: resolveWith({ value: 1 }), notifier })

    const error = requireApiRequestError(await api.get('/legacy').catch(reason => reason))

    expect(error.message).toBe('Invalid API response envelope')
  })

  it('拒绝带旧顶层 message_i18n 的 envelope', async () => {
    const legacyEnvelope = {
      success: false,
      message: 'Failed',
      message_i18n: '旧版错误',
      data: null,
    }
    const { api } = createApiClients({ adapter: resolveWith(legacyEnvelope), notifier })

    const error = requireApiRequestError(await api.get('/legacy').catch(reason => reason))

    expect(error.message).toBe('Invalid API response envelope')
    expect(error.payload).toEqual(legacyEnvelope)
  })

  it.each([
    ['zh-CN', '服务器返回了无效响应'],
    ['en-US', 'The server returned an invalid response'],
  ])('使用应用注入的 %s fallback 文案提示协议异常', async (_locale, translatedMessage) => {
    const { api } = createApiClients({
      adapter: resolveWith({ value: 1 }),
      notifier,
      resolveFallbackMessage: key => (key === 'invalid-envelope' ? translatedMessage : key),
    })

    const error = requireApiRequestError(await api.get('/legacy').catch(reason => reason))

    expect(error.message).toBe(translatedMessage)
    expect(notifier.error).toHaveBeenCalledWith(translatedMessage)
  })
})
