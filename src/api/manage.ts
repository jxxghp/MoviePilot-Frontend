import type { AxiosRequestConfig } from 'axios'
import api from './index'

/** 通用管理请求：目标标识 + 管理动作 + 透传参数，与后端 ManageRequest 一致。 */
export interface ManageRequest {
  target: string
  action: string
  params?: Record<string, unknown>
}

/**
 * 调用统一管理端点（通知渠道 / 网盘存储 / LLM 提供商）
 *
 * 端点层不定义任何目标特定的名称与参数，
 * 目标标识、管理动作与表单参数原样透传给后端模块
 */
function manageTarget<T = Record<string, unknown>>(
  endpoint: 'notification/manage' | 'storage/manage' | 'llm/manage',
  request: ManageRequest,
  config?: AxiosRequestConfig,
): Promise<T> {
  return api.post<T>(endpoint, { params: {}, ...request }, config)
}

/** 对指定通知渠道执行管理动作，返回响应中的业务数据。 */
export function manageNotificationChannel<T = Record<string, unknown>>(
  channel: string,
  action: string,
  params: Record<string, unknown> = {},
  config?: AxiosRequestConfig,
): Promise<T> {
  return manageTarget<T>('notification/manage', { target: channel, action, params }, config)
}

/** 对指定网盘存储执行管理动作，返回响应中的业务数据。 */
export function manageStorage<T = Record<string, unknown>>(
  storage: string,
  action: string,
  params: Record<string, unknown> = {},
  config?: AxiosRequestConfig,
): Promise<T> {
  return manageTarget<T>('storage/manage', { target: storage, action, params }, config)
}

/** 对指定 LLM 提供商执行管理动作，返回响应中的业务数据。 */
export function manageLlmProvider<T = Record<string, unknown>>(
  provider: string,
  action: string,
  params: Record<string, unknown> = {},
  config?: AxiosRequestConfig,
): Promise<T> {
  return manageTarget<T>('llm/manage', { target: provider, action, params }, config)
}
