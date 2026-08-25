import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  i18nT: vi.fn((key: string) => `translated:${key}`),
  authState: { token: null as string | null },
  logout: vi.fn(),
  routerPush: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/router', () => ({
  default: { push: mocks.routerPush },
}))
vi.mock('@/stores', () => ({
  useAuthStore: () => ({
    get token() {
      return mocks.authState.token
    },
    // 与真实 store 一致：登出时清空 token，后续在途请求按无 token 处理。
    logout: mocks.logout.mockImplementation(() => {
      mocks.authState.token = null
    }),
  }),
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
  useToast: () => ({ error: mocks.toastError, success: vi.fn() }),
}))

/** 安装始终返回指定 HTTP 失败的适配器。 */
async function installFailingAdapter(status: number, data: unknown) {
  const module = await import('@/api')
  module.default.defaults.adapter = async config => {
    const response: AxiosResponse = {
      config: config as InternalAxiosRequestConfig,
      data,
      headers: new AxiosHeaders(),
      status,
      statusText: 'Error',
    }
    throw new AxiosError(
      'Request failed',
      AxiosError.ERR_BAD_RESPONSE,
      config as InternalAxiosRequestConfig,
      undefined,
      response,
    )
  }
  return module
}

describe('API application wiring', () => {
  beforeEach(() => {
    mocks.authState.token = null
    mocks.logout.mockClear()
    mocks.routerPush.mockClear()
    mocks.toastError.mockClear()
  })

  it('向 window 暴露插件最终 payload 客户端，而内部默认导出数据客户端', async () => {
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

  it('已登录时并发 401 只统一登出并静默返回登录页', async () => {
    mocks.authState.token = 'expired-token'
    const module = await installFailingAdapter(401, { detail: 'Not authenticated' })

    await Promise.allSettled([module.default.get('/dashboard'), module.default.get('/subscribe')])

    expect(mocks.logout).toHaveBeenCalledOnce()
    expect(mocks.routerPush).toHaveBeenCalledWith('/login')
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('登出后的在途 401 持续静默，不在登录页暴露认证错误', async () => {
    mocks.authState.token = 'expired-token'
    const module = await installFailingAdapter(401, { detail: 'Not authenticated' })

    await module.default.get('/dashboard').catch(() => {})
    await module.default.get('/subscribe').catch(() => {})
    await module.default.get('/resource').catch(() => {})

    expect(mocks.logout).toHaveBeenCalledOnce()
    expect(mocks.routerPush).toHaveBeenCalledOnce()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('token 校验失败的 403 完成签退后不弹技术错误', async () => {
    mocks.authState.token = 'invalid-token'
    const module = await installFailingAdapter(403, { detail: 'token校验不通过' })

    await Promise.allSettled([module.default.get('/dashboard'), module.default.get('/subscribe')])

    expect(mocks.logout).toHaveBeenCalledOnce()
    expect(mocks.routerPush).toHaveBeenCalledWith('/login')
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})
