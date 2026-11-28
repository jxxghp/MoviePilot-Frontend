import api from './index'

/** 渠道成员可授予的业务能力，管理员具有全部能力。 */
export type ChannelScope = 'search' | 'subscribe' | 'download' | 'schedule'
/** 独立渠道角色不等同于网页登录账号角色。 */
export type ChannelRole = 'member' | 'admin'
/** 申请审批与当前启用状态。 */
export type ChannelMemberStatus = 'pending' | 'approved' | 'rejected' | 'disabled'

/** 脱敏的通知实例，授权页面不读取渠道密钥。 */
export interface AuthorizationChannel {
  id: string
  name: string
  channel: string
  enabled: boolean
}

/** 管理弹窗使用的渠道成员及申请快照。 */
export interface ChannelMember {
  id: string
  notification_id: string
  channel: string
  source: string
  sender_id: string
  display_name: string
  status: ChannelMemberStatus
  role: ChannelRole
  scopes: ChannelScope[]
  linked_username: string | null
  origin: string
  created_at: number
  updated_at: number
  channel_enabled: boolean
}

/** 首次加载成员与可选通知实例的响应。 */
export interface ChannelAuthorizationData {
  members: ChannelMember[]
  channels: AuthorizationChannel[]
}

/** 管理员明确确认的审批或权限变更。 */
export interface ChannelMemberUpdate {
  status: Exclude<ChannelMemberStatus, 'pending'>
  role: ChannelRole
  scopes: ChannelScope[]
}

/** 直接授权时使用完整平台发送者 ID，不接受昵称或群 ID。 */
export interface ChannelMemberCreate extends ChannelMemberUpdate {
  notification_id: string
  sender_id: string
  display_name: string
}

/** 整批操作只处理显式选择的版本，冲突时整批不提交。 */
export type ChannelMemberBatchAction = 'approve' | 'reject' | 'disable' | 'delete'
export interface ChannelMemberBatchRequest {
  action: ChannelMemberBatchAction
  members: { id: string; expected_updated_at: number }[]
  scopes?: ChannelScope[]
  confirm_approved?: boolean
}
export interface ChannelMemberBatchResult {
  members: ChannelMember[]
  deleted_ids: string[]
}

/** 批量通过仅授予普通成员角色，权限由本次操作明确选择。 */
export function batchChannelAuthorizations(payload: ChannelMemberBatchRequest): Promise<ChannelMemberBatchResult> {
  return api.post('authorization/batch', payload, { feedback: 'silent' })
}

/** 删除当前读取版本；已授权记录必须在界面二次确认。 */
export function deleteChannelAuthorization(member: ChannelMember, confirmApproved = false): Promise<void> {
  return api.delete(`authorization/${encodeURIComponent(member.id)}`, {
    data: { expected_updated_at: member.updated_at, confirm_approved: confirmApproved },
    feedback: 'silent',
  })
}

/** 当前网页账号五分钟有效的一次性关联码，不写入浏览器持久化存储。 */
export interface ChannelBindingData {
  code: string
  expires_at: number
}

export const CHANNEL_SCOPES: ChannelScope[] = ['search', 'subscribe', 'download', 'schedule']
export const DEFAULT_CHANNEL_SCOPES: ChannelScope[] = ['search', 'subscribe', 'download']

/** 查询统一申请和成员列表，取消已关闭弹窗的读取请求。 */
export function getChannelAuthorizations(signal?: AbortSignal): Promise<ChannelAuthorizationData> {
  return api.get('authorization/', { signal, feedback: 'silent' })
}

/** 修改指定成员，返回提交后的当前授权快照。 */
export function updateChannelAuthorization(id: string, payload: ChannelMemberUpdate): Promise<ChannelMember> {
  return api.put(`authorization/${encodeURIComponent(id)}`, payload, { feedback: 'silent' })
}

/** 为管理员已经核对的平台用户直接授权。 */
export function createChannelAuthorization(payload: ChannelMemberCreate): Promise<ChannelMember> {
  return api.post('authorization/', payload, { feedback: 'silent' })
}

/** 仅在用户打开关联弹窗或主动重新生成时请求短时凭据。 */
export function createChannelBinding(signal?: AbortSignal): Promise<ChannelBindingData> {
  return api.post('authorization/binding', undefined, { signal, feedback: 'silent' })
}

/** 移除旧渠道授权键，防止旧页面草稿重新提交已迁移的白名单。 */
export function stripLegacyChannelAuthorization(config: Record<string, unknown>): Record<string, unknown> {
  const result = { ...config }
  for (const key of [
    'TELEGRAM_USERS',
    'TELEGRAM_ADMINS',
    'WECHAT_ADMINS',
    'WECHATCLAWBOT_ADMINS',
    'FEISHU_ADMINS',
    'QQBOT_ADMINS',
    'DISCORD_ADMINS',
    'SLACK_ADMINS',
    'VOCECHAT_ADMINS',
    'SYNOLOGYCHAT_ADMINS',
  ]) {
    delete result[key]
  }
  return result
}
