import { defineAsyncComponent, ref, type Ref } from 'vue'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import api from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { formatSeason } from '@/@core/utils/formatters'
import type { MediaDataSource, MediaInfo, MediaSeason, Subscribe } from '@/api/types'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useConfirm } from '@/composables/useConfirm'
import { setCachedMediaSubscribeStatus } from '@/utils/mediaStatusCache'
import { isMediaDataSource, isValidMediaSourceId } from '@/utils/mediaId'

export type SubscribeMode = 'normal' | 'best_version' | 'best_version_full'

interface SubscribePayload {
  best_version?: number
  best_version_full?: number
}

interface SubscribeConfig {
  show_edit_dialog?: boolean
  best_version?: unknown
  best_version_full?: unknown
}

interface AddSubscribeOptions {
  openEditDialog?: boolean
}

interface RemoveSubscribeOptions {
  confirm?: boolean
}

interface UseMediaSubscribeOptions {
  media: () => MediaInfo | undefined
  canSubscribe: () => boolean
  isSubscribed?: Ref<boolean>
  isExists?: () => boolean
  seasonsSubscribed?: Ref<{ [key: number]: boolean }>
  subscribedSeasons?: Ref<number[]>
  subscribedSeasonModes?: Ref<SeasonSubscribeModes>
  primarySeason?: () => number | null
  getSubscribeStatusKey?: (season: number | null) => string
  onEditRemove?: () => void
}

const SubscribeEditDialog = defineAsyncComponent(() => import('@/components/dialog/SubscribeEditDialog.vue'))
const SubscribeModeDialog = defineAsyncComponent(() => import('@/components/dialog/SubscribeModeDialog.vue'))
const SubscribeSeasonDialog = defineAsyncComponent(() => import('@/components/dialog/SubscribeSeasonDialog.vue'))

export type SeasonSubscribeModes = Record<number, SubscribeMode>

export interface MediaSubscribeIdentity {
  mediaId: string
  mediaKey: string
  source: MediaDataSource
}

/** 按媒体声明的主来源解析订阅身份，避免辅助 ID 覆盖原始识别源。 */
export function getMediaSubscribeIdentity(media?: MediaInfo): MediaSubscribeIdentity | undefined {
  const mediaId = media?.media_id === undefined || media.media_id === null ? '' : String(media.media_id).trim()
  if (!isMediaDataSource(media?.media_source) || !mediaId || !isValidMediaSourceId(mediaId, media.media_source)) {
    return undefined
  }
  return {
    mediaId,
    mediaKey: `${media.media_source}:${mediaId}`,
    source: media.media_source,
  }
}

// 生成跨媒体源稳定的订阅媒体标识。
export function getMediaSubscribeId(media?: MediaInfo) {
  return getMediaSubscribeIdentity(media)?.mediaKey ?? ''
}

/** 返回订阅 API 使用的音乐实体；旧音乐对象缺省时按单曲兼容。 */
function getMusicSubscribeType(media?: MediaInfo) {
  return media?.type === '音乐' ? (media.music_type ?? 'recording') : undefined
}

// 将订阅模式转换为后端订阅字段。
function getSubscribePayload(mode: SubscribeMode): SubscribePayload {
  return {
    best_version: mode === 'normal' ? 0 : 1,
    best_version_full: mode === 'best_version_full' ? 1 : 0,
  }
}

// 兼容布尔值和数字、字符串形式的开关值。
function isEnabledFlag(value: unknown) {
  return value === true || value === 1 || value === '1'
}

// 从订阅字段解析统一的订阅模式。
export function getSubscribeMode(subscribe: { best_version?: unknown; best_version_full?: unknown }): SubscribeMode {
  if (!isEnabledFlag(subscribe.best_version)) return 'normal'

  return isEnabledFlag(subscribe.best_version_full) ? 'best_version_full' : 'best_version'
}

// 从默认订阅配置解析订阅模式。
function getSubscribeConfigMode(config?: SubscribeConfig): SubscribeMode {
  return getSubscribeMode({
    best_version: config?.best_version,
    best_version_full: config?.best_version_full,
  })
}

