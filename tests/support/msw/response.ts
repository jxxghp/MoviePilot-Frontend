import type { ApiResponse } from '@/api/types'
import { HttpResponse, type HttpResponseInit, type JsonBodyType } from 'msw'

/** 构造主程序普通 API 的固定三段式响应。 */
export function apiEnvelope<T>(data: T | null, message = ''): ApiResponse<T> {
  return { data, message, success: true }
}

/** 返回主程序普通 API 的成功响应；调用点必须显式选择该协议。 */
export function apiJson<T>(data: T | null, init: HttpResponseInit = {}) {
  return HttpResponse.json(apiEnvelope(data) as unknown as JsonBodyType, init)
}

/** 返回主程序普通 API 的业务失败响应。 */
export function apiFailureJson<T = null>(message: string, data: T | null = null, init: HttpResponseInit = {}) {
  const body: ApiResponse<T> = { data, message, success: false }
  return HttpResponse.json(body as unknown as JsonBodyType, init)
}
