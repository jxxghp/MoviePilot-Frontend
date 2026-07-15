<script lang="ts" setup>
import type { CalendarOptions, EventInput, EventSourceInput } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import timeGridPlugin from '@fullcalendar/timegrid'
import FullCalendar from '@fullcalendar/vue3'
import type { Ref } from 'vue'
import type { MediaInfo, Subscribe, TmdbEpisode } from '@/api/types'
import api from '@/api'
import { formatDateDifference, formatEp, formatSeasonEpisode, parseDate } from '@/@core/utils/formatters'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { getCurrentLocale } from '@/plugins/i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'

const ProgressDialog = defineAsyncComponent(() => import('@/components/dialog/ProgressDialog.vue'))

const COLLAPSED_DAY_CARD_LIMIT = 5
const COLLAPSED_VISIBLE_CARD_LIMIT = COLLAPSED_DAY_CARD_LIMIT
const DAY_GROUP_EVENT_PREFIX = 'calendar-day-group-'
const ALL_MOBILE_FILTER_VALUE = '__all__'
const DAY_TIME = 24 * 60 * 60 * 1000
const MOBILE_HISTORY_DAY_LIMIT = 30

// 国际化
const { t } = useI18n()

// 跟随 Vuetify 断点，MD 以下使用移动端时间线模式。
const display = useDisplay()

// 加载中
const loading = ref(false)

// 已加载过
const isLoaded = ref(false)

// 获取当前语言
const i18nLocale = getCurrentLocale()
const currentLocale = i18nLocale.split('-')[0]

let progressDialogController: ReturnType<typeof openSharedDialog> | null = null

type CalendarLibraryState = 'none' | 'partial' | 'complete'

// 订阅日历事件信息。
interface CalendarEventInfo {
  id?: string
  title: string
  episodeTitle?: string
  episodeTitles?: string[]
  subtitle: string
  start: Date | null
  allDay: boolean
  posterPath: string | undefined
  mediaType: string
  runtime?: number
  season?: number
  year?: string
  len: number
  episodeNumbers: number[]
  libraryEpisode: number
  lackEpisode: number
  totalEpisode: number
  libraryEpisodeNumbers: number[]
  libraryState: CalendarLibraryState
  libraryUpdateText: string
  dateKey?: string
  hiddenEventCount?: number
  calendarSortIndex?: number
}

// 移动端筛选项。
interface MobileCalendarFilterOption {
  label: string
  value: string
  count: number
}

// 移动端日期分组。
interface MobileCalendarDayGroup {
  dateKey: string
  date: Date
  title: string
  subtitle: string
  count: number
  events: CalendarEventInfo[]
}

// 打开订阅日历共享进度弹窗。
function openProgressDialog() {
  progressDialogController?.close()
  progressDialogController = openSharedDialog(
    ProgressDialog,
    { text: `${t('common.loading')} ...` },
    {},
    { closeOn: false },
  )
}

// 关闭订阅日历共享进度弹窗。
function closeProgressDialog() {
  progressDialogController?.close()
  progressDialogController = null
}

// 日历属性
const calendarOptions: Ref<CalendarOptions> = ref({
  height: 'auto',
  locale: currentLocale,
  plugins: [
    dayGridPlugin,
    timeGridPlugin,
    interactionPlugin, // needed for dateClick
  ],
  initialView: 'dayGridMonth',
  weekends: true,
  firstDay: 1,
  headerToolbar: {
    left: 'prev',
    center: 'title',
    right: 'next',
  },
  // 折叠逻辑由组件自行控制，点击展开时可以直接扩展当前日期格子。
  dayMaxEvents: false,
  dayMaxEventRows: false,
  eventDisplay: 'block',
  eventOrder: 'start,calendarSortIndex,title',
  eventOrderStrict: true,
  views: {
    week: {
      titleFormat: { day: 'numeric' },
    },
  },
  events: [],
})

// 原始日历事件与已展开日期分离，避免依赖 FullCalendar 的弹窗式 more 链接。
const rawCalendarEvents = ref<CalendarEventInfo[]>([])
const expandedDateKeys = ref(new Set<string>())
const calendarRef = ref<InstanceType<typeof FullCalendar> | null>(null)

// 移动端当前剧集筛选值。
const mobileSelectedFilterValue = ref(ALL_MOBILE_FILTER_VALUE)

// 移动端默认隐藏已经过期的日历项。
const mobileHideExpired = ref(true)

// 移动端剧集筛选项。
const mobileSeriesFilterOptions = computed<MobileCalendarFilterOption[]>(() => {
  const optionMap = new Map<string, MobileCalendarFilterOption>()

  rawCalendarEvents.value.forEach(event => {
    const label = event.title.trim()
    if (!label) return

    const currentOption = optionMap.get(label)
    if (currentOption) {
      currentOption.count += event.len || 1
    } else {
      optionMap.set(label, {
        label,
        value: label,
        count: event.len || 1,
      })
    }
  })

  return [
    {
      label: t('common.all'),
      value: ALL_MOBILE_FILTER_VALUE,
      count: rawCalendarEvents.value.reduce((total, event) => total + (event.len || 1), 0),
    },
    ...Array.from(optionMap.values()),
  ]
})

// 移动端筛选后的日历事件。
const mobileFilteredCalendarEvents = computed(() => {
  return rawCalendarEvents.value.filter(event => {
    if (mobileSelectedFilterValue.value !== ALL_MOBILE_FILTER_VALUE && event.title !== mobileSelectedFilterValue.value) {
      return false
    }

    if (isDateBeforeMobileHistoryWindow(event.start)) {
      return false
    }

    if (mobileHideExpired.value && isDateBeforeToday(event.start)) {
      return false
    }

    return true
  })
})

// 移动端按日期聚合后的时间线分组。
const mobileCalendarDayGroups = computed<MobileCalendarDayGroup[]>(() => {
  const groupedEvents = new Map<string, CalendarEventInfo[]>()

  mobileFilteredCalendarEvents.value.forEach(event => {
    const dateKey = getDateKey(event.start)
    if (!dateKey) return

    groupedEvents.set(dateKey, [...(groupedEvents.get(dateKey) || []), event])
  })

  return Array.from(groupedEvents.entries()).map(([dateKey, events]) => {
    const date = events[0].start as Date

    return {
      dateKey,
      date,
      title: getMobileDateTitle(date),
      subtitle: getMobileDateSubtitle(date),
      count: events.reduce((total, event) => total + (event.len || 1), 0),
      events,
    }
  })
})

watch(mobileSeriesFilterOptions, options => {
  if (
    mobileSelectedFilterValue.value !== ALL_MOBILE_FILTER_VALUE &&
    !options.some(option => option.value === mobileSelectedFilterValue.value)
  ) {
    mobileSelectedFilterValue.value = ALL_MOBILE_FILTER_VALUE
  }
})

