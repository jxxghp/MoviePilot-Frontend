<script lang="ts" setup>
import type { CalendarOptions, EventSourceInput } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import timeGridPlugin from '@fullcalendar/timegrid'
import FullCalendar from '@fullcalendar/vue3'
import type { Ref } from 'vue'
import type { MediaInfo, Subscribe, TmdbEpisode } from '@/api/types'
import api from '@/api'
import { formatDateDifference, formatEp, parseDate } from '@/@core/utils/formatters'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { getCurrentLocale } from '@/plugins/i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'

const ProgressDialog = defineAsyncComponent(() => import('@/components/dialog/ProgressDialog.vue'))

// 国际化
const { t } = useI18n()

// 跟随 Vuetify 断点，MD 及以下使用小屏海报模式。
const display = useDisplay()

// 加载中
const loading = ref(false)

// 已加载过
const isLoaded = ref(false)

// 获取当前语言
const currentLocale = getCurrentLocale().split('-')[0]

let progressDialogController: ReturnType<typeof openSharedDialog> | null = null

type CalendarLibraryState = 'none' | 'partial' | 'complete'

interface CalendarEventInfo {
  title: string
  subtitle: string
  start: Date | null
  allDay: boolean
  posterPath: string | undefined
  mediaType: string
  len: number
  episodeNumbers: number[]
  libraryEpisode: number
  lackEpisode: number
  totalEpisode: number
  libraryEpisodeNumbers: number[]
  libraryState: CalendarLibraryState
  libraryUpdateText: string
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
  // 日历页需要完整展示每天所有订阅条目，避免折叠成 "+ more" 后隐藏关键信息。
  dayMaxEvents: false,
  dayMaxEventRows: false,
  eventDisplay: 'block',
  views: {
    week: {
      titleFormat: { day: 'numeric' },
    },
  },
  events: [],
})

function clampEpisodeCount(value: number, total: number) {
  return Math.min(Math.max(value, 0), total)
}

function getLibraryEpisodeCount(subscribe: Subscribe) {
  const totalEpisode = subscribe.total_episode || 0
  if (!totalEpisode) return 0

  const libraryEpisode =
    typeof subscribe.lack_episode === 'number'
      ? totalEpisode - subscribe.lack_episode
      : subscribe.completed_episode ?? 0

  return clampEpisodeCount(libraryEpisode, totalEpisode)
}

function getLackEpisodeCount(subscribe: Subscribe) {
  const totalEpisode = subscribe.total_episode || 0
  if (!totalEpisode) return 0

  return clampEpisodeCount(subscribe.lack_episode ?? totalEpisode - getLibraryEpisodeCount(subscribe), totalEpisode)
}

function normalizeEpisodeNumbers(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map(number => Number(number))
    .filter(number => Number.isFinite(number) && number > 0)
}

function isEnabledFlag(value: unknown) {
  return value === true || value === 1 || value === '1'
}

function getLibraryEpisodeNumbers(subscribe: Subscribe) {
  if (isEnabledFlag(subscribe.best_version)) {
    return Object.entries(subscribe.episode_priority || {})
      .filter(([episode, priority]) => Number.isFinite(Number(episode)) && priority === 100)
      .map(([episode]) => Number(episode))
  }

  return normalizeEpisodeNumbers(subscribe.note)
}

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

function buildCalendarEventInfo(
  subscribe: Subscribe,
  payload: Pick<CalendarEventInfo, 'subtitle' | 'start' | 'episodeNumbers' | 'len'>,
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
    totalEpisode,
    libraryEpisode,
    lackEpisode,
    libraryEpisodeNumbers,
    libraryState: getLibraryState(payload.episodeNumbers, libraryEpisode, libraryEpisodeNumbers),
    libraryUpdateText: libraryEpisode > 0 && subscribe.last_update ? formatDateDifference(subscribe.last_update) : '',
    ...payload,
  }
}

