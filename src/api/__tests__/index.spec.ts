import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  i18nT: vi.fn((key: string) => `translated:${key}`),
}))

vi.mock('@/router', () => ({
  default: { push: vi.fn() },
}))
vi.mock('@/stores', () => ({
  useAuthStore: () => ({ logout: vi.fn(), token: null }),
}))
vi.mock('@/utils/requestOptimizer', () => ({
  initializeRequestOptimizer: vi.fn(),
}))
vi.mock('@/composables/useOfflineStatus', () => ({
  useGlobalOfflineStatus: () => ({
    markServerOnline: vi.fn(),
    reportNetworkError: vi.fn(),
  }),
}))
vi.mock('@/plugins/i18n', () => ({
  default: { global: { t: mocks.i18nT } },
  getCurrentLocale: () => 'zh-CN',
}))
vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}))

describe('API application wiring', () => {
  it('向 window 暴露插件 envelope 客户端，而内部默认导出数据客户端', async () => {
    const module = await import('@/api')

    expect(window.MoviePilotAPI).toBe(module.pluginApi)
    expect(module.default).not.toBe(module.pluginApi)
  })

  it('通过 i18n 实例解析请求层 fallback 文案', async () => {
    const module = await import('@/api')
    module.default.defaults.adapter = async config => ({
      config: config as InternalAxiosRequestConfig,
      data: { legacy: true },
      headers: new AxiosHeaders(),
      status: 200,
      statusText: 'OK',
    })

    const error = await module.default.get('/legacy').catch(reason => reason)

    expect(error).toBeInstanceOf(module.ApiRequestError)
    expect((error as Error).message).toBe('translated:common.invalidApiResponse')
    expect(mocks.i18nT).toHaveBeenCalledWith('common.invalidApiResponse')
  })
})
