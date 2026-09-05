import api from '@/api'
import type { MediaServerClient } from '@/api/types'

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