// 获取日期的 YYYY-MM-DD 键。
function getDateKey(date: Date | null) {
  if (!date) return ''

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return `${year}-${month}-${day}`
}

// 获取当天聚合事件在 FullCalendar 中的事件 ID。
function getDayGroupEventId(dateKey: string) {
  return `${DAY_GROUP_EVENT_PREFIX}${dateKey}`
}

// 构建 FullCalendar 中单日聚合事件。
function createDayGroupCalendarEvent(dateKey: string, events: CalendarEventInfo[]): EventInput {
  const isExpanded = expandedDateKeys.value.has(dateKey)
  const visibleEvents = isExpanded ? events : events.slice(0, COLLAPSED_VISIBLE_CARD_LIMIT)

  return {
    id: getDayGroupEventId(dateKey),
    title: '',
    start: events[0]?.start || undefined,
    allDay: false,
    interactive: false,
    calendarSortIndex: events[0]?.calendarSortIndex ?? 0,
    dateKey,
    hiddenEventCount: isExpanded ? 0 : Math.max(events.length - COLLAPSED_VISIBLE_CARD_LIMIT, 0),
    isDayGroup: true,
    visibleEvents,
  }
}

// 统一日历事件排序并记录排序序号。
function normalizeCalendarEventOrder(events: CalendarEventInfo[]) {
  return events
    .sort((first, second) => {
      const firstTime = first.start?.getTime() ?? 0
      const secondTime = second.start?.getTime() ?? 0

      return firstTime - secondTime || first.title.localeCompare(second.title)
    })
    .map((event, index) => ({
      ...event,
      calendarSortIndex: index,
    }))
}

// 将原始事件转换为 FullCalendar 可见事件。
function renderVisibleCalendarEvents() {
  const groupedEvents = new Map<string, CalendarEventInfo[]>()

  rawCalendarEvents.value.forEach(event => {
    const dateKey = getDateKey(event.start)
    if (!dateKey) return

    groupedEvents.set(dateKey, [...(groupedEvents.get(dateKey) || []), event])
  })

  calendarOptions.value.events = Array.from(groupedEvents.entries()).map(([dateKey, events]) =>
    createDayGroupCalendarEvent(dateKey, events),
  ) as EventSourceInput
}

// 展开指定日期在桌面日历中的折叠事件。
function expandCalendarDay(dateKey: string) {
  const currentScrollY = window.scrollY
  const events = rawCalendarEvents.value.filter(event => getDateKey(event.start) === dateKey)
  const calendarApi = calendarRef.value?.getApi()

  expandedDateKeys.value = new Set(expandedDateKeys.value).add(dateKey)

  // 只更新当天这个聚合事件的内容，避免重置整个 FullCalendar 导致页面回到顶部。
  if (calendarApi) {
    const event = calendarApi.getEventById(getDayGroupEventId(dateKey))
    event?.setExtendedProp('visibleEvents', events)
    event?.setExtendedProp('hiddenEventCount', 0)

    requestAnimationFrame(() => window.scrollTo({ top: currentScrollY, left: window.scrollX }))
  } else {
    renderVisibleCalendarEvents()
  }
}

// 将入库集数限制在合法区间。
function clampEpisodeCount(value: number, total: number) {
  return Math.min(Math.max(value, 0), total)
}

// 获取订阅已入库集数。
function getLibraryEpisodeCount(subscribe: Subscribe) {
  const totalEpisode = subscribe.total_episode || 0
  if (!totalEpisode) return 0

  const libraryEpisode =
    typeof subscribe.lack_episode === 'number'
      ? totalEpisode - subscribe.lack_episode
      : (subscribe.completed_episode ?? 0)

  return clampEpisodeCount(libraryEpisode, totalEpisode)
}

// 获取订阅缺失集数。
function getLackEpisodeCount(subscribe: Subscribe) {
  const totalEpisode = subscribe.total_episode || 0
  if (!totalEpisode) return 0

  return clampEpisodeCount(subscribe.lack_episode ?? totalEpisode - getLibraryEpisodeCount(subscribe), totalEpisode)
}

// 规范化后端返回的集号列表。
function normalizeEpisodeNumbers(value: unknown) {
  if (!Array.isArray(value)) return []

  return value.map(number => Number(number)).filter(number => Number.isFinite(number) && number > 0)
}

// 判断后端布尔兼容字段是否为开启。
function isEnabledFlag(value: unknown) {
  return value === true || value === 1 || value === '1'
}

// 获取已经入库的具体集号列表。
function getLibraryEpisodeNumbers(subscribe: Subscribe) {
  if (isEnabledFlag(subscribe.best_version)) {
    return Object.entries(subscribe.episode_priority || {})
      .filter(([episode, priority]) => Number.isFinite(Number(episode)) && priority === 100)
      .map(([episode]) => Number(episode))
  }

  return normalizeEpisodeNumbers(subscribe.note)
}

// 根据集号和入库信息计算当前日历项入库状态。
function getLibraryState(
  episodeNumbers: number[],
  libraryEpisode: number,
  libraryEpisodeNumbers: number[],
): CalendarLibraryState {
  const validEpisodeNumbers = episodeNumbers.filter(number => Number.isFinite(number) && number > 0)
  if (!validEpisodeNumbers.length || !libraryEpisode) return 'none'

  // 后端存在具体集号时优先精确匹配；缺少明细时才按聚合进度做保守降级展示。
  const matchedEpisodeCount = libraryEpisodeNumbers.length
    ? validEpisodeNumbers.filter(number => libraryEpisodeNumbers.includes(number)).length
    : validEpisodeNumbers.filter(number => number <= libraryEpisode).length
  if (!matchedEpisodeCount) return 'none'

  return matchedEpisodeCount === validEpisodeNumbers.length ? 'complete' : 'partial'
}

// 构建订阅日历事件。
function buildCalendarEventInfo(
  subscribe: Subscribe,
  payload: Pick<CalendarEventInfo, 'subtitle' | 'start' | 'episodeNumbers' | 'len'> &
    Partial<Pick<CalendarEventInfo, 'episodeTitle' | 'episodeTitles' | 'runtime'>>,
): CalendarEventInfo {
  const totalEpisode = subscribe.total_episode || 0
  const libraryEpisode = getLibraryEpisodeCount(subscribe)
  const lackEpisode = getLackEpisodeCount(subscribe)
  const libraryEpisodeNumbers = getLibraryEpisodeNumbers(subscribe)

  return {
    title: subscribe.name || '',
    allDay: false,
    posterPath: subscribe.poster,
    mediaType: subscribe.type || '',
    season: subscribe.season,
    year: subscribe.year,
    totalEpisode,
    libraryEpisode,
    lackEpisode,
    libraryEpisodeNumbers,
    libraryState: getLibraryState(payload.episodeNumbers, libraryEpisode, libraryEpisodeNumbers),
    libraryUpdateText: libraryEpisode > 0 && subscribe.last_update ? formatDateDifference(subscribe.last_update) : '',
    ...payload,
  }
}

