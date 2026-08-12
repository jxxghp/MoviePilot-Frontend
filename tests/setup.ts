import '@testing-library/jest-dom/vitest'
import { abortAllRequests } from '@/utils/requestOptimizer'
import { cleanup } from '@testing-library/vue'
import { HttpResponse, type HttpResponseInit, type JsonBodyType } from 'msw'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { createDataApiMock as buildDataApiMock } from './support/apiMock'
import { server } from './support/msw/server'

declare global {
  // 测试文件中的 hoisted API mock 在应用模块加载前执行，因此通过 setup 注册统一适配器。
  var createDataApiMock: typeof buildDataApiMock
}

globalThis.createDataApiMock = buildDataApiMock

const originalJsonResponse = HttpResponse.json.bind(HttpResponse)

/** 判断测试夹具是否已经表达了业务响应状态。 */
function isLegacyApiEnvelope(body: unknown): body is Record<string, unknown> & { success: boolean } {
  return (
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    typeof (body as { success?: unknown }).success === 'boolean'
  )
}

/** 识别 MSW 夹具中历史遗留的 Axios `{ data }` 响应壳。 */
function isLegacyDataWrapper(body: unknown): body is { data: unknown } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  return Object.keys(body).length === 1 && 'data' in body
}

/**
 * 将业务测试中的裸成功数据适配为当前后端统一 envelope。
 *
 * 低层客户端协议测试使用 Axios adapter，不经过这里；HTTP 错误保持原载荷，
 * 便于继续覆盖 detail、Blob 和非标准错误响应的归一化行为。
 */
function installApiEnvelopeFixtureAdapter() {
  Object.defineProperty(HttpResponse, 'json', {
    configurable: true,
    value: <BodyType extends JsonBodyType>(body?: BodyType | null, init: HttpResponseInit = {}) => {
      const status = init.status ?? 200
      if (status >= 400) return originalJsonResponse(body, init)

      if (isLegacyApiEnvelope(body)) {
        const envelope = body as Record<string, unknown> & { success: boolean }
        return originalJsonResponse(
          {
            ...envelope,
            message: typeof envelope.message === 'string' ? envelope.message : '',
            data: Object.hasOwn(envelope, 'data') ? envelope.data : null,
          },
          init,
        )
      }

      if (isLegacyDataWrapper(body)) {
        return originalJsonResponse({ success: true, message: '', data: body.data }, init)
      }

      return originalJsonResponse({ success: true, message: '', data: body ?? null }, init)
    },
    writable: true,
  })
}

installApiEnvelopeFixtureAdapter()

class ResizeObserverStub implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

class IntersectionObserverStub implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '0px'
  readonly thresholds = [0]

  disconnect() {}
  observe() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
  unobserve() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: ResizeObserverStub,
  writable: true,
})

Object.defineProperty(globalThis, 'IntersectionObserver', {
  configurable: true,
  value: IntersectionObserverStub,
  writable: true,
})

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string): MediaQueryList => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  }),
  writable: true,
})

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  cleanup()
  abortAllRequests()
  server.resetHandlers()
  localStorage.clear()
  sessionStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

afterAll(() => {
  server.close()
})
