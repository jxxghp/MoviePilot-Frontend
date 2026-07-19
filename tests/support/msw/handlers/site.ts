import type { Site, SiteStatistic, SiteUserData } from '@/api/types'
import { HttpResponse, http, type JsonBodyType } from 'msw'

const API_BASE_URL = 'http://localhost/api/v1/'

export const siteApiUrls = {
  list: new URL('site/', API_BASE_URL).href,
  priorities: new URL('site/priorities', API_BASE_URL).href,
  statistic: (domain: string) => new URL(`site/statistic/${domain}`, API_BASE_URL).href,
  statistics: new URL('site/statistic', API_BASE_URL).href,
  userDataLatest: new URL('site/userdata/latest', API_BASE_URL).href,
}

export function siteListHandler(
  sites: Site[],
  status: number | (() => number) = 200,
  onRequest: () => void | Promise<void> = () => {},
) {
  return http.get(siteApiUrls.list, async () => {
    await onRequest()
    return HttpResponse.json(sites as unknown as JsonBodyType, {
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
    return HttpResponse.json(statistics as unknown as JsonBodyType, { status })
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
    return HttpResponse.json(statistic as unknown as JsonBodyType, { status })
  })
}

export function siteUserDataLatestHandler(
  userData: SiteUserData[],
  status = 200,
  onRequest: () => void | Promise<void> = () => {},
) {
  return http.get(siteApiUrls.userDataLatest, async () => {
    await onRequest()
    return HttpResponse.json(userData as unknown as JsonBodyType, { status })
  })
}

export function saveSitePrioritiesHandler(
  onSave: (priorities: Array<{ id: number; pri: number }>) => void | Promise<void> = () => {},
  options: { status?: number; success?: boolean } = {},
) {
  return http.post(siteApiUrls.priorities, async ({ request }) => {
    const priorities = (await request.json()) as Array<{ id: number; pri: number }>
    await onSave(priorities)
    return HttpResponse.json(
      { success: options.success ?? (options.status ?? 200) < 400 },
      { status: options.status ?? 200 },
    )
  })
}