// 获取折叠事件展开按钮文案。
function getExpandCalendarEventLabel(event: any) {
  const props = event.extendedProps as CalendarEventInfo

  return t('calendar.expandDayEvents', { count: props.hiddenEventCount || 0 })
}

// 获取日历事件悬浮提示。
function getCalendarEventInfoTooltip(event: CalendarEventInfo) {
  const parts = [event.title]

  if (event.episodeTitle) parts.push(event.episodeTitle)
  if (event.subtitle) parts.push(t('calendar.episode', { number: event.subtitle }))
  if (event.totalEpisode) {
    parts.push(t('calendar.libraryProgress', { completed: event.libraryEpisode, total: event.totalEpisode }))
  }
  if (event.libraryUpdateText) parts.push(t('calendar.libraryUpdatedAt', { time: event.libraryUpdateText }))

  return parts.filter(Boolean).join(' · ')
}

// 获取入库状态文案。
function getLibraryStateText(state: CalendarLibraryState) {
  if (state === 'complete') return t('calendar.currentEpisodeInLibrary')
  if (state === 'partial') return t('calendar.currentEpisodePartiallyInLibrary')
  return t('calendar.currentEpisodeNotInLibrary')
}

// 获取桌面端入库状态与进度组合文案。
function getCompactLibraryProgressText(event: CalendarEventInfo) {
  if (!event.totalEpisode) return getDesktopLibraryStateText(event.libraryState)

  return t('calendar.compactLibraryProgress', {
    state: getDesktopLibraryStateText(event.libraryState),
    completed: event.libraryEpisode,
    total: event.totalEpisode,
  })
}

// 获取桌面端短入库状态文案。
function getDesktopLibraryStateText(state: CalendarLibraryState) {
  if (state === 'complete') return t('calendar.libraryStateComplete')
  if (state === 'partial') return t('calendar.libraryStatePartial')
  return t('calendar.libraryStateNone')
}

// 获取入库状态图标。
function getLibraryStateIcon(state: CalendarLibraryState) {
  if (state === 'none') return 'mdi-minus-circle-outline'
  return 'mdi-check-circle-outline'
}

// 获取当天零点时间。
function getTodayStart() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return today
}

// 判断日期是否早于今天。
function isDateBeforeToday(date: Date | null) {
  if (!date) return false

  return date.getTime() < getTodayStart().getTime()
}

// 判断日期是否早于移动端允许展示的历史窗口。
function isDateBeforeMobileHistoryWindow(date: Date | null) {
  if (!date) return false

  return date.getTime() < getTodayStart().getTime() - MOBILE_HISTORY_DAY_LIMIT * DAY_TIME
}

// 判断日期是否是今天。
function isDateToday(date: Date | null) {
  if (!date) return false

  return getDateKey(date) === getDateKey(getTodayStart())
}

// 判断日期是否在今天之后。
function isDateAfterToday(date: Date | null) {
  if (!date) return false

  return date.getTime() >= getTodayStart().getTime() + DAY_TIME
}

// 判断日期是否在当前年份。
function isDateInCurrentYear(date: Date) {
  return date.getFullYear() === new Date().getFullYear()
}

// 格式化移动端日期主标题。
function getMobileDateTitle(date: Date) {
  if (isDateToday(date)) return t('calendar.today')

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')

  return isDateInCurrentYear(date) ? `${month}/${day}` : `${year}/${month}/${day}`
}

// 格式化移动端日期副标题。
function getMobileDateSubtitle(date: Date) {
  if (isDateToday(date)) return t('calendar.todayUpdated')

  return new Intl.DateTimeFormat(i18nLocale, { weekday: 'short' }).format(date)
}

// 获取移动端单条事件主标题。
function getMobileEventMainTitle(event: CalendarEventInfo) {
  if (event.episodeTitle) return event.episodeTitle
  if (event.subtitle) return t('calendar.mobileEpisodeTitle', { number: event.subtitle })

  return event.title
}

// 获取移动端单条事件副标题。
function getMobileEventSubtitle(event: CalendarEventInfo) {
  if (event.mediaType === '电影') return event.year || event.mediaType

  return event.title
}

// 获取移动端集季标识。
function getMobileEventEpisodeTag(event: CalendarEventInfo) {
  if (event.mediaType === '电影') return t('calendar.movie')
  if (!event.episodeNumbers.length && !event.season) return ''

  return formatSeasonEpisode(event.season, event.episodeNumbers)
}

// 获取移动端海报角标集号。
function getMobilePosterEpisodeTag(event: CalendarEventInfo) {
  if (event.mediaType === '电影' || !event.episodeNumbers.length) return ''

  return formatSeasonEpisode(undefined, event.episodeNumbers)
}

// 获取移动端时长标识。
function getMobileEventRuntimeTag(event: CalendarEventInfo) {
  if (!event.runtime) return ''

  return t('calendar.runtimeMinutes', { minutes: event.runtime })
}

// 获取移动端卡片右侧日期标识。
function getMobileEventDateBadge(event: CalendarEventInfo) {
  if (isDateToday(event.start)) return t('calendar.today')
  if (isDateAfterToday(event.start)) return t('calendar.upcoming')
  if (isDateBeforeToday(event.start)) return t('calendar.expired')

  return ''
}

// 获取单日聚合剧集标题。
function getEpisodeTitle(episodeNumbers: number[], episodeTitles: string[]) {
  const titles = episodeTitles.map(title => title.trim()).filter(Boolean)
  if (titles.length === 1) return titles[0]
  if (titles.length > 1 && titles.length === episodeNumbers.length) return titles.join(' / ')

  return ''
}

