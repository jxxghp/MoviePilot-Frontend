import api from '@/api'
import type { MediaInfo, Subscribe } from '@/api/types'
import { getMediaSubscribeIdentity, getSubscribeMode, type SeasonSubscribeModes } from '@/composables/useMediaSubscribe'
import { getSharedData } from '@/utils/sharedDataCache'

/** 卡片与详情只消费轻量状态，不持有完整订阅及媒体库记录。 */
export interface MediaStatusResult {
  item_id?: string | null
  subscribed: boolean
  seasons: SeasonSubscribeModes
  legacy?: boolean
  legacyFailures?: { exists?: string; subscribe?: string }
}

/** 单批状态查询复用既有媒体身份、标题回退与音乐实体隔离字段。 */
interface MediaStatusQuery {
  media_source?: string
  media_id?: string
  title?: string
  year?: string
  mtype?: string
  season?: number
  music_type?: string
}

/** 等待与同一帧其他可见卡片合并的查询。 */
interface PendingStatus {
  query: MediaStatusQuery
  resolve: (result: MediaStatusResult) => void
  reject: (error: unknown) => void
}

const pending: PendingStatus[] = []
const STATUS_BATCH_SIZE = 50
let scheduled = false
let flushing = false

/** 旧后端只支持单项状态时，逐页共用订阅列表，避免每张卡片重新下载全部订阅。 */
function getLegacySubscriptions() {
  return getSharedData('media-status:legacy-subscriptions', async () => {
    const result: Subscribe[] = []
    for (let page = 1; ; page++) {
      const batch = await api.get<Subscribe[]>('subscribe/', { params: { page, count: 50 }, feedback: 'silent' })
      result.push(...batch)
      if (batch.length < 50) return result
    }
  })
}

/** 保留旧后端的状态含义，兼容查询以批内顺序执行限制并发。 */
async function loadLegacyStatus(query: MediaStatusQuery): Promise<MediaStatusResult> {
  const { mtype, ...identity } = query
  const [exists, subscribe] = await Promise.allSettled([
    mtype === '音乐'
      ? undefined
      : api.get<{ item?: { id?: string } }>('mediaserver/exists', {
          params: { ...identity, mtype },
          feedback: 'silent',
        }),
    query.media_source && query.media_id
      ? api
          .get<Subscribe>(`subscribe/media/${encodeURIComponent(query.media_id)}`, {
            params: { ...query, media_id: undefined },
            feedback: 'silent',
          })
          .catch(error => {
            if (error?.response?.status === 404) return undefined
            throw error
          })
      : undefined,
  ])
  return {
    item_id: exists.status === 'fulfilled' ? exists.value?.item?.id : undefined,
    subscribed: subscribe.status === 'fulfilled' && Boolean(subscribe.value?.id),
    seasons: {},
    legacy: true,
    ...(exists.status === 'rejected' || subscribe.status === 'rejected'
      ? {
          legacyFailures: {
            exists: exists.status === 'rejected' ? String(exists.reason) : undefined,
            subscribe: subscribe.status === 'rejected' ? String(subscribe.reason) : undefined,
          },
        }
      : {}),
  }
}

/** 选季界面需要全部季模式时才读取旧后端列表；新后端直接复用批量状态投影。 */
export async function getMediaSubscribedSeasons(media: MediaInfo): Promise<SeasonSubscribeModes> {
  const status = await getMediaStatus(media)
  if (!status.legacy) return status.seasons
  const identity = getMediaSubscribeIdentity(media)
  const seasons: SeasonSubscribeModes = {}
  for (const record of await getLegacySubscriptions()) {
    if (
      record.type === '电视剧' &&
      record.media_source === identity?.source &&
      String(record.media_id) === identity?.mediaId &&
      record.season !== undefined
    )
      seasons[record.season] = getSubscribeMode(record)
  }
  return seasons
}

/** 每次最多发一批请求；后续可见卡片等待当前批次完成，避免请求扇出。 */
async function flushStatuses() {
  scheduled = false
  if (flushing) return
  flushing = true
  try {
    while (pending.length) {
      const batch = pending.splice(0, STATUS_BATCH_SIZE)
      try {
        const result = await api.post<MediaStatusResult[]>(
          'media/status',
          batch.map(item => item.query),
          {
            feedback: 'silent',
          },
        )
        if (!Array.isArray(result) || result.length !== batch.length) throw new Error('媒体状态响应数量不匹配')
        batch.forEach((item, index) => item.resolve(result[index]))
      } catch (error) {
        if ((error as { response?: { status?: number } }).response?.status === 404) {
          for (const item of batch) {
            try {
              item.resolve(await loadLegacyStatus(item.query))
            } catch (legacyError) {
              item.reject(legacyError)
            }
          }
        } else batch.forEach(item => item.reject(error))
      }
    }
  } finally {
    flushing = false
  }
}

/** 同一媒体短暂复用结果，不同媒体在当前帧合并为最多 50 项的状态查询。 */
export function getMediaStatus(media: MediaInfo): Promise<MediaStatusResult> {
  const identity = getMediaSubscribeIdentity(media)
  const query: MediaStatusQuery = {
    ...(identity ? { media_source: identity.source, media_id: identity.mediaId } : {}),
    title: media.title,
    year: media.year?.toString(),
    mtype: media.type,
    season: media.season,
    ...(media.type === '音乐' ? { music_type: media.music_type ?? 'recording' } : {}),
  }
  return getSharedData(
    `media-status:${JSON.stringify(query)}`,
    () =>
      new Promise((resolve, reject) => {
        pending.push({ query, resolve, reject })
        if (!scheduled && !flushing) {
          scheduled = true
          setTimeout(() => void flushStatuses(), 10)
        }
      }),
    result => !result.legacyFailures,
  )
}
