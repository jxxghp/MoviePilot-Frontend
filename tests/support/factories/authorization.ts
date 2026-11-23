import type { ChannelMember } from '@/api/authorization'

/** 创建脱敏的渠道申请，保持与后端公开响应一致。 */
export function createChannelMember(overrides: Partial<ChannelMember> = {}): ChannelMember {
  return {
    id: 'member-a',
    notification_id: 'telegram-a',
    channel: 'Telegram',
    source: '家庭机器人',
    sender_id: '10001',
    display_name: '小明',
    status: 'pending',
    role: 'member',
    scopes: ['search', 'subscribe', 'download'],
    linked_username: null,
    origin: 'request',
    created_at: 1794840000,
    updated_at: 1794840000,
    channel_enabled: true,
    ...overrides,
  }
}
