import type {
  DownloaderConf,
  FilterRuleGroup,
  MediaInfo,
  Site,
  Subscribe,
  SubscribeShare,
  SubscribeShareStatistics,
  TransferDirectoryConf,
} from '@/api/types'
import { HttpResponse, http, type JsonBodyType, type RequestHandler } from 'msw'
import { apiFailureJson, apiJson } from '../response'

const API_BASE_URL = 'http://localhost/api/v1/'

export type SubscribeMediaType = '电影' | '电视剧' | '音乐'

export interface SubscribeMutationResponse {
  success: boolean
  data?: Record<string, unknown>
  message?: string
}

export const subscribeApiUrls = {
  create: new URL('subscribe/', API_BASE_URL).href,
  defaultConfig: (type: SubscribeMediaType, writable = false) =>
    new URL(
      `system/setting/${writable ? '' : 'public/'}${
        {
          电影: 'DefaultMovieSubscribeConfig',
          电视剧: 'DefaultTvSubscribeConfig',
          音乐: 'DefaultMusicSubscribeConfig',
        }[type]
      }`,
      API_BASE_URL,
    ).href,
  deleteById: (id: number) => new URL(`subscribe/${id}`, API_BASE_URL).href,
  deleteByMedia: (mediaId: string) => new URL(`subscribe/media/${mediaId}`, API_BASE_URL).href,
  details: (id: number) => new URL(`subscribe/${id}`, API_BASE_URL).href,
  directories: new URL('system/setting/public/Directories', API_BASE_URL).href,
  downloaders: new URL('download/clients', API_BASE_URL).href,
  episodeGroups: (tmdbId: number) => new URL(`media/groups/${tmdbId}`, API_BASE_URL).href,
  filterRuleGroups: new URL('system/setting/UserFilterRuleGroups', API_BASE_URL).href,
  filesById: (id: number) => new URL(`subscribe/files/${id}`, API_BASE_URL).href,
  historyById: (id: number) => new URL(`subscribe/history/${id}`, API_BASE_URL).href,
  historyByType: (type: SubscribeMediaType) => new URL(`subscribe/history/${type}`, API_BASE_URL).href,
  follow: new URL('subscribe/follow', API_BASE_URL).href,
  followSubscribers: new URL('system/setting/public/FollowSubscribers', API_BASE_URL).href,
  fork: new URL('subscribe/fork', API_BASE_URL).href,
  queryByMedia: (mediaId: string) => new URL(`subscribe/media/${mediaId}`, API_BASE_URL).href,
  list: new URL('subscribe/', API_BASE_URL).href,
  orderConfig: (type: SubscribeMediaType) =>
    new URL(
      `user/config/${{ 电影: 'SubscribeMovieOrder', 电视剧: 'SubscribeTvOrder', 音乐: 'SubscribeMusicOrder' }[type]}`,
      API_BASE_URL,
    ).href,
  popular: new URL('subscribe/popular', API_BASE_URL).href,
  resetById: (id: number) => new URL(`subscribe/reset/${id}`, API_BASE_URL).href,
  searchById: (id: number) => new URL(`subscribe/search/${id}`, API_BASE_URL).href,
  share: new URL('subscribe/share', API_BASE_URL).href,
  shareById: (id: number) => new URL(`subscribe/share/${id}`, API_BASE_URL).href,
  shareStatistics: new URL('subscribe/share/statistics', API_BASE_URL).href,
  shares: new URL('subscribe/shares', API_BASE_URL).href,
  sites: new URL('site/rss', API_BASE_URL).href,
  statusById: (id: number) => new URL(`subscribe/status/${id}`, API_BASE_URL).href,
  update: new URL('subscribe/', API_BASE_URL).href,
}

function dataResponse(body: JsonBodyType, status: number) {
  if (status >= 400) return HttpResponse.json(body, { status })
  return apiJson(body, { status })
}

function mutationResponse(response: SubscribeMutationResponse, status: number) {
  if (status >= 400) return HttpResponse.json(response, { status })
  if (!response.success) return apiFailureJson(response.message ?? '', response.data ?? null, { status })
  return apiJson(response.data ?? null, { status })
}

export function subscribeListHandler(
  response: JsonBodyType = [],
  status = 200,
  onRequest: (url: URL) => void = () => {},
) {
  return http.get(subscribeApiUrls.list, ({ request }) => {
    onRequest(new URL(request.url))
    return dataResponse(response, status)
  })
}

export function popularSubscribesHandler(
  response: MediaInfo[] = [],
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.get(subscribeApiUrls.popular, async ({ request }) => {
    await onRequest(new URL(request.url))
    return dataResponse(response as unknown as JsonBodyType, status)
  })
}

export function subscribeSharesHandler(
  response: SubscribeShare[] = [],
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.get(subscribeApiUrls.shares, async ({ request }) => {
    await onRequest(new URL(request.url))
    return dataResponse(response as unknown as JsonBodyType, status)
  })
}

