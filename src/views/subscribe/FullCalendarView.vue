<script lang='ts' setup>
import type { CalendarOptions, EventSourceInput } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import timeGridPlugin from '@fullcalendar/timegrid'
import FullCalendar from '@fullcalendar/vue3'
import type { Ref } from 'vue'
import type { MediaInfo, Subscribe, TmdbEpisode } from '@/api/types'
import api from '@/api'
import { formatEp, parseDate } from '@/@core/utils/formatters'

// 日历属性
const calendarOptions: Ref<CalendarOptions> = ref({
  height: 'auto',
  locale: 'zh-cn',
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
  views: {
    week: {
      titleFormat: { day: 'numeric' },
    },
  },
  events: [],
})

async function eventsHander(subscribe: Subscribe) {
  // 如果是电影直接返回
  if (subscribe.type === '电影') {
    // 调用API查询TMDB详情
    const movie: MediaInfo = await api.get(`media/tmdb:${subscribe.tmdbid}`, {
      params: { type_name: subscribe.type },
    })

    return {
      title: subscribe.name,
      subtitle: '',
      start: parseDate(movie.release_date || ''),
      allDay: false,
      posterPath: subscribe.poster,
      mediaType: subscribe.type,
      len: 1,
    }
  }
  else {
    // 调用API查询集信息
    const episodes: TmdbEpisode[] = await api.get(
      `tmdb/${subscribe.tmdbid}/${subscribe.season}`,
    )

    interface EpisodeInfo {
      title: string
      subtitle: string
      start: Date | null
      allDay: boolean
      posterPath: string | undefined
      mediaType: string
      len: number
    }

    interface EpisodesDictionary {
      [key: string]: EpisodeInfo
    }

    const dictEpisode: EpisodesDictionary = {}
    episodes.forEach((episode: TmdbEpisode) => {
      const air_date = episode.air_date ?? ''
      if (dictEpisode[air_date]) {
        dictEpisode[air_date].subtitle += `,${episode.episode_number}`
        dictEpisode[air_date].len++
      }
      else {
        dictEpisode[air_date] = {
          title: subscribe.name,
          subtitle: `${episode.episode_number}`,
          start: parseDate(episode.air_date || ''),
          allDay: false,
          posterPath: subscribe.poster,
          mediaType: subscribe.type,
          len: 1,
        }
      }
    })
    for (const key in dictEpisode)
      dictEpisode[key].subtitle = formatEp(dictEpisode[key].subtitle.split(',').map(Number))

    return Object.values(dictEpisode)
  }
}

// 调用API查询所有订阅
async function getSubscribes() {
  try {
    // 订阅
    const subscribes: Subscribe[] = await api.get('subscribe/')

    const subEvents = await Promise.all(
      subscribes.map(async sub => eventsHander(sub)),
    )

    calendarOptions.value.events = subEvents.flat().filter(event => event.start) as EventSourceInput
  }
  catch (error) {
    console.error(error)
  }
}

// 页面加载时调用API查询所有订阅
onMounted(() => {
  getSubscribes()
})
</script>

<template>
  <FullCalendar :options="calendarOptions">
    <template #eventContent="arg">
      <div class="hidden md:block overflow-hidden">
        <VCard>
          <div class="d-flex justify-space-between flex-nowrap flex-row">
            <div class="ma-auto">
              <VImg
                height="75"
                width="50"
                :src="arg.event.extendedProps.posterPath"
                aspect-ratio="2/3"
                class="object-cover rounded shadow ring-gray-500"
                cover
              >
                <template #placeholder>
                  <div class="w-full h-full">
                    <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                  </div>
                </template>
              </VImg>
            </div>
            <div>
              <VCardSubtitle class="pa-1 px-2 font-bold break-words whitespace-break-spaces">
                {{ arg.event.title }}
              </VCardSubtitle>
              <VCardText v-if="arg.event.extendedProps.subtitle" class="pa-0 px-2 break-words">
                第{{ arg.event.extendedProps.subtitle }}集
              </VCardText>
            </div>
          </div>
        </VCard>
      </div>
      <div class="md:hidden">
        <VTooltip :text="`${arg.event.title} 第 ${arg.event.extendedProps.subtitle} 集`">
          <template #activator="{ props }">
            <VImg
              height="60"
              width="40"
              :src="arg.event.extendedProps.posterPath"
              v-bind="props"
              aspect-ratio="2/3"
              class="object-cover rounded shadow ring-gray-500"
              cover
            >
              <template #placeholder>
                <div class="w-full h-full">
                  <VSkeletonLoader class="object-cover aspect-w-2 aspect-h-3" />
                </div>
              </template>
              <VChip
                v-if="arg.event.extendedProps.len > 1"
                variant="elevated"
                color="primary"
                size="x-small"
                class="absolute right-0 top-0"
              >
                {{ arg.event.extendedProps.len }}
              </VChip>
            </VImg>
          </template>
        </VTooltip>
      </div>
    </template>
  </FullCalendar>
