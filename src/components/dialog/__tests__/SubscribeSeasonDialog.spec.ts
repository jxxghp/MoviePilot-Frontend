import type { MediaInfo, MediaSeason, NotExistMediaInfo } from '@/api/types'
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import SubscribeSeasonDialog from '@/components/dialog/SubscribeSeasonDialog.vue'
import type { SubscribeMode } from '@/composables/useMediaSubscribe'
import { getActiveRequestsCount } from '@/utils/requestOptimizer'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createMediaInfo, createMediaSeason, createNotExistMediaInfo } from '@tests/support/factories/media'
import {
  mediaEpisodeGroupsHandler,
  mediaGroupSeasonsHandler,
  mediaNotExistsHandler,
  mediaSeasonsHandler,
} from '@tests/support/msw/handlers/media'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** 季订阅弹窗测试属性。 */
interface SeasonDialogProps {
  defaultSubscribeMode?: SubscribeMode
  initialEpisodeGroup?: string
  media?: MediaInfo
  modelValue?: boolean
  selectedSeason?: number
  subscribedSeasonModes?: Record<number, SubscribeMode>
  subscribedSeasons?: number[]
}

/** 创建可由测试主动完成的异步门闩。 */
function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

/** 创建季订阅测试使用的电视剧媒体。 */
function createTvMedia(overrides: Partial<MediaInfo> = {}) {
  return createMediaInfo({
    poster_path: '/images/fallback-poster.jpg',
    season: 1,
    title: '季订阅测试剧',
    tmdb_id: 7301,
    type: '电视剧',
    year: '2026',
    ...overrides,
  })
}

/** 使用完整应用依赖渲染季订阅弹窗。 */
async function renderDialog(props: SeasonDialogProps = {}) {
  const events = {
    close: vi.fn(),
    subscribe: vi.fn(),
  }
  const result = await renderWithProviders(SubscribeSeasonDialog, {
    global: {
      components: {
        VDialogCloseBtn: DialogCloseBtn,
      },
      stubs: {
        VImg: {
          props: ['alt', 'src'],
          template: '<img :alt="alt" :src="src" />',
        },
      },
    },
    initialState: {
      globalSettings: {
        data: {
          GLOBAL_IMAGE_CACHE: false,
          TMDB_IMAGE_DOMAIN: 'image.tmdb.org',
        },
      },
    },
    props: {
      media: createTvMedia(),
      modelValue: true,
      ...props,
      onClose: events.close,
      onSubscribe: events.subscribe,
    },
  })

  return { ...result, events }
}

/** 获取指定季号对应的列表行。 */
function seasonRow(number: number) {
  const title = screen.getByText(`第 ${number} 季`)
  const row = title.closest('.v-list-item')
  if (!row) throw new Error(`Season ${number} row was not rendered`)
  return row as HTMLElement
}

/** 等待弹窗发起的并行请求全部结算。 */
async function settleRequests() {
  await flushPromises()
  await flushPromises()
}