// 生成单个订阅对应的日历事件。
async function eventsHander(subscribe: Subscribe) {
  // 如果是电影直接返回
  if (subscribe.type === '电影') {
    // 调用API查询TMDB详情
    const movie: MediaInfo = await api.get(`media/tmdb:${subscribe.tmdbid}`, {
      params: { type_name: subscribe.type },
    })

    return buildCalendarEventInfo(subscribe, {
      subtitle: '',
      start: parseDate(movie.release_date || ''),
      len: 1,
      runtime: movie.runtime,
      episodeNumbers: [],
    })
  } else {
    // 调用API查询集信息
    const params = subscribe.episode_group ? { episode_group: subscribe.episode_group } : undefined
    const episodes: TmdbEpisode[] = await api.get(
      `tmdb/${subscribe.tmdbid}/${subscribe.season}`,
      params ? { params } : undefined,
    )

    // 按播出日期聚合 TMDB 剧集。
    interface EpisodesDictionary {
      [key: string]: CalendarEventInfo
    }

    const dictEpisode: EpisodesDictionary = {}
    episodes.forEach((episode: TmdbEpisode) => {
      const air_date = episode.air_date ?? ''
      const episodeNumber = episode.episode_number || 0
      if (dictEpisode[air_date]) {
        dictEpisode[air_date].episodeNumbers.push(episodeNumber)
        if (episode.name) dictEpisode[air_date].episodeTitles?.push(episode.name)
        if (!dictEpisode[air_date].runtime && episode.runtime) dictEpisode[air_date].runtime = episode.runtime
        dictEpisode[air_date].len++
      } else {
        dictEpisode[air_date] = buildCalendarEventInfo(subscribe, {
          subtitle: '',
          start: parseDate(episode.air_date || ''),
          len: 1,
          episodeTitle: episode.name,
          episodeTitles: episode.name ? [episode.name] : [],
          runtime: episode.runtime,
          episodeNumbers: [episodeNumber],
        })
      }
    })
    for (const key in dictEpisode) {
      const episodeNumbers = dictEpisode[key].episodeNumbers.filter(number => Number.isFinite(number) && number > 0)
      dictEpisode[key].subtitle = formatEp(episodeNumbers)
      dictEpisode[key].episodeTitle = getEpisodeTitle(episodeNumbers, dictEpisode[key].episodeTitles || [])
      dictEpisode[key].libraryState = getLibraryState(
        episodeNumbers,
        dictEpisode[key].libraryEpisode,
        dictEpisode[key].libraryEpisodeNumbers,
      )
    }

    return Object.values(dictEpisode)
  }
}

// 调用API查询所有订阅
async function getSubscribes() {
  if (!isLoaded.value && display.mdAndUp.value) openProgressDialog()
  try {
    // 订阅
    loading.value = true
    const subscribes: Subscribe[] = await api.get('subscribe/')
    loading.value = false
    const subEvents = await Promise.allSettled(subscribes.map(async sub => eventsHander(sub)))
    const succEvents = subEvents.filter(result => result.status === 'fulfilled').map(result => result.value)
    rawCalendarEvents.value = normalizeCalendarEventOrder(succEvents.flat().filter(event => event.start))
    renderVisibleCalendarEvents()
    isLoaded.value = true
  } catch (error) {
    console.error(error)
  } finally {
    closeProgressDialog()
  }
}

// 页面加载时调用API查询所有订阅
onMounted(() => {
  getSubscribes()
})

onActivated(() => {
  if (!loading.value) {
    getSubscribes()
  }
})
</script>

