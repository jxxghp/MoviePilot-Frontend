import { computed } from 'vue'
import api from '@/api'
import type { MediaSourceInfo } from '@/api/types'
import {
  getMediaSourceCatalog,
  markMediaSourceCatalogUnavailable,
  setMediaSourceCatalog,
  supportsMediaSourceType,
} from '@/utils/mediaId'

export type MediaSourceOptionKind = 'media' | 'music'

let mediaSourceLoadPromise: Promise<void> | null = null

/** 加载后端注册的媒体来源目录；同一页面会话只发起一次请求。 */
export function loadMediaSources(force = false): Promise<void> {
  if (force) mediaSourceLoadPromise = null
  if (mediaSourceLoadPromise) return mediaSourceLoadPromise
  let loaded = false
  mediaSourceLoadPromise = api
    .get<MediaSourceInfo[]>('media/source')
    .then(sources => {
      setMediaSourceCatalog(Array.isArray(sources) ? sources : [])
      loaded = true
    })
    .catch(error => {
      console.warn('加载媒体数据源失败：', error)
      markMediaSourceCatalogUnavailable()
    })
    .finally(() => {
      if (!loaded) mediaSourceLoadPromise = null
    })
  return mediaSourceLoadPromise
}

/** 提供后端来源目录，并按影视/音乐能力构造选择器选项。 */
export function useMediaSources() {
  const catalog = getMediaSourceCatalog()

  const mediaSourceItems = (kind?: MediaSourceOptionKind) =>
    computed(() =>
      catalog.value
        .filter(source => {
          return !kind || supportsMediaSourceType(source, kind)
        })
        .map(source => ({ title: source.name, value: source.media_source })),
    )

  return {
    catalog,
    mediaSourceItems,
    loadMediaSources,
  }
}
