import type { MediaSourceInfo, ModuleCatalogInfo } from '@/api/types'
import { setMediaSourceCatalog } from '@/utils/mediaId'
import { HttpResponse, http } from 'msw'
import { apiJson } from '../response'

const API_BASE_URL = 'http://localhost/api/v1/'

/** 目录类接口的测试地址。 */
export const catalogApiUrls = {
  mediaSources: new URL('media/source', API_BASE_URL).href,
  moduleCatalog: new URL('system/module-catalog', API_BASE_URL).href,
}

/** 覆盖内置探索、推荐测试所需的后端媒体来源快照。 */
export const defaultMediaSources: MediaSourceInfo[] = [
  { name: 'TheMovieDb', media_source: 'themoviedb', media_types: ['电影', '电视剧'] },
  { name: '豆瓣', media_source: 'douban', media_types: ['电影', '电视剧'] },
  { name: 'Bangumi', media_source: 'bangumi', media_types: ['电影', '电视剧'] },
  { name: 'AniList', media_source: 'anilist', media_types: ['电影', '电视剧'] },
  { name: 'IMDb', media_source: 'imdb', media_types: ['电影', '电视剧'] },
  { name: 'TVDB', media_source: 'tvdb', media_types: ['电影', '电视剧'] },
  { name: 'MusicBrainz', media_source: 'musicbrainz', media_types: ['音乐'] },
  { name: 'TheAudioDB', media_source: 'theaudiodb', media_types: ['音乐'] },
  { name: '豆瓣音乐', media_source: 'doubanmusic', media_types: ['音乐'] },
]

/** 为未挂载应用初始化的组件测试注入后端媒体来源快照。 */
export function seedMediaSourceCatalog(sources: MediaSourceInfo[] = defaultMediaSources) {
  setMediaSourceCatalog(sources)
}

/** 激活推荐测试所需的后端模块快照。 */
export const defaultModuleCatalog: ModuleCatalogInfo[] = [
  {
    id: 'ListenBrainzModule',
    name: 'ListenBrainz',
    name_i18n: 'ListenBrainz',
    name_key: 'system.modules.ListenBrainzModule.name',
    description_i18n: '',
    description_key: 'system.modules.ListenBrainzModule.description',
    type: 'other',
    subtype: 'ListenBrainz',
    enabled: true,
    active: true,
  },
]

/** 返回媒体来源目录的成功或失败响应。 */
export function mediaSourcesHandler(sources: MediaSourceInfo[] = defaultMediaSources, status = 200) {
  return http.get(catalogApiUrls.mediaSources, () => {
    if (status >= 400) return HttpResponse.json({ detail: 'failed' }, { status })
    return apiJson(sources, { status })
  })
}

/** 返回宿主模块目录的成功或失败响应。 */
export function moduleCatalogHandler(modules: ModuleCatalogInfo[] = defaultModuleCatalog, status = 200) {
  return http.get(catalogApiUrls.moduleCatalog, () => {
    if (status >= 400) return HttpResponse.json({ detail: 'failed' }, { status })
    return apiJson({ modules }, { status })
  })
}