function getCalendarEventTooltip(event: any) {
  const props = event.extendedProps as CalendarEventInfo
  const parts = [event.title]

  if (props.subtitle) parts.push(t('calendar.episode', { number: props.subtitle }))
  if (props.totalEpisode) {
    parts.push(t('calendar.libraryProgress', { completed: props.libraryEpisode, total: props.totalEpisode }))
  }
  if (props.libraryUpdateText) parts.push(t('calendar.libraryUpdatedAt', { time: props.libraryUpdateText }))

  return parts.filter(Boolean).join(' · ')
}

function getLibraryStateText(state: CalendarLibraryState) {
  if (state === 'complete') return t('calendar.currentEpisodeInLibrary')
  if (state === 'partial') return t('calendar.currentEpisodePartiallyInLibrary')
  return t('calendar.currentEpisodeNotInLibrary')
}

function getLibraryStateIcon(state: CalendarLibraryState) {
  if (state === 'none') return 'mdi-minus-circle-outline'
  return 'mdi-check-circle-outline'
}

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
      episodeNumbers: [],
    })
  } else {
    // 调用API查询集信息
    const params = subscribe.episode_group ? { episode_group: subscribe.episode_group } : undefined
    const episodes: TmdbEpisode[] = await api.get(
      `tmdb/${subscribe.tmdbid}/${subscribe.season}`,
      params ? { params } : undefined,
    )

    interface EpisodesDictionary {
      [key: string]: CalendarEventInfo
    }

    const dictEpisode: EpisodesDictionary = {}
    episodes.forEach((episode: TmdbEpisode) => {
      const air_date = episode.air_date ?? ''
      const episodeNumber = episode.episode_number || 0
      if (dictEpisode[air_date]) {
        dictEpisode[air_date].episodeNumbers.push(episodeNumber)
        dictEpisode[air_date].len++
      } else {
        dictEpisode[air_date] = buildCalendarEventInfo(subscribe, {
          subtitle: '',
          start: parseDate(episode.air_date || ''),
          len: 1,
          episodeNumbers: [episodeNumber],
        })
      }
    })
    for (const key in dictEpisode) {
      const episodeNumbers = dictEpisode[key].episodeNumbers.filter(number => Number.isFinite(number) && number > 0)
      dictEpisode[key].subtitle = formatEp(episodeNumbers)
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
  if (!isLoaded.value) openProgressDialog()
  try {
    // 订阅
    loading.value = true
    const subscribes: Subscribe[] = await api.get('subscribe/')
    loading.value = false
    const subEvents = await Promise.allSettled(subscribes.map(async sub => eventsHander(sub)))
    const succEvents = subEvents.filter(result => result.status === 'fulfilled').map(result => result.value)
    calendarOptions.value.events = succEvents.flat().filter(event => event.start) as EventSourceInput
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
  <FullCalendar :options="calendarOptions">
    <template #eventContent="arg">
      <div v-if="display.lgAndUp.value">
        <div
          class="calendar-event-card"
          :class="`calendar-event-card--${arg.event.extendedProps.libraryState}`"
          :title="getCalendarEventTooltip(arg.event)"
        >
          <div class="calendar-event-poster">
            <VImg
              height="74"
              width="50"
              :src="arg.event.extendedProps.posterPath"
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
            <span
              v-if="arg.event.extendedProps.libraryState === 'complete'"
              class="calendar-library-check"
            >
              <VIcon icon="mdi-check" size="12" />
            </span>
          </div>

          <div class="calendar-event-content">
            <div class="calendar-event-title">
              {{ arg.event.title }}
            </div>
            <div v-if="arg.event.extendedProps.subtitle" class="calendar-event-episode">
              <VIcon icon="mdi-calendar-blank-outline" size="13" />
              {{ t('calendar.episode', { number: arg.event.extendedProps.subtitle }) }}
            </div>
            <div v-if="arg.event.extendedProps.totalEpisode" class="calendar-event-library-row">
              <span
                v-if="arg.event.extendedProps.libraryState !== 'complete'"
                class="calendar-event-status"
                :class="`calendar-event-status--${arg.event.extendedProps.libraryState}`"
              >
                <VIcon :icon="getLibraryStateIcon(arg.event.extendedProps.libraryState)" size="13" />
                {{ getLibraryStateText(arg.event.extendedProps.libraryState) }}
              </span>
              <span class="calendar-event-progress">
                <VIcon icon="mdi-library" size="13" />
                {{
                  t('calendar.libraryProgress', {
                    completed: arg.event.extendedProps.libraryEpisode,
                    total: arg.event.extendedProps.totalEpisode,
                  })
                }}
              </span>
            </div>
            <div v-if="arg.event.extendedProps.libraryUpdateText" class="calendar-event-time">
              <VIcon icon="mdi-clock-outline" size="13" />
              {{ t('calendar.libraryUpdatedAtShort', { time: arg.event.extendedProps.libraryUpdateText }) }}
            </div>
          </div>
        </div>
      </div>
      <div v-else>
        <VImg
          :src="arg.event.extendedProps.posterPath"
          aspect-ratio="2/3"
          class="calendar-mobile-image object-cover ring-gray-500"
          cover
          :title="getCalendarEventTooltip(arg.event)"
        >
          <template #placeholder>
            <div class="w-full h-full">
              <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
            </div>
          </template>
          <span
            v-if="arg.event.extendedProps.libraryState === 'complete'"
            class="calendar-library-check calendar-library-check--mobile"
          >
            <VIcon icon="mdi-check" size="11" />
          </span>
          <span v-if="arg.event.extendedProps.subtitle" class="calendar-mobile-episode">
            {{ arg.event.extendedProps.subtitle }}
          </span>
        </VImg>
      </div>
    </template>
  </FullCalendar>
</template>

<style lang="scss">
.v-application .fc {
  --fc-today-bg-color: rgba(var(--v-theme-on-surface), 0.04);
  --fc-border-color: rgba(var(--v-border-color), var(--v-border-opacity));
  --fc-neutral-bg-color: rgb(var(--v-theme-background), 0.3);
  --fc-list-event-hover-bg-color: rgba(var(--v-theme-on-surface), 0.02);
  --fc-page-bg-color: rgb(var(--v-theme-background), 0.3);
  --fc-event-border-color: currentcolor;
}

// 当天背景渐变
.fc-day-today {
  background-image: linear-gradient(to bottom, #af85fd, rgba(var(--v-theme-on-surface), 0.04));
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
  border-color: transparent;
  background: transparent !important;
  box-shadow: none;
  margin-block-end: 0.3rem;
  padding: 0 !important;
}

.v-application .fc .fc-event-main {
  color: inherit;
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0 !important;
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
  gap: 0.55rem;
  align-items: flex-start;
  padding: 0.4rem;
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.72);
  overflow: hidden;
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
  top: 0.18rem;
  right: 0.18rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgb(var(--v-theme-surface));
  border-radius: 50%;
  background: rgb(var(--v-theme-success));
  block-size: 1.15rem;
  color: rgb(var(--v-theme-on-success));
  inline-size: 1.15rem;
}

.calendar-library-check--mobile {
  top: 0.12rem;
  right: 0.12rem;
  block-size: 1rem;
  inline-size: 1rem;
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
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1.28;
  max-block-size: calc(0.88rem * 1.28 * 2);
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-word;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.calendar-event-episode {
  display: inline-flex;
  align-items: center;
  overflow: hidden;
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
  align-items: center;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  column-gap: 0.2rem;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-event-library-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.18rem 0.3rem;
  align-items: center;
  min-inline-size: 0;
}

.calendar-event-status,
.calendar-event-progress {
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

.calendar-event-progress {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.calendar-event-time {
  font-size: 0.64rem;
}

.calendar-event-status,
.calendar-event-progress,
.calendar-event-time {
  max-inline-size: 100%;
  overflow: hidden;
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
  right: 0;
  bottom: 0;
  left: 0;
  display: block;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.58);
  color: #fff;
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 1.25;
  padding-block: 0.1rem;
  padding-inline: 0.2rem;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (width <= 1279px) {
  .fc-daygrid-event-harness {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
