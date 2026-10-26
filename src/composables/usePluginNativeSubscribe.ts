import api from '@/api'
import { getMediaSubscribedSeasons } from '@/api/mediaStatus'
import type { MediaDataSource, MediaInfo } from '@/api/types'
import { type SeasonSubscribeModes, useMediaSubscribeFactory } from '@/composables/useMediaSubscribe'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import { isMediaDataSource } from '@/utils/mediaId'

type AuxiliaryMediaIdKey =
  'tmdb_id' | 'imdb_id' | 'tvdb_id' | 'douban_id' | 'bangumi_id' | 'anilist_id' | 'anidb_id' | 'collection_id'

export type NativeSubscribeMediaInfo = Omit<Partial<MediaInfo>, AuxiliaryMediaIdKey> & {
  media_source?: MediaDataSource
}

// 插件输入只接受统一主身份；各来源辅助 ID 仍可存在于后端返回的 MediaInfo 中用于展示。
const auxiliaryMediaIdKeys = new Set<AuxiliaryMediaIdKey>([
  'tmdb_id',
  'imdb_id',
  'tvdb_id',
  'douban_id',
  'bangumi_id',
  'anilist_id',
  'anidb_id',
  'collection_id',
])

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

/** 将字符串或数字 ID 转换为非空字符串。 */
function normalizeStringId(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined

  const id = String(value).trim()
  return id && id !== '0' ? id : undefined
}

/** 规范插件媒体信息并校验统一媒体身份，校验结果可供宿主明确拒绝无效调用。 */
export function normalizeNativeSubscribeMedia(input: unknown): MediaNormalizationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { success: false, reason: 'invalidMedia' }
  }

  const raw = input as Record<string, unknown>
  const type = normalizeMediaType(raw.type)
  if (!type) return { success: false, reason: 'unsupportedType' }

  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!title) return { success: false, reason: 'missingTitle' }

  const mediaSource = isMediaDataSource(raw.media_source) ? raw.media_source : undefined
  const mediaId = normalizeStringId(raw.media_id)
  if (!mediaSource || !mediaId) return { success: false, reason: 'missingId' }
  const publicFields = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !auxiliaryMediaIdKeys.has(key as AuxiliaryMediaIdKey)),
  )
  const normalizedMedia = {
    ...publicFields,
    media_id: mediaId,
    media_source: mediaSource,
    title,
    type,
    year: normalizeStringId(raw.year),
  } as MediaInfo

  return { success: true, media: normalizedMedia }
}

/** 为插件联邦组件创建主程序原生订阅入口。 */
export function usePluginNativeSubscribe(): NativeSubscribe {
  const { t } = useI18n()
  const $toast = useToast()
  const userStore = useUserStore()
  const userPermissions = computed(() => buildUserPermissionContext(userStore.superUser, userStore.permissions))
  const canSubscribe = computed(() => hasPermission(userPermissions.value, 'subscribe'))
  const createSubscribeActions = useMediaSubscribeFactory()

  /** 每次调用拥有独立媒体、加载状态和弹窗回调，异步操作不会切换到另一次调用的媒体。 */
  function createInteraction(currentMedia: MediaInfo) {
    const isSubscribed = ref(false)
    const isExists = ref(false)
    const subscribedSeasons = ref<number[]>([])
    const subscribedSeasonModes = ref<SeasonSubscribeModes>({})
    const subscribeActions = createSubscribeActions({
      media: () => currentMedia,
      canSubscribe: () => canSubscribe.value,
      isSubscribed,
      isExists: () => isExists.value,
      subscribedSeasons,
      subscribedSeasonModes,
      primarySeason: () => currentMedia.season ?? null,
    })

    /** 查询电影订阅和入库状态，使插件入口与原生媒体卡片保持相同行为。 */
    async function loadMovieState(currentMedia: MediaInfo) {
      const [subscribeResult, existsResult] = await Promise.allSettled([
        subscribeActions.checkSubscribe(null),
        api.get('mediaserver/exists', {
          feedback: 'silent',
          params: {
            mtype: currentMedia.type,
            media_source: currentMedia.media_source,
            media_id: currentMedia.media_id,
            season: currentMedia.season,
            title: currentMedia.title,
            year: currentMedia.year,
          },
        }) as Promise<{ item?: { id?: string } }>,
      ])

      if (subscribeResult.status === 'fulfilled') isSubscribed.value = subscribeResult.value
      else console.error(subscribeResult.reason)

      if (existsResult.status === 'fulfilled') isExists.value = Boolean(existsResult.value?.item?.id)
      else console.error(existsResult.reason)
    }

    /** 查询电视剧全部订阅记录，让选季弹窗正确展示已订阅季和订阅模式。 */
    async function loadTvState(currentMedia: MediaInfo) {
      try {
        const modes = await getMediaSubscribedSeasons(currentMedia)
        subscribedSeasons.value = Object.keys(modes)
          .map(Number)
          .sort((a, b) => a - b)
        subscribedSeasonModes.value = modes
        isSubscribed.value = subscribedSeasons.value.length > 0
      } catch (error) {
        console.error(error)
      }
    }

    return {
      async start() {
        if (currentMedia.type === '电视剧') await loadTvState(currentMedia)
        else await loadMovieState(currentMedia)
        await subscribeActions.handleSubscribe()
      },
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

    await createInteraction(normalized.media).start()
    return { success: true }
  }

  return nativeSubscribe
}
