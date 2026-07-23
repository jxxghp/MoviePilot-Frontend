import api from '@/api'
import type { MediaInfo, Subscribe } from '@/api/types'
import {
  getMediaSubscribeId,
  getSubscribeMode,
  type SeasonSubscribeModes,
  useMediaSubscribe,
} from '@/composables/useMediaSubscribe'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import { computed, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'

export interface NativeSubscribeMediaInfo extends Partial<MediaInfo> {
  anilistid?: number | string
  bangumiid?: number | string
  doubanid?: number | string
  media_source?: string
  tmdbid?: number | string
}

export type NativeSubscribeResult =
  | { success: true }
  | {
      success: false
      code: 'INVALID_MEDIA' | 'PERMISSION_DENIED'
      message: string
    }

export type NativeSubscribe = (media: NativeSubscribeMediaInfo) => Promise<NativeSubscribeResult>

type MediaNormalizationResult =
  | { success: true; media: MediaInfo }
  | {
      success: false
      reason: 'invalidMedia' | 'missingId' | 'missingTitle' | 'unsupportedType'
    }

/** 将插件常用的中英文媒体类型转换为主程序订阅流程使用的类型。 */
function normalizeMediaType(value: unknown) {
  if (typeof value !== 'string') return undefined

  const normalized = value.trim().toLowerCase()
  if (normalized === '电影' || normalized === 'movie') return '电影'
  if (normalized === '电视剧' || normalized === 'tv' || normalized === 'television') return '电视剧'
  return undefined
}

/** 将数字或数字字符串转换为有效的正整数媒体 ID。 */
function normalizeNumericId(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return undefined

  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}

/** 将字符串或数字 ID 转换为非空字符串。 */
function normalizeStringId(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined

  const id = String(value).trim()
  return id && id !== '0' ? id : undefined
}

/** 规范插件媒体信息并兼容后端字段别名，校验结果可供宿主明确拒绝无效调用。 */
export function normalizeNativeSubscribeMedia(input: unknown): MediaNormalizationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { success: false, reason: 'invalidMedia' }
  }

  const raw = input as Record<string, unknown>
  const type = normalizeMediaType(raw.type)
  if (!type) return { success: false, reason: 'unsupportedType' }

  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!title) return { success: false, reason: 'missingTitle' }

  const source = normalizeStringId(raw.source ?? raw.media_source)
  const mediaidPrefix = normalizeStringId(raw.mediaid_prefix)
  const normalizedMedia = {
    ...raw,
    anilist_id: normalizeNumericId(raw.anilist_id ?? raw.anilistid),
    bangumi_id: normalizeStringId(raw.bangumi_id ?? raw.bangumiid),
    douban_id: normalizeStringId(raw.douban_id ?? raw.doubanid),
    media_id: normalizeStringId(raw.media_id),
    mediaid_prefix: mediaidPrefix,
    source,
    title,
    tmdb_id: normalizeNumericId(raw.tmdb_id ?? raw.tmdbid),
    type,
    year: normalizeStringId(raw.year),
  } as MediaInfo

  if (!getMediaSubscribeId(normalizedMedia)) return { success: false, reason: 'missingId' }

  return { success: true, media: normalizedMedia }
}

/** 生成订阅记录的统一媒体标识，用于恢复电视剧已订阅季状态。 */
function getSubscribeRecordMediaId(subscribe: Subscribe) {
  if (subscribe.media_source && subscribe.media_id) {
    const source = subscribe.media_source === 'themoviedb' ? 'tmdb' : subscribe.media_source
    return `${source}:${subscribe.media_id}`
  }
  if (subscribe.mediaid) return subscribe.mediaid
  if (subscribe.tmdbid) return `tmdb:${subscribe.tmdbid}`
  if (subscribe.doubanid) return `douban:${subscribe.doubanid}`
  if (subscribe.bangumiid) return `bangumi:${subscribe.bangumiid}`
  if (subscribe.anilistid) return `anilist:${subscribe.anilistid}`
  return ''
}

