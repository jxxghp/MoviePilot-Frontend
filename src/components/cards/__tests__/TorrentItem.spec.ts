import { formatDateDifference, formatFileSize } from '@/@core/utils/formatters'
import type { Context, MediaInfo, MetaInfo, TorrentInfo } from '@/api/types'
import TorrentItem from '@/components/cards/TorrentItem.vue'
import { downloadedTorrentMap } from '@/utils/torrentDownloadCache'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCachedSiteIcon: vi.fn(),
  openSharedDialog: vi.fn(),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/utils/siteIconCache', () => ({
  getCachedSiteIcon: (...args: unknown[]) => mocks.getCachedSiteIcon(...args),
}))

const ImageStub = defineComponent({
  inheritAttrs: false,
  props: {
    alt: String,
    src: String,
  },
  setup: props => () => h('img', { alt: props.alt, src: props.src }),
})

interface ContextOverrides {
  media?: Partial<MediaInfo>
  meta?: Partial<MetaInfo>
  torrent?: Partial<TorrentInfo>
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function createContext(overrides: ContextOverrides = {}): Context {
  return {
    media_info: {
      episode_run_time: [],
      origin_country: [],
      title: '测试电影',
      title_year: '测试电影 (2026)',
      ...overrides.media,
    },
    meta_info: {
      apply_words: [],
      audio_term: '',
      edition: '',
      episode: '',
      episode_list: [],
      episode_seq: '',
      episode_seqs: '',
      episodes: '',
      isfile: false,
      name: '测试电影',
      release_group: '',
      resource_term: '',
      sea: '',
      season: '',
      season_episode: '',
      season_list: [],
      season_seq: '',
      total_episode: 0,
      total_season: 0,
      type: '电影',
      video_term: '',
      web_source: '',
      ...overrides.meta,
    },
    torrent_info: {
      category: '电影',
      downloadvolumefactor: 1,
      enclosure: 'https://downloads.example.com/test.torrent',
      freedate: '',
      freedate_diff: '',
      grabs: 3,
      hit_and_run: false,
      imdbid: 'tt1000001',
      labels: [],
      page_url: 'https://tracker.example.com/details/1001',
      peers: 2,
      pri_order: 0,
      seeders: 10,
      site: 101,
      site_name: '测试站',
      site_order: 0,
      site_proxy: false,
      size: 1024,
      title: 'Test.Movie.2026.1080p',
      uploadvolumefactor: 1,
      volume_factor: 'FREE',
      ...overrides.torrent,
    },
  }
}

async function renderItem(context: Context) {
  return renderWithProviders(TorrentItem, {
    global: { stubs: { VImg: ImageStub } },
    props: { torrent: context },
  })
}

function getItem(container: Element) {
  const item = container.querySelector<HTMLElement>('.torrent-item')
  expect(item).not.toBeNull()
  return item as HTMLElement
}

function getDetailButton(container: Element) {
  const button = container.querySelector<HTMLButtonElement>('.v-list-item__append .v-btn--icon')
  expect(button).not.toBeNull()
  return button as HTMLButtonElement
}

function getDialogCall(index = 0) {
  const [, props, events, options] = mocks.openSharedDialog.mock.calls[index] as [
    unknown,
    Record<string, unknown>,
    Record<string, (...args: unknown[]) => void>,
    Record<string, unknown>,
  ]
  return { events, options, props }
}

describe('TorrentItem approved regressions', () => {
  beforeEach(() => {
    Object.keys(downloadedTorrentMap).forEach(url => delete downloadedTorrentMap[url])
    mocks.getCachedSiteIcon.mockResolvedValue('https://images.example.com/site-101.png')
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('does not open a blank detail page or trigger download when the URL is missing', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const context = createContext({ torrent: { page_url: undefined } })
    const { container } = await renderItem(context)

    await fireEvent.click(getDetailButton(container))

    expect(open).not.toHaveBeenCalled()
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })

  it('keeps the current site icon when an older request resolves last', async () => {
    const oldIcon = createDeferred<string>()
    const currentIcon = createDeferred<string>()
    mocks.getCachedSiteIcon.mockImplementation((site: number) => (site === 101 ? oldIcon.promise : currentIcon.promise))
    const oldContext = createContext({ torrent: { site: 101, site_name: '旧站' } })
    const currentContext = createContext({ torrent: { site: 202, site_name: '当前站' } })

    const { container, rerender } = await renderItem(oldContext)
    await waitFor(() => expect(mocks.getCachedSiteIcon).toHaveBeenCalledWith(101, expect.any(Function)))
    await rerender({ torrent: currentContext })
    await waitFor(() => expect(mocks.getCachedSiteIcon).toHaveBeenCalledWith(202, expect.any(Function)))

    currentIcon.resolve('https://images.example.com/site-202.png')
    await waitFor(() => expect(container.querySelector<HTMLImageElement>('img')?.src).toContain('site-202.png'))

    oldIcon.resolve('https://images.example.com/site-101.png')
    await waitFor(() => expect(mocks.getCachedSiteIcon).toHaveBeenCalledTimes(2))
    await Promise.resolve()

    expect(container.querySelector<HTMLImageElement>('img')?.src).toContain('site-202.png')
  })
})

describe('TorrentItem display and interactions', () => {
  beforeEach(() => {
    Object.keys(downloadedTorrentMap).forEach(url => delete downloadedTorrentMap[url])
    mocks.getCachedSiteIcon.mockImplementation((site: number) =>
      Promise.resolve(`https://images.example.com/site-${site}.png`),
    )
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders the current title, release metadata, tracker state, labels, size, and time', async () => {
    const context = createContext({
      media: { title: '列表媒体' },
      meta: {
        edition: '导演剪辑版',
        resource_pix: '1080p',
        resource_team: '列表组',
        season_episode: 'S01E08',
        subtitle: '简繁字幕',
        video_encode: 'AV1',
        web_source: 'Apple TV+',
      },
      torrent: {
        downloadvolumefactor: 0.5,
        freedate_diff: '剩余 2 小时',
        hit_and_run: true,
        labels: ['国语', '高码率'],
        peers: 6,
        pubdate: '2026-07-29 18:00:00',
        seeders: 24,
        size: 2048,
        site_name: '列表测试站',
        title: 'List.Media.S01E08.1080p',
        uploadvolumefactor: 1,
      },
    })

    const { container } = await renderItem(context)

    for (const text of [
      '列表媒体',
      'S01E08',
      'List.Media.S01E08.1080p',
      '简繁字幕',
      'Apple TV+',
      '导演剪辑版',
      '1080p',
      'AV1',
      '列表组',
      '国语',
      '高码率',
      'H&R',
      '剩余 2 小时',
      formatFileSize(2048),
      formatDateDifference('2026-07-29 18:00:00'),
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
    expect(container.querySelector('.discount-banner')).toHaveClass('bg-orange')
    expect(container.querySelector('.torrent-item [title="列表测试站"]')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector<HTMLImageElement>('img')?.src).toContain('site-101.png'))
  })

  it('falls back to the recognized name, placeholder description, and tracker initial', async () => {
    mocks.getCachedSiteIcon.mockRejectedValue(new Error('icon unavailable'))
    const context = createContext({
      media: { title: undefined },
      meta: { name: '列表识别名称', subtitle: undefined },
      torrent: { description: undefined, site_name: '备用列表站' },
    })

    const { container } = await renderItem(context)

    expect(screen.getByText('列表识别名称')).toBeInTheDocument()
    expect(screen.getByText('暂无描述')).toBeInTheDocument()
    expect(screen.getByText('备')).toBeInTheDocument()
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it.each([
    ['free', 0, 1, 'bg-success'],
    ['upload bonus', 1, 2, 'bg-purple'],
    ['unclassified promotion', 2, 1, null],
  ] as const)('projects the %s promotion style', async (_case, downloadFactor, uploadFactor, expectedClass) => {
    const { container } = await renderItem(
      createContext({
        torrent: {
          downloadvolumefactor: downloadFactor,
          uploadvolumefactor: uploadFactor,
          volume_factor: _case,
        },
      }),
    )
    const banner = container.querySelector('.discount-banner')

    expect(banner).toBeInTheDocument()
    if (expectedClass) expect(banner).toHaveClass(expectedClass)
    else expect(banner).not.toHaveClass('bg-success', 'bg-orange', 'bg-purple')
  })

  it('opens the download dialog with the current Context and marks the item after success', async () => {
    const context = createContext({ meta: { season_episode: 'S04E05' } })
    const { container } = await renderItem(context)

    await fireEvent.click(getItem(container))
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const { events, options, props } = getDialogCall()

    expect(props).toEqual({
      media: context.media_info,
      title: '测试电影 (2026) S04E05',
      torrent: context.torrent_info,
    })
    expect(options).toEqual({ closeOn: ['close', 'done', 'error'] })

    events.done('')
    expect(getItem(container)).not.toHaveClass('border-success')

    events.done(context.torrent_info.enclosure)
    await waitFor(() => expect(getItem(container)).toHaveClass('border-success'))

    events.error('下载失败')
    expect(console.error).toHaveBeenCalledWith('下载失败')
  })

  it('opens an available detail URL without starting a download', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const context = createContext()
    const { container } = await renderItem(context)

    await fireEvent.click(getDetailButton(container))

    expect(open).toHaveBeenCalledWith(context.torrent_info.page_url, '_blank')
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })

  it('clears a resolved icon when the current Context has no site identity', async () => {
    const current = createContext({ torrent: { site: 101, site_name: '当前站' } })
    const withoutSite = createContext({ torrent: { site: undefined, site_name: '无站点' } })
    const { container, rerender } = await renderItem(current)
    await waitFor(() => expect(container.querySelector<HTMLImageElement>('img')?.src).toContain('site-101.png'))

    await rerender({ torrent: withoutSite })

    await waitFor(() => expect(container.querySelector('img')).not.toBeInTheDocument())
    expect(screen.getByText('无')).toBeInTheDocument()
    expect(mocks.getCachedSiteIcon).toHaveBeenCalledOnce()
  })
})
