import type { MediaInfo, MediaSeason, NotExistMediaInfo, TmdbEpisode } from '@/api/types'
import { HttpResponse, http, type JsonBodyType } from 'msw'

const API_BASE_URL = 'http://localhost/api/v1/'

export const mediaApiUrls = {
  episodeGroups: (tmdbId: number) => new URL(`media/groups/${tmdbId}`, API_BASE_URL).href,
  groupSeasons: (episodeGroup: string) => new URL(`media/group/seasons/${episodeGroup}`, API_BASE_URL).href,
  notExists: new URL('mediaserver/notexists', API_BASE_URL).href,
  seasons: new URL('media/seasons', API_BASE_URL).href,
}

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

export function mediaSeasonsHandler(
  response: MediaSeason[],
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.get(mediaApiUrls.seasons, async ({ request }) => {
    await onRequest(new URL(request.url))
    return HttpResponse.json(response as unknown as JsonBodyType, { status })
  })
}

export function mediaEpisodeGroupsHandler(
  tmdbId: number,
  response: Record<string, unknown>[],
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.get(mediaApiUrls.episodeGroups(tmdbId), async ({ request }) => {
    await onRequest(new URL(request.url))
    return HttpResponse.json(response as JsonBodyType, { status })
  })
}

export function mediaGroupSeasonsHandler(
  episodeGroup: string,
  response: MediaSeason[],
  status = 200,
  onRequest: (url: URL) => void | Promise<void> = () => {},
) {
  return http.get(mediaApiUrls.groupSeasons(episodeGroup), async ({ request }) => {
    await onRequest(new URL(request.url))
    return HttpResponse.json(response as unknown as JsonBodyType, { status })
  })
}

export function mediaNotExistsHandler(
  response: NotExistMediaInfo[],
  status = 200,
  onRequest: (payload: Record<string, unknown>, url: URL) => void | Promise<void> = () => {},
) {
  return http.post(mediaApiUrls.notExists, async ({ request }) => {
    const payload = (await request.json()) as Record<string, unknown>
    await onRequest(payload, new URL(request.url))
    return HttpResponse.json(response as unknown as JsonBodyType, { status })
  })
}
