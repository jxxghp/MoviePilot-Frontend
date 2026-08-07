import type { MediaInfo } from '@/api/types'
import type { RouteLocationRaw } from 'vue-router'

export interface MusicRouteTarget {
  source?: string
  media_source?: string
  media_id?: string | number
  title?: string
  name?: string
  year?: string | number
}

/** 返回音乐对象可用于路由和订阅的统一来源。 */
export function getMusicSource(item: MusicRouteTarget): string | undefined {
  return item.source || item.media_source
}

/** 返回音乐候选在列表和状态缓存中的稳定身份。 */
export function getMusicKey(item: MusicRouteTarget): string {
  const source = getMusicSource(item) || 'music'
  return `${source}:${item.media_id || `${item.title || item.name}-${item.year || ''}`}`
}

/** 构造音乐详情路由，缺少标准身份时回退到音乐搜索页。 */
export function buildMusicDetailRoute(item: MusicRouteTarget): RouteLocationRaw {
  const source = getMusicSource(item)
  if (!source || !item.media_id) {
    return {
      path: '/music',
      query: { query: item.title || item.name },
    }
  }
  return {
    path: '/music/detail',
    query: {
      source,
      mediaid: item.media_id.toString(),
      title: item.title || item.name,
    },
  }
}

/** 构造音乐元数据身份对应的站点资源搜索路由。 */
export function buildMusicResourceRoute(item: MediaInfo): RouteLocationRaw | undefined {
  const source = getMusicSource(item)
  if (!source || !item.media_id) return undefined
  return {
    path: '/resource',
    query: {
      keyword: `${source}:${item.media_id}`,
      type: '音乐',
      title: item.title,
      year: item.year,
      area: 'title',
      result_type: 'torrent',
    },
  }
}