</template>

<style lang='scss'>
.v-application .fc {
  --fc-today-bg-color: rgba(var(--v-theme-on-surface), 0.04);
  --fc-border-color: rgba(var(--v-border-color), var(--v-border-opacity));
  --fc-neutral-bg-color: rgb(var(--v-theme-background));
  --fc-list-event-hover-bg-color: rgba(var(--v-theme-on-surface), 0.02);
  --fc-page-bg-color: rgb(var(--v-theme-surface));
  --fc-event-border-color: currentcolor;
}

// 当天背景渐变
.fc-day-today {
  background-image: linear-gradient(to bottom, #AF85FD ,rgba(var(--v-theme-on-surface), 0.04));
}

.v-application .fc a {
  color: inherit;
}

.v-application .fc .fc-timegrid-divider {
  padding: 0;
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

.v-application .fc .fc-toolbar-chunk {
  display: flex;
  align-items: center;
}

.v-application .fc .fc-toolbar-chunk .fc-button-group .fc-button-primary,
.v-application .fc .fc-toolbar-chunk .fc-button-group .fc-button-primary:hover,
.v-application
.fc
.fc-toolbar-chunk
.fc-button-group
.fc-button-primary:not(.disabled):active {
  border-color: transparent;
  background-color: transparent;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.v-application .fc .fc-toolbar-chunk .fc-button-group .fc-button-primary:focus {
  box-shadow: none !important;
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

.v-application
.fc
.fc-toolbar-chunk:last-child
.fc-button-group
.fc-button:not(:last-child) {
  border-inline-end: 0.0625rem solid rgba(var(--v-theme-primary), var(--v-overlay-scrim-opacity));
}

.v-application
.fc
.fc-toolbar-chunk:last-child
.fc-button-group
.fc-button.fc-button-active {
  background-color: rgba(var(--v-theme-primary), var(--v-activated-opacity));
  color: rgb(var(--v-theme-primary));
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

.v-application .fc .fc-scrollgrid-section th {
  border-inline: 0;
}

.v-application .fc .fc-view-harness {
  min-block-size: 40.625rem;
}

.v-application .fc .fc-event {
  border-color: transparent;
  margin-block-end: 0.3rem;
  padding-inline: 0.3125rem;
}

.v-application .fc .fc-event-main {
  color: inherit;
  font-size: 0.75rem;
  font-weight: 500;
  padding-inline: 0.25rem;
}

.v-application .fc tbody[role="rowgroup"] > tr > td[role="presentation"] {
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

.v-application .fc .fc-popover {
  border-radius: 6px;
  box-shadow: 0 4px 14px -4px var(--v-shadow-key-umbra-opacity),
  0 4px 8px -4px var(--v-shadow-key-penumbra-opacity),
  0 4px 8px -4px var(--v-shadow-key-ambient-opacity);
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

.v-application .fc .fc-toolbar-chunk .fc-button-group {
  align-items: center;
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

.v-theme--dark
.v-application
.fc
.fc-toolbar-chunk
.fc-button-group
.fc-drawerToggler-button {
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
  background-color: transparent;
}

.v-application .fc .fc-button-primary {
  border: none;
  background-color: transparent;
  color: var(--v-theme-on-surface);
  outline: none;
}

.v-application .fc .fc-button-primary:hover {
  background-color: transparent;
  color: rgb(var(--v-theme-primary));
}

@media (width <= 776px) {
  .fc-daygrid-event-harness {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
