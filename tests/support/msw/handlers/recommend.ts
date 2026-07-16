import type { RecommendSource } from '@/api/types'
import { HttpResponse, http, type JsonBodyType } from 'msw'

const API_BASE_URL = 'http://localhost/api/v1/'

export const recommendApiUrls = {
  config: new URL('user/config/Recommend', API_BASE_URL).href,
  media: (sourcePath: string) => new URL(sourcePath.replace(/^\//, ''), API_BASE_URL).href,
  sources: new URL('recommend/source', API_BASE_URL).href,
}

export function recommendSourcesHandler(
  sources: RecommendSource[],
  status = 200,
  onRequest: () => void = () => {},
) {
  return http.get(recommendApiUrls.sources, () => {
    onRequest()
    return HttpResponse.json(sources, { status })
  })
}

export function recommendConfigHandler(
  config: JsonBodyType,
  status = 200,
  onRequest: () => void = () => {},
) {
  return http.get(recommendApiUrls.config, () => {
    onRequest()
    return HttpResponse.json({ data: { value: config } }, { status })
  })
}

export function saveRecommendConfigHandler(
  onSave: (config: Record<string, boolean>) => void = () => {},
  status = 200,
) {
  return http.post(recommendApiUrls.config, async ({ request }) => {
    const config = (await request.json()) as Record<string, boolean>
    onSave(config)
    return HttpResponse.json({ success: status < 400 }, { status })
  })
}

export function recommendMediaHandler(
  sourcePath: string,
  response: JsonBodyType | JsonBodyType[],
  status = 200,
  onRequest: () => void = () => {},
) {
  return http.get(recommendApiUrls.media(sourcePath), () => {
    onRequest()
    return HttpResponse.json(response as JsonBodyType, { status })
  })
}
