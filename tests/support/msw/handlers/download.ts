import type { DownloadHistory, DownloadingInfo } from '@/api/types'
import { HttpResponse, http, type JsonBodyType } from 'msw'
import { apiFailureJson, apiJson } from '../response'

const API_BASE_URL = 'http://localhost/api/v1/'

export interface DownloadMutationResponse {
  success: boolean
  message?: string
}

export const downloadApiUrls = {
  action: (operation: 'start' | 'stop', hash: string) => new URL(`download/${operation}/${hash}`, API_BASE_URL).href,
  delete: (hash: string) => new URL(`download/${hash}`, API_BASE_URL).href,
  list: new URL('download/', API_BASE_URL).href,
  history: new URL('history/download', API_BASE_URL).href,
}

function dataResponse(body: JsonBodyType, status: number) {
  if (status >= 400) return HttpResponse.json(body, { status })
  return apiJson(body, { status })
}

function mutationResponse(response: DownloadMutationResponse, status: number) {
  if (status >= 400) return HttpResponse.json(response, { status })
  if (!response.success) return apiFailureJson(response.message ?? '', null, { status })
  return apiJson(null, { status })
}

/** 拦截下载任务快照查询，并保留下载器查询参数供断言。 */
export function downloadingListHandler(
  response: DownloadingInfo[] | ((url: URL) => DownloadingInfo[] | Promise<DownloadingInfo[]>) = [],
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.get(downloadApiUrls.list, async ({ request }) => {
    const url = new URL(request.url)
    await onRequest(url)
    const body = typeof response === 'function' ? await response(url) : response
    return dataResponse(body as unknown as JsonBodyType, status)
  })
}

/** 拦截暂停或继续下载请求，并保留下载器查询参数供断言。 */
export function downloadActionHandler(
  operation: 'start' | 'stop',
  hash: string,
  response: DownloadMutationResponse = { success: true },
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.get(downloadApiUrls.action(operation, hash), async ({ request }) => {
    const url = new URL(request.url)
    await onRequest(url)
    return mutationResponse(response, status)
  })
}

/** 拦截删除下载任务请求，并保留下载器查询参数供断言。 */
export function deleteDownloadHandler(
  hash: string,
  response: DownloadMutationResponse = { success: true },
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.delete(downloadApiUrls.delete(hash), async ({ request }) => {
    const url = new URL(request.url)
    await onRequest(url)
    return mutationResponse(response, status)
  })
}

/** 拦截下载历史分页查询，并保留分页参数供断言。 */
export function downloadHistoryHandler(
  response: DownloadHistory[] | ((url: URL) => DownloadHistory[] | Promise<DownloadHistory[]>) = [],
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.get(downloadApiUrls.history, async ({ request }) => {
    const url = new URL(request.url)
    await onRequest(url)
    const body = typeof response === 'function' ? await response(url) : response
    return dataResponse(body as unknown as JsonBodyType, status)
  })
}

/** 拦截下载历史删除请求，并保留请求体供断言。 */
export function deleteDownloadHistoryHandler(
  response: DownloadMutationResponse = { success: true },
  status = 200,
  onRequest: (body: DownloadHistory) => void | Promise<void> = () => {},
) {
  return http.delete(downloadApiUrls.history, async ({ request }) => {
    await onRequest((await request.json()) as DownloadHistory)
    return mutationResponse(response, status)
  })
}