// 获取订阅模式的本地化名称。
function getModeName(t: ReturnType<typeof useI18n>['t'], mode: SubscribeMode) {
  if (mode === 'normal') return t('dialog.subscribeMode.normal')
  if (mode === 'best_version') return t('dialog.subscribeMode.bestVersionEpisode')
  return t('dialog.subscribeMode.bestVersionFull')
}

// 从变更请求异常中提取可展示消息，并为非标准错误提供稳定兜底。
function getRequestErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    const responseMessage = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message
    if (typeof responseMessage === 'string' && responseMessage) return responseMessage
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

// 封装媒体卡片与详情页共用的订阅交互。
export function useMediaSubscribe(options: UseMediaSubscribeOptions) {
  const { t } = useI18n()
  const $toast = useToast()
  const createConfirm = useConfirm()
  const episodeGroup = ref('')

  // 获取调用方当前媒体，避免在异步流程中持有旧对象。
  function currentMedia() {
    return options.media()
  }

  // 获取当前媒体的统一订阅标识。
  function getMediaId() {
    return getMediaSubscribeIdentity(currentMedia())
  }

  // 获取主订阅入口默认对应的季号。
  function getPrimarySeason() {
    return options.primarySeason?.() ?? currentMedia()?.season ?? null
  }

  // 同步调用方状态和订阅状态缓存。
  function updateSubscribeStatus(season: number | null, subscribed: boolean, mode: SubscribeMode = 'normal') {
    const media = currentMedia()

    if (media?.type === '电影' || season === null) {
      if (options.isSubscribed) options.isSubscribed.value = subscribed
    } else {
      if (options.seasonsSubscribed) options.seasonsSubscribed.value[season] = subscribed
      else if (options.subscribedSeasons) {
        const nextSeasons = new Set(options.subscribedSeasons.value)
        if (subscribed) nextSeasons.add(season)
        else nextSeasons.delete(season)
        options.subscribedSeasons.value = [...nextSeasons].sort((a, b) => a - b)
      }

      if (options.isSubscribed) {
        if (subscribed) {
          options.isSubscribed.value = true
        } else if (options.seasonsSubscribed) {
          options.isSubscribed.value = Object.values(options.seasonsSubscribed.value).some(Boolean)
        } else if (options.subscribedSeasons) {
          options.isSubscribed.value = options.subscribedSeasons.value.length > 0
        } else {
          options.isSubscribed.value = false
        }
      }

      if (options.subscribedSeasonModes) {
        const nextModes = { ...options.subscribedSeasonModes.value }
        if (subscribed) nextModes[season] = mode
        else delete nextModes[season]
        options.subscribedSeasonModes.value = nextModes
      }
    }

    if (options.getSubscribeStatusKey) {
      setCachedMediaSubscribeStatus(options.getSubscribeStatusKey(season), subscribed)
    }
  }

  // 打开已创建订阅的编辑弹窗。
  function openSubscribeEditDialog(subid: number, season: number | null, mode: SubscribeMode) {
    openSharedDialog(
      SubscribeEditDialog,
      { subid },
      {
        save: (subscribe?: Subscribe) => {
          const savedSeason = currentMedia()?.type === '电影' ? null : (subscribe?.season ?? season)
          if (savedSeason !== season) updateSubscribeStatus(season, false)
          updateSubscribeStatus(savedSeason, true, subscribe ? getSubscribeMode(subscribe) : mode)
        },
        remove: () => {
          updateSubscribeStatus(season, false)
          options.onEditRemove?.()
        },
      },
      { closeOn: ['close', 'save', 'remove'] },
    )
  }

  // 打开订阅模式选择弹窗并转换选择结果。
  function openSubscribeModeDialog(
    modes: SubscribeMode[],
    choose: (payload: SubscribePayload, mode: SubscribeMode) => void,
  ) {
    openSharedDialog(
      SubscribeModeDialog,
      { modes, type: currentMedia()?.type },
      {
        choose: (mode: SubscribeMode) => choose(getSubscribePayload(mode), mode),
      },
      { closeOn: ['close', 'choose'] },
    )
  }

  // 打开季订阅弹窗，并保留发起入口当前使用的剧集组。
  async function openSubscribeSeasonDialog(selectedSeason?: number | null, initialEpisodeGroup = '') {
    const media = currentMedia()
    if (!media) return
    const defaultSubscribeConfig = await queryDefaultSubscribeConfig()

    openSharedDialog(
      SubscribeSeasonDialog,
      {
        media,
        selectedSeason,
        initialEpisodeGroup,
        subscribedSeasons: options.subscribedSeasons?.value ?? [],
        subscribedSeasonModes: options.subscribedSeasonModes?.value ?? {},
        defaultSubscribeMode: getSubscribeConfigMode(defaultSubscribeConfig),
      },
      {
        subscribe: subscribeSeasons,
      },
      { closeOn: ['close', 'subscribe'] },
    )
  }

  // 查询系统默认订阅配置。
  async function queryDefaultSubscribeConfig(): Promise<SubscribeConfig | undefined> {
    if (!options.canSubscribe()) return undefined

    try {
      const media = currentMedia()
      const subscribeConfigUrl = {
        电影: 'system/setting/public/DefaultMovieSubscribeConfig',
        电视剧: 'system/setting/public/DefaultTvSubscribeConfig',
        音乐: 'system/setting/public/DefaultMusicSubscribeConfig',
      }[media?.type || '']
      if (!subscribeConfigUrl) return undefined
      const result = await api.get<{ value?: SubscribeConfig }>(subscribeConfigUrl, {
        feedback: 'silent',
      })
      return result.value
    } catch (error) {
      console.log(error)
    }

    return undefined
  }

  // 展示订阅新增结果通知。
  function showSubscribeAddToast(
    result: boolean,
    title: string,
    season: number | null,
    message: string,
    bestVersion: number,
  ) {
    if (season !== null) title = `${title} ${formatSeason(season.toString())}`

    const subname = bestVersion > 0 ? t('subscribe.versionSub') : t('subscribe.normalSub')

    if (result) $toast.success(`${title} ${t('subscribe.addSuccess', { name: subname })}`)
    else $toast.error(`${title} ${t('subscribe.addFailed', { name: subname, message })}`)
  }

  // 创建指定季和模式的订阅。
  async function addSubscribe(
    season: number | null = null,
    payload: SubscribePayload = {},
    addOptions: AddSubscribeOptions = {},
  ) {
    const media = currentMedia()
    // 艺术家仅用于继续浏览，其下作品必须按单曲或专辑分别订阅。
    if (!media || media.music_type === 'artist') return
    const identity = getMediaSubscribeIdentity(media)
    if (!identity) return

    startNProgress()
    try {
      const result = await api.post<Subscribe>(
        'subscribe/',
        {
          name: media.title,
          type: media.type,
          // 后端的订阅模型 year 为字符串，音乐的 year 是数字，需统一转字符串避免 422
          year: media.year?.toString() ?? '',
          media_source: identity.source,
          media_id: identity.mediaId,
          // 专辑订阅必须保留实体类型和曲目总数，后端据此校验整专资源并决定何时完成订阅。
          music_type: getMusicSubscribeType(media),
          total_tracks: getMusicSubscribeType(media) === 'album' ? media.total_tracks : undefined,
          season: media.type === '电影' ? null : season,
          ...payload,
          episode_group: episodeGroup.value,
        },
        { feedback: 'silent' },
      )

      const subscribeSeason = media.type === '电影' ? null : season
      const subscribeMode = getSubscribeMode(payload)
      updateSubscribeStatus(subscribeSeason, true, subscribeMode)
      showSubscribeAddToast(true, media.title ?? '', season, '', payload.best_version ?? 0)

      if (addOptions.openEditDialog ?? true) {
        const subscribeConfig = await queryDefaultSubscribeConfig()
        if (subscribeConfig?.show_edit_dialog && result.id) {
          openSubscribeEditDialog(result.id, subscribeSeason, subscribeMode)
        }
      }
    } catch (error) {
      console.error(error)
      showSubscribeAddToast(
        false,
        media.title ?? '',
        season,
        getRequestErrorMessage(error, t('subscribe.requestFailed')),
        payload.best_version ?? 0,
      )
    } finally {
      doneNProgress()
    }
  }

  // 删除指定季的订阅。
  async function removeSubscribe(season: number | null = null, removeOptions: RemoveSubscribeOptions = {}) {
    if (removeOptions.confirm ?? true) {
      const confirmed = await createConfirm({
        title: t('common.confirm'),
        content: t('dialog.subscribeEdit.cancelSubscribeConfirm'),
      })
      if (!confirmed) return
    }

    const media = currentMedia()
    if (!media) return
    const identity = getMediaId()
    if (!identity) return
    let title = media.title ?? ''
    if (media.type !== '电影' && season !== null) title = `${title} ${formatSeason(season.toString())}`

    startNProgress()
    try {
      await api.delete(`subscribe/media/${encodeURIComponent(identity.mediaId)}`, {
        feedback: 'silent',
        params: {
          media_source: identity.source,
          season: media.type === '电影' ? null : season,
          music_type: getMusicSubscribeType(media),
        },
      })

      updateSubscribeStatus(media.type === '电影' ? null : season, false)
      $toast.success(`${title} ${t('subscribe.cancelSuccess')}`)
    } catch (error) {
      console.error(error)
      $toast.error(
        `${title} ${t('subscribe.cancelFailed', {
          message: getRequestErrorMessage(error, t('subscribe.requestFailed')),
        })}`,
      )
    } finally {
      doneNProgress()
    }
  }

  // 检查当前媒体指定季是否已订阅。
  async function checkSubscribe(season: number | null = null) {
    const identity = getMediaId()
    if (!identity) return false
    try {
      const result: Subscribe = await api.get(`subscribe/media/${encodeURIComponent(identity.mediaId)}`, {
        feedback: 'silent',
        params: {
          media_source: identity.source,
          season,
          title: currentMedia()?.title,
          music_type: getMusicSubscribeType(currentMedia()),
        },
      })

      return Boolean(result.id)
    } catch (error: any) {
      if (error?.response?.status === 404) return false

      throw error
    }
  }

  // 查询当前媒体指定季的订阅记录。
  async function querySubscribe(season: number | null = null) {
    const identity = getMediaId()
    if (!identity) return null
    try {
      const result: Subscribe = await api.get(`subscribe/media/${encodeURIComponent(identity.mediaId)}`, {
        feedback: 'silent',
        params: {
          media_source: identity.source,
          season,
          title: currentMedia()?.title,
          music_type: getMusicSubscribeType(currentMedia()),
        },
      })

      return result.id ? result : null
    } catch (error: any) {
      if (error?.response?.status === 404) return null

      throw error
    }
  }

  // 更新已有单季订阅的模式。
  async function updateSubscribeMode(season: number, mode: SubscribeMode) {
    const media = currentMedia()
    if (!media) return
    const title = `${media.title ?? ''} ${formatSeason(season.toString())}`

    startNProgress()
    try {
      const subscribe = await querySubscribe(season)
      if (!subscribe?.id) {
        $toast.error(`${media.title ?? ''} ${formatSeason(season.toString())} ${t('subscribe.notFound')}`)
        return
      }

      const payload = getSubscribePayload(mode)
      await api.put(
        'subscribe/',
        {
          ...subscribe,
          ...payload,
        },
        { feedback: 'silent' },
      )

      updateSubscribeStatus(season, true, mode)
      $toast.success(`${title} ${t('subscribe.modeUpdateSuccess', { mode: getModeName(t, mode) })}`)
    } catch (error) {
      console.error(error)
      $toast.error(
        `${title} ${t('subscribe.addFailed', {
          name: getModeName(t, mode),
          message: getRequestErrorMessage(error, t('subscribe.requestFailed')),
        })}`,
      )
    } finally {
      doneNProgress()
    }
  }

  // 处理单季订阅入口，未订阅时将当前剧集组带入季选择弹窗。
  function handleSeasonSubscribe(season: number, initialEpisodeGroup = '') {
    if (options.seasonsSubscribed?.value[season]) {
      removeSubscribe(season)
      return
    }

    openSubscribeSeasonDialog(season, initialEpisodeGroup)
  }

  // 处理媒体主订阅入口，电视剧统一进入季选择弹窗。
  function handlePrimarySubscribe() {
    const media = currentMedia()
    if (!media || media.music_type === 'artist') return

    const season = media.type === '电影' ? null : getPrimarySeason()

    if (media.type === '电视剧') {
      openSubscribeSeasonDialog()
      return
    }

    if (options.isSubscribed?.value) {
      removeSubscribe(season)
      return
    }

    if (options.isExists?.()) {
      openSubscribeModeDialog(['normal', 'best_version'], payload => addSubscribe(null, payload))
      return
    }

    addSubscribe(null)
  }

  // 根据是否指定季号分发主订阅或单季订阅操作。
  function handleSubscribe(season?: number | null, initialEpisodeGroup = '') {
    if (season !== undefined && season !== null) {
      handleSeasonSubscribe(season, initialEpisodeGroup)
      return
    }

    handlePrimarySubscribe()
  }

  // 批量对齐弹窗中选择的季、订阅模式和当前订阅状态。
  function subscribeSeasons(
    seasons: MediaSeason[] = [],
    seasonExistsStates: { [key: number]: number } = {},
    groupId = '',
    seasonModes: SubscribeMode | SeasonSubscribeModes = 'normal',
    visibleSeasonNumbers: number[] = [],
  ) {
    episodeGroup.value = groupId
    const subscribedSeasonSet = new Set(options.subscribedSeasons?.value ?? [])
    const selectedSeasonSet = new Set(
      seasons
        .map(season => season.season_number)
        .filter((season): season is number => season !== null && season !== undefined),
    )
    const visibleSeasonSet = new Set(visibleSeasonNumbers)
    const seasonsToSubscribe = seasons.filter(season => {
      const seasonNumber = season.season_number ?? null
      return seasonNumber !== null && !subscribedSeasonSet.has(seasonNumber)
    })
    const seasonsToUnsubscribe = [...subscribedSeasonSet].filter(
      season => visibleSeasonSet.has(season) && !selectedSeasonSet.has(season),
    )
    const seasonsToUpdateMode = seasons.filter(season => {
      const seasonNumber = season.season_number ?? null
      if (seasonNumber === null || !subscribedSeasonSet.has(seasonNumber)) return false

      const nextMode = typeof seasonModes === 'string' ? seasonModes : (seasonModes[seasonNumber] ?? 'normal')
      return (options.subscribedSeasonModes?.value[seasonNumber] ?? 'normal') !== nextMode
    })

    seasonsToUnsubscribe.forEach(season => {
      removeSubscribe(season, { confirm: false })
    })

    seasonsToUpdateMode.forEach(season => {
      const seasonNumber = season.season_number ?? null
      if (seasonNumber === null) return

      const mode = typeof seasonModes === 'string' ? seasonModes : (seasonModes[seasonNumber] ?? 'normal')
      updateSubscribeMode(seasonNumber, mode)
    })

    seasonsToSubscribe.forEach(season => {
      const seasonNumber = season.season_number ?? null
      if (seasonNumber === null) return

      const mode = typeof seasonModes === 'string' ? seasonModes : (seasonModes[seasonNumber] ?? 'normal')
      const payload = getSubscribePayload(mode)
      addSubscribe(seasonNumber, payload, {
        openEditDialog: seasonsToSubscribe.length === 1 && seasonsToUnsubscribe.length === 0,
      })
    })
  }

  return {
    addSubscribe,
    checkSubscribe,
    handleSubscribe,
    openSubscribeSeasonDialog,
    removeSubscribe,
    subscribeSeasons,
  }
}
