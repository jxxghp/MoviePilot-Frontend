import type { MediaInfo, Subscribe } from '@/api/types'
import FullCalendarView from '@/views/subscribe/FullCalendarView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { createMediaInfo, createTmdbEpisode } from '@tests/support/factories/media'
import { createSubscribe } from '@tests/support/factories/subscribe'
import { mediaDetailsHandler, tmdbSeasonEpisodesHandler } from '@tests/support/msw/handlers/media'
import { subscribeApiUrls, subscribeListHandler } from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http } from 'msw'
import { apiJson } from '@tests/support/msw/response'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getEventById: vi.fn(),
  openSharedDialog: vi.fn(),
  setExtendedProp: vi.fn(),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@fullcalendar/vue3', async () => {
  const { defineComponent, h } = await import('vue')

  return {
    default: defineComponent({
      name: 'FullCalendarTestDouble',
      props: {
        options: {
          required: true,
          type: Object,
        },
      },
      setup(props, { expose, slots }) {
        const getEventById = (id: string) => {
          mocks.getEventById(id)
          const options = props.options as { events?: Record<string, unknown>[] }
          const event = options.events?.find(item => item.id === id)
          if (!event) return undefined

          return {
            setExtendedProp(key: string, value: unknown) {
              mocks.setExtendedProp(id, key, value)
              event[key] = value
            },
          }
        }

        expose({
          getApi: () => ({ getEventById }),
        })

        return () => {
          const options = props.options as { events?: Record<string, unknown>[] }
          const events = Array.isArray(options.events) ? options.events : []

          return h(
            'div',
            { 'data-testid': 'full-calendar' },
            events.map(event =>
              h(
                'section',
                { 'data-calendar-event-id': String(event.id) },
                slots.eventContent?.({
                  event: {
                    extendedProps: event,
                    id: event.id,
                  },
                }),
              ),
            ),
          )
        }
      },
    }),
  }
})

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width, writable: true })
  window.dispatchEvent(new Event('resize'))
}

function queryMobileCalendarEventCard(title: string) {
  return (
    Array.from(document.querySelectorAll<HTMLElement>('.mobile-calendar-event-card')).find(card =>
      card.title.startsWith(title),
    ) ?? null
  )
}

function movieSubscribe(id: number, name: string, overrides: Partial<Subscribe> = {}) {
  return createSubscribe({
    id,
    media_id: String(id),
    media_source: 'themoviedb',
    name,
    type: '电影',
    username: `user-${id}`,
    ...overrides,
  })
}

function tvSubscribe(id: number, name: string, overrides: Partial<Subscribe> = {}) {
  return createSubscribe({
    id,
    name,
    season: 1,
    media_id: String(id),
    media_source: 'themoviedb',
    total_episode: 4,
    type: '电视剧',
    username: `user-${id}`,
    ...overrides,
  })
}

async function renderCalendar(component = FullCalendarView) {
  return renderWithProviders(component, { initialRoute: '/calendar' })
}

function keepAliveHarness() {
  return defineComponent({
    components: { FullCalendarView },
    setup() {
      const active = ref(true)
      return { active }
    },
    template: `
      <button type="button" @click="active = false">停用日历</button>
      <button type="button" @click="active = true">启用日历</button>
      <KeepAlive><FullCalendarView v-if="active" /></KeepAlive>
    `,
  })
}

function sequenceSubscribeList(responses: Array<{ body: Subscribe[]; status?: number }>, onRequest = vi.fn()) {
  let index = 0
  return http.get(subscribeApiUrls.list, () => {
    onRequest()
    const response = responses[Math.min(index, responses.length - 1)]
    index += 1
    if ((response.status ?? 200) >= 400) return HttpResponse.json(response.body, { status: response.status })
    return apiJson(response.body, { status: response.status ?? 200 })
  })
}