<template>
  <FullCalendar v-if="display.mdAndUp.value" ref="calendarRef" :options="calendarOptions">
    <template #eventContent="arg">
      <div v-if="arg.event.extendedProps.isDayGroup" class="calendar-day-events">
        <div
          v-for="calendarEvent in arg.event.extendedProps.visibleEvents"
          :key="`${calendarEvent.title}-${calendarEvent.subtitle}-${calendarEvent.calendarSortIndex}`"
          class="calendar-event-card"
          :class="`calendar-event-card--${calendarEvent.libraryState}`"
          :title="getCalendarEventInfoTooltip(calendarEvent)"
        >
          <div v-if="display.mdAndUp.value" class="calendar-event-poster">
            <VImg
              height="74"
              width="50"
              :src="calendarEvent.posterPath"
              aspect-ratio="2/3"
              class="calendar-event-image object-cover"
              cover
            >
              <template #placeholder>
                <div class="w-full h-full">
                  <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                </div>
              </template>
            </VImg>
            <span v-if="calendarEvent.libraryState === 'complete'" class="calendar-library-check">
              <VIcon icon="mdi-check" size="12" />
            </span>
          </div>

          <VImg
            v-else
            :src="calendarEvent.posterPath"
            aspect-ratio="2/3"
            class="calendar-mobile-image object-cover ring-gray-500"
            cover
            :title="getCalendarEventInfoTooltip(calendarEvent)"
          >
            <template #placeholder>
              <div class="w-full h-full">
                <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
              </div>
            </template>
            <span
              v-if="calendarEvent.libraryState === 'complete'"
              class="calendar-library-check calendar-library-check--mobile"
            >
              <VIcon icon="mdi-check" size="11" />
            </span>
            <span v-if="calendarEvent.subtitle" class="calendar-mobile-episode">
              {{ calendarEvent.subtitle }}
            </span>
          </VImg>

          <div v-if="display.mdAndUp.value" class="calendar-event-content">
            <div class="calendar-event-title">
              {{ calendarEvent.title }}
            </div>
            <div v-if="calendarEvent.subtitle" class="calendar-event-episode">
              <VIcon icon="mdi-calendar-blank-outline" size="13" />
              {{ t('calendar.episode', { number: calendarEvent.subtitle }) }}
            </div>
            <div v-if="calendarEvent.totalEpisode" class="calendar-event-library-row">
              <span
                class="calendar-event-status"
                :class="`calendar-event-status--${calendarEvent.libraryState}`"
              >
                <VIcon :icon="getLibraryStateIcon(calendarEvent.libraryState)" size="13" />
                {{ getCompactLibraryProgressText(calendarEvent) }}
              </span>
            </div>
            <div v-if="calendarEvent.libraryUpdateText" class="calendar-event-time">
              <VIcon icon="mdi-clock-outline" size="13" />
              {{ t('calendar.libraryUpdatedAtShort', { time: calendarEvent.libraryUpdateText }) }}
            </div>
          </div>
        </div>

        <button
          v-if="arg.event.extendedProps.hiddenEventCount"
          type="button"
          class="calendar-expand-card"
          :title="getExpandCalendarEventLabel(arg.event)"
          :aria-label="getExpandCalendarEventLabel(arg.event)"
          @click.stop.prevent="expandCalendarDay(arg.event.extendedProps.dateKey)"
        >
          <VIcon icon="mdi-unfold-more-horizontal" size="18" />
          <span class="calendar-expand-count">+{{ arg.event.extendedProps.hiddenEventCount }}</span>
        </button>
      </div>
    </template>
  </FullCalendar>

  <div v-else class="mobile-subscribe-calendar">
    <LoadingBanner v-if="!isLoaded" class="mt-12" />

    <template v-else>
      <section class="mobile-calendar-filter-card">
      <div class="mobile-calendar-filter-head">
        <div class="mobile-calendar-filter-copy">
          <h2>{{ t('calendar.mobileFilterTitle') }}</h2>
          <span>{{ t('calendar.itemCount', { count: mobileSeriesFilterOptions[0]?.count || 0 }) }}</span>
        </div>

        <button
          type="button"
          class="mobile-calendar-expired-toggle"
          :class="{ 'mobile-calendar-expired-toggle--active': mobileHideExpired }"
          @click="mobileHideExpired = !mobileHideExpired"
        >
          <VIcon :icon="mobileHideExpired ? 'mdi-eye-off-outline' : 'mdi-eye-outline'" size="18" />
          <span>{{ mobileHideExpired ? t('calendar.hideExpired') : t('calendar.showExpired') }}</span>
        </button>
      </div>

      <div class="mobile-calendar-filter-list" role="listbox" :aria-label="t('calendar.mobileFilterTitle')">
        <button
          v-for="option in mobileSeriesFilterOptions"
          :key="option.value"
          type="button"
          class="mobile-calendar-filter-chip"
          :class="{ 'mobile-calendar-filter-chip--active': mobileSelectedFilterValue === option.value }"
          role="option"
          :aria-selected="mobileSelectedFilterValue === option.value"
          @click="mobileSelectedFilterValue = option.value"
        >
          {{ option.label }}
        </button>
      </div>
      </section>

      <div v-if="mobileCalendarDayGroups.length" class="mobile-calendar-timeline">
      <section v-for="group in mobileCalendarDayGroups" :key="group.dateKey" class="mobile-calendar-day">
        <div class="mobile-calendar-day-marker">
          <span class="mobile-calendar-day-dot" :class="{ 'mobile-calendar-day-dot--today': isDateToday(group.date) }" />
        </div>

        <div class="mobile-calendar-day-body">
          <header class="mobile-calendar-day-head">
            <div class="mobile-calendar-day-title-wrap">
              <h2>{{ group.title }}</h2>
              <span>{{ group.subtitle }}</span>
            </div>

            <span class="mobile-calendar-day-count">{{ t('calendar.episodeCount', { count: group.count }) }}</span>
          </header>

          <div class="mobile-calendar-event-list">
            <article
              v-for="calendarEvent in group.events"
              :key="`${group.dateKey}-${calendarEvent.title}-${calendarEvent.subtitle}-${calendarEvent.calendarSortIndex}`"
              class="mobile-calendar-event-card"
              :class="`mobile-calendar-event-card--${calendarEvent.libraryState}`"
              :title="getCalendarEventInfoTooltip(calendarEvent)"
            >
              <div class="mobile-calendar-event-poster-wrap">
                <VImg
                  :src="calendarEvent.posterPath"
                  aspect-ratio="2/3"
                  class="mobile-calendar-event-poster object-cover"
                  cover
                >
                  <template #placeholder>
                    <div class="mobile-calendar-event-poster-placeholder">
                      <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                    </div>
                  </template>
                  <template #error>
                    <div class="mobile-calendar-event-poster-error">
                      <VIcon icon="mdi-image-off-outline" size="32" />
                      <span>{{ t('calendar.imageLoadFailed') }}</span>
                    </div>
                  </template>
                </VImg>

                <span v-if="getMobilePosterEpisodeTag(calendarEvent)" class="mobile-calendar-poster-episode">
                  {{ getMobilePosterEpisodeTag(calendarEvent) }}
                </span>
              </div>

              <div class="mobile-calendar-event-content">
                <div class="mobile-calendar-event-title-row">
                  <h3>{{ getMobileEventMainTitle(calendarEvent) }}</h3>
                  <span
                    v-if="getMobileEventDateBadge(calendarEvent)"
                    class="mobile-calendar-date-badge"
                    :class="{
                      'mobile-calendar-date-badge--today': isDateToday(calendarEvent.start),
                      'mobile-calendar-date-badge--upcoming': isDateAfterToday(calendarEvent.start),
                      'mobile-calendar-date-badge--expired': isDateBeforeToday(calendarEvent.start),
                    }"
                  >
                    {{ getMobileEventDateBadge(calendarEvent) }}
                  </span>
                </div>

                <p>{{ getMobileEventSubtitle(calendarEvent) }}</p>

                <div class="mobile-calendar-event-tags">
                  <span v-if="getMobileEventEpisodeTag(calendarEvent)" class="mobile-calendar-event-tag mobile-calendar-event-tag--primary">
                    {{ getMobileEventEpisodeTag(calendarEvent) }}
                  </span>
                  <span v-if="getMobileEventRuntimeTag(calendarEvent)" class="mobile-calendar-event-tag">
                    {{ getMobileEventRuntimeTag(calendarEvent) }}
                  </span>
                  <span
                    class="mobile-calendar-event-tag"
                    :class="`mobile-calendar-event-tag--library-${calendarEvent.libraryState}`"
                  >
                    {{ getLibraryStateText(calendarEvent.libraryState) }}
                  </span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>
      </div>

      <div v-else class="mobile-calendar-empty">
      <VIcon icon="mdi-calendar-blank-outline" size="44" />
      <h2>{{ t('common.noData') }}</h2>
      <p>{{ t('calendar.noMatchingEvents') }}</p>
      </div>
    </template>
  </div>
</template>

<style lang="scss">
.v-application .fc {
  --fc-today-bg-color: rgba(var(--v-theme-primary), 0.12);
  --fc-border-color: rgba(var(--v-border-color), var(--v-border-opacity));
  --fc-neutral-bg-color: rgb(var(--v-theme-background), 0.3);
  --fc-list-event-hover-bg-color: rgba(var(--v-theme-on-surface), 0.02);
  --fc-page-bg-color: rgb(var(--v-theme-background), 0.3);
  --fc-event-border-color: currentcolor;
}

.v-application .fc a {
  color: inherit;
}

.v-application .fc .fc-timegrid-divider {
  padding: 0;
}

