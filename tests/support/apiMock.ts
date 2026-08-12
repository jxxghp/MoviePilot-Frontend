import { ApiRequestError } from '@/api/client'

type ApiMethodMock = (...args: unknown[]) => unknown

/** 判断旧测试夹具是否是后端标准响应结构。 */
function isApiEnvelope(value: unknown): value is { data?: unknown; message?: string; success: boolean } {
  return Boolean(value) && typeof value === 'object' && typeof (value as { success?: unknown }).success === 'boolean'
}

/** 识别测试中历史遗留的 Axios `{ data }` 响应壳。 */
function isLegacyDataWrapper(value: unknown): value is { data: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.keys(value).length === 1 && 'data' in value
}

/** 去掉请求层反馈选项，让业务测试的 spy 继续只关注端点、参数和载荷。 */
function businessArguments(args: unknown[]) {
  const normalized = [...args]
  const config = normalized.at(-1)
  if (!config || typeof config !== 'object' || Array.isArray(config) || !Object.hasOwn(config, 'feedback')) {
    return normalized
  }

  const businessConfig = { ...(config as Record<string, unknown>) }
  delete businessConfig.feedback
  if (Object.keys(businessConfig).length > 0) normalized[normalized.length - 1] = businessConfig
  else normalized.pop()
  if (normalized.at(-1) === undefined) normalized.pop()
  return normalized
}

/**
 * 让直接 mock 的 API 方法遵循生产数据客户端语义。
 *
 * 成功响应解包为 data，业务失败转为拒绝 Promise；裸数据保持不变。
 */
export function createDataApiMock<T extends Record<string, ApiMethodMock>>(methods: T) {
  return Object.fromEntries(
    Object.entries(methods).map(([name, method]) => [
      name,
      async (...args: unknown[]) => {
        let result: unknown
        try {
          result = await method(...businessArguments(args))
        } catch (error) {
          if (error instanceof ApiRequestError) throw error
          if (error instanceof Error) throw new ApiRequestError(error.message, { cause: error })
          throw new ApiRequestError('服务器连接失败', { cause: error })
        }
        if (isLegacyDataWrapper(result)) return result.data
        if (!isApiEnvelope(result)) return result
        if (!result.success) {
          throw new ApiRequestError(result.message || '请求失败', { businessFailure: true, payload: result })
        }
        return Object.hasOwn(result, 'data') ? result.data : null
      },
    ]),
  ) as { [K in keyof T]: ApiMethodMock }
}
