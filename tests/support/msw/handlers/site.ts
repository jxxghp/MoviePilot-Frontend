import type {
  ApiResponse,
  DownloaderConf,
  Site,
  SiteCategory,
  SiteStatistic,
  SiteUserData,
  TorrentInfo,
} from '@/api/types'
import { HttpResponse, http, type JsonBodyType } from 'msw'

const API_BASE_URL = 'http://localhost/api/v1/'

interface ApiEnvelopeInput<T> {
  success: boolean
  data?: T | null
  message?: string
}

type SiteMutationResponse = ApiEnvelopeInput<Record<string, unknown>>

/** 构造站点测试请求的严格三段式网络响应。 */
function apiEnvelope<T>(data: T | null, success = true, message = ''): ApiResponse<T> {
  return { data, message, success }
}

/** 将测试用的简写输入规范化为后端实际发送的完整 envelope。 */
function normalizeEnvelope<T>(input: ApiEnvelopeInput<T>): ApiResponse<T> {
  return apiEnvelope(input.data ?? null, input.success, input.message ?? '')
}

export const siteApiUrls = {
  categories: (siteId: number) => new URL(`site/category/${siteId}`, API_BASE_URL).href,
  cookie: (id: number) => new URL(`site/cookie/${id}`, API_BASE_URL).href,
  delete: (id: number) => new URL(`site/${id}`, API_BASE_URL).href,
  details: (id: number) => new URL(`site/${id}`, API_BASE_URL).href,
  downloaders: new URL('download/clients', API_BASE_URL).href,
  icon: (id: number) => new URL(`site/icon/${id}`, API_BASE_URL).href,
  list: new URL('site/', API_BASE_URL).href,
  priorities: new URL('site/priorities', API_BASE_URL).href,
  resources: (siteId: number) => new URL(`site/resource/${siteId}`, API_BASE_URL).href,
  statistic: (domain: string) => new URL(`site/statistic/${domain}`, API_BASE_URL).href,
  statistics: new URL('site/statistic', API_BASE_URL).href,
  test: (id: number) => new URL(`site/test/${id}`, API_BASE_URL).href,
  userData: (id: number) => new URL(`site/userdata/${id}`, API_BASE_URL).href,
  userDataLatest: new URL('site/userdata/latest', API_BASE_URL).href,
}

export function siteListHandler(
  sites: Site[],
  status: number | (() => number) = 200,
  onRequest: () => void | Promise<void> = () => {},
) {
  return http.get(siteApiUrls.list, async () => {
    await onRequest()
    return HttpResponse.json(apiEnvelope(sites) as unknown as JsonBodyType, {
      status: typeof status === 'function' ? status() : status,
    })
  })
}

export function siteStatisticsHandler(
  statistics: SiteStatistic[],
  status = 200,
  onRequest: () => void | Promise<void> = () => {},
) {
  return http.get(siteApiUrls.statistics, async () => {
    await onRequest()
    return HttpResponse.json(apiEnvelope(statistics) as unknown as JsonBodyType, { status })
  })
}

export function siteStatisticHandler(
  domain: string,
  statistic: SiteStatistic,
  status = 200,
  onRequest: () => void | Promise<void> = () => {},
) {
  return http.get(siteApiUrls.statistic(domain), async () => {
    await onRequest()
    return HttpResponse.json(apiEnvelope(statistic) as unknown as JsonBodyType, { status })
  })
}

export function siteUserDataLatestHandler(
  userData: SiteUserData[],
  status = 200,
  onRequest: () => void | Promise<void> = () => {},
) {
  return http.get(siteApiUrls.userDataLatest, async () => {
    await onRequest()
    return HttpResponse.json(apiEnvelope(userData) as unknown as JsonBodyType, { status })
  })
}

export function siteUserDataHandler(
  id: number,
  result: ApiEnvelopeInput<SiteUserData[]>,
  status = 200,
  onRequest: () => void | Promise<void> = () => {},
) {
  return http.get(siteApiUrls.userData(id), async () => {
    await onRequest()
    return response(normalizeEnvelope(result) as unknown as JsonBodyType, status)
  })
}

export function refreshSiteUserDataHandler(
  id: number,
  result: ApiEnvelopeInput<Record<string, unknown>>,
  status = 200,
  onRequest: () => void | Promise<void> = () => {},
) {
  return http.post(siteApiUrls.userData(id), async () => {
    await onRequest()
    return response(normalizeEnvelope(result) as unknown as JsonBodyType, status)
  })
}

