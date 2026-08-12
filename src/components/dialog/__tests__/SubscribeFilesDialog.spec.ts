import type { Subscribe, SubscrbieInfo } from '@/api/types'
import SubscribeFilesDialog from '@/components/dialog/SubscribeFilesDialog.vue'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { server } from '@tests/support/msw/server'
import { subscribeApiUrls, subscribeFilesHandler } from '@tests/support/msw/handlers/subscribe'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http, type JsonBodyType } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  copyToClipboard: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/@core/utils/navigator', () => ({
  copyToClipboard: (...args: unknown[]) => mocks.copyToClipboard(...args),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

function createSubscribe(overrides: Partial<Subscribe> = {}): Subscribe {
  return {
    best_version: 0,
    current_priority: 0,
    date: '2026-07-17 10:00:00',
    id: 3101,
    last_update: '2026-07-17 10:00:00',
    name: '文件测试剧',
    page_open: false,
    show_edit_dialog: false,
    sites: [],
    state: 'R',
    media_id: '31010',
    media_source: 'themoviedb',
    type: '电视剧',
    username: 'tester',
    year: '2026',
    ...overrides,
  }
}

function createFilesInfo(overrides: Partial<SubscrbieInfo> = {}): SubscrbieInfo {
  return {
    episodes: {
      1: {
        download: [],
        library: [],
        title: '第一集',
      },
    },
    subscribe: createSubscribe({ season: 1, total_episode: 1 }),
    ...overrides,
  }
}

function createTvFilesInfo(): SubscrbieInfo {
  return createFilesInfo({
    episodes: {
      10: {
        description: '第十集简介',
        download: [],
        library: [],
        title: '第十集',
      },
      2: {
        description: '第二集简介',
        download: [
          {
            downloader: 'Transmission',
            file_path: '/downloads/show.S01E02.1080p.mkv',
            hash: 'hash-episode-2',
            site_name: '站点二',
            torrent_title: 'Show.S01E02.1080p.WEB-DL',
          },
        ],
        library: [
          {
            file_path: '/media/show.S01E02.1080p.mkv',
            storage: 'local-disk',
          },
        ],
        title: '第二集',
      },
      1: {
        backdrop: 'https://image.example.com/t/p/w500/episode-1.jpg',
        description: '第一集简介',
        download: [
          {
            downloader: 'qBittorrent',
            file_path: '/downloads/show.S01E01.2160p.mkv',
            hash: 'hash-episode-1',
            site_name: '站点一',
            torrent_title: 'Show.S01E01.2160p.WEB-DL',
          },
        ],
        library: [],
        title: '第一集',
      },
    },
    subscribe: createSubscribe({
      backdrop: 'https://image.example.com/t/p/w780/show.jpg',
      description: '整剧简介',
      poster: 'https://image.example.com/poster.jpg',
      season: 1,
      total_episode: 4,
    }),
  })
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width, writable: true })
  window.dispatchEvent(new Event('resize'))
}

function useFilesResponse(id: number, response: JsonBodyType, status = 200, onRequest: (url: URL) => void = () => {}) {
  server.use(subscribeFilesHandler(id, response, status, onRequest))
}

async function renderDialog(subid: number) {
  const close = vi.fn()
  const result = await renderWithProviders(SubscribeFilesDialog, {
    initialState: {
      globalSettings: {
        data: { GLOBAL_IMAGE_CACHE: false },
      },
    },
    props: {
      modelValue: true,
      subid,
      onClose: close,
    },
  })

  return { ...result, close }
}