export function shareSubscribeHandler(
  response: SubscribeMutationResponse = { success: true },
  status = 200,
  onShare: (payload: SubscribeShare) => void | Promise<void> = () => {},
) {
  return http.post(subscribeApiUrls.share, async ({ request }) => {
    const payload = (await request.json()) as SubscribeShare
    await onShare(payload)
    return mutationResponse(response, status)
  })
}

export function forkSubscribeHandler(
  response: SubscribeMutationResponse = { data: { id: 1 }, success: true },
  status = 200,
  onFork: (payload: SubscribeShare) => void | Promise<void> = () => {},
) {
  return http.post(subscribeApiUrls.fork, async ({ request }) => {
    const payload = (await request.json()) as SubscribeShare
    await onFork(payload)
    return mutationResponse(response, status)
  })
}

export function followSubscribersSettingHandler(
  users: string[] = [],
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.get(subscribeApiUrls.followSubscribers, async ({ request }) => {
    await onRequest(new URL(request.url))
    if (status >= 400) return HttpResponse.json({ detail: 'failed' }, { status })
    return apiJson({ value: users }, { status })
  })
}

export function followSubscriberHandler(
  response: SubscribeMutationResponse = { success: true },
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.post(subscribeApiUrls.follow, async ({ request }) => {
    await onRequest(new URL(request.url))
    return mutationResponse(response, status)
  })
}

export function unfollowSubscriberHandler(
  response: SubscribeMutationResponse = { success: true },
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.delete(subscribeApiUrls.follow, async ({ request }) => {
    await onRequest(new URL(request.url))
    return mutationResponse(response, status)
  })
}

export function deleteSubscribeShareHandler(
  id: number,
  response: SubscribeMutationResponse = { success: true },
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.delete(subscribeApiUrls.shareById(id), async ({ request }) => {
    await onRequest(new URL(request.url))
    return mutationResponse(response, status)
  })
}

export function subscribeShareStatisticsHandler(
  response: SubscribeShareStatistics[] = [],
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.get(subscribeApiUrls.shareStatistics, async ({ request }) => {
    await onRequest(new URL(request.url))
    return dataResponse(response as unknown as JsonBodyType, status)
  })
}

export function subscribeFilesHandler(
  id: number,
  response: JsonBodyType = { episodes: {}, subscribe: null },
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.get(subscribeApiUrls.filesById(id), async ({ request }) => {
    await onRequest(new URL(request.url))
    return dataResponse(response, status)
  })
}

export function subscribeHistoryHandler(
  type: SubscribeMediaType,
  response: Subscribe[] = [],
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.get(subscribeApiUrls.historyByType(type), async ({ request }) => {
    await onRequest(new URL(request.url))
    return dataResponse(response as unknown as JsonBodyType, status)
  })
}

export function deleteSubscribeHistoryHandler(
  id: number,
  response: SubscribeMutationResponse = { success: true },
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.delete(subscribeApiUrls.historyById(id), async ({ request }) => {
    await onRequest(new URL(request.url))
    return mutationResponse(response, status)
  })
}

export function subscribeOrderConfigHandler(
  type: SubscribeMediaType,
  value: JsonBodyType = [],
  status = 200,
  onRequest: (url: URL) => void = () => {},
) {
  return http.get(subscribeApiUrls.orderConfig(type), ({ request }) => {
    onRequest(new URL(request.url))
    if (status >= 400) return HttpResponse.json({ detail: 'failed' }, { status })
    return apiJson({ value }, { status })
  })
}

export function saveSubscribeOrderConfigHandler(
  type: SubscribeMediaType,
  response: SubscribeMutationResponse = { success: true },
  status = 200,
  onSave: (payload: { id: number }[], url: URL) => void | Promise<void> = () => {},
) {
  return http.post(subscribeApiUrls.orderConfig(type), async ({ request }) => {
    const payload = (await request.json()) as { id: number }[]
    await onSave(payload, new URL(request.url))
    return mutationResponse(response, status)
  })
}

export function updateSubscribeStatusHandler(
  id: number,
  response: SubscribeMutationResponse = { success: true },
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.put(subscribeApiUrls.statusById(id), async ({ request }) => {
    await onRequest(new URL(request.url))
    return mutationResponse(response, status)
  })
}

export function searchSubscribeByIdHandler(
  id: number,
  response: SubscribeMutationResponse = { success: true },
  status = 200,
  onRequest: (url: URL) => void = () => {},
) {
  return http.get(subscribeApiUrls.searchById(id), ({ request }) => {
    onRequest(new URL(request.url))
    return mutationResponse(response, status)
  })
}

export function resetSubscribeByIdHandler(
  id: number,
  response: SubscribeMutationResponse = { success: true },
  status = 200,
  onRequest: (url: URL) => void = () => {},
) {
  return http.get(subscribeApiUrls.resetById(id), ({ request }) => {
    onRequest(new URL(request.url))
    return mutationResponse(response, status)
  })
}