export function saveSitePrioritiesHandler(
  onSave: (priorities: Array<{ id: number; pri: number }>) => void | Promise<void> = () => {},
  options: { status?: number; success?: boolean } = {},
) {
  return http.post(siteApiUrls.priorities, async ({ request }) => {
    const priorities = (await request.json()) as Array<{ id: number; pri: number }>
    await onSave(priorities)
    const success = options.success ?? (options.status ?? 200) < 400
    return HttpResponse.json(apiEnvelope(null, success), { status: options.status ?? 200 })
  })
}

function response(body: JsonBodyType, status: number) {
  return HttpResponse.json(body, { status })
}

export function siteIconHandler(
  id: number,
  icon: string | null,
  status = 200,
  onRequest: () => void | Promise<void> = () => {},
) {
  return http.get(siteApiUrls.icon(id), async () => {
    await onRequest()
    return response(apiEnvelope(icon ? { icon } : {}, Boolean(icon)), status)
  })
}

export function testSiteConnectionHandler(
  id: number,
  result: ApiEnvelopeInput<null>,
  status = 200,
  onRequest: () => void | Promise<void> = () => {},
) {
  return http.get(siteApiUrls.test(id), async () => {
    await onRequest()
    return response(normalizeEnvelope(result), status)
  })
}

export function deleteSiteHandler(
  id: number,
  result: ApiEnvelopeInput<null> = { success: true },
  status = 200,
  onRequest: () => void | Promise<void> = () => {},
) {
  return http.delete(siteApiUrls.delete(id), async () => {
    await onRequest()
    return response(normalizeEnvelope(result), status)
  })
}

export function siteDownloadersHandler(
  response: DownloaderConf[] = [],
  status = 200,
  onRequest: () => void | Promise<void> = () => {},
) {
  return http.get(siteApiUrls.downloaders, async () => {
    await onRequest()
    return HttpResponse.json(apiEnvelope(response) as unknown as JsonBodyType, { status })
  })
}

export function siteDetailsHandler(
  id: number,
  response: Site,
  status = 200,
  onRequest: () => void | Promise<void> = () => {},
) {
  return http.get(siteApiUrls.details(id), async () => {
    await onRequest()
    return HttpResponse.json(apiEnvelope(response) as unknown as JsonBodyType, { status })
  })
}

export function addSiteHandler(
  response: SiteMutationResponse = { success: true },
  status = 200,
  onRequest: (payload: Site) => void | Promise<void> = () => {},
) {
  return http.post(siteApiUrls.list, async ({ request }) => {
    await onRequest((await request.json()) as Site)
    return HttpResponse.json(normalizeEnvelope(response), { status })
  })
}

export function updateSiteHandler(
  response: SiteMutationResponse = { success: true },
  status = 200,
  onRequest: (payload: Site) => void | Promise<void> = () => {},
) {
  return http.put(siteApiUrls.list, async ({ request }) => {
    await onRequest((await request.json()) as Site)
    return HttpResponse.json(normalizeEnvelope(response), { status })
  })
}

export function updateSiteCookieHandler(
  id: number,
  response: SiteMutationResponse = { success: true },
  status = 200,
  onRequest: (payload: { code: string; password: string; username: string }) => void | Promise<void> = () => {},
) {
  return http.post(siteApiUrls.cookie(id), async ({ request }) => {
    await onRequest((await request.json()) as { code: string; password: string; username: string })
    return HttpResponse.json(normalizeEnvelope(response), { status })
  })
}

export function siteCategoriesHandler(
  siteId: number,
  response: SiteCategory[],
  status = 200,
  onRequest: (url: URL) => void = () => {},
) {
  return http.get(siteApiUrls.categories(siteId), ({ request }) => {
    onRequest(new URL(request.url))
    return HttpResponse.json(apiEnvelope(response), { status })
  })
}

export function siteResourcesHandler(
  siteId: number,
  response: TorrentInfo[],
  status = 200,
  onRequest: (url: URL) => void = () => {},
) {
  return http.get(siteApiUrls.resources(siteId), ({ request }) => {
    onRequest(new URL(request.url))
    return HttpResponse.json(apiEnvelope(response), { status })
  })
}
