import { defineAsyncComponent, ref, type Ref } from 'vue'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import api from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { formatSeason } from '@/@core/utils/formatters'
import type { MediaInfo, MediaSeason, Subscribe } from '@/api/types'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useConfirm } from '@/composables/useConfirm'
import { setCachedMediaSubscribeStatus } from '@/utils/mediaStatusCache'

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

export function getMediaSubscribeId(media?: MediaInfo) {
  if (media?.tmdb_id) return `tmdb:${media.tmdb_id}`
  if (media?.douban_id) return `douban:${media.douban_id}`
  if (media?.bangumi_id) return `bangumi:${media.bangumi_id}`
  return `${media?.mediaid_prefix}:${media?.media_id}`
}

function getSubscribePayload(mode: SubscribeMode): SubscribePayload {
  return {
    best_version: mode === 'normal' ? 0 : 1,
    best_version_full: mode === 'best_version_full' ? 1 : 0,
  }
}

function isEnabledFlag(value: unknown) {
  return value === true || value === 1 || value === '1'
}

export function getSubscribeMode(subscribe: { best_version?: unknown; best_version_full?: unknown }): SubscribeMode {
  if (!isEnabledFlag(subscribe.best_version)) return 'normal'

  return isEnabledFlag(subscribe.best_version_full) ? 'best_version_full' : 'best_version'
}

function getSubscribeConfigMode(config?: SubscribeConfig): SubscribeMode {
  return getSubscribeMode({
    best_version: config?.best_version,
    best_version_full: config?.best_version_full,
  })
}

function getModeName(t: ReturnType<typeof useI18n>['t'], mode: SubscribeMode) {
  if (mode === 'normal') return t('dialog.subscribeMode.normal')
  if (mode === 'best_version') return t('dialog.subscribeMode.bestVersionEpisode')
  return t('dialog.subscribeMode.bestVersionFull')
}