describe('FullCalendarView', () => {
  beforeEach(() => {
    setViewport(1280)
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('maps movie and TV requests into ordered desktop calendar events', async () => {
    const earlyMovie = movieSubscribe(3101, '较早电影')
    const tv = tvSubscribe(3102, 'Zulu剧集', {
      episode_group: 'group-a',
      lack_episode: 2,
      note: [1],
    })
    const sameDayMovie = movieSubscribe(3103, 'Alpha电影')
    const movieRequest = vi.fn<(url: URL) => void>()
    const tvRequest = vi.fn<(url: URL) => void>()
    const progressClose = vi.fn()
    mocks.openSharedDialog.mockReturnValue({ close: progressClose, id: 1, updateProps: vi.fn() })
    server.use(
      subscribeListHandler([tv, sameDayMovie, earlyMovie]),
      mediaDetailsHandler(
        3101,
        createMediaInfo({ release_date: '2026-07-20', runtime: 121, title: earlyMovie.name, tmdb_id: 3101 }),
        200,
        movieRequest,
      ),
      mediaDetailsHandler(
        3103,
        createMediaInfo({ release_date: '2026-07-21', runtime: 110, title: sameDayMovie.name, tmdb_id: 3103 }),
      ),
      tmdbSeasonEpisodesHandler(
        3102,
        1,
        [
          createTmdbEpisode({ air_date: '2026-07-21', episode_number: 1, name: '第一集', runtime: 45 }),
          createTmdbEpisode({ air_date: '2026-07-21', episode_number: 2, name: '第二集', runtime: 48 }),
        ],
        200,
        tvRequest,
      ),
    )

    await renderCalendar()

    expect(await screen.findByText('较早电影')).toBeInTheDocument()
    expect(await screen.findByText('Zulu剧集')).toBeInTheDocument()
    expect(screen.getByText('Alpha电影')).toBeInTheDocument()
    expect(screen.getByText('第1-2集')).toBeInTheDocument()
    expect(screen.getByText('部分入库 (2/4)')).toBeInTheDocument()
    expect(document.querySelector('.calendar-event-card[title*="第一集 / 第二集"]')).toBeInTheDocument()
    expect(
      Array.from(document.querySelectorAll('.calendar-event-title')).map(element => element.textContent?.trim()),
    ).toEqual(['较早电影', 'Alpha电影', 'Zulu剧集'])
    expect(movieRequest).toHaveBeenCalledOnce()
    expect(movieRequest.mock.calls[0][0].searchParams.get('type_name')).toBe('电影')
    expect(tvRequest).toHaveBeenCalledOnce()
    expect(tvRequest.mock.calls[0][0].searchParams.get('episode_group')).toBe('group-a')
    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    expect(progressClose).toHaveBeenCalledOnce()
  })

  it('distinguishes none, partial, complete, and best-version library states', async () => {
    const subscriptions = [
      tvSubscribe(3201, '未入库', { lack_episode: 4, note: [] }),
      tvSubscribe(3202, '部分入库', { lack_episode: 2, note: [1] }),
      tvSubscribe(3203, '全部入库', { lack_episode: 0, note: [1, 2] }),
      tvSubscribe(3204, '洗版部分入库', {
        best_version: '1',
        episode_priority: { '1': 100, '2': 50 },
        lack_episode: 0,
      }),
    ]
    const episodes = [
      createTmdbEpisode({ air_date: '2026-07-22', episode_number: 1 }),
      createTmdbEpisode({ air_date: '2026-07-22', episode_number: 2 }),
    ]
    server.use(
      subscribeListHandler(subscriptions),
      ...subscriptions.map(subscribe => tmdbSeasonEpisodesHandler(Number(subscribe.media_id), 1, episodes)),
    )

    await renderCalendar()

    const noneCard = (await screen.findByText('未入库')).closest('.calendar-event-card')
    const partialCard = (await screen.findByText('部分入库')).closest('.calendar-event-card')
    const completeCard = (await screen.findByText('全部入库')).closest('.calendar-event-card')
    const washCard = (await screen.findByText('洗版部分入库')).closest('.calendar-event-card')
    expect(noneCard).toHaveClass('calendar-event-card--none')
    expect(partialCard).toHaveClass('calendar-event-card--partial')
    expect(completeCard).toHaveClass('calendar-event-card--complete')
    expect(washCard).toHaveClass('calendar-event-card--partial')
  })

  it('keeps successful events when another detail request fails and drops invalid dates', async () => {
    const valid = movieSubscribe(3301, '有效电影')
    const failed = movieSubscribe(3302, '失败电影')
    const undated = movieSubscribe(3303, '无日期电影')
    const undatedTv = tvSubscribe(3304, '无日期剧集')
    server.use(
      subscribeListHandler([failed, undated, undatedTv, valid]),
      mediaDetailsHandler(3301, createMediaInfo({ release_date: '2026-07-23', tmdb_id: 3301 })),
      mediaDetailsHandler(3302, createMediaInfo({ tmdb_id: 3302 }), 500),
      mediaDetailsHandler(3303, createMediaInfo({ release_date: '', tmdb_id: 3303 })),
      tmdbSeasonEpisodesHandler(3304, 1, [
        createTmdbEpisode({ air_date: undefined, episode_number: undefined, name: undefined, runtime: undefined }),
      ]),
    )

    await renderCalendar()

    expect(await screen.findByText('有效电影')).toBeInTheDocument()
    expect(screen.queryByText('失败电影')).not.toBeInTheDocument()
    expect(screen.queryByText('无日期电影')).not.toBeInTheDocument()
    expect(screen.queryByText('无日期剧集')).not.toBeInTheDocument()
  })

  it('updates only the expanded day through the FullCalendar API and restores scroll', async () => {
    const sameDaySubscriptions = Array.from({ length: 6 }, (_, index) =>
      tvSubscribe(3400 + index, `同日项目 ${index + 1}`),
    )
    const nextDaySubscription = tvSubscribe(3499, '次日项目')
    const subscriptions = [...sameDaySubscriptions, nextDaySubscription]
    const sameDayEpisode = createTmdbEpisode({ air_date: '2026-08-01', episode_number: 1 })
    server.use(
      subscribeListHandler(subscriptions),
      ...sameDaySubscriptions.map(subscribe =>
        tmdbSeasonEpisodesHandler(Number(subscribe.media_id), 1, [sameDayEpisode]),
      ),
      tmdbSeasonEpisodesHandler(3499, 1, [createTmdbEpisode({ air_date: '2026-08-02', episode_number: 1 })]),
    )
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 240 })
    Object.defineProperty(window, 'scrollX', { configurable: true, value: 16 })
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0)
      return 1
    })

    await renderCalendar()

    expect(await screen.findByText('同日项目 1')).toBeInTheDocument()
    expect(screen.getByText('次日项目')).toBeInTheDocument()
    expect(screen.queryByText('同日项目 6')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '展开当天剩余 1 个条目' }))

    const eventId = 'calendar-day-group-2026-08-01'
    expect(mocks.getEventById).toHaveBeenCalledWith(eventId)
    expect(mocks.setExtendedProp).toHaveBeenNthCalledWith(
      1,
      eventId,
      'visibleEvents',
      expect.arrayContaining([expect.objectContaining({ title: '同日项目 6' })]),
    )
    expect(mocks.setExtendedProp).toHaveBeenNthCalledWith(2, eventId, 'hiddenEventCount', 0)
    expect(mocks.setExtendedProp).toHaveBeenCalledTimes(2)
    expect(scrollTo).toHaveBeenCalledWith({ left: 16, top: 240 })
  })

  it('renders mobile date boundaries and filters without restoring events older than 30 days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-17T12:00:00+08:00'))
    setViewport(480)
    const today = movieSubscribe(3501, '今日电影', { year: '' })
    const future = movieSubscribe(3502, '未来电影')
    const recent = movieSubscribe(3503, '近期过期电影')
    const old = movieSubscribe(3504, '过久电影')
    const boundary = movieSubscribe(3505, '边界电影')
    const details: Array<[Subscribe, MediaInfo]> = [
      [today, createMediaInfo({ release_date: '2026-07-17', tmdb_id: 3501 })],
      [future, createMediaInfo({ release_date: '2026-07-18', tmdb_id: 3502 })],
      [recent, createMediaInfo({ release_date: '2026-07-12', tmdb_id: 3503 })],
      [old, createMediaInfo({ release_date: '2026-06-16', tmdb_id: 3504 })],
      [boundary, createMediaInfo({ release_date: '2026-06-17', tmdb_id: 3505 })],
    ]
    server.use(
      subscribeListHandler(details.map(([subscribe]) => subscribe)),
      ...details.map(([subscribe, media]) => mediaDetailsHandler(String(subscribe.media_id), media)),
    )

    await renderCalendar()

    await waitFor(() => expect(queryMobileCalendarEventCard('今日电影')).toBeInTheDocument())
    expect(
      queryMobileCalendarEventCard('今日电影')?.querySelector('.mobile-calendar-event-content > p'),
    ).toHaveTextContent('电影')
    expect(queryMobileCalendarEventCard('未来电影')).toBeInTheDocument()
    expect(queryMobileCalendarEventCard('近期过期电影')).not.toBeInTheDocument()
    expect(queryMobileCalendarEventCard('边界电影')).not.toBeInTheDocument()
    expect(queryMobileCalendarEventCard('过久电影')).not.toBeInTheDocument()
    expect(screen.getByText('5 项')).toBeInTheDocument()
    expect(screen.getByText('即将播出')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '隐藏过期' }))
    await waitFor(() => expect(queryMobileCalendarEventCard('近期过期电影')).toBeInTheDocument())
    expect(queryMobileCalendarEventCard('边界电影')).toBeInTheDocument()
    expect(queryMobileCalendarEventCard('过久电影')).not.toBeInTheDocument()
    expect(screen.getAllByText('已播出')).toHaveLength(2)

    await fireEvent.click(screen.getByRole('option', { name: '未来电影' }))
    expect(queryMobileCalendarEventCard('未来电影')).toBeInTheDocument()
    expect(queryMobileCalendarEventCard('今日电影')).not.toBeInTheDocument()
    expect(queryMobileCalendarEventCard('近期过期电影')).not.toBeInTheDocument()
    expect(queryMobileCalendarEventCard('边界电影')).not.toBeInTheDocument()
  })

  it('renders cross-year TV metadata and all mobile library states', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-31T12:00:00+08:00'))
    setViewport(480)
    const aggregate = tvSubscribe(3551, '年度剧集', {
      lack_episode: 3,
      note: [],
      total_episode: 4,
    })
    const partial = tvSubscribe(3552, '部分剧集', {
      lack_episode: 2,
      note: [1],
      total_episode: 4,
    })
    server.use(
      subscribeListHandler([aggregate, partial]),
      tmdbSeasonEpisodesHandler(3551, 1, [
        createTmdbEpisode({ air_date: '2027-01-01', episode_number: 1, name: '跨年首集', runtime: 50 }),
        createTmdbEpisode({ air_date: '2027-01-02', episode_number: 2, name: undefined, runtime: undefined }),
      ]),
      tmdbSeasonEpisodesHandler(3552, 1, [
        createTmdbEpisode({ air_date: '2027-01-03', episode_number: 1, name: '第一集', runtime: undefined }),
        createTmdbEpisode({ air_date: '2027-01-03', episode_number: 2, name: '第二集' }),
      ]),
    )

    await renderCalendar()

    const completeCard = (await screen.findByRole('heading', { name: '跨年首集' })).closest(
      '.mobile-calendar-event-card',
    )
    const noneCard = screen.getByRole('heading', { name: '年度剧集' }).closest('.mobile-calendar-event-card')
    const partialCard = screen.getByRole('heading', { name: '第一集 / 第二集' }).closest('.mobile-calendar-event-card')
    expect(completeCard).toHaveClass('mobile-calendar-event-card--complete')
    expect(noneCard).toHaveClass('mobile-calendar-event-card--none')
    expect(partialCard).toHaveClass('mobile-calendar-event-card--partial')
    expect(screen.getByText('2027/01/01')).toBeInTheDocument()
    expect(screen.getByText('50 分钟')).toBeInTheDocument()
    expect(screen.getByText('45 分钟')).toBeInTheDocument()
    expect(screen.getAllByText('S01E01').length).toBeGreaterThan(0)
    expect(screen.getByRole('option', { name: '年度剧集' })).toBeInTheDocument()
  })

  it('resets a stale mobile title filter after keep-alive refresh replaces the data', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-10T12:00:00+08:00'))
    setViewport(480)
    const first = movieSubscribe(3601, '第一轮电影')
    const second = movieSubscribe(3602, '第二轮电影')
    server.use(
      sequenceSubscribeList([{ body: [first] }, { body: [second] }]),
      mediaDetailsHandler(3601, createMediaInfo({ release_date: '2026-08-10', tmdb_id: 3601 })),
      mediaDetailsHandler(3602, createMediaInfo({ release_date: '2026-08-11', tmdb_id: 3602 })),
    )

    await renderCalendar(keepAliveHarness())
    await waitFor(() => expect(queryMobileCalendarEventCard('第一轮电影')).toBeInTheDocument())
    await fireEvent.click(screen.getByRole('option', { name: '第一轮电影' }))
    await fireEvent.click(screen.getByRole('button', { name: '停用日历' }))
    await fireEvent.click(screen.getByRole('button', { name: '启用日历' }))

    await waitFor(() => expect(queryMobileCalendarEventCard('第二轮电影')).toBeInTheDocument())
    expect(screen.getByRole('option', { name: '全部' })).toHaveAttribute('aria-selected', 'true')
  })

  it('recovers from a failed list request when the kept-alive view is activated again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-10T12:00:00+08:00'))
    setViewport(480)
    const recovered = movieSubscribe(3701, '恢复后的电影')
    const onListRequest = vi.fn()
    server.use(
      sequenceSubscribeList([{ body: [], status: 500 }, { body: [recovered] }], onListRequest),
      mediaDetailsHandler(3701, createMediaInfo({ release_date: '2026-08-12', tmdb_id: 3701 })),
    )

    await renderCalendar(keepAliveHarness())
    await waitFor(() => expect(onListRequest).toHaveBeenCalledOnce())
    await fireEvent.click(screen.getByRole('button', { name: '停用日历' }))
    await fireEvent.click(screen.getByRole('button', { name: '启用日历' }))

    await waitFor(() => expect(queryMobileCalendarEventCard('恢复后的电影')).toBeInTheDocument())
    expect(onListRequest).toHaveBeenCalledTimes(2)
  })

  it('filters desktop calendar events by media type', async () => {
    const movie = movieSubscribe(3801, '筛选电影')
    const tv = tvSubscribe(3802, '筛选剧集')
    server.use(
      subscribeListHandler([movie, tv]),
      mediaDetailsHandler(3801, createMediaInfo({ release_date: '2026-07-24', tmdb_id: 3801 })),
      tmdbSeasonEpisodesHandler(3802, 1, [createTmdbEpisode({ air_date: '2026-07-24', episode_number: 1 })]),
    )

    await renderCalendar()

    expect(await screen.findByText('筛选电影')).toBeInTheDocument()
    expect(screen.getByText('筛选剧集')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '电视剧' }))
    expect(screen.queryByText('筛选电影')).not.toBeInTheDocument()
    expect(screen.getByText('筛选剧集')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '电影' }))
    expect(screen.getByText('筛选电影')).toBeInTheDocument()
    expect(screen.queryByText('筛选剧集')).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(screen.getByText('筛选电影')).toBeInTheDocument()
    expect(screen.getByText('筛选剧集')).toBeInTheDocument()
  })

  it('re-collapses a previously expanded desktop day when the media type filter changes', async () => {
    const sameDaySubscriptions = Array.from({ length: 6 }, (_, index) =>
      tvSubscribe(4000 + index, `折叠项目 ${index + 1}`),
    )
    const sameDayEpisode = createTmdbEpisode({ air_date: '2026-08-05', episode_number: 1 })
    server.use(
      subscribeListHandler(sameDaySubscriptions),
      ...sameDaySubscriptions.map(subscribe =>
        tmdbSeasonEpisodesHandler(Number(subscribe.media_id), 1, [sameDayEpisode]),
      ),
    )
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0)
      return 1
    })

    await renderCalendar()

    expect(await screen.findByText('折叠项目 1')).toBeInTheDocument()
    expect(screen.queryByText('折叠项目 6')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '展开当天剩余 1 个条目' }))
    expect(screen.getByText('折叠项目 6')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '电影' }))
    await fireEvent.click(screen.getByRole('button', { name: '全部' }))

    expect(await screen.findByText('折叠项目 1')).toBeInTheDocument()
    expect(screen.queryByText('折叠项目 6')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开当天剩余 1 个条目' })).toBeInTheDocument()
  })

  it('filters mobile calendar events by media type', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-23T12:00:00+08:00'))
    setViewport(480)
    const movie = movieSubscribe(3901, '移动筛选电影')
    const tv = tvSubscribe(3902, '移动筛选剧集')
    server.use(
      subscribeListHandler([movie, tv]),
      mediaDetailsHandler(3901, createMediaInfo({ release_date: '2026-07-24', tmdb_id: 3901 })),
      tmdbSeasonEpisodesHandler(3902, 1, [createTmdbEpisode({ air_date: '2026-07-24', episode_number: 1 })]),
    )

    await renderCalendar()

    await waitFor(() => expect(queryMobileCalendarEventCard('移动筛选电影')).toBeInTheDocument())
    expect(queryMobileCalendarEventCard('移动筛选剧集')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '电视剧' }))
    expect(queryMobileCalendarEventCard('移动筛选电影')).not.toBeInTheDocument()
    expect(queryMobileCalendarEventCard('移动筛选剧集')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(queryMobileCalendarEventCard('移动筛选电影')).toBeInTheDocument()
    expect(queryMobileCalendarEventCard('移动筛选剧集')).toBeInTheDocument()
  })

  it('shows the mobile empty state for an empty subscription list', async () => {
    setViewport(480)
    server.use(subscribeListHandler([]))

    await renderCalendar()

    expect(await screen.findByText('暂无符合筛选条件的日历内容')).toBeInTheDocument()
    expect(screen.queryByText('加载中 ...')).not.toBeInTheDocument()
  })
})