describe('SubscribeFilesDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    setViewport(1280)
  })

  it('sorts TV episodes numerically, selects the first one, and applies status priority and statistics', async () => {
    const requested = vi.fn()
    useFilesResponse(3110, createTvFilesInfo() as unknown as JsonBodyType, 200, requested)

    await renderDialog(3110)

    expect(await screen.findByRole('heading', { name: '文件测试剧' })).toBeInTheDocument()
    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    expect(requested.mock.calls[0][0].pathname).toBe('/api/v1/subscribe/files/3110')

    const rail = document.querySelector('.subscribe-files-episode-rail')
    expect(rail).not.toBeNull()
    const episodeButtons = within(rail as HTMLElement).getAllByRole('button')
    expect(episodeButtons.map(button => button.textContent)).toEqual([
      expect.stringMatching(/E01.*第一集.*已下载/s),
      expect.stringMatching(/E02.*第二集.*已入库/s),
      expect.stringMatching(/E10.*第十集.*待入库/s),
    ])
    expect(episodeButtons[0]).toHaveClass('subscribe-files-episode-item--active')

    const detailTitle = document.querySelector('.subscribe-files-detail__title')
    expect(detailTitle).not.toBeNull()
    expect(detailTitle).toHaveTextContent('E01')
    expect(detailTitle).toHaveTextContent('第一集')

    const statCards = document.querySelectorAll('.subscribe-files-stat-card')
    expect(statCards).toHaveLength(2)
    expect(statCards[0]).toHaveTextContent('下载')
    expect(statCards[0]).toHaveTextContent('2/4')
    expect(statCards[1]).toHaveTextContent('入库')
    expect(statCards[1]).toHaveTextContent('1/4')
    expect(screen.getByText('缺失 3')).toBeInTheDocument()
  })

  it('counts a non-TMDB custom episode range instead of treating its ending episode as the total', async () => {
    const episodes = Object.fromEntries(
      [44, 45, 46, 47, 48].map(episode => [
        episode,
        {
          download: [],
          library: [],
          title: `第 ${episode} 集`,
        },
      ]),
    )
    const info = createFilesInfo({
      episodes,
      subscribe: createSubscribe({
        media_id: 'douban-range-44-48',
        media_source: 'douban',
        start_episode: 44,
        total_episode: 48,
      }),
    })
    useFilesResponse(3120, info as unknown as JsonBodyType)

    await renderDialog(3120)

    expect(await screen.findByRole('heading', { name: '文件测试剧' })).toBeInTheDocument()
    expect(screen.getAllByText('0/5')).toHaveLength(2)
    expect(screen.getByText('缺失 5')).toBeInTheDocument()
  })

  it('uses the returned TMDB episode keys when they exceed the configured target range', async () => {
    const episodes = Object.fromEntries(
      [1, 2, 3, 4].map(episode => [
        episode,
        {
          download: [],
          library: [],
          title: `第 ${episode} 集`,
        },
      ]),
    )
    const info = createFilesInfo({
      episodes,
      subscribe: createSubscribe({ media_id: '31210', start_episode: 3, total_episode: 4 }),
    })
    useFilesResponse(3121, info as unknown as JsonBodyType)

    await renderDialog(3121)

    expect(await screen.findByRole('heading', { name: '文件测试剧' })).toBeInTheDocument()
    expect(screen.getAllByText('0/4')).toHaveLength(2)
    expect(screen.getByText('缺失 4')).toBeInTheDocument()
  })

  it('renders download details, switches desktop episodes, and shows both tab empty states', async () => {
    useFilesResponse(3111, createTvFilesInfo() as unknown as JsonBodyType)
    const user = userEvent.setup()

    await renderDialog(3111)

    const firstTorrent = await screen.findByRole('heading', { name: 'Show.S01E01.2160p.WEB-DL' })
    const firstFileCard = firstTorrent.closest('.subscribe-files-file-card')
    expect(firstFileCard).not.toBeNull()
    expect(within(firstFileCard as HTMLElement).getByText('2160P')).toBeInTheDocument()
    expect(within(firstFileCard as HTMLElement).getByText('站点一')).toBeInTheDocument()
    expect(within(firstFileCard as HTMLElement).getByText('下载器：qBittorrent')).toBeInTheDocument()
    expect(within(firstFileCard as HTMLElement).getByText('Hash：hash-episode-1')).toBeInTheDocument()
    expect(within(firstFileCard as HTMLElement).getByText('/downloads/show.S01E01.2160p.mkv')).toBeInTheDocument()

    const rail = document.querySelector('.subscribe-files-episode-rail') as HTMLElement
    const episodeButtons = within(rail).getAllByRole('button')
    await user.click(episodeButtons[1])
    expect(await screen.findByRole('heading', { name: 'Show.S01E02.1080p.WEB-DL' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Show.S01E01.2160p.WEB-DL' })).not.toBeInTheDocument()

    await user.click(episodeButtons[2])
    expect(await screen.findByText('暂无下载文件')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '媒体库文件' }))
    expect(await screen.findByText('暂无媒体库文件')).toBeInTheDocument()
  })

  it('renders local library paths and safe HTTP(S) media-server links', async () => {
    const httpUrl = 'http://media.example.com/items/emby-1'
    const httpsUrl = 'https://media.example.com/items/jellyfin-2'
    const info = createFilesInfo({
      episodes: {
        1: {
          download: [],
          library: [
            { file_path: '/media/show.S01E01.1080p.mkv', storage: '本地存储' },
            { file_path: httpUrl, itemid: 'emby-1', server: '家庭 Emby', server_type: 'emby' },
            { file_path: httpsUrl, itemid: 'jellyfin-2', server: '家庭 Jellyfin', server_type: 'jellyfin' },
            {},
          ],
          title: '媒体库详情集',
        },
      },
      subscribe: createSubscribe({ season: 1, total_episode: 1 }),
    })
    useFilesResponse(3112, info as unknown as JsonBodyType)
    const user = userEvent.setup()

    await renderDialog(3112)
    expect(await screen.findByRole('heading', { name: '文件测试剧' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '媒体库文件' }))

    const localPath = await screen.findByText('/media/show.S01E01.1080p.mkv')
    expect(localPath.closest('a')).toBeNull()
    expect(screen.getByText('1080P')).toBeInTheDocument()
    expect(screen.getByText('本地存储')).toBeInTheDocument()
    expect(screen.getByText('local')).toBeInTheDocument()
    expect(screen.getByText('家庭 Emby')).toBeInTheDocument()
    expect(screen.getByText('家庭 Jellyfin')).toBeInTheDocument()

    for (const url of [httpUrl, httpsUrl]) {
      const link = screen.getByRole('link', { name: url })
      expect(link).toHaveAttribute('href', url)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }

    expect(screen.getByText('暂无路径')).toBeInTheDocument()
    const copyButtons = screen.getAllByRole('button', { name: '复制路径' })
    expect(copyButtons.at(-1)).toBeDisabled()
  })

  it('reports clipboard success, false results, and exceptions while disabling empty paths', async () => {
    const info = createFilesInfo({
      episodes: {
        1: {
          download: [
            { file_path: '/downloads/one.mkv', torrent_title: '文件一' },
            { file_path: '/downloads/two.mkv', torrent_title: '文件二' },
            { file_path: '/downloads/three.mkv', torrent_title: '文件三' },
            { torrent_title: '无路径文件' },
          ],
          library: [],
          title: '复制测试集',
        },
      },
      subscribe: createSubscribe({ total_episode: 1 }),
    })
    useFilesResponse(3113, info as unknown as JsonBodyType)
    mocks.copyToClipboard
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('clipboard denied'))
    const user = userEvent.setup()

    await renderDialog(3113)
    expect(await screen.findByRole('heading', { name: '文件一' })).toBeInTheDocument()
    const copyButtons = screen.getAllByRole('button', { name: '复制路径' })
    expect(copyButtons).toHaveLength(4)
    expect(copyButtons[3]).toBeDisabled()

    await user.click(copyButtons[0])
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('路径已复制'))
    await user.click(copyButtons[1])
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1))
    await user.click(copyButtons[2])
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(2))
    await user.click(copyButtons[3])

    expect(mocks.copyToClipboard.mock.calls).toEqual([
      ['/downloads/one.mkv'],
      ['/downloads/two.mkv'],
      ['/downloads/three.mkv'],
    ])
    expect(mocks.toastError).toHaveBeenNthCalledWith(1, '复制失败')
    expect(mocks.toastError).toHaveBeenNthCalledWith(2, '复制失败')
  })

  it('renders every episode and its active-tab files on mobile', async () => {
    setViewport(480)
    const info = createFilesInfo({
      episodes: {
        2: {
          download: [{ file_path: '/downloads/mobile-2.mkv', torrent_title: '移动第二集' }],
          library: [],
          title: '移动第二集',
        },
        1: {
          download: [{ file_path: '/downloads/mobile-1.mkv', torrent_title: '移动第一集' }],
          library: [{ file_path: '/media/mobile-1.mkv', storage: 'mobile-storage' }],
          title: '移动第一集',
        },
      },
      subscribe: createSubscribe({ total_episode: 2 }),
    })
    useFilesResponse(3114, info as unknown as JsonBodyType)
    const user = userEvent.setup()

    await renderDialog(3114)
    expect(await screen.findByRole('heading', { name: '文件测试剧' })).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('.subscribe-files-mobile-list')).not.toBeNull())
    expect(document.querySelector('.subscribe-files-episode-rail')).toBeNull()
    const mobileCards = document.querySelectorAll('.subscribe-files-mobile-card')
    expect(mobileCards).toHaveLength(2)
    expect(mobileCards[0]).toHaveTextContent('E01')
    expect(mobileCards[0]).toHaveTextContent('/downloads/mobile-1.mkv')
    expect(mobileCards[1]).toHaveTextContent('E02')
    expect(mobileCards[1]).toHaveTextContent('/downloads/mobile-2.mkv')

    await user.click(screen.getByRole('button', { name: '媒体库文件' }))
    expect(await screen.findByText('/media/mobile-1.mkv')).toBeInTheDocument()
    expect(screen.getByText('暂无媒体库文件')).toBeInTheDocument()
  })

  it('uses the movie model for episode zero and keeps its statistics meaningful', async () => {
    const info = createFilesInfo({
      episodes: {
        0: {
          download: [{ file_path: '/downloads/movie.4k.mkv', torrent_title: 'Movie.4K' }],
          library: [],
          title: '电影正片',
        },
      },
      subscribe: createSubscribe({ season: undefined, total_episode: 0, type: '电影' }),
    })
    useFilesResponse(3115, info as unknown as JsonBodyType)

    await renderDialog(3115)

    expect(await screen.findByRole('heading', { name: '文件测试剧' })).toBeInTheDocument()
    const rail = document.querySelector('.subscribe-files-episode-rail') as HTMLElement
    expect(within(rail).getByRole('button')).toHaveTextContent('电影')
    expect(within(rail).getByRole('button')).toHaveTextContent('电影正片')
    expect(document.querySelector('.subscribe-files-detail__title')).toHaveTextContent('电影')
    expect(screen.getAllByText('1/1')).toHaveLength(1)
    expect(screen.getByText('4K')).toBeInTheDocument()
  })

  it('shows season zero as a valid season label', async () => {
    const info = createFilesInfo({
      subscribe: createSubscribe({ season: 0, total_episode: 1 }),
    })
    useFilesResponse(3101, info as unknown as JsonBodyType)

    await renderDialog(3101)

    expect(await screen.findByRole('heading', { name: '文件测试剧' })).toBeInTheDocument()
    expect(screen.getByText('第 0 季')).toBeInTheDocument()
  })

  it('distinguishes an HTTP failure from an empty response and offers retry', async () => {
    const info = createFilesInfo({ subscribe: createSubscribe({ name: '重试恢复剧', total_episode: 1 }) })
    let requestCount = 0
    server.use(
      http.get(subscribeApiUrls.filesById(3102), () => {
        requestCount += 1
        if (requestCount === 1) return HttpResponse.json({}, { status: 500 })
        return HttpResponse.json(info as unknown as JsonBodyType)
      }),
    )
    const user = userEvent.setup()

    await renderDialog(3102)

    expect(await screen.findByText('服务器错误，请稍后重试。')).toBeInTheDocument()
    expect(screen.queryByText('没有数据')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('heading', { name: '重试恢复剧' })).toBeInTheDocument()
    expect(screen.queryByText('服务器错误，请稍后重试。')).not.toBeInTheDocument()
    expect(requestCount).toBe(2)
  })

  it('shows loading until the request resolves', async () => {
    const deferred = createDeferred<JsonBodyType>()
    server.use(
      http.get(subscribeApiUrls.filesById(3116), async () => {
        return HttpResponse.json(await deferred.promise)
      }),
    )

    await renderDialog(3116)

    expect(document.querySelector('.initial-loading-container')).not.toBeNull()
    deferred.resolve(createFilesInfo() as unknown as JsonBodyType)
    expect(await screen.findByRole('heading', { name: '文件测试剧' })).toBeInTheDocument()
    expect(document.querySelector('.initial-loading-container')).toBeNull()
  })

  it('keeps a successful empty response as the no-data state without retry', async () => {
    useFilesResponse(3117, { episodes: {}, subscribe: null })

    await renderDialog(3117)

    expect(await screen.findByText('没有数据')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument()
  })

  it.each([
    ['R', '订阅中'],
    ['P', '待处理'],
    ['S', '已暂停'],
    ['N', '新订阅'],
    ['unexpected', '未知'],
  ])('renders subscription state %s as %s', async (state, label) => {
    const info = createFilesInfo({
      episodes: {},
      subscribe: createSubscribe({ state, total_episode: 0 }),
    })
    useFilesResponse(3118, info as unknown as JsonBodyType)

    await renderDialog(3118)

    expect(await screen.findByRole('heading', { name: '文件测试剧' })).toBeInTheDocument()
    const chips = document.querySelector('.subscribe-files-hero__chips') as HTMLElement
    expect(within(chips).getByText(label)).toBeInTheDocument()
    expect(screen.getAllByText('0/0')).toHaveLength(2)
    expect(screen.getByText('缺失 0')).toBeInTheDocument()
  })

  it('emits close from the dialog close button', async () => {
    useFilesResponse(3119, createFilesInfo() as unknown as JsonBodyType)
    const user = userEvent.setup()
    const { close } = await renderDialog(3119)

    expect(await screen.findByRole('heading', { name: '文件测试剧' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭' }))

    expect(close).toHaveBeenCalledOnce()
  })
})
