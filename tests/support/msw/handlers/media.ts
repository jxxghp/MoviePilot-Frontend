import type { MediaInfo, TmdbEpisode } from '@/api/types'
import { HttpResponse, http, type JsonBodyType } from 'msw'

const API_BASE_URL = 'http://localhost/api/v1/'

export function mediaDetailsHandler(
  tmdbId: number,
  response: MediaInfo,
  status = 200,
  onRequest: (url: URL) => void = () => {},
) {
  return http.get(new URL(`media/tmdb:${tmdbId}`, API_BASE_URL).href, ({ request }) => {
    onRequest(new URL(request.url))
    return HttpResponse.json(response as unknown as JsonBodyType, { status })
  })
}

export function tmdbSeasonEpisodesHandler(
  tmdbId: number,
  season: number,
  response: TmdbEpisode[],
  status = 200,
  onRequest: (url: URL) => void = () => {},
) {
  return http.get(new URL(`tmdb/${tmdbId}/${season}`, API_BASE_URL).href, ({ request }) => {
    onRequest(new URL(request.url))
    return HttpResponse.json(response as unknown as JsonBodyType, { status })
  })
}