.v-application .fc .fc-toolbar-title {
  display: inline-block;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 1.25rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.v-application .fc .fc-col-header-cell-cushion {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 0.875rem;
  font-weight: 500;
}

.v-application .fc .fc-toolbar .fc-toolbar-title {
  margin-inline-start: 0.25rem;
}

.v-application .fc .fc-event-time {
  font-size: 0.75rem;
  font-weight: 500;
}

.v-application .fc .fc-timegrid-event .fc-event-title {
  font-size: 0.875rem;
  font-weight: 400;
}

.v-application .fc .fc-prev-button {
  padding-inline-start: 0;
}

.v-application .fc .fc-prev-button,
.v-application .fc .fc-next-button {
  padding: 0.25rem;
}

.v-application .fc .fc-col-header .fc-col-header-cell .fc-col-header-cell-cushion {
  padding: 0.5rem;
  text-decoration: none !important;
}

.v-application .fc .fc-timegrid .fc-timegrid-slots .fc-timegrid-slot {
  block-size: 3rem;
}

.v-application .fc .fc-list {
  border-inline-start: none;
  font-size: 0.875rem;
}

.v-application .fc .fc-list .fc-list-day-cushion.fc-cell-shaded {
  background-color: rgba(var(--v-custom-background));
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-weight: 500;
}

.v-application .fc .fc-list .fc-list-event-time,
.v-application .fc .fc-list .fc-list-event-title {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.v-application .fc .fc-list .fc-list-day .fc-list-day-text,
.v-application .fc .fc-list .fc-list-day .fc-list-day-side-text {
  text-decoration: none;
}

.v-application .fc .fc-timegrid-axis {
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
  font-size: 0.75rem;
  text-transform: capitalize;
}

.v-application .fc .fc-timegrid-slot-label-frame {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 0.75rem;
  text-align: center;
  text-transform: uppercase;
}

.v-application .fc .fc-header-toolbar {
  flex-wrap: nowrap;
  row-gap: 0.5rem;
}

.v-application .fc .fc-button-primary {
  border: none;
  background-color: transparent;
  color: var(--v-theme-on-surface);
  outline: none;

  &:hover {
    background-color: transparent;
    color: rgb(var(--v-theme-primary));
  }
}

.v-application .fc .fc-toolbar-chunk .fc-button-group {
  align-items: center;
}

.v-application .fc .fc-toolbar-chunk {
  display: flex;
  align-items: center;
}

.v-application .fc .fc-toolbar-chunk .fc-button-group .fc-button-primary,
.v-application .fc .fc-toolbar-chunk .fc-button-group .fc-button-primary:hover,
.v-application .fc .fc-toolbar-chunk .fc-button-group .fc-button-primary:not(.disabled):active {
  border-color: transparent;
  background-color: transparent;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.v-application .fc .fc-toolbar-chunk:last-child .fc-button-group {
  border: 0.0625rem solid rgba(var(--v-theme-primary), var(--v-overlay-scrim-opacity));
  border-radius: 0.375rem;
}

.v-application .fc .fc-toolbar-chunk:last-child .fc-button-group .fc-button {
  color: rgb(var(--v-theme-primary));
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0.0187rem;
  padding-inline: 1rem;
  text-transform: uppercase;
}

.v-application .fc .fc-toolbar-chunk:last-child .fc-button-group .fc-button:not(:last-child) {
  border-inline-end: 0.0625rem solid rgba(var(--v-theme-primary), var(--v-overlay-scrim-opacity));
}

.v-application .fc .fc-toolbar-chunk:last-child .fc-button-group .fc-button.fc-button-active {
  background-color: rgba(var(--v-theme-primary), var(--v-activated-opacity));
  color: rgb(var(--v-theme-primary));
}

.v-application .fc .fc-scrollgrid-section th {
  border-inline: 0;
}

.v-application .fc .fc-view-harness {
  min-block-size: 40.625rem;
}

.v-application .fc .fc-event,
.v-application .fc .fc-h-event,
.v-application .fc .fc-daygrid-event {
  padding: 0 !important;
  border-color: transparent;
  background: transparent !important;
  box-shadow: none;
  margin-block-end: 0.3rem;
}

.v-application .fc .fc-event-main {
  padding: 0 !important;
  color: inherit;
  font-size: 0.75rem;
  font-weight: 500;
}

.v-application .fc tbody[role='rowgroup'] > tr > td[role='presentation'] {
  border: none;
}

.v-application .fc .fc-scrollgrid {
  border-inline-start: none;
}

.v-application .fc .fc-daygrid-day {
  padding: 0.3125rem;
}

.v-application .fc .fc-daygrid-day-number {
  padding-block: 0;
  padding-inline: 0;
}

.v-application .fc .fc-list-event-dot {
  color: inherit;

  --fc-event-border-color: currentcolor;
}

.v-application .fc .fc-list-event {
  background-color: transparent !important;
}

.v-application .fc .fc-popover .fc-popover-header,
.v-application .fc .fc-popover .fc-popover-body {
  padding: 0.5rem;
}

.v-application .fc .fc-popover .fc-popover-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
}

.v-application .fc .fc-toolbar-chunk .fc-button-group .fc-button .fc-icon {
  vertical-align: bottom;
}

.v-application .fc .fc-toolbar-chunk .fc-button-group .fc-drawerToggler-button {
  display: none;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' stroke='rgba(94,86,105,0.68)' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round' class='css-i6dzq1'%3E%3Cpath d='M3 12h18M3 6h18M3 18h18'/%3E%3C/svg%3E");
  background-position: 50%;
  background-repeat: no-repeat;
  block-size: 1.5625rem;
  font-size: 0;
  inline-size: 1.5625rem;
  margin-inline-end: 0.25rem;
}

@media (width <= 1264px) {
  .v-application .fc .fc-toolbar-chunk .fc-button-group .fc-drawerToggler-button {
    display: block !important;
  }
}

.v-theme--dark .v-application .fc .fc-toolbar-chunk .fc-button-group .fc-drawerToggler-button {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' stroke='rgba(232,232,241,0.68)' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round' class='css-i6dzq1'%3E%3Cpath d='M3 12h18M3 6h18M3 18h18'/%3E%3C/svg%3E");
}

.v-application .fc .fc-col-header,
.v-application .fc .fc-daygrid-body,
.v-application .fc .fc-scrollgrid-sync-table,
.v-application .fc .fc-timegrid-body,
.v-application .fc .fc-timegrid-body table {
  inline-size: 100% !important;
}

.calendars-checkbox .v-label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  opacity: var(--v-high-emphasis-opacity);
}

.calendar-add-event-drawer.v-navigation-drawer:not(.v-navigation-drawer--temporary) {
  border-end-start-radius: 0.375rem;
  border-start-start-radius: 0.375rem;
}

.v-layout[data-v-85990893] {
  overflow: visible !important;
}

.v-layout .v-card[data-v-85990893] {
  overflow: visible;
}

.v-application .fc-v-event {
  border: 0 !important;
  background-color: transparent !important;
}

.calendar-event-card {
  display: flex;
  overflow: hidden;
  align-items: flex-start;
  padding: 0.4rem;
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.72);
  gap: 0.55rem;
}

.calendar-day-events {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  inline-size: 100%;
}

.calendar-expand-card {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px dashed rgba(var(--v-theme-primary), 0.44);
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 700;
  gap: 0.35rem;
  inline-size: 100%;
  min-block-size: 2.1rem;
}

.calendar-expand-card:hover {
  background: rgba(var(--v-theme-primary), 0.14);
}

.calendar-expand-count {
  line-height: 1;
}

.calendar-event-poster {
  position: relative;
  flex: 0 0 56px;
  inline-size: 56px;
}

.calendar-event-image {
  border-radius: 6px;
  block-size: 84px !important;
  inline-size: 56px !important;
}

.calendar-library-check {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(var(--v-theme-surface), 0.5);
  border-radius: 50%;
  background: rgb(var(--v-theme-success));
  block-size: 1.15rem;
  color: rgb(var(--v-theme-on-success));
  inline-size: 1.15rem;
  inset-block-start: 0.18rem;
  inset-inline-end: 0.18rem;
}

.calendar-library-check--mobile {
  block-size: 1rem;
  inline-size: 1rem;
  inset-block-start: 0.12rem;
  inset-inline-end: 0.12rem;
}

