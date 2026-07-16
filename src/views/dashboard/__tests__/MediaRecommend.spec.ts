import MediaRecommend from '@/views/dashboard/MediaRecommend.vue'
import { getActiveRequestsCount } from '@/utils/requestOptimizer'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createMediaInfo } from '@tests/support/factories/media'
import { recommendApiUrls, recommendMediaHandler } from '@tests/support/msw/handlers/recommend'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { http, HttpResponse } from 'msw'
import { defineComponent, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const DEFAULT_SOURCE = 'recommend/tmdb_trending'
const MOVIE_SOURCE = 'recommend/tmdb_movies'
const SOURCE_MENU_LABEL = '选择推荐媒体来源'

function getSourceMenuButton() {
  return screen.getByRole('button', { name: SOURCE_MENU_LABEL })
}

async function renderMediaRecommend(
  response: unknown,
  options: { sourcePath?: string; status?: number; onRequest?: () => void } = {},
) {
  const sourcePath = options.sourcePath ?? DEFAULT_SOURCE
  server.use(
    recommendMediaHandler(
      sourcePath,
      response as Record<string, unknown>,
      options.status ?? 200,
      options.onRequest,
    ),
  )
  return renderWithProviders(MediaRecommend, {
    initialRoute: '/dashboard',
    initialState: {
      globalSettings: {
        data: { GLOBAL_IMAGE_CACHE: false },
        initialized: true,
        loading: false,
      },
    },
  })
}

describe('MediaRecommend', () => {
  it.each([
    ['array', (media: ReturnType<typeof createMediaInfo>) => [media]],
    ['data array', (media: ReturnType<typeof createMediaInfo>) => ({ data: [media] })],
    ['data list', (media: ReturnType<typeof createMediaInfo>) => ({ data: { list: [media] } })],
  ])('normalizes the %s response shape', async (_shape, wrapResponse) => {
    const media = createMediaInfo({ title: `响应-${_shape}` })
    const requested = vi.fn()

    await renderMediaRecommend(wrapResponse(media), { onRequest: requested })

    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    expect(await screen.findByText(media.title || '')).toBeInTheDocument()
  })

  it('filters unusable media and limits the carousel to five items', async () => {
    const validMedia = Array.from({ length: 6 }, (_, index) => createMediaInfo({ title: `有效媒体 ${index + 1}` }))
    const response = {
      data: {
        list: [
          createMediaInfo({ title: undefined }),
          createMediaInfo({ backdrop_path: undefined, poster_path: undefined, title: '无图片' }),
          createMediaInfo({ collection_id: undefined, title: '无标识', tmdb_id: undefined }),
          ...validMedia,
        ],
      },
    }
    const requested = vi.fn()
    const { container } = await renderMediaRecommend(response, { onRequest: requested })

    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    await screen.findByText('有效媒体 1')

    expect(container.querySelectorAll('.dashboard-recommend-slide')).toHaveLength(5)
    expect(screen.getAllByRole('button', { name: /查看第 \d+ 项推荐/ })).toHaveLength(5)
    expect(screen.queryByText('无图片')).not.toBeInTheDocument()
    expect(screen.queryByText('无标识')).not.toBeInTheDocument()
    expect(screen.queryByText('有效媒体 6')).not.toBeInTheDocument()
  })

  it('restores a valid source and replaces an invalid stored source', async () => {
    const movieRequested = vi.fn()
    localStorage.setItem('MP_DASHBOARD_RECOMMEND_SOURCE', MOVIE_SOURCE)
    await renderMediaRecommend([createMediaInfo({ title: '电影来源内容' })], {
      onRequest: movieRequested,
      sourcePath: MOVIE_SOURCE,
    })

    await waitFor(() => expect(movieRequested).toHaveBeenCalledOnce())
    expect(await screen.findByText('电影来源内容')).toBeInTheDocument()
    expect(within(getSourceMenuButton()).getByText('TMDB热门电影')).toBeInTheDocument()
    expect(localStorage.getItem('MP_DASHBOARD_RECOMMEND_SOURCE')).toBe(MOVIE_SOURCE)
  })

  it('falls back to the first source when persisted data is invalid', async () => {
    const requested = vi.fn()
    localStorage.setItem('MP_DASHBOARD_RECOMMEND_SOURCE', 'recommend/removed')
    await renderMediaRecommend([createMediaInfo({ title: '默认来源内容' })], { onRequest: requested })

    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    expect(await screen.findByText('默认来源内容')).toBeInTheDocument()
    expect(localStorage.getItem('MP_DASHBOARD_RECOMMEND_SOURCE')).toBe(DEFAULT_SOURCE)
  })

  it('switches sources, persists the choice, and reuses the session cache', async () => {
    const user = userEvent.setup()
    const trendingRequested = vi.fn()
    const moviesRequested = vi.fn()
    server.use(
      recommendMediaHandler(MOVIE_SOURCE, [createMediaInfo({ title: '热门电影内容' })], 200, moviesRequested),
    )
    await renderMediaRecommend([createMediaInfo({ title: '趋势内容' })], { onRequest: trendingRequested })
    await waitFor(() => expect(trendingRequested).toHaveBeenCalledOnce())

    await user.click(getSourceMenuButton())
    await user.click(await screen.findByText('TMDB热门电影'))
    await waitFor(() => expect(moviesRequested).toHaveBeenCalledOnce())
    expect(await screen.findByText('热门电影内容')).toBeInTheDocument()
    expect(localStorage.getItem('MP_DASHBOARD_RECOMMEND_SOURCE')).toBe(MOVIE_SOURCE)

    await user.click(getSourceMenuButton())
    await user.click(await screen.findByText('流行趋势'))
    expect(await screen.findByText('趋势内容')).toBeInTheDocument()
    expect(trendingRequested).toHaveBeenCalledOnce()
  })

  it('supports arrows, pagination, touch gestures, and detail routes', async () => {
    const first = createMediaInfo({ title: '普通媒体', tmdb_id: 101, type: '电影', year: '2025' })
    const second = createMediaInfo({ collection_id: 202, title: '媒体合集', tmdb_id: undefined, type: '合集' })
    const third = createMediaInfo({ title: '第三项媒体', tmdb_id: 303 })
    const { container, router } = await renderMediaRecommend([first, second, third])
    await screen.findByText('普通媒体')

    await fireEvent.click(screen.getByRole('button', { name: '下一项推荐' }))
    expect(await screen.findByText('媒体合集')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '查看详情' }))
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/browse/tmdb/collection/202'))
    expect(router.currentRoute.value.query.title).toBe('媒体合集')

    await fireEvent.click(screen.getByRole('button', { name: '查看第 3 项推荐' }))
    expect(await screen.findByText('第三项媒体')).toBeInTheDocument()
    const card = container.querySelector<HTMLElement>('.dashboard-recommend')
    expect(card).not.toBeNull()

    await fireEvent.touchStart(card as HTMLElement, { changedTouches: [{ clientX: 200 }] })
    await fireEvent.touchEnd(card as HTMLElement, { changedTouches: [{ clientX: 170 }] })
    expect(screen.getByText('第三项媒体')).toBeInTheDocument()

    await fireEvent.touchStart(card as HTMLElement, { changedTouches: [{ clientX: 200 }] })
    await fireEvent.touchEnd(card as HTMLElement, { changedTouches: [{ clientX: 280 }] })
    expect(await screen.findByText('媒体合集')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '上一项推荐' }))
    expect(await screen.findByText('普通媒体')).toBeInTheDocument()
    await fireEvent.keyDown(screen.getByRole('link'), { key: 'Enter' })
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/media'))
    expect(router.currentRoute.value.query).toMatchObject({
      mediaid: 'tmdb:101',
      title: '普通媒体',
      type: '电影',
      year: '2025',
    })
  })

  it('pauses autoplay for interaction and clears the interval on unmount', async () => {
    let autoplay: (() => void) | undefined
    const autoplayTimer = {} as ReturnType<typeof globalThis.setInterval>
    const requestOptimizerTimer = {} as ReturnType<typeof globalThis.setInterval>
    const setInterval = vi
      .spyOn(window, 'setInterval')
      .mockImplementation((handler: TimerHandler, timeout?: number) => {
        if (timeout === 8000 && typeof handler === 'function') autoplay = handler as () => void
        return timeout === 8000 ? autoplayTimer : requestOptimizerTimer
      })
    const clearInterval = vi.spyOn(window, 'clearInterval')
    const { container, unmount } = await renderMediaRecommend([
      createMediaInfo({ title: '自动播放一' }),
      createMediaInfo({ title: '自动播放二' }),
    ])
    await screen.findByText('自动播放一')

    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 8000)
    const card = container.querySelector<HTMLElement>('.dashboard-recommend') as HTMLElement
    await fireEvent.focusIn(card)
    await fireEvent.mouseEnter(card)
    await fireEvent.mouseLeave(card)
    autoplay?.()
    expect(screen.getByText('自动播放一')).toBeInTheDocument()

    await fireEvent.mouseEnter(card)
    await fireEvent.focusOut(card)
    autoplay?.()
    expect(screen.getByText('自动播放一')).toBeInTheDocument()

    await fireEvent.mouseLeave(card)
    autoplay?.()
    expect(await screen.findByText('自动播放二')).toBeInTheDocument()
    unmount()

    expect(clearInterval).toHaveBeenCalledWith(autoplayTimer)
  })

  it('does not start autoplay when reduced motion is requested', async () => {
    const reducedMotion = { ...window.matchMedia(''), matches: true }
    vi.spyOn(window, 'matchMedia').mockReturnValue(reducedMotion)
    const setInterval = vi.spyOn(window, 'setInterval')

    await renderMediaRecommend([createMediaInfo({ title: '静态推荐' })])
    await screen.findByText('静态推荐')

    expect(setInterval).not.toHaveBeenCalledWith(expect.any(Function), 8000)
  })

  it('clears autoplay when a kept-alive instance is deactivated', async () => {
    const autoplayTimer = {} as ReturnType<typeof globalThis.setInterval>
    const requestOptimizerTimer = {} as ReturnType<typeof globalThis.setInterval>
    vi.spyOn(window, 'setInterval').mockImplementation((_handler: TimerHandler, timeout?: number) =>
      timeout === 8000 ? autoplayTimer : requestOptimizerTimer,
    )
    const clearInterval = vi.spyOn(window, 'clearInterval')
    const KeepAliveHarness = defineComponent({
      components: { MediaRecommend },
      setup() {
        const active = ref(true)
        return { active }
      },
      template:
        '<button type="button" @click="active = false">停用推荐</button><KeepAlive><MediaRecommend v-if="active" /></KeepAlive>',
    })
    server.use(recommendMediaHandler(DEFAULT_SOURCE, [createMediaInfo({ title: '可停用推荐' })]))
    await renderWithProviders(KeepAliveHarness, {
      initialRoute: '/dashboard',
      initialState: {
        globalSettings: {
          data: { GLOBAL_IMAGE_CACHE: false },
          initialized: true,
          loading: false,
        },
      },
    })
    await screen.findByText('可停用推荐')
    clearInterval.mockClear()

    await fireEvent.click(screen.getByRole('button', { name: '停用推荐' }))

    expect(clearInterval).toHaveBeenCalledWith(autoplayTimer)
  })

  it('does not restart autoplay when deactivated before the initial request settles', async () => {
    let resolveRequest: ((response: Response) => void) | undefined
    server.use(
      http.get(recommendApiUrls.media(DEFAULT_SOURCE), () => new Promise<Response>(resolve => {
        resolveRequest = resolve
      })),
    )
    const KeepAliveHarness = defineComponent({
      components: { MediaRecommend },
      setup() {
        const active = ref(true)
        return { active }
      },
      template:
        '<button type="button" @click="active = false">停用慢请求推荐</button><KeepAlive><MediaRecommend v-if="active" /></KeepAlive>',
    })
    await renderWithProviders(KeepAliveHarness, {
      initialRoute: '/dashboard',
      initialState: {
        globalSettings: {
          data: { GLOBAL_IMAGE_CACHE: false },
          initialized: true,
          loading: false,
        },
      },
    })
    await waitFor(() => expect(resolveRequest).toBeTypeOf('function'))
    const setInterval = vi.spyOn(window, 'setInterval')

    await fireEvent.click(screen.getByRole('button', { name: '停用慢请求推荐' }))
    setInterval.mockClear()
    resolveRequest?.(HttpResponse.json([createMediaInfo({ title: '迟到推荐' })]))
    await waitFor(() => expect(getActiveRequestsCount()).toBe(0))
    await new Promise(resolve => window.setTimeout(resolve, 0))

    expect(setInterval).not.toHaveBeenCalledWith(expect.any(Function), 8000)
  })

  it('restarts autoplay when reactivated before a source request settles', async () => {
    const autoplayTimer = {} as ReturnType<typeof globalThis.setInterval>
    const requestOptimizerTimer = {} as ReturnType<typeof globalThis.setInterval>
    const setInterval = vi
      .spyOn(window, 'setInterval')
      .mockImplementation((_handler: TimerHandler, timeout?: number) =>
        timeout === 8000 ? autoplayTimer : requestOptimizerTimer,
      )
    let resolveMovies: ((response: Response) => void) | undefined
    server.use(
      recommendMediaHandler(DEFAULT_SOURCE, [createMediaInfo({ title: '初始推荐' })]),
      http.get(recommendApiUrls.media(MOVIE_SOURCE), () => new Promise<Response>(resolve => {
        resolveMovies = resolve
      })),
    )
    const KeepAliveHarness = defineComponent({
      components: { MediaRecommend },
      setup() {
        const active = ref(true)
        return { active }
      },
      template:
        '<button type="button" @click="active = !active">{{ active ? "停用切源推荐" : "恢复切源推荐" }}</button><KeepAlive><MediaRecommend v-if="active" /></KeepAlive>',
    })
    await renderWithProviders(KeepAliveHarness, {
      initialRoute: '/dashboard',
      initialState: {
        globalSettings: {
          data: { GLOBAL_IMAGE_CACHE: false },
          initialized: true,
          loading: false,
        },
      },
    })
    await screen.findByText('初始推荐')
    const user = userEvent.setup()
    await user.click(getSourceMenuButton())
    await user.click(await screen.findByText('TMDB热门电影'))
    await waitFor(() => expect(resolveMovies).toBeTypeOf('function'))

    await fireEvent.click(screen.getByRole('button', { name: '停用切源推荐' }))
    setInterval.mockClear()
    await fireEvent.click(screen.getByRole('button', { name: '恢复切源推荐' }))
    expect(setInterval).not.toHaveBeenCalledWith(expect.any(Function), 8000)

    resolveMovies?.(HttpResponse.json([createMediaInfo({ title: '切源完成' })]))
    await waitFor(() => expect(getActiveRequestsCount()).toBe(0))
    await screen.findByText('切源完成')

    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 8000)
  })

  it('shows empty data and retries a failed request', async () => {
    const user = userEvent.setup()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await renderMediaRecommend({}, { status: 500 })

    expect(await screen.findByText('推荐媒体加载失败')).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalled()
    server.use(recommendMediaHandler(DEFAULT_SOURCE, [createMediaInfo({ title: '重试成功' })]))
    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('重试成功')).toBeInTheDocument()
  })

  it('renders the non-error empty state for invalid responses', async () => {
    const requested = vi.fn()
    await renderMediaRecommend(null, { onRequest: requested })

    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    expect(await screen.findByText('当前来源暂无推荐媒体')).toBeInTheDocument()
  })

  it('invalidates a pending request when switching back to a cached source', async () => {
    await renderMediaRecommend([createMediaInfo({ title: '初始结果' })])
    expect(await screen.findByText('初始结果')).toBeInTheDocument()

    let resolveMovies: ((response: Response) => void) | undefined
    server.use(
      http.get(recommendApiUrls.media(MOVIE_SOURCE), () => new Promise<Response>(resolve => {
        resolveMovies = resolve
      })),
    )
    const user = userEvent.setup()
    await user.click(getSourceMenuButton())
    const sourceList = await screen.findByRole('listbox', { name: SOURCE_MENU_LABEL })
    const moviesOption = within(sourceList).getByText('TMDB热门电影')
    const trendingOption = within(sourceList).getByText('流行趋势')
    moviesOption.click()
    trendingOption.click()

    expect(await screen.findByText('初始结果')).toBeInTheDocument()
    await waitFor(() => expect(resolveMovies).toBeTypeOf('function'))
    resolveMovies?.(HttpResponse.json([createMediaInfo({ title: '过期结果' })]))
    await waitFor(() => expect(getActiveRequestsCount()).toBe(0))
    await new Promise(resolve => window.setTimeout(resolve, 0))

    expect(screen.queryByText('过期结果')).not.toBeInTheDocument()
    expect(screen.getByText('初始结果')).toBeInTheDocument()
  })
})
