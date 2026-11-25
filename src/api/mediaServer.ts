import api from '@/api'
import type { MediaServerClient } from '@/api/types'

/** 媒体服务器播放同步模式。 */
export type MediaServerSyncMode = 'session' | 'userdata' | 'scrobble' | 'none'

/** 当前用户与媒体服务器账号的绑定状态。 */
export type MediaServerBindingStatus = 'bound' | 'invalid' | 'unbound' | 'builtin' | 'unsupported'

/** 当前用户在单个媒体服务器实例上的脱敏账号绑定状态。 */
export interface MediaServerAccountBinding {
  server: string
  server_type: string
  sync_mode: MediaServerSyncMode
  supports_binding: boolean
  bound: boolean
  status: MediaServerBindingStatus
  remote_username: string | null
  source: 'manual' | 'auxiliary_auth' | null
  updated_at: number | null
}

/** 一次性换取媒体服务器个人访问令牌的绑定请求载荷（密码不落库）。 */
export interface MediaServerAccountBindPayload {
  server: string
  username?: string
  password?: string
  token?: string
}

const VALID_SYNC_MODES = new Set<MediaServerSyncMode>(['session', 'userdata', 'scrobble', 'none'])
const VALID_BINDING_STATUSES = new Set<MediaServerBindingStatus>([
  'bound',
  'invalid',
  'unbound',
  'builtin',
  'unsupported',
])

function normalizeBinding(raw: unknown): MediaServerAccountBinding | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const server = typeof record.server === 'string' ? record.server.trim() : ''
  const serverType = typeof record.server_type === 'string' ? record.server_type.trim() : ''
  if (!server || !serverType) return null
  const syncMode = VALID_SYNC_MODES.has(record.sync_mode as MediaServerSyncMode)
    ? (record.sync_mode as MediaServerSyncMode)
    : 'none'
  const status = VALID_BINDING_STATUSES.has(record.status as MediaServerBindingStatus)
    ? (record.status as MediaServerBindingStatus)
    : 'unsupported'
  const source = record.source === 'manual' || record.source === 'auxiliary_auth' ? record.source : null
  const remoteUsername =
    typeof record.remote_username === 'string' && record.remote_username.trim() ? record.remote_username.trim() : null
  const updatedAt =
    typeof record.updated_at === 'number' && Number.isFinite(record.updated_at) ? record.updated_at : null
  return {
    server,
    server_type: serverType,
    sync_mode: syncMode,
    supports_binding: Boolean(record.supports_binding),
    bound: Boolean(record.bound),
    status,
    remote_username: remoteUsername,
    source,
    updated_at: updatedAt,
  }
}

/** 查询已启用且不包含连接配置的媒体服务器客户端。 */
export async function listMediaServerClients(): Promise<MediaServerClient[]> {
  const result = await api.get<unknown>('mediaserver/clients', { feedback: 'silent' })
  if (!Array.isArray(result)) return []

  return result.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const type = typeof record.type === 'string' ? record.type.trim() : ''
    return name && type ? [{ name, type }] : []
  })
}

/** 查询当前用户在全部已启用媒体服务器上的账号绑定状态与同步模式。 */
export async function listMediaServerAccountBindings(signal?: AbortSignal): Promise<MediaServerAccountBinding[]> {
  const result = await api.get<unknown>('mediaserver/account-bindings', { signal, feedback: 'silent' })
  if (!Array.isArray(result)) return []
  return result.flatMap(item => {
    const normalized = normalizeBinding(item)
    return normalized ? [normalized] : []
  })
}

/** 使用账号密码或 Plex Token 为当前用户绑定媒体服务器以启用实时会话同步。 */
export async function bindMediaServerAccount(
  payload: MediaServerAccountBindPayload,
): Promise<MediaServerAccountBinding> {
  const result = await api.post<unknown>('mediaserver/account-bindings', payload, { feedback: 'silent' })
  const normalized = normalizeBinding(result)
  if (!normalized) throw new Error('媒体服务器账号绑定响应格式异常')
  return normalized
}

/** 解除当前用户在指定媒体服务器上的个人令牌绑定。 */
export async function unbindMediaServerAccount(server: string): Promise<void> {
  await api.delete(`mediaserver/account-bindings/${encodeURIComponent(server)}`, { feedback: 'silent' })
}