describe('SubscribeSeasonDialog', () => {
  afterEach(async () => {
    await waitFor(() => expect(getActiveRequestsCount()).toBe(0))
  })

  it('loads the default TMDB seasons once with exact requests and renders season states', async () => {
    const media = createTvMedia({ season: 0, tmdb_id: 7302 })
    const seasons = [
      createMediaSeason({ air_date: '2020-01-02', episode_count: 3, name: '', poster_path: '', season_number: 0 }),
      createMediaSeason({ air_date: '2021-02-03', episode_count: 4, season_number: 1 }),
      createMediaSeason({ air_date: '2022-03-04', episode_count: 5, season_number: 2 }),
    ]
    const states = [
      createNotExistMediaInfo({ episodes: [1, 2, 3], season: 0, total_episode: 3 }),
      createNotExistMediaInfo({ episodes: [1, 2], season: 1, total_episode: 4 }),
      createNotExistMediaInfo({ episodes: [], season: 2, total_episode: 5 }),
    ]
    const seasonRequests: URL[] = []
    const missingPayloads: Record<string, unknown>[] = []
    const groupRequests = vi.fn()
    server.use(
      mediaSeasonsHandler(seasons, 200, url => {
        seasonRequests.push(url)
      }),
      mediaNotExistsHandler(states, 200, payload => {
        missingPayloads.push(payload)
      }),
      mediaEpisodeGroupsHandler(media.tmdb_id!, [], 200, groupRequests),
    )

    await renderDialog({ media })

    expect(await screen.findByText('第 0 季')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('部分缺失')).toBeInTheDocument())
    expect(screen.getByText('缺失')).toBeInTheDocument()
    expect(screen.getByText('首播于 2020年1月2日')).toBeInTheDocument()
    expect(seasonRow(0)).toHaveTextContent('3 集')
    expect(within(seasonRow(0)).getByAltText('第 0 季')).toHaveAttribute(
      'src',
      'https://image.tmdb.org/t/p/w500/images/fallback-poster.jpg',
    )
    await settleRequests()

    expect(seasonRequests).toHaveLength(1)
    expect(missingPayloads).toHaveLength(1)
    expect(groupRequests).toHaveBeenCalledOnce()
    expect(seasonRequests[0].searchParams.get('media_id')).toBe(String(media.media_id))
    expect(seasonRequests[0].searchParams.get('media_source')).toBe('themoviedb')
    expect(seasonRequests[0].searchParams.get('title')).toBe(media.title)
    expect(seasonRequests[0].searchParams.get('year')).toBe(media.year)
    expect(seasonRequests[0].searchParams.get('season')).toBe('0')
    expect(missingPayloads[0]).toMatchObject({ episode_group: '', season: 0, tmdb_id: media.tmdb_id })
  })

  it('preserves source image URLs and hides unavailable season metadata', async () => {
    const media = createTvMedia({
      poster_path: 'https://images.example.com/main-poster.jpg',
      media_source: 'anilist',
      tmdb_id: undefined,
    })
    server.use(
      mediaSeasonsHandler([
        createMediaSeason({
          air_date: undefined,
          episode_count: undefined,
          name: '葬送的芙莉莲 第一部分',
          poster_path: 'https://images.example.com/original/season-poster.jpg',
          season_number: 1,
          vote_average: undefined,
        }),
      ]),
      mediaNotExistsHandler([]),
    )

    await renderDialog({ media })

    await screen.findByText('第 1 季')
    const row = seasonRow(1)
    expect(row).toHaveTextContent('葬送的芙莉莲 第一部分')
    expect(within(row).getByAltText('第 1 季 - 葬送的芙莉莲 第一部分')).toHaveAttribute(
      'src',
      'https://images.example.com/original/season-poster.jpg',
    )
    expect(row).not.toHaveTextContent('undefined')
    expect(within(row).queryByText(/首播于/)).not.toBeInTheDocument()
  })

  it('renders safe fallbacks for incomplete season metadata', async () => {
    const media = createTvMedia({ poster_path: '' })
    server.use(
      mediaSeasonsHandler([
        createMediaSeason({
          air_date: 'unknown',
          episode_count: 0,
          name: '来源特别篇',
          poster_path: '',
          season_number: undefined,
        }),
        createMediaSeason({
          air_date: '',
          episode_count: undefined,
          name: 'Season 01',
          poster_path: '/images/season-one.jpg',
          season_number: 1,
        }),
      ]),
      mediaNotExistsHandler([]),
      mediaEpisodeGroupsHandler(media.tmdb_id!, []),
    )

    await renderDialog({ media })

    expect(await screen.findByText('第 0 季')).toBeInTheDocument()
    expect(seasonRow(0)).toHaveTextContent('unknown')
    expect(within(seasonRow(0)).getByAltText('第 0 季')).toHaveAttribute('src')
    expect(seasonRow(1)).not.toHaveTextContent('Season 01')
  })

  it.each([
    ['Douban', { douban_id: 'db-7303', media_id: 'db-7303', media_source: 'douban', tmdb_id: undefined }, 'db-7303'],
    [
      'Bangumi',
      {
        bangumi_id: 'bgm-7304',
        douban_id: undefined,
        media_id: 'bgm-7304',
        media_source: 'bangumi',
        tmdb_id: undefined,
      },
      'bgm-7304',
    ],
    [
      'AniList',
      { anilist_id: 154587, bangumi_id: undefined, media_id: '154587', media_source: 'anilist', tmdb_id: undefined },
      '154587',
    ],
    [
      'Bilibili source',
      {
        bangumi_id: undefined,
        douban_id: undefined,
        media_id: 'custom-7305',
        media_source: 'bilibili',
        tmdb_id: undefined,
      },
      'custom-7305',
    ],
    [
      'source-only TMDB',
      {
        bangumi_id: undefined,
        douban_id: undefined,
        media_id: 'source-7306',
        media_source: 'themoviedb',
        tmdb_id: undefined,
      },
      'source-7306',
    ],
  ] as const)('uses the %s media identifier without requesting TMDB groups', async (label, overrides, mediaId) => {
    const consoleWarn =
      label === 'source-only TMDB' ? vi.spyOn(console, 'warn').mockImplementation(() => {}) : undefined
    const media = createTvMedia(overrides)
    const requested = vi.fn()
    server.use(
      mediaSeasonsHandler([createMediaSeason({ season_number: 1 })], 200, requested),
      mediaNotExistsHandler([]),
    )

    await renderDialog({ media })

    expect(await screen.findByText('第 1 季')).toBeInTheDocument()
    await settleRequests()
    expect(requested).toHaveBeenCalledOnce()
    expect(requested.mock.calls[0][0].searchParams.get('media_id')).toBe(mediaId)
    expect(requested.mock.calls[0][0].searchParams.get('media_source')).toBe(media.media_source)
    if (label === 'source-only TMDB') expect(consoleWarn).toHaveBeenCalledWith('tmdb_id is not set or is empty')
  })

  it.each([
    ['Douban', { douban_id: 'db-7310', media_id: 'db-7310', media_source: 'douban' }, 'db-7310'],
    ['Bangumi', { bangumi_id: 'bgm-7310', media_id: 'bgm-7310', media_source: 'bangumi' }, 'bgm-7310'],
    ['AniList', { anilist_id: 154587, media_id: '154587', media_source: 'anilist' }, '154587'],
  ] as const)(
    'keeps the %s identity and skips episode groups when an auxiliary TMDB ID exists',
    async (_label, overrides, mediaId) => {
      const media = createTvMedia({ ...overrides, tmdb_id: 7310 })
      const seasonRequest = vi.fn()
      const groupRequest = vi.fn()
      const groupSeasonsRequest = vi.fn()
      server.use(
        mediaSeasonsHandler([createMediaSeason({ season_number: 1 })], 200, seasonRequest),
        mediaNotExistsHandler([]),
        mediaEpisodeGroupsHandler(7310, [], 200, groupRequest),
        mediaGroupSeasonsHandler('auxiliary-group', [], 200, groupSeasonsRequest),
      )

      await renderDialog({ initialEpisodeGroup: 'auxiliary-group', media })

      expect(await screen.findByText('第 1 季')).toBeInTheDocument()
      await settleRequests()
      expect(seasonRequest.mock.calls[0][0].searchParams.get('media_id')).toBe(mediaId)
      expect(seasonRequest.mock.calls[0][0].searchParams.get('media_source')).toBe(media.media_source)
      expect(groupRequest).not.toHaveBeenCalled()
      expect(groupSeasonsRequest).not.toHaveBeenCalled()
    },
  )

  it('synchronizes visible selections and modes, then emits the five-argument subscription payload', async () => {
    const media = createTvMedia({ tmdb_id: 7306 })
    const seasons = [
      createMediaSeason({ season_number: 0 }),
      createMediaSeason({ season_number: 1 }),
      createMediaSeason({ season_number: 2 }),
    ]
    server.use(
      mediaSeasonsHandler(seasons),
      mediaNotExistsHandler([
        createNotExistMediaInfo({ episodes: [1], season: 0, total_episode: 1 }),
        createNotExistMediaInfo({ episodes: [], season: 1, total_episode: 12 }),
        createNotExistMediaInfo({ episodes: [1], season: 2, total_episode: 12 }),
      ]),
      mediaEpisodeGroupsHandler(media.tmdb_id!, []),
    )
    const user = userEvent.setup()
    const { events } = await renderDialog({
      defaultSubscribeMode: 'normal',
      media,
      selectedSeason: 0,
      subscribedSeasonModes: { 1: 'best_version' },
      subscribedSeasons: [1, 99],
    })

    expect(await screen.findByText('第 2 季')).toBeInTheDocument()
    await settleRequests()
    expect(within(seasonRow(0)).getByRole('button', { name: '全集洗版' })).toHaveClass('v-btn--active')
    expect(within(seasonRow(1)).getByRole('button', { name: '分集洗版' })).toHaveClass('v-btn--active')

    await user.click(within(seasonRow(0)).getByRole('button', { name: '普通订阅' }))
    await user.click(seasonRow(2))
    await user.click(within(seasonRow(2)).getByRole('button', { name: '分集洗版' }))
    await user.click(screen.getByRole('button', { name: '提交订阅' }))

    expect(events.subscribe).toHaveBeenCalledOnce()
    const [selected, states, episodeGroup, modes, visible] = events.subscribe.mock.calls[0]
    expect(selected).toEqual(seasons)
    expect(states).toEqual({ 0: 0, 1: 2, 2: 1 })
    expect(episodeGroup).toBe('')
    expect(modes).toMatchObject({ 0: 'normal', 1: 'best_version', 2: 'best_version' })
    expect(visible).toEqual([0, 1, 2])
  })

  it('keeps the submit action disabled when subscribed selections and modes are unchanged', async () => {
    const media = createTvMedia({ tmdb_id: 7307 })
    server.use(
      mediaSeasonsHandler([createMediaSeason({ season_number: 1 })]),
      mediaNotExistsHandler([createNotExistMediaInfo({ episodes: [], season: 1 })]),
      mediaEpisodeGroupsHandler(media.tmdb_id!, []),
    )

    await renderDialog({
      media,
      subscribedSeasonModes: { 1: 'best_version' },
      subscribedSeasons: [1],
    })

    expect(await screen.findByRole('button', { name: '提交订阅' })).toBeDisabled()
    expect(await screen.findByText('缺失')).toBeInTheDocument()
    expect(screen.getByText('已订阅')).toBeInTheDocument()
  })

  it('preserves a manually chosen mode when delayed missing-state data arrives', async () => {
    const media = createTvMedia({ tmdb_id: 7308 })
    const missingGate = createDeferred()
    server.use(
      mediaSeasonsHandler([createMediaSeason({ season_number: 1 })]),
      mediaNotExistsHandler(
        [createNotExistMediaInfo({ episodes: [], season: 1 })],
        200,
        async () => missingGate.promise,
      ),
      mediaEpisodeGroupsHandler(media.tmdb_id!, []),
    )
    const user = userEvent.setup()
    const { events } = await renderDialog({
      defaultSubscribeMode: 'best_version',
      media,
      selectedSeason: 1,
    })

    expect(await screen.findByText('第 1 季')).toBeInTheDocument()
    await user.click(within(seasonRow(1)).getByRole('button', { name: '普通订阅' }))
    missingGate.resolve()
    await waitFor(() => expect(screen.getByText('缺失')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '提交订阅' }))

    const modes = events.subscribe.mock.calls[0][3]
    expect(modes[1]).toBe('normal')
  })

  it('shows Loading instead of an error empty state while switching from a custom group to default seasons', async () => {
    const media = createTvMedia({ tmdb_id: 7309 })
    const defaultRequestStarted = createDeferred()
    const defaultResponseGate = createDeferred()
    server.use(
      mediaEpisodeGroupsHandler(media.tmdb_id!, [
        { episode_count: 8, group_count: 1, id: 'group-a', name: '自定义排序 A' },
      ]),
      mediaGroupSeasonsHandler('group-a', [createMediaSeason({ season_number: 5 })]),
      mediaSeasonsHandler([createMediaSeason({ season_number: 1 })], 200, async () => {
        defaultRequestStarted.resolve()
        await defaultResponseGate.promise
      }),
      mediaNotExistsHandler([]),
    )
    const user = userEvent.setup()
    await renderDialog({ initialEpisodeGroup: 'group-a', media })

    expect(await screen.findByText('第 5 季')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /默认/ }))
    await defaultRequestStarted.promise
    const showedLoading = document.querySelector('.initial-loading-container') !== null
    const showedErrorEmptyState = screen.queryByText(`${media.title} 未查询到季集信息`) !== null
    defaultResponseGate.resolve()
    expect(await screen.findByText('第 1 季')).toBeInTheDocument()

    expect(showedLoading).toBe(true)
    expect(showedErrorEmptyState).toBe(false)
  })

  it('exits Loading after the default season request fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const media = createTvMedia({ tmdb_id: 7310 })
    const requested = vi.fn()
    server.use(
      mediaSeasonsHandler([], 500, requested),
      mediaNotExistsHandler([]),
      mediaEpisodeGroupsHandler(media.tmdb_id!, []),
    )
    await renderDialog({ media })

    await waitFor(() => expect(requested).toHaveBeenCalled())
    await settleRequests()

    expect(document.querySelector('.initial-loading-container')).not.toBeInTheDocument()
    expect(screen.getByText(`${media.title} 未查询到季集信息`)).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledOnce()
  })

  it('keeps season selection usable when the missing-state request fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const media = createTvMedia({ tmdb_id: 7313 })
    const missingRequested = vi.fn()
    server.use(
      mediaSeasonsHandler([createMediaSeason({ season_number: 1 })]),
      mediaNotExistsHandler([], 500, missingRequested),
      mediaEpisodeGroupsHandler(media.tmdb_id!, []),
    )
    const user = userEvent.setup()
    const { events } = await renderDialog({ media })

    expect(await screen.findByText('第 1 季')).toBeInTheDocument()
    await waitFor(() => expect(missingRequested).toHaveBeenCalledOnce())
    await settleRequests()
    await user.click(seasonRow(1))
    await user.click(screen.getByRole('button', { name: '提交订阅' }))

    expect(events.subscribe).toHaveBeenCalledOnce()
    expect(events.subscribe.mock.calls[0][1]).toEqual({})
    expect(consoleError).toHaveBeenCalledOnce()
  })

  it('keeps season selection usable when optional episode groups fail to load', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const media = createTvMedia({ tmdb_id: 7314 })
    const groupsRequested = vi.fn()
    server.use(
      mediaSeasonsHandler([createMediaSeason({ season_number: 1 })]),
      mediaNotExistsHandler([createNotExistMediaInfo({ episodes: [], season: 1 })]),
      mediaEpisodeGroupsHandler(media.tmdb_id!, [], 500, groupsRequested),
    )
    const user = userEvent.setup()
    const { events } = await renderDialog({ media })

    expect(await screen.findByText('第 1 季')).toBeInTheDocument()
    await waitFor(() => expect(groupsRequested).toHaveBeenCalledOnce())
    await settleRequests()
    await user.click(seasonRow(1))
    await user.click(screen.getByRole('button', { name: '提交订阅' }))

    expect(events.subscribe).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: /^默认/ })).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledOnce()
  })

  it('renders the successful empty state and emits close without submitting', async () => {
    const media = createTvMedia({ tmdb_id: 7311 })
    server.use(mediaSeasonsHandler([]), mediaNotExistsHandler([]), mediaEpisodeGroupsHandler(media.tmdb_id!, []))
    const { events } = await renderDialog({ media })

    expect(await screen.findByText(`${media.title} 未查询到季集信息`)).toBeInTheDocument()
    await settleRequests()
    const closeButton = document.querySelector('.absolute.right-3')
    expect(closeButton).not.toBeNull()
    await fireEvent.click(closeButton!)

    expect(events.close).toHaveBeenCalledOnce()
    expect(events.subscribe).not.toHaveBeenCalled()
  })

  it('updates episode-group rail navigation from its real scroll position', async () => {
    const media = createTvMedia({ tmdb_id: 7312 })
    server.use(
      mediaSeasonsHandler([createMediaSeason({ season_number: 1 })]),
      mediaNotExistsHandler([]),
      mediaEpisodeGroupsHandler(media.tmdb_id!, [
        { episode_count: 8, group_count: 1, id: 'group-a', name: '排序 A' },
        { episode_count: 8, group_count: 1, id: 'group-b', name: '排序 B' },
      ]),
      mediaGroupSeasonsHandler('group-a', [createMediaSeason({ season_number: 1 })]),
      mediaGroupSeasonsHandler('group-b', [createMediaSeason({ season_number: 2 })]),
    )
    const user = userEvent.setup()
    await renderDialog({ media })
    await screen.findByText('排序 B')

    const rail = document.querySelector('.subscribe-season-group-options') as HTMLElement & {
      scrollBy: (options: ScrollToOptions) => void
    }
    Object.defineProperties(rail, {
      clientWidth: { configurable: true, value: 400 },
      scrollLeft: { configurable: true, value: 0, writable: true },
      scrollWidth: { configurable: true, value: 1000 },
    })
    rail.scrollBy = vi.fn()
    await fireEvent.scroll(rail)

    await user.click(screen.getByRole('button', { name: '查看更多剧集组' }))
    expect(rail.scrollBy).toHaveBeenCalledWith({ behavior: 'smooth', left: 288 })

    rail.scrollLeft = 300
    await fireEvent.scroll(rail)
    await user.click(screen.getByRole('button', { name: '查看上一组剧集组' }))
    expect(rail.scrollBy).toHaveBeenCalledWith({ behavior: 'smooth', left: -288 })
  })
})
