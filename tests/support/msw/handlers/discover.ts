import type { DiscoverSource } from '@/api/types'
import { HttpResponse, http, type JsonBodyType } from 'msw'

const API_BASE_URL = 'http://localhost/api/v1/'

export interface DiscoverOrderItem {
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
    return HttpResponse.json(sources as unknown as JsonBodyType, { status })
  })
}

export function discoverOrderConfigHandler(
  order: DiscoverOrderItem[] | null,
  status = 200,
  onRequest: () => void | Promise<void> = () => {},
) {
  return http.get(discoverApiUrls.orderConfig, async () => {
    await onRequest()
    return HttpResponse.json({ data: { value: order }, success: status < 400 }, { status })
  })
}

export function saveDiscoverOrderHandler(
  onSave: (order: DiscoverOrderItem[]) => void | Promise<void> = () => {},
  status = 200,
) {
  return http.post(discoverApiUrls.orderConfig, async ({ request }) => {
    const order = (await request.json()) as DiscoverOrderItem[]
    await onSave(order)
    return HttpResponse.json({ success: status < 400 }, { status })
  })
}