/** 为插件联邦组件创建主程序原生订阅入口。 */
export function usePluginNativeSubscribe(): NativeSubscribe {
  const { t } = useI18n()
  const $toast = useToast()
  const userStore = useUserStore()
  const media = shallowRef<MediaInfo>()
  const isSubscribed = ref(false)
  const isExists = ref(false)
  const subscribedSeasons = ref<number[]>([])
  const subscribedSeasonModes = ref<SeasonSubscribeModes>({})
  const userPermissions = computed(() => buildUserPermissionContext(userStore.superUser, userStore.permissions))
  const canSubscribe = computed(() => hasPermission(userPermissions.value, 'subscribe'))

  const subscribeActions = useMediaSubscribe({
    media: () => media.value,
    canSubscribe: () => canSubscribe.value,
    isSubscribed,
    isExists: () => isExists.value,
    subscribedSeasons,
    subscribedSeasonModes,
    primarySeason: () => media.value?.season ?? null,
  })

  /** 清空上一次原生订阅调用的临时状态，避免不同媒体互相污染。 */
  function resetSubscribeState() {
    isSubscribed.value = false
    isExists.value = false
    subscribedSeasons.value = []
    subscribedSeasonModes.value = {}
  }

  /** 查询电影订阅和入库状态，使插件入口与原生媒体卡片保持相同行为。 */
  async function loadMovieState(currentMedia: MediaInfo) {
    const [subscribeResult, existsResult] = await Promise.allSettled([
      subscribeActions.checkSubscribe(null),
      api.get('mediaserver/exists', {
        params: {
          mtype: currentMedia.type,
          season: currentMedia.season,
          title: currentMedia.title,
          tmdbid: currentMedia.tmdb_id,
          year: currentMedia.year,
        },
      }) as Promise<{ success?: boolean }>,
    ])

    if (subscribeResult.status === 'fulfilled') isSubscribed.value = subscribeResult.value
    else console.error(subscribeResult.reason)

    if (existsResult.status === 'fulfilled') isExists.value = Boolean(existsResult.value?.success)
    else console.error(existsResult.reason)
  }

  /** 查询电视剧全部订阅记录，让选季弹窗正确展示已订阅季和订阅模式。 */
  async function loadTvState(currentMedia: MediaInfo) {
    try {
      const subscribes: Subscribe[] = await api.get('subscribe/')
      const mediaId = getMediaSubscribeId(currentMedia)
      const mediaSubscribes = subscribes.filter(
        item => item.type === '电视剧' && item.season !== undefined && getSubscribeRecordMediaId(item) === mediaId,
      )

      subscribedSeasons.value = [...new Set(mediaSubscribes.map(item => item.season as number))].sort((a, b) => a - b)
      subscribedSeasonModes.value = mediaSubscribes.reduce<SeasonSubscribeModes>((modes, item) => {
        if (item.season !== undefined) modes[item.season] = getSubscribeMode(item)
        return modes
      }, {})
      isSubscribed.value = subscribedSeasons.value.length > 0
    } catch (error) {
      console.error(error)
    }
  }

  /** 显示宿主拒绝原因，并返回插件可用于 fallback 的结构化结果。 */
  function rejectNativeSubscribe(code: 'INVALID_MEDIA' | 'PERMISSION_DENIED', message: string): NativeSubscribeResult {
    $toast.error(message)
    return { success: false, code, message }
  }

  /** 校验插件媒体信息并启动电影或电视剧的主程序原生订阅交互。 */
  async function nativeSubscribe(input: NativeSubscribeMediaInfo): Promise<NativeSubscribeResult> {
    const normalized = normalizeNativeSubscribeMedia(input)
    if (!normalized.success) {
      return rejectNativeSubscribe('INVALID_MEDIA', t(`subscribe.native.${normalized.reason}`))
    }
    if (!canSubscribe.value) {
      return rejectNativeSubscribe('PERMISSION_DENIED', t('subscribe.native.permissionDenied'))
    }

    media.value = normalized.media
    resetSubscribeState()

    if (normalized.media.type === '电视剧') await loadTvState(normalized.media)
    else await loadMovieState(normalized.media)

    await subscribeActions.handleSubscribe()
    return { success: true }
  }

  return nativeSubscribe
}
