import {
  abortAllRequests,
  getActiveRequestsCount,
  initializeRequestOptimizer,
  setNavigatingState,
} from '@/utils/requestOptimizer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface RequestConfigFake {
  signal?: AbortSignal
  skipNavigationCancellation?: boolean
}

interface ResponseFake {
  config?: RequestConfigFake
  data?: unknown
}

interface RequestErrorFake {
  config?: RequestConfigFake
  message: string
}

type RejectedInterceptor = (error: unknown) => Promise<never>

/** 捕获 Axios 注册的 interceptor，以真实调用顺序驱动请求生命周期。 */
function createAxiosInterceptorFake() {
  let requestFulfilled: ((config: RequestConfigFake) => RequestConfigFake) | undefined
  let requestRejected: RejectedInterceptor | undefined
  let responseFulfilled: ((response: ResponseFake) => ResponseFake) | undefined
  let responseRejected: RejectedInterceptor | undefined

  const requestUse = vi.fn(
    (fulfilled: (config: RequestConfigFake) => RequestConfigFake, rejected: RejectedInterceptor) => {
      requestFulfilled = fulfilled
      requestRejected = rejected
      return 0
    },
  )
  const responseUse = vi.fn((fulfilled: (response: ResponseFake) => ResponseFake, rejected: RejectedInterceptor) => {
    responseFulfilled = fulfilled
    responseRejected = rejected
    return 0
  })
  const axiosInstance = {
    interceptors: {
      request: { use: requestUse },
      response: { use: responseUse },
    },
  }

  initializeRequestOptimizer(axiosInstance)

  return {
    request: {
      fulfilled: requestFulfilled!,
      rejected: requestRejected!,
    },
    requestUse,
    response: {
      fulfilled: responseFulfilled!,
      rejected: responseRejected!,
    },
    responseUse,
  }
}

describe('requestOptimizer', () => {
  beforeEach(() => {
    abortAllRequests()
    setNavigatingState(false)
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    abortAllRequests()
    setNavigatingState(false)
    vi.restoreAllMocks()
  })

  it('为没有 signal 的请求注入控制器，并在正常响应后清理', () => {
    const interceptors = createAxiosInterceptorFake()
    const config = interceptors.request.fulfilled({})

    expect(interceptors.requestUse).toHaveBeenCalledOnce()
    expect(interceptors.responseUse).toHaveBeenCalledOnce()
    expect(config.signal).toBeInstanceOf(AbortSignal)
    expect(config.signal?.aborted).toBe(false)
    expect(getActiveRequestsCount()).toBe(1)

    const response = { config, data: { ok: true } }
    expect(interceptors.response.fulfilled(response)).toBe(response)
    expect(getActiveRequestsCount()).toBe(0)
  })

  it('在错误响应后清理控制器，并保留原始拒绝原因', async () => {
    const interceptors = createAxiosInterceptorFake()
    const config = interceptors.request.fulfilled({})
    const responseError: RequestErrorFake = { config, message: 'request failed' }

    await expect(interceptors.response.rejected(responseError)).rejects.toBe(responseError)
    expect(getActiveRequestsCount()).toBe(0)

    const requestError = new Error('interceptor failed')
    await expect(interceptors.request.rejected(requestError)).rejects.toBe(requestError)
  })

  it('不覆盖调用方 signal，也不把调用方控制器纳入全局取消', () => {
    const interceptors = createAxiosInterceptorFake()
    const callerController = new AbortController()
    const config = interceptors.request.fulfilled({ signal: callerController.signal })

    expect(config.signal).toBe(callerController.signal)
    expect(getActiveRequestsCount()).toBe(0)

    abortAllRequests()
    expect(callerController.signal.aborted).toBe(false)

    expect(interceptors.response.fulfilled({ config })).toEqual({ config })
    expect(getActiveRequestsCount()).toBe(0)
  })

  it('不把跨路由心跳和轮询纳入导航取消', () => {
    const interceptors = createAxiosInterceptorFake()
    const config = interceptors.request.fulfilled({ skipNavigationCancellation: true })

    expect(config.signal).toBeUndefined()
    expect(getActiveRequestsCount()).toBe(0)

    setNavigatingState(true)

    expect(config.signal).toBeUndefined()
    expect(getActiveRequestsCount()).toBe(0)
  })

  it('导航开始时只取消当前活跃请求，导航结束不主动取消', () => {
    const interceptors = createAxiosInterceptorFake()
    const first = interceptors.request.fulfilled({})
    const second = interceptors.request.fulfilled({})

    setNavigatingState(false)
    expect(first.signal?.aborted).toBe(false)
    expect(second.signal?.aborted).toBe(false)
    expect(getActiveRequestsCount()).toBe(2)

    setNavigatingState(true)
    expect(first.signal?.aborted).toBe(true)
    expect(second.signal?.aborted).toBe(true)
    expect(getActiveRequestsCount()).toBe(0)
  })

  it('手动全量取消会中断并清空所有自动管理的请求', () => {
    const interceptors = createAxiosInterceptorFake()
    const first = interceptors.request.fulfilled({})
    const second = interceptors.request.fulfilled({})

    abortAllRequests()

    expect(first.signal?.aborted).toBe(true)
    expect(second.signal?.aborted).toBe(true)
    expect(getActiveRequestsCount()).toBe(0)
  })
})
