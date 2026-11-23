import api from '@/api'

/** 连接、通知与交互管理共用的连接摘要，读接口只返回凭据状态。 */
export interface ChannelConnection {
  id: string
  name: string
  provider: string
  mode: 'standard' | 'app' | 'bot'
  identity_namespace: string
  enabled: boolean
  revision: number
  credential_status?: 'ready' | 'verification_required'
  inbound_token_configured?: boolean
  can_rotate_credential?: boolean
}

/** 独立保存的通知路由。 */
export interface NotificationRoute {
  connection_id: string
  enabled: boolean
  message_types: string[]
  rules?: NotificationRule[]
  revision: number
}

/** 按宿主已经确定的受众选择事件和单个投递目标。 */
export type NotificationAudience = 'any' | 'admin' | 'user' | 'all'
/** 全局路由产生的通知类别；空集合代表沿用全局范围。 */
export type NotificationRuleAudience = Exclude<NotificationAudience, 'any'>
export type NotificationTargetKind = 'bound' | 'account' | 'user' | 'conversation' | 'webhook' | 'all' | 'review'

/** 以系统本地时间限制规则，窗口外直接跳过。 */
export interface NotificationSendTime {
  start: string
  end: string
}

/** 主动通知规则；缺省名字和时间窗口兼容历史配置。 */
export interface NotificationRule {
  name?: string
  send_time?: NotificationSendTime | null
  message_types: string[]
  enabled: boolean
  audience: NotificationAudience
  audiences?: NotificationRuleAudience[] | null
  kind: NotificationTargetKind
  target: string | null
  thread_id: string | null
  fallback_only: boolean
  legacy_usernames: string[]
  owner_identity: string | null
}

/** 独立保存的交互配置。 */
export interface InteractionPolicy {
  connection_id: string
  enabled: boolean
  admission: AdmissionMode
  command_guild_id?: string | null
  admission_rules?: AdmissionRule[]
  auto_download_rules?: InteractionMatch[]
  auto_download?: AutoDownloadPreference
  revision: number
}

/** 后端能力目录提供的接入方式和可配置的交互偏好。 */
export type AdmissionMode = 'manual' | 'manual_rules' | 'rules' | 'open'
export type InteractionScope = 'search' | 'subscribe' | 'download' | 'schedule'
export type AutoDownloadPreference = 'off' | 'specified' | 'all'
export type RuleKind = 'user' | 'group' | 'private'

/** 精确匹配当前连接的入站身份。私聊不填写目标 ID。 */
export interface InteractionMatch {
  name?: string
  kind: RuleKind
  target: string | null
  enabled?: boolean
}

/** 每条豁免规则独立指定允许的业务操作。 */
export interface AdmissionRule extends InteractionMatch {
  scopes: InteractionScope[]
}

export type InteractionPolicyOptions = {
  admission: AdmissionMode
  command_guild_id?: string
  admission_rules: AdmissionRule[]
  auto_download: AutoDownloadPreference
  auto_download_rules: InteractionMatch[]
}

/** 管理员可以读取的连接和功能配置。 */
export interface ChannelSettings {
  connections: ChannelConnection[]
  notifications: NotificationRoute[]
  notification_target_kinds?: Record<string, NotificationTargetKind[]>
  interactions: InteractionPolicy[]
  admission_modes?: Record<string, AdmissionMode[]>
  rule_kinds?: Record<string, RuleKind[]>
  orders?: Partial<Record<ChannelFeature, string[]>>
  can_edit_provider_config?: boolean
  can_delete_connections?: boolean
}

/** 确认移除时展示的记录数量。 */
export interface ChannelConnectionReferences {
  member_count: number
  task_count: number
}

/** 两个页面可各自保存显示顺序。 */
export type ChannelFeature = 'notification' | 'interaction'

/** 读取平台编辑表单时只回填非敏感字段。 */
export interface ChannelConnectionForm {
  revision: number
  values: Record<string, unknown>
  editable_fields: string[]
}

const path = 'notification/channels'

export function getChannelSettings(signal: AbortSignal) {
  return api.get<ChannelSettings>(path, { signal, feedback: 'silent' })
}

/** 管理员可按用户名选择稳定的推送账号。 */
export interface NotificationRuleAccount {
  name: string
  identity: string
}

export function getNotificationRuleAccounts(signal: AbortSignal) {
  return api.get<NotificationRuleAccount[]>(`${path}/notification-accounts`, { signal, feedback: 'silent' })
}

export function createChannelConnection(name: string, provider: string, config: Record<string, unknown>) {
  return api.post<ChannelConnection>(
    `${path}/connections`,
    { name, provider, provider_config: config },
    { feedback: 'silent' },
  )
}

export function updateChannelConnection(
  connection: ChannelConnection,
  name: string,
  enabled: boolean,
  inboundToken?: string,
  providerConfig?: Record<string, unknown>,
) {
  return api.put<ChannelConnection>(
    `${path}/${encodeURIComponent(connection.id)}/connection`,
    {
      name,
      enabled,
      expected_revision: connection.revision,
      inbound_token: inboundToken,
      provider_config: providerConfig,
    },
    { feedback: 'silent' },
  )
}

export function getChannelConnectionForm(connection: ChannelConnection, signal: AbortSignal) {
  return api.get<ChannelConnectionForm>(`${path}/${encodeURIComponent(connection.id)}/connection`, {
    signal,
    feedback: 'silent',
  })
}

export function reorderChannelCards(feature: ChannelFeature, order: string[], expectedOrder: string[]) {
  return api.put<string[]>(`${path}/order/${feature}`, { order, expected_order: expectedOrder }, { feedback: 'silent' })
}

export function getChannelConnectionReferences(connection: ChannelConnection, signal: AbortSignal) {
  return api.get<ChannelConnectionReferences>(`${path}/${encodeURIComponent(connection.id)}/references`, {
    signal,
    feedback: 'silent',
  })
}

/** 移除前核对确认画面中的连接和两个用途各自的版本。 */
export function deleteChannelConnection(
  connection: ChannelConnection,
  route: NotificationRoute | undefined,
  policy: InteractionPolicy | undefined,
) {
  return api.delete<ChannelConnection>(`${path}/${encodeURIComponent(connection.id)}/connection`, {
    data: {
      expected_revision: connection.revision,
      notification_revision: route?.revision ?? null,
      interaction_revision: policy?.revision ?? null,
    },
    feedback: 'silent',
  })
}

/** 仅提交候选凭据和连接版本，平台账号由后端核验。 */
export function rotateChannelCredential(connection: ChannelConnection, secret: string) {
  return api.put<ChannelConnection>(
    `${path}/${encodeURIComponent(connection.id)}/credential`,
    { secret, expected_revision: connection.revision },
    { feedback: 'silent' },
  )
}

export function updateNotificationRoute(
  route: NotificationRoute,
  enabled: boolean,
  messageTypes: string[],
  rules?: NotificationRule[],
) {
  return api.put<NotificationRoute>(
    `${path}/${encodeURIComponent(route.connection_id)}/notification`,
    { enabled, ...(rules ? { rules } : { message_types: messageTypes }), expected_revision: route.revision },
    { feedback: 'silent' },
  )
}

export function updateInteractionPolicy(
  policy: InteractionPolicy,
  enabled: boolean,
  options?: InteractionPolicyOptions,
) {
  return api.put<InteractionPolicy>(
    `${path}/${encodeURIComponent(policy.connection_id)}/interaction`,
    { enabled, expected_revision: policy.revision, ...options },
    { feedback: 'silent' },
  )
}