export function useMediaSubscribe(options: UseMediaSubscribeOptions) {
  const { t } = useI18n()
  const $toast = useToast()
  const createConfirm = useConfirm()
  const episodeGroup = ref('')

  function currentMedia() {
    return options.media()
  }

  function getMediaId() {
    return getMediaSubscribeId(currentMedia())
  }

  function getPrimarySeason() {
    return options.primarySeason?.() ?? currentMedia()?.season ?? null
  }

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

  function openSubscribeEditDialog(subid: number) {
    openSharedDialog(
      SubscribeEditDialog,
      { subid },
      {
        remove: () => {
          if (options.onEditRemove) {
            options.onEditRemove()
          } else if (options.isSubscribed) {
            options.isSubscribed.value = false
          }
        },
      },
      { closeOn: ['close', 'save', 'remove'] },
    )
  }

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

  async function openSubscribeSeasonDialog(selectedSeason?: number | null) {
    const media = currentMedia()
    if (!media) return
    const defaultSubscribeConfig = await queryDefaultSubscribeConfig()

    openSharedDialog(
      SubscribeSeasonDialog,
      {
        media,
        selectedSeason,
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

  async function queryDefaultSubscribeConfig(): Promise<SubscribeConfig | undefined> {
    if (!options.canSubscribe()) return undefined

    try {
      const media = currentMedia()
      const subscribeConfigUrl =
        media?.type === '电影'
          ? 'system/setting/public/DefaultMovieSubscribeConfig'
          : 'system/setting/public/DefaultTvSubscribeConfig'
      const result: { [key: string]: any } = await api.get(subscribeConfigUrl)

      return result.data?.value
    } catch (error) {
      console.log(error)
    }

    return undefined
  }

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

  async function addSubscribe(
    season: number | null = null,
    payload: SubscribePayload = {},
    addOptions: AddSubscribeOptions = {},
  ) {
    const media = currentMedia()
    if (!media) return

    startNProgress()
    try {
      const result: { [key: string]: any } = await api.post('subscribe/', {
        name: media.title,
        type: media.type,
        year: media.year,
        tmdbid: media.tmdb_id,
        doubanid: media.douban_id,
        bangumiid: media.bangumi_id,
        mediaid: media.media_id ? `${media.mediaid_prefix}:${media.media_id}` : '',
        season: media.type === '电影' ? null : season,
        ...payload,
        episode_group: episodeGroup.value,
      })

      if (result.success) updateSubscribeStatus(media.type === '电影' ? null : season, true, getSubscribeMode(payload))

      showSubscribeAddToast(result.success, media.title ?? '', season, result.message, payload.best_version ?? 0)

      if (result.success && (addOptions.openEditDialog ?? true)) {
        const subscribeConfig = await queryDefaultSubscribeConfig()
        if (subscribeConfig?.show_edit_dialog) openSubscribeEditDialog(result.data.id)
      }
    } catch (error) {
      console.error(error)
    } finally {
      doneNProgress()
    }
  }

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

    startNProgress()
    try {
      const result: { [key: string]: any } = await api.delete(`subscribe/media/${getMediaId()}`, {
        params: {
          season: media.type === '电影' ? null : season,
        },
      })
      let title = media.title ?? ''
      if (media.type !== '电影' && season !== null) title = `${title} ${formatSeason(season.toString())}`

      if (result.success) {
        updateSubscribeStatus(media.type === '电影' ? null : season, false)
        $toast.success(`${title} ${t('subscribe.cancelSuccess')}`)
      } else {
        $toast.error(`${title} ${t('subscribe.cancelFailed', { message: result.message })}`)
      }
    } catch (error) {
      console.error(error)
    } finally {
      doneNProgress()
    }
  }

  async function checkSubscribe(season: number | null = null) {
    try {
      const result: Subscribe = await api.get(`subscribe/media/${getMediaId()}`, {
        params: {
          season,
          title: currentMedia()?.title,
        },
      })

      return Boolean(result.id)
    } catch (error: any) {
      if (error?.response?.status === 404) return false

      throw error
    }
  }

  async function querySubscribe(season: number | null = null) {
    try {
      const result: Subscribe = await api.get(`subscribe/media/${getMediaId()}`, {
        params: {
          season,
          title: currentMedia()?.title,
        },
      })

      return result.id ? result : null
    } catch (error: any) {
      if (error?.response?.status === 404) return null

      throw error
    }
  }

  async function updateSubscribeMode(season: number, mode: SubscribeMode) {
    const media = currentMedia()
    if (!media) return

    startNProgress()
    try {
      const subscribe = await querySubscribe(season)
      if (!subscribe?.id) {
        $toast.error(`${media.title ?? ''} ${formatSeason(season.toString())} ${t('subscribe.notFound')}`)
        return
      }

      const payload = getSubscribePayload(mode)
      const result: { [key: string]: any } = await api.put('subscribe/', {
        ...subscribe,
        ...payload,
      })
      const title = `${media.title ?? ''} ${formatSeason(season.toString())}`

      if (result.success) {
        updateSubscribeStatus(season, true, mode)
        $toast.success(`${title} ${t('subscribe.modeUpdateSuccess', { mode: getModeName(t, mode) })}`)
      } else {
        $toast.error(`${title} ${t('subscribe.addFailed', { name: getModeName(t, mode), message: result.message })}`)
      }
    } catch (error) {
      console.error(error)
    } finally {
      doneNProgress()
    }
  }

  function handleSeasonSubscribe(season: number) {
    if (options.seasonsSubscribed?.value[season]) {
      removeSubscribe(season)
      return
    }

    openSubscribeSeasonDialog(season)
  }

  function handlePrimarySubscribe() {
    const media = currentMedia()
    if (!media) return

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

  function handleSubscribe(season?: number | null) {
    if (season !== undefined && season !== null) {
      handleSeasonSubscribe(season)
      return
    }

    handlePrimarySubscribe()
  }

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
      seasons.map(season => season.season_number).filter((season): season is number => season !== null && season !== undefined),
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

      const nextMode = typeof seasonModes === 'string' ? seasonModes : seasonModes[seasonNumber] ?? 'normal'
      return (options.subscribedSeasonModes?.value[seasonNumber] ?? 'normal') !== nextMode
    })

    seasonsToUnsubscribe.forEach(season => {
      removeSubscribe(season, { confirm: false })
    })

    seasonsToUpdateMode.forEach(season => {
      const seasonNumber = season.season_number ?? null
      if (seasonNumber === null) return

      const mode = typeof seasonModes === 'string' ? seasonModes : seasonModes[seasonNumber] ?? 'normal'
      updateSubscribeMode(seasonNumber, mode)
    })

    seasonsToSubscribe.forEach(season => {
      const seasonNumber = season.season_number ?? null
      if (seasonNumber === null) return

      const mode = typeof seasonModes === 'string' ? seasonModes : seasonModes[seasonNumber] ?? 'normal'
      const payload = getSubscribePayload(mode)
      addSubscribe(
        seasonNumber,
        payload,
        {
          openEditDialog: seasonsToSubscribe.length === 1 && seasonsToUnsubscribe.length === 0,
        },
      )
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
