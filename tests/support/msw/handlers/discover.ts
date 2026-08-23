import type { DiscoverSource } from '@/api/types'
import { HttpResponse, http, type JsonBodyType } from 'msw'
import { apiJson } from '../response'

const API_BASE_URL = 'http://localhost/api/v1/'

export interface DiscoverTabConfigItem {
  enabled?: boolean
  mediaid_prefix?: string
  name: string
}

export const discoverApiUrls = {
  orderConfig: new URL('user/config/MP_DISCOVER_TAB_ORDER', API_BASE_URL).href,
  sources: new URL('discover/source', API_BASE_URL).href,
}

export function discoverSourcesHandler(
  sources: DiscoverSource[],
  status = 200,
  onRequest: () => void | Promise<void> = () => {},
) {
  return http.get(discoverApiUrls.sources, async () => {
    await onRequest()
    if (status >= 400) return HttpResponse.json(sources as unknown as JsonBodyType, { status })
    return apiJson(sources, { status })
  })
}

export function discoverOrderConfigHandler(
  order: DiscoverTabConfigItem[] | null,
  status = 200,
  onRequest: () => void | Promise<void> = () => {},
) {
  return http.get(discoverApiUrls.orderConfig, async () => {
    await onRequest()
    if (status >= 400) return HttpResponse.json({ detail: 'failed' }, { status })
    return apiJson({ value: order }, { status })
  })
}

export function saveDiscoverOrderHandler(
  onSave: (order: DiscoverTabConfigItem[]) => void | Promise<void> = () => {},
  status = 200,
) {
  return http.post(discoverApiUrls.orderConfig, async ({ request }) => {
    const order = (await request.json()) as DiscoverTabConfigItem[]
    await onSave(order)
    if (status >= 400) return HttpResponse.json({ detail: 'failed' }, { status })
    return apiJson(null, { status })
  })
}
