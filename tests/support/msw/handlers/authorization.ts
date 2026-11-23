import type { AuthorizationChannel, ChannelMember } from '@/api/authorization'
import { http } from 'msw'
import { apiJson } from '../response'

export const authorizationApiUrls = {
  list: 'http://localhost/api/v1/authorization/',
  member: (id: string) => `http://localhost/api/v1/authorization/${id}`,
  binding: 'http://localhost/api/v1/authorization/binding',
}

/** 注册不含连接密钥的通知实例和成员读取协议。 */
export function authorizationListHandler(
  members: ChannelMember[],
  channels: AuthorizationChannel[] = [{ id: 'telegram-a', name: '家庭机器人', channel: 'Telegram', enabled: true }],
) {
  return http.get(authorizationApiUrls.list, () => apiJson({ members, channels }))
}
