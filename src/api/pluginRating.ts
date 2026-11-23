import api from '@/api'
import type { PluginRating } from '@/api/types'

/**
 * 一次读取完整评分快照，避免把插件 ID 拼成长查询参数触发 WAF。
 * 中心端全量查询使用小写键且只包含已有评分的插件，此处恢复列表 ID 和零评分默认值。
 */
export async function getPluginRatings(pluginIds: readonly string[]): Promise<Record<string, PluginRating>> {
  if (pluginIds.length === 0) return {}

  const snapshot = await api.get<Record<string, PluginRating>>('plugin/rating')
  const ratings = new Map(Object.entries(snapshot).map(([id, rating]) => [id.toLowerCase(), rating]))
  return Object.fromEntries(
    pluginIds.map(id => {
      const rating = ratings.get(id.toLowerCase())
      return [
        id,
        {
          plugin_id: id,
          average_rating: rating?.average_rating ?? 0,
          rating_count: rating?.rating_count ?? 0,
          user_rating: rating?.user_rating ?? null,
        },
      ]
    }),
  )
}