.calendar-event-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.2rem;
  min-inline-size: 0;
}

.calendar-event-title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 0.88rem;
  font-weight: 700;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  line-height: 1.28;
  max-block-size: calc(0.88rem * 1.28 * 2);
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-word;
}

.calendar-event-episode {
  display: inline-flex;
  overflow: hidden;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  column-gap: 0.2rem;
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-event-episode,
.calendar-event-time {
  display: inline-flex;
  overflow: hidden;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  column-gap: 0.2rem;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-event-library-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.18rem 0.3rem;
  min-inline-size: 0;
}

.calendar-event-status {
  display: inline-flex;
  align-items: center;
  color: rgb(var(--v-theme-success));
  column-gap: 0.16rem;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.2;
}

.calendar-event-status--none {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.calendar-event-status--partial {
  color: rgb(var(--v-theme-warning));
}

.calendar-event-time {
  font-size: 0.64rem;
}

.calendar-event-status,
.calendar-event-time {
  overflow: hidden;
  max-inline-size: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-mobile-image {
  border-radius: 6px;
  block-size: clamp(60px, 8.7vw, 96px) !important;
  inline-size: clamp(40px, 5.8vw, 64px) !important;
}

.calendar-mobile-episode {
  position: absolute;
  display: block;
  overflow: hidden;
  background: rgba(0, 0, 0, 58%);
  color: #fff;
  font-size: 0.62rem;
  font-weight: 700;
  inset-block-end: 0;
  inset-inline: 0;
  line-height: 1.25;
  padding-block: 0.1rem;
  padding-inline: 0.2rem;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (width <= 1279px) {
  .calendar-day-events {
    align-items: center;
  }

  .calendar-event-card,
  .fc-daygrid-event-harness {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .calendar-expand-card {
    flex-direction: column;
    block-size: clamp(60px, 8.7vw, 96px);
    gap: 0.12rem;
    inline-size: clamp(40px, 5.8vw, 64px);
    min-block-size: 0;
  }

  .calendar-expand-count {
    font-size: 0.68rem;
  }
}

.mobile-subscribe-calendar {
  color: rgba(var(--v-theme-on-background), var(--v-high-emphasis-opacity));
  inline-size: 100%;
  padding-block: 0.75rem calc(5rem + env(safe-area-inset-bottom, 0px));
  padding-inline: clamp(0.75rem, 4vw, 1.5rem);

  --mobile-calendar-control-bg: rgba(var(--v-theme-on-surface), 0.08);
  --mobile-calendar-event-bg-opacity: 0.92;
  --mobile-calendar-placeholder-bg: rgba(var(--v-theme-on-surface), 0.08);
  --mobile-calendar-surface-bg-opacity: 0.9;
  --mobile-calendar-surface-blur: none;
}

.mobile-calendar-filter-card {
  backdrop-filter: var(--mobile-calendar-surface-blur);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-surface), var(--mobile-calendar-surface-bg-opacity));
  box-shadow: var(--app-surface-shadow);
  margin-block-end: 1.8rem;
  padding-block: 1rem;
  padding-inline: 1rem;
}

.mobile-calendar-filter-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-block-end: 0.85rem;
}

.mobile-calendar-filter-copy {
  min-inline-size: 0;
}

.mobile-calendar-filter-copy h2 {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 1rem;
  font-weight: 800;
  line-height: 1.35;
  margin: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-calendar-filter-copy span {
  display: block;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.82rem;
  font-weight: 700;
  margin-block-start: 0.15rem;
}

.mobile-calendar-expired-toggle {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.72);
  cursor: pointer;
  font-size: 0.86rem;
  font-weight: 700;
  gap: 0.28rem;
  line-height: 1.2;
  min-block-size: 1.75rem;
}

.mobile-calendar-expired-toggle--active {
  color: rgb(var(--v-theme-primary));
}

.mobile-calendar-filter-list {
  display: flex;
  gap: 0.6rem;
  margin-inline: -0.15rem;
  overflow-x: auto;
  padding-block: 0.05rem;
  padding-inline: 0.15rem;
  scrollbar-width: none;
}

.mobile-calendar-filter-list::-webkit-scrollbar {
  display: none;
}

.mobile-calendar-filter-chip {
  display: inline-flex;
  overflow: hidden;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  max-inline-size: min(68vw, 18rem);
  min-block-size: 2.45rem;
  padding-block: 0;
  padding-inline: 1rem;
  border: 0;
  border-radius: var(--app-control-radius);
  background: var(--mobile-calendar-control-bg);
  color: rgba(var(--v-theme-on-surface), 0.72);
  cursor: pointer;
  font-size: 0.86rem;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-calendar-filter-chip--active {
  background: rgba(var(--v-theme-primary), 0.18);
  color: rgb(var(--v-theme-primary));
}

.mobile-calendar-timeline {
  position: relative;
}

.mobile-calendar-day {
  position: relative;
  display: grid;
  grid-template-columns: 1.8rem minmax(0, 1fr);
  column-gap: 0.35rem;
}

.mobile-calendar-day + .mobile-calendar-day {
  margin-block-start: 1.4rem;
}

.mobile-calendar-day-marker {
  position: relative;
  display: flex;
  justify-content: center;
  padding-block-start: 3.25rem;
}

.mobile-calendar-day-marker::before {
  position: absolute;
  background: rgba(var(--v-theme-on-surface), 0.14);
  content: '';
  inline-size: 2px;
  inset-block: 3.85rem -1.4rem;
  inset-inline-start: 50%;
  transform: translateX(-50%);
}

.mobile-calendar-day:last-child .mobile-calendar-day-marker::before {
  inset-block-end: 1.2rem;
}

.mobile-calendar-day-dot {
  position: relative;
  z-index: 1;
  border: 2px solid rgba(var(--v-theme-background), 1);
  border-radius: 999px;
  background: rgb(var(--v-theme-primary));
  block-size: 0.78rem;
  inline-size: 0.78rem;
  outline: 4px solid rgba(var(--v-theme-primary), 0.18);
}

.mobile-calendar-day-dot--today {
  background: rgb(var(--v-theme-primary));
  outline: 5px solid rgba(var(--v-theme-primary), 0.22);
}

.mobile-calendar-day-body {
  min-inline-size: 0;
}

.mobile-calendar-day-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  min-block-size: 2.8rem;
  margin-block-end: 0.75rem;
}

.mobile-calendar-day-title-wrap {
  position: relative;
  min-inline-size: 0;
  padding-inline-start: 0.35rem;
}

.mobile-calendar-day-title-wrap::before {
  position: absolute;
  border-radius: 999px;
  background: rgb(var(--v-theme-primary));
  block-size: 2.05rem;
  content: '';
  inline-size: 4px;
  inset-block-start: 0.1rem;
  inset-inline-start: -0.35rem;
}

.mobile-calendar-day-title-wrap h2 {
  overflow: hidden;
  color: rgb(var(--v-theme-primary));
  font-size: 1.08rem;
  font-weight: 900;
  line-height: 1.18;
  margin: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-calendar-day-title-wrap span,
.mobile-calendar-day-count {
  color: rgba(var(--v-theme-on-background), 0.72);
  font-size: 0.86rem;
  font-weight: 700;
  line-height: 1.25;
}

.mobile-calendar-day-count {
  flex: 0 0 auto;
  padding-block-end: 0.12rem;
}

.mobile-calendar-event-list {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.mobile-calendar-event-card {
  position: relative;
  display: grid;
  overflow: hidden;
  grid-template-columns: clamp(5.2rem, 24vw, 6.6rem) minmax(0, 1fr);
  align-items: center;
  backdrop-filter: var(--mobile-calendar-surface-blur);
  border-radius: var(--app-surface-radius);
  background: rgba(var(--v-theme-surface), var(--mobile-calendar-event-bg-opacity));
  box-shadow: var(--app-surface-shadow);
  column-gap: 1rem;
  min-block-size: 9.1rem;
  padding-block: 0.85rem;
  padding-inline: 0.85rem 1rem;
}

.mobile-calendar-event-poster-wrap {
  position: relative;
  align-self: stretch;
  min-block-size: 7.4rem;
}

.mobile-calendar-event-poster {
  border-radius: var(--app-control-radius);
  block-size: 100% !important;
  inline-size: 100% !important;
}

.mobile-calendar-event-poster-placeholder,
.mobile-calendar-event-poster-error {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--mobile-calendar-placeholder-bg);
  block-size: 100%;
  color: rgba(var(--v-theme-on-surface), 0.55);
  inline-size: 100%;
}

.mobile-calendar-event-poster-error {
  flex-direction: column;
  font-size: 0.74rem;
  font-weight: 700;
  gap: 0.3rem;
}

.mobile-calendar-poster-episode {
  position: absolute;
  overflow: hidden;
  border-end-end-radius: var(--app-control-radius);
  border-end-start-radius: var(--app-control-radius);
  background: rgba(0, 0, 0, 68%);
  color: #fff;
  font-size: 0.72rem;
  font-weight: 900;
  inset-block-end: 0;
  inset-inline: 0;
  line-height: 1.1;
  padding-block: 0.28rem;
  padding-inline: 0.35rem;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-calendar-event-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.55rem;
  min-inline-size: 0;
}

.mobile-calendar-event-title-row {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  min-inline-size: 0;
}

.mobile-calendar-event-title-row h3 {
  display: -webkit-box;
  overflow: hidden;
  flex: 1 1 auto;
  -webkit-box-orient: vertical;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 1.05rem;
  font-weight: 900;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  line-height: 1.28;
  margin: 0;
  overflow-wrap: anywhere;
}

.mobile-calendar-date-badge {
  flex: 0 0 auto;
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-primary), 0.14);
  color: rgb(var(--v-theme-primary));
  font-size: 0.78rem;
  font-weight: 900;
  line-height: 1;
  padding-block: 0.38rem;
  padding-inline: 0.58rem;
  white-space: nowrap;
}

.mobile-calendar-date-badge--today {
  background: rgba(var(--v-theme-success), 0.16);
  color: rgb(var(--v-theme-success));
}

.mobile-calendar-date-badge--upcoming {
  background: rgba(var(--v-theme-warning), 0.16);
  color: rgb(var(--v-theme-warning));
}

.mobile-calendar-date-badge--expired {
  background: rgba(var(--v-theme-error), 0.16);
  color: rgb(var(--v-theme-error));
}

.mobile-calendar-event-content p {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  color: rgba(var(--v-theme-on-surface), 0.86);
  font-size: 0.92rem;
  font-weight: 700;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  line-height: 1.35;
  margin: 0;
  overflow-wrap: anywhere;
}

.mobile-calendar-event-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  min-inline-size: 0;
}