export function createSubscribeHandler(
  response: SubscribeMutationResponse = { data: { id: 1 }, success: true },
  status = 200,
  onCreate: (payload: Record<string, unknown>) => void = () => {},
) {
  return http.post(subscribeApiUrls.create, async ({ request }) => {
    const payload = (await request.json()) as Record<string, unknown>
    onCreate(payload)
    return mutationResponse(response, status)
  })
}

export function updateSubscribeHandler(
  response: SubscribeMutationResponse = { success: true },
  status = 200,
  onUpdate: (payload: Record<string, unknown>) => void = () => {},
) {
  return http.put(subscribeApiUrls.update, async ({ request }) => {
    const payload = (await request.json()) as Record<string, unknown>
    onUpdate(payload)
    return mutationResponse(response, status)
  })
}

export function querySubscribeByMediaHandler(
  mediaId: string,
  subscribe: Partial<Subscribe>,
  status = 200,
  onRequest: (url: URL) => void = () => {},
) {
  return http.get(subscribeApiUrls.queryByMedia(mediaId), ({ request }) => {
    onRequest(new URL(request.url))
    return dataResponse(subscribe as JsonBodyType, status)
  })
}

export function deleteSubscribeByMediaHandler(
  mediaId: string,
  response: SubscribeMutationResponse = { success: true },
  status = 200,
  onRequest: (url: URL) => void = () => {},
) {
  return http.delete(subscribeApiUrls.deleteByMedia(mediaId), ({ request }) => {
    onRequest(new URL(request.url))
    return mutationResponse(response, status)
  })
}

export function subscribeDetailsHandler(
  id: number,
  subscribe: Subscribe,
  status = 200,
  onRequest: () => void = () => {},
) {
  return http.get(subscribeApiUrls.details(id), () => {
    onRequest()
    return dataResponse(subscribe as unknown as JsonBodyType, status)
  })
}

export function deleteSubscribeByIdHandler(
  id: number,
  response: SubscribeMutationResponse = { data: { status: 'deleted' }, success: true },
  status = 200,
  onRequest: () => void = () => {},
) {
  return http.delete(subscribeApiUrls.deleteById(id), () => {
    onRequest()
    return mutationResponse(response, status)
  })
}

export function defaultSubscribeConfigHandler(
  type: SubscribeMediaType,
  config: Partial<Subscribe>,
  status = 200,
  onRequest: () => void = () => {},
) {
  return http.get(subscribeApiUrls.defaultConfig(type), () => {
    onRequest()
    if (status >= 400) return HttpResponse.json({ detail: 'failed' }, { status })
    return apiJson({ value: config }, { status })
  })
}

export function saveDefaultSubscribeConfigHandler(
  type: SubscribeMediaType,
  response: SubscribeMutationResponse = { success: true },
  status = 200,
  onSave: (payload: Record<string, unknown>) => void = () => {},
) {
  return http.post(subscribeApiUrls.defaultConfig(type, true), async ({ request }) => {
    const payload = (await request.json()) as Record<string, unknown>
    onSave(payload)
    return mutationResponse(response, status)
  })
}

export interface SubscribeDialogOptions {
  directories?: TransferDirectoryConf[]
  downloaders?: DownloaderConf[]
  episodeGroups?: Record<string, unknown>[]
  filterRuleGroups?: FilterRuleGroup[]
  onDirectories?: () => void
  onDownloaders?: () => void
  onEpisodeGroups?: () => void
  onFilterRuleGroups?: () => void
  onSites?: () => void
  sites?: Site[]
  tmdbId?: number
}

/** 为编辑弹窗提供彼此独立、可按测试覆盖的选项接口。 */
export function subscribeDialogOptionHandlers(options: SubscribeDialogOptions = {}): RequestHandler[] {
  const {
    directories = [],
    downloaders = [],
    episodeGroups = [],
    filterRuleGroups = [],
    onDirectories = () => {},
    onDownloaders = () => {},
    onEpisodeGroups = () => {},
    onFilterRuleGroups = () => {},
    onSites = () => {},
    sites = [],
    tmdbId = 1,
  } = options

  return [
    http.get(subscribeApiUrls.sites, () => {
      onSites()
      return dataResponse(sites as unknown as JsonBodyType, 200)
    }),
    http.get(subscribeApiUrls.downloaders, () => {
      onDownloaders()
      return dataResponse(downloaders as unknown as JsonBodyType, 200)
    }),
    http.get(subscribeApiUrls.directories, () => {
      onDirectories()
      return apiJson({ value: directories })
    }),
    http.get(subscribeApiUrls.filterRuleGroups, () => {
      onFilterRuleGroups()
      return apiJson({ value: filterRuleGroups })
    }),
    http.get(subscribeApiUrls.episodeGroups(tmdbId), () => {
      onEpisodeGroups()
      return dataResponse(episodeGroups as unknown as JsonBodyType, 200)
    }),
  ]
}
