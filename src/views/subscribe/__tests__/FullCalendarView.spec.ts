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
  setRange: undefined as ((range: { start: Date; end: Date }) => void) | undefined,
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
      /** 保留日历事件插槽与按日展开所需的公开接口。 */
      setup(props, { expose, slots }) {
        mocks.setRange = (props.options as { datesSet?: typeof mocks.setRange }).datesSet
        // 按稳定事件 ID 定位测试事件，模拟 FullCalendar 的局部更新。
        const getEventById = (id: string) => {
          mocks.getEventById(id)
          const options = props.options as { events?: Record<string, unknown>[] }
          const event = options.events?.find(item => item.id === id)
          if (!event) return undefined

          return {
            /** 记录局部更新并让插槽读取最新扩展属性。 */
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

/** 按真实 Vuetify 断点切换测试视口。 */
function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width, writable: true })
  window.dispatchEvent(new Event('resize'))
}

/** 按订阅标题定位移动端时间线卡片。 */
function queryMobileCalendarEventCard(title: string) {
  return (
    Array.from(document.querySelectorAll<HTMLElement>('.mobile-calendar-event-card')).find(card =>
      card.title.startsWith(title),
    ) ?? null
  )
}

/** 构造可覆盖媒体身份和进度的电影订阅。 */
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

/** 构造具有季集信息的电视剧订阅。 */
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

/** 使用生产 UI 插件渲染日历或其缓存生命周期载具。 */
async function renderCalendar(component = FullCalendarView) {
  return renderWithProviders(component, { initialRoute: '/calendar' })
}

