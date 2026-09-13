import api from './index'
import { ApiRequestError, isApiBusinessFailure, isApiResponse } from './client'
import type { PluginCloneOutcome, PluginCloneRequest, PluginRestorableInstance } from './types'

/** 服务端接受的分身后缀字符集；这里只做即时反馈，能否创建仍以服务端为准。 */
export const CLONE_SUFFIX_PATTERN = /^[A-Za-z0-9]+$/

/** 服务端接受的分身后缀最大长度。 */
export const CLONE_SUFFIX_MAX_LENGTH = 20

/** 一条落到具体字段上的服务端校验结论。 */
export interface PluginCloneFieldIssue {
  // 字段名，取自 pydantic loc 的最后一段，例如 suffix
  field: string
  // 该字段的校验失败原因
  message: string
}

/**
 * 创建或恢复一个插件分身。
 *
 * suffix 送 null 即请求服务端自动分配；填上某个已停用分身的后缀则是恢复那一行，
 * 两者走的是同一个端点。回执里的 instance_id 是唯一可靠的实例 ID 来源：自动分配
 * 时前端无从推算它。
 */
export function createPluginClone(pluginId: string, request: PluginCloneRequest): Promise<PluginCloneOutcome> {
  return api.post<PluginCloneOutcome, PluginCloneOutcome, PluginCloneRequest>(
    `plugin/clone/${encodeURIComponent(pluginId)}`,
    request,
    { feedback: 'silent' },
  )
}

/**
 * 读取该插件下可被恢复的分身清单。
 *
 * 只认源插件 ID。不传分页参数取完整清单：这份清单是给人挑的，长度等于该插件历史上
 * 停用过的分身数，分页反而会让「自动分配不会挑中清单里的号」这条结论看着不成立。
 */
export function getPluginRestorableInstances(pluginId: string): Promise<PluginRestorableInstance[]> {
  return api.get<PluginRestorableInstance[]>(`plugin/clone/${encodeURIComponent(pluginId)}/restorable`, {
    feedback: 'silent',
  })
}

/** 判断未知值是否是带实例 ID 的分身回执。 */
function isCloneOutcome(value: unknown): value is PluginCloneOutcome {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.instance_id === 'string' && record.instance_id.length > 0
}

/**
 * 从业务失败中读回「分身已经建出来了」的回执。
 *
 * 分身建成之后补挂定时任务或路由仍可能失败，此时 success 为假但 data.instance_id
 * 有值——那个实例是真的存在的。把这种失败当成没建成而提示重试，只会撞上「已存在」。
 */
export function getPluginClonePartialOutcome(error: unknown): PluginCloneOutcome | null {
  if (!isApiBusinessFailure(error)) return null
  const payload = error.payload ?? error.response?.data
  if (!isApiResponse<PluginCloneOutcome>(payload)) return null
  return isCloneOutcome(payload.data) ? payload.data : null
}

/** 取 pydantic loc 中最后一段字符串作为字段名，跳过 body 与数组下标。 */
function resolveIssueField(loc: unknown): string {
  if (!Array.isArray(loc)) return ''
  const segments = loc.filter((item): item is string => typeof item === 'string' && item !== 'body')
  return segments.at(-1) ?? ''
}

/**
 * 从 422 响应中读取字段级校验结论。
 *
 * 后缀不合规时服务端回的是 pydantic 标准结构而非业务层 envelope，detail 是数组，
 * 请求层的 message 取不到它，只会留下「请求失败」这类无用文案，必须在这里解开。
 */
export function getPluginCloneFieldIssues(error: unknown): PluginCloneFieldIssue[] {
  if (!(error instanceof ApiRequestError) || error.status !== 422) return []

  const payload = error.payload ?? error.response?.data
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const detail = (payload as Record<string, unknown>).detail
  if (!Array.isArray(detail)) return []

  return detail.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const message = typeof record.msg === 'string' ? record.msg.trim() : ''
    if (!message) return []
    return [{ field: resolveIssueField(record.loc), message }]
  })
}
