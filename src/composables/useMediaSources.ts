import { computed } from 'vue'
import api from '@/api'
import type { MediaSourceInfo } from '@/api/types'
import { MediaSource } from '@/api/types'
import { getMediaSourceCatalog, setMediaSourceCatalog, supportsMediaSourceType } from '@/utils/mediaId'

export type MediaSourceOptionKind = 'media' | 'music'

let mediaSourceLoadPromise: Promise<void> | null = null

/** 加载后端注册的媒体来源目录；同一页面会话只发起一次请求。 */
export function loadMediaSources(): Promise<void> {
  if (mediaSourceLoadPromise) return mediaSourceLoadPromise
  mediaSourceLoadPromise = api
    .get<MediaSourceInfo[]>('media/source')
    .then(sources => setMediaSourceCatalog(Array.isArray(sources) ? sources : []))
    .catch(error => {
      console.warn('加载媒体数据源失败，继续使用内置来源：', error)
    })
  return mediaSourceLoadPromise
}

/** 提供来源选择器所需的插件扩展项，并按影视/音乐能力过滤。 */
export function useMediaSources() {
  const catalog = getMediaSourceCatalog()
  const customMediaSources = computed(() => {
    const builtin = new Set<string>(Object.values(MediaSource))
    return catalog.value.filter(source => !builtin.has(source.media_source))
  })

  const mediaSourceItems = (kind?: MediaSourceOptionKind) =>
    computed(() =>
      customMediaSources.value
        .filter(source => {
          return !kind || supportsMediaSourceType(source, kind)
        })
        .map(source => ({ title: source.name, value: source.media_source })),
    )

  return {
    catalog,
    customMediaSources,
    mediaSourceItems,
    loadMediaSources,
  }
}