/** 提供停用和重新激活日历的交互入口。 */
function keepAliveHarness() {
  return defineComponent({
    components: { FullCalendarView },
    /** 通过公开按钮切换 KeepAlive 激活状态。 */
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

/** 按次序重放旧后端订阅列表，验证刷新和错误恢复。 */
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
  it('falls back when an older backend parses calendar as an integer subscription id', async () => {
    const fallback = vi.fn()
    const subscribe = movieSubscribe(9600, '旧后端兼容日历')
    server.use(
      http.get('http://localhost/api/v1/subscribe/calendar', () =>
        HttpResponse.json(
          { detail: [{ type: 'int_parsing', loc: ['path', 'subscribe_id'], input: 'calendar' }] },
          { status: 422 },
        ),
      ),
      subscribeListHandler([subscribe], 200, fallback),
      mediaDetailsHandler(subscribe.media_id!, createMediaInfo({ title: subscribe.name, release_date: '2027-02-02' })),
    )
    await renderCalendar()
    await waitFor(() => expect(fallback).toHaveBeenCalledOnce())
    expect(await screen.findByText('旧后端兼容日历')).toBeInTheDocument()
  })

  it('does not treat calendar query validation errors as an older backend', async () => {
    const fallback = vi.fn()
    server.use(
      http.get('http://localhost/api/v1/subscribe/calendar', () =>
        HttpResponse.json(
          { detail: [{ type: 'date_from_datetime_parsing', loc: ['query', 'start'], input: 'invalid' }] },
          { status: 422 },
        ),
      ),
      subscribeListHandler([], 200, fallback),
    )
    await renderCalendar()
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(fallback).not.toHaveBeenCalled()
  })

  it('does not duplicate a mobile window when retrying after a later page fails', async () => {
    setViewport(390)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let initialEnd = ''
    let failedPage = false
    let laterPageCalls = 0
    const dateKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const eventDate = new Date(today)
    eventDate.setDate(eventDate.getDate() + 65)
    const laterItems = Array.from({ length: 51 }, (_, index) => ({
      subscribe: movieSubscribe(9800 + index, `重试窗口 ${index}`),
      date: dateKey(eventDate),
      episodes: [],
    }))
    server.use(
      http.get('http://localhost/api/v1/subscribe/calendar', ({ request }) => {
        const url = new URL(request.url)
        initialEnd ||= url.searchParams.get('end')!
        if (url.searchParams.get('end') === initialEnd) {
          return apiJson({
            total: 1,
            items: [{ subscribe: movieSubscribe(9700, '初始窗口'), date: dateKey(today), episodes: [] }],
          })
        }
        const page = Number(url.searchParams.get('page'))
        laterPageCalls++
        if (page === 2 && !failedPage) {
          failedPage = true
          return HttpResponse.json({ detail: 'retry later' }, { status: 503 })
        }
        return apiJson({ total: 51, items: laterItems.slice((page - 1) * 50, page * 50) })
      }),
    )
    await renderCalendar()
    await screen.findByRole('heading', { name: '初始窗口' })
    await fireEvent.click(screen.getByRole('button', { name: '加载更多' }))
    await waitFor(() => expect(laterPageCalls).toBe(2))
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^加载更多/ }).at(-1)).toBeEnabled())
    await fireEvent.click(screen.getAllByRole('button', { name: /^加载更多/ }).at(-1)!)
    await waitFor(() => expect(laterPageCalls).toBe(4))
    const laterGroup = [...document.querySelectorAll('.mobile-calendar-day')].find(group =>
      group.textContent?.includes('重试窗口'),
    )!
    const expand = [...laterGroup.querySelectorAll('button')].find(button => button.textContent?.includes('加载更多'))
    if (expand) await fireEvent.click(expand)
    await waitFor(() => expect(laterGroup.querySelectorAll('.mobile-calendar-event-card')).toHaveLength(51))
    expect(screen.getAllByRole('heading', { name: '重试窗口 0' })).toHaveLength(1)
  })

  it('expands already downloaded mobile dates before requesting a later window', async () => {
    setViewport(390)
    let requests = 0
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    server.use(
      http.get('http://localhost/api/v1/subscribe/calendar', () => {
        requests++
        return apiJson({
          total: 40,
          items: Array.from({ length: 40 }, (_, index) => {
            const day = new Date(today)
            day.setDate(day.getDate() + index)
            return {
              subscribe: movieSubscribe(9500 + index, `已加载日期 ${index}`),
              date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
              episodes: [],
            }
          }),
        })
      }),
    )
    await renderCalendar()
    await screen.findByRole('heading', { name: '已加载日期 0' })
    expect(document.querySelectorAll('.mobile-calendar-day')).toHaveLength(30)
    await fireEvent.click(screen.getByRole('button', { name: '加载更多' }))
    expect(document.querySelectorAll('.mobile-calendar-day')).toHaveLength(40)
    expect(requests).toBe(1)
  })

  it('requests the visible date window first and cancels stale pages when the month changes', async () => {
    const requests: URL[] = []
    let releaseOldWindow = () => {}
    const oldWindowPending = new Promise<void>(resolve => {
      releaseOldWindow = resolve
    })
    const oldMovie = movieSubscribe(9100, '旧月份迟到的电影')
    const newMovies = Array.from({ length: 51 }, (_, index) => movieSubscribe(9200 + index, `新月份电影 ${index}`))
    const subscriptionList = vi.fn()
    server.use(
      subscribeListHandler([], 200, subscriptionList),
      http.get('http://localhost/api/v1/subscribe/calendar', async ({ request }) => {
        const url = new URL(request.url)
        requests.push(url)
        expect(url.searchParams.get('count')).toBe('50')
        if (url.searchParams.get('start') !== '2027-02-01') {
          await oldWindowPending
          return apiJson({ items: [{ subscribe: oldMovie, date: '2027-02-03', episodes: [] }], total: 100 })
        }
        const page = Number(url.searchParams.get('page'))
        return apiJson({
          items: newMovies.slice((page - 1) * 50, page * 50).map(subscribe => ({
            subscribe,
            date: page === 1 ? '2027-02-04' : '2027-02-05',
            episodes: [],
          })),
          total: 51,
        })
      }),
    )
    await renderCalendar()
    await waitFor(() => expect(requests).toHaveLength(1))
    const today = new Date().toISOString().slice(0, 10)
    expect(requests[0].searchParams.get('start')! <= today).toBe(true)
    expect(requests[0].searchParams.get('end')! > today).toBe(true)
    mocks.setRange?.({ start: new Date('2027-02-01T00:00:00'), end: new Date('2027-03-01T00:00:00') })
    await screen.findByText('新月份电影 50')
    releaseOldWindow()
    await waitFor(() => expect(document.querySelector('[role="status"]')).not.toBeInTheDocument())
    expect(requests.map(url => [url.searchParams.get('start'), url.searchParams.get('page')])).toEqual([
      [requests[0].searchParams.get('start'), '1'],
      ['2027-02-01', '1'],
      ['2027-02-01', '2'],
    ])
    expect(screen.queryByText(oldMovie.name)).not.toBeInTheDocument()
    expect(subscriptionList).not.toHaveBeenCalled()
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })

  it('starts the mobile timeline near today and requests the next thirty days only on demand', async () => {
    setViewport(390)
    const requests: URL[] = []
    server.use(
      http.get('http://localhost/api/v1/subscribe/calendar', ({ request }) => {
        requests.push(new URL(request.url))
        return apiJson({ items: [], total: 0 })
      }),
    )
    await renderCalendar()
    const more = await screen.findByRole('button', { name: '加载更多' })
    expect(requests).toHaveLength(1)
    const initialStart = new Date(requests[0].searchParams.get('start')!)
    const initialEnd = new Date(requests[0].searchParams.get('end')!)
    expect((initialEnd.getTime() - initialStart.getTime()) / 86400000).toBe(90)
    await fireEvent.click(more)
    await waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1].searchParams.get('start')).toBe(requests[0].searchParams.get('end'))
    expect((new Date(requests[1].searchParams.get('end')!).getTime() - initialEnd.getTime()) / 86400000).toBe(30)
  })

  it('pages subscriptions and caps detail concurrency before appending the next batch', async () => {
    const subscriptions = Array.from({ length: 51 }, (_, index) =>
      tvSubscribe(9000 + index, `分页订阅 ${index}`, { lack_episode: 4, note: [] }),
    )
    const pages: string[] = []
    let active = 0
    let peak = 0
    server.use(
      subscribeListHandler(url => {
        pages.push(url.searchParams.get('page') ?? '')
        expect(url.searchParams.get('count')).toBe('50')
        const page = Number(url.searchParams.get('page'))
        return subscriptions.slice((page - 1) * 50, page * 50)
      }),
      http.get('http://localhost/api/v1/tmdb/:id/:season', async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise(resolve => setTimeout(resolve, 5))
        active--
        return apiJson([createTmdbEpisode({ air_date: '2026-08-01', episode_number: 1 })])
      }),
    )
    await renderCalendar()
    await screen.findByText('分页订阅 0')
    await waitFor(() => expect(pages).toEqual(['1', '2']))
    await waitFor(() => expect(document.querySelector('[role="status"]')).not.toBeInTheDocument())
    expect(peak).toBe(4)
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })
  beforeEach(() => {
    setViewport(1280)
    server.use(
      http.get('http://localhost/api/v1/subscribe/calendar', () => new HttpResponse(null, { status: 404 })),
      http.get('http://localhost/api/v1/subscribe/files/:id', () =>
        apiJson({
          subscribe: null,
          episodes: {},
        }),
      ),
    )
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
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
    expect(progressClose).not.toHaveBeenCalled()
  })

  it('distinguishes none, partial, complete, and best-version library states', async () => {
    const subscriptions = [
      tvSubscribe(3201, '未入库', { lack_episode: 4, note: [] }),
      tvSubscribe(3202, '部分入库', { lack_episode: 2, note: [1] }),
      tvSubscribe(3203, '全部入库', { lack_episode: 0, note: [1, 2] }),
      tvSubscribe(3204, '洗版已有版本', {
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
    const washCard = (await screen.findByText('洗版已有版本')).closest('.calendar-event-card')
    expect(noneCard).toHaveClass('calendar-event-card--none')
    expect(partialCard).toHaveClass('calendar-event-card--partial')
    expect(completeCard).toHaveClass('calendar-event-card--complete')
    expect(washCard).toHaveClass('calendar-event-card--complete')
  })

  it.each([
    { apiMode: 'legacy', width: 1280, bestVersion: 1 },
    { apiMode: 'window', width: 1280, bestVersion: true },
    { apiMode: 'legacy', width: 390, bestVersion: '1' },
    { apiMode: 'window', width: 390, bestVersion: 1 },
  ])(
    'shows recorded episodes of any quality as in library ($apiMode, $width)',
    async ({ apiMode, width, bestVersion }) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-08-10T12:00:00+08:00'))
      setViewport(width)
      const subscribe = tvSubscribe(3241, '洗版任意版本入库', {
        best_version: bestVersion,
        total_episode: 8,
        lack_episode: 2,
        completed_episode: 2,
        note: [1, 2, 3, 4, 5, 6],
        episode_priority: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 100, '6': 100 },
      })
      const episodes = [
        createTmdbEpisode({ air_date: '2026-08-10', episode_number: 3 }),
        createTmdbEpisode({ air_date: '2026-08-10', episode_number: 4 }),
      ]
      const filesRequest = vi.fn()
      server.use(
        subscribeListHandler([subscribe]),
        tmdbSeasonEpisodesHandler(3241, 1, episodes),
        http.get(subscribeApiUrls.filesById(3241), () => {
          filesRequest()
          return apiJson({ episodes: {} })
        }),
      )
      if (apiMode === 'window') {
        server.use(
          http.get('http://localhost/api/v1/subscribe/calendar', () =>
            apiJson({ items: [{ subscribe, date: '2026-08-10', episodes }], total: 1 }),
          ),
        )
      }

      await renderCalendar()

      await waitFor(() => {
        const card =
          width < 960
            ? queryMobileCalendarEventCard(subscribe.name)
            : screen.getByText(subscribe.name).closest('.calendar-event-card')
        expect(card).toHaveClass(width < 960 ? 'mobile-calendar-event-card--complete' : 'calendar-event-card--complete')
        expect(card).toHaveAttribute('title', expect.stringContaining('已入库 6/8'))
      })
      await waitFor(() => expect(document.querySelector('[role="status"]')).not.toBeInTheDocument())
      expect(filesRequest).not.toHaveBeenCalled()
    },
  )

  it('does not infer library presence from zero-priority placeholders without download records', async () => {
    const subscribe = tvSubscribe(3242, '洗版占位集号', {
      best_version: 1,
      lack_episode: 2,
      note: [3, 4],
      episode_priority: { '1': 0, '3': 0, '4': 50 },
    })
    server.use(
      subscribeListHandler([subscribe]),
      tmdbSeasonEpisodesHandler(3242, 1, [createTmdbEpisode({ air_date: '2026-07-23', episode_number: 1 })]),
    )

    await renderCalendar()

    const card = (await screen.findByText(subscribe.name)).closest('.calendar-event-card')
    expect(card).toHaveClass('calendar-event-card--none')
  })

  it.each(['legacy', 'window'])('backfills stale best-version library facts with actual files (%s)', async apiMode => {
    const subscribe = tvSubscribe(3243, '洗版手动入库', {
      best_version: 1,
      lack_episode: 2,
      note: [1],
      episode_priority: { '1': 100, '3': 0, '4': 0 },
    })
    const episodes = [
      createTmdbEpisode({ air_date: '2026-07-23', episode_number: 3 }),
      createTmdbEpisode({ air_date: '2026-07-23', episode_number: 4 }),
    ]
    const filesRequest = vi.fn()
    let resolveFiles: (() => void) | undefined
    const filesReady = new Promise<void>(resolve => {
      resolveFiles = resolve
    })
    server.use(
      subscribeListHandler([subscribe]),
      tmdbSeasonEpisodesHandler(3243, 1, episodes),
      http.get(subscribeApiUrls.filesById(3243), async () => {
        filesRequest()
        await filesReady
        return apiJson({
          episodes: {
            3: { library: [{ file_path: '/media/洗版手动入库/S01E03.mkv', storage: 'local' }] },
            4: { download: [{ file_path: '/downloads/S01E04.mkv' }] },
          },
        })
      }),
    )
    if (apiMode === 'window') {
      server.use(
        http.get('http://localhost/api/v1/subscribe/calendar', () =>
          apiJson({ items: [{ subscribe, date: '2026-07-23', episodes }], total: 1 }),
        ),
      )
    }

    await renderCalendar()

    await screen.findByText(subscribe.name)
    expect(screen.getByText('未入库 (2/4)')).toBeInTheDocument()
    await waitFor(() => expect(filesRequest).toHaveBeenCalledOnce())
    resolveFiles?.()
    await waitFor(() => expect(screen.getByText('部分入库 (2/4)')).toBeInTheDocument())
  })

  it('keeps known best-version library episodes when the detail lookup fails', async () => {
    const subscribe = tvSubscribe(3244, '洗版补查失败', {
      best_version: 1,
      total_episode: 8,
      lack_episode: 2,
      note: [3],
      episode_priority: { '4': 50 },
    })
    const filesRequest = vi.fn()
    server.use(
      subscribeListHandler([subscribe]),
      tmdbSeasonEpisodesHandler(3244, 1, [
        createTmdbEpisode({ air_date: '2026-07-23', episode_number: 3 }),
        createTmdbEpisode({ air_date: '2026-07-23', episode_number: 4 }),
      ]),
      http.get(subscribeApiUrls.filesById(3244), () => {
        filesRequest()
        return HttpResponse.json({ detail: 'unavailable' }, { status: 500 })
      }),
    )

    await renderCalendar()

    await screen.findByText(subscribe.name)
    await waitFor(() => expect(filesRequest).toHaveBeenCalledOnce())
    await waitFor(() => expect(document.querySelector('[role="status"]')).not.toBeInTheDocument())
    expect(screen.getByText('已入库 (6/8)')).toBeInTheDocument()
  })

  it('uses media-library episode details when subscription facts lag behind aggregate progress', async () => {
    const lagging = tvSubscribe(3251, '手动入库剧集', {
      lack_episode: 33,
      note: Array.from({ length: 25 }, (_, index) => index + 71),
      total_episode: 129,
    })
    const filesRequest = vi.fn()
    let resolveFiles: (() => void) | undefined
    const filesReady = new Promise<void>(resolve => {
      resolveFiles = resolve
    })
    server.use(
      subscribeListHandler([lagging]),
      tmdbSeasonEpisodesHandler(3251, 1, [
        createTmdbEpisode({ air_date: '2026-07-23', episode_number: 96, name: '第九十六集' }),
      ]),
      http.get(subscribeApiUrls.filesById(lagging.id as number), async () => {
        filesRequest()
        await filesReady
        return apiJson({
          subscribe: lagging,
          episodes: {
            96: {
              library: [{ file_path: '/media/手动入库剧集/S01E96.mkv', storage: 'local' }],
            },
          },
        })
      }),
    )

    await renderCalendar()

    await screen.findByText('手动入库剧集')
    await waitFor(() => expect(filesRequest).toHaveBeenCalledOnce())
    expect(screen.getByText('未入库 (96/129)')).toBeInTheDocument()
    resolveFiles?.()
    await waitFor(() => expect(screen.getByText('已入库 (96/129)')).toBeInTheDocument())
    const card = screen.getByText('手动入库剧集').closest('.calendar-event-card')
    expect(card).toHaveClass('calendar-event-card--complete')
  })

  it('limits background media-library detail requests', async () => {
    const subscriptions = [
      tvSubscribe(3261, '后台补查一', { lack_episode: 1, note: [1] }),
      tvSubscribe(3262, '洗版后台补查二', { best_version: 1, lack_episode: 1, note: [1] }),
      tvSubscribe(3263, '后台补查三', { lack_episode: 1, note: [1] }),
    ]
    let activeRequests = 0
    let maxActiveRequests = 0
    let requestCount = 0
    server.use(
      subscribeListHandler(subscriptions),
      ...subscriptions.map(subscribe =>
        tmdbSeasonEpisodesHandler(Number(subscribe.media_id), 1, [
          createTmdbEpisode({ air_date: '2026-07-24', episode_number: 2 }),
        ]),
      ),
      http.get('http://localhost/api/v1/subscribe/files/:id', async () => {
        requestCount += 1
        activeRequests += 1
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
        await new Promise(resolve => setTimeout(resolve, 10))
        activeRequests -= 1
        return apiJson({ subscribe: null, episodes: {} })
      }),
    )

    await renderCalendar()

    await waitFor(() => expect(requestCount).toBe(subscriptions.length))
    expect(maxActiveRequests).toBe(2)
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
    // 日历按浏览器本地日期分组，固定本地正午而不是其他时区的绝对时刻。
    vi.setSystemTime(new Date(2026, 6, 17, 12))
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
    expect(
      queryMobileCalendarEventCard('今日电影')
        ?.closest('.mobile-calendar-day')
        ?.querySelector('.mobile-calendar-day-status--upcoming'),
    ).toBeNull()

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