.mobile-calendar-event-tag {
  display: inline-flex;
  overflow: hidden;
  align-items: center;
  max-inline-size: 100%;
  border-radius: var(--app-control-radius);
  background: rgba(var(--v-theme-on-surface), 0.09);
  color: rgba(var(--v-theme-on-surface), 0.74);
  font-size: 0.76rem;
  font-weight: 800;
  line-height: 1;
  min-block-size: 1.7rem;
  padding-block: 0;
  padding-inline: 0.65rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-calendar-event-tag--primary {
  background: rgba(var(--v-theme-primary), 0.18);
  color: rgb(var(--v-theme-primary));
}

.mobile-calendar-event-tag--library-complete {
  background: rgba(var(--v-theme-success), 0.16);
  color: rgb(var(--v-theme-success));
}

.mobile-calendar-event-tag--library-partial {
  background: rgba(var(--v-theme-warning), 0.16);
  color: rgb(var(--v-theme-warning));
}

.mobile-calendar-event-tag--library-none {
  background: rgba(var(--v-theme-on-surface), 0.09);
  color: rgba(var(--v-theme-on-surface), 0.68);
}

.mobile-calendar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-background), 0.66);
  min-block-size: 18rem;
  text-align: center;
}

.mobile-calendar-empty h2 {
  color: rgba(var(--v-theme-on-background), var(--v-high-emphasis-opacity));
  font-size: 1.1rem;
  margin-block: 0.75rem 0.3rem;
}

.mobile-calendar-empty p {
  margin: 0;
}

html[data-theme='transparent'] .mobile-subscribe-calendar,
.v-theme--transparent .mobile-subscribe-calendar {
  --mobile-calendar-control-bg: rgba(var(--v-theme-surface), var(--transparent-opacity-light, 0.2));
  --mobile-calendar-event-bg-opacity: var(--transparent-opacity-light, 0.2);
  --mobile-calendar-placeholder-bg: rgba(var(--v-theme-surface), var(--transparent-opacity, 0.3));
  --mobile-calendar-surface-bg-opacity: var(--transparent-opacity-light, 0.2);
  --mobile-calendar-surface-blur: blur(var(--transparent-blur, 10px));
}

@media (width <= 420px) {
  .mobile-subscribe-calendar {
    padding-inline: 0.75rem;
  }

  .mobile-calendar-filter-card {
    padding-inline: 0.9rem;
  }

  .mobile-calendar-event-card {
    grid-template-columns: 4.9rem minmax(0, 1fr);
    column-gap: 0.85rem;
    min-block-size: 8.6rem;
    padding: 0.75rem;
  }

  .mobile-calendar-event-title-row h3 {
    font-size: 1rem;
  }

  .mobile-calendar-event-content p {
    font-size: 0.88rem;
  }

  .mobile-calendar-event-tag {
    font-size: 0.72rem;
    min-block-size: 1.6rem;
    padding-inline: 0.55rem;
  }
}
</style>
