import { formatDateDifference, formatFileSize } from '@/@core/utils/formatters'
import type { Context, MediaInfo, MetaInfo, TorrentInfo } from '@/api/types'
import TorrentCard from '@/components/cards/TorrentCard.vue'
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
      media_id: 'tt1000001',
      media_source: 'imdb',
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

async function renderCard(context: Context, more: Context[] = []) {
  return renderWithProviders(TorrentCard, {
    global: { stubs: { VImg: ImageStub } },
    props: { more, torrent: context },
  })
}

function getCard(container: Element) {
  const card = container.querySelector<HTMLElement>('.torrent-card')
  expect(card).not.toBeNull()
  return card as HTMLElement
}

function getDetailButton(container: Element) {
  const button = container.querySelector<HTMLButtonElement>('.v-card-actions .v-btn--icon')
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

describe('TorrentCard approved regressions', () => {
  beforeEach(() => {
    Object.keys(downloadedTorrentMap).forEach(url => delete downloadedTorrentMap[url])
    mocks.getCachedSiteIcon.mockImplementation((site: number) =>
      Promise.resolve(`https://images.example.com/site-${site}.png`),
    )
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('omits a missing season and episode from the download title', async () => {
    const context = createContext({ meta: { season_episode: undefined } })
    const { container } = await renderCard(context)

    await fireEvent.click(getCard(container))
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())

    expect(mocks.openSharedDialog.mock.calls[0]?.[1]).toMatchObject({
      media: context.media_info,
      title: '测试电影 (2026)',
      torrent: context.torrent_info,
    })
  })

  it('does not open a blank detail page or trigger download when the URL is missing', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const context = createContext({ torrent: { page_url: undefined } })
    const { container } = await renderCard(context)

    await fireEvent.click(getDetailButton(container))

    expect(open).not.toHaveBeenCalled()
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })
})

describe('TorrentCard display and interactions', () => {
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
      media: { title: '可见媒体' },
      meta: {
        edition: 'IMAX',
        resource_pix: '2160p',
        resource_team: '测试组',
        season_episode: 'S02E03',
        subtitle: '国粤双语',
        video_encode: 'HEVC',
        web_source: 'Netflix',
      },
      torrent: {
        description: '种子描述',
        downloadvolumefactor: 0,
        freedate_diff: '剩余 1 天',
        hit_and_run: true,
        labels: ['国语', '杜比视界'],
        peers: 4,
        pubdate: '2026-07-29 12:00:00',
        seeders: 12,
        size: 1536,
        site_name: '高清测试站',
        title: 'Visible.Media.S02E03.2160p',
        uploadvolumefactor: 2,
      },
    })

    const { container } = await renderCard(context)

    for (const text of [
      '可见媒体',
      'S02E03',
      'Visible.Media.S02E03.2160p',
      '国粤双语',
      '高清测试站',
      'Netflix',
      'IMAX',
      '2160p',
      'HEVC',
      '测试组',
      '国语',
      '杜比视界',
      'H&R',
      '剩余 1 天',
      formatFileSize(1536),
      formatDateDifference('2026-07-29 12:00:00'),
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
    expect(container.querySelector('.discount-banner')).toHaveClass('bg-success')
    await waitFor(() => expect(container.querySelector<HTMLImageElement>('img')?.src).toContain('site-101.png'))
  })

  it('falls back to the recognized name and tracker initial when richer metadata and icon are unavailable', async () => {
    mocks.getCachedSiteIcon.mockRejectedValue(new Error('icon unavailable'))
    const context = createContext({
      media: { title: undefined },
      meta: { name: '识别名称', subtitle: undefined },
      torrent: { description: undefined, site_name: '备用站' },
    })

    const { container } = await renderCard(context)

    expect(screen.getByText('识别名称')).toBeInTheDocument()
    expect(screen.getByText('备')).toBeInTheDocument()
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it.each([
    ['discount', 0.5, 1, 'bg-orange'],
    ['upload bonus', 1, 2, 'bg-purple'],
    ['unclassified promotion', 2, 1, null],
  ] as const)('projects the %s promotion style', async (_case, downloadFactor, uploadFactor, expectedClass) => {
    const { container } = await renderCard(
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

  it('opens the download dialog with the current Context and shares successful download state across cards', async () => {
    const context = createContext({ meta: { season_episode: 'S01E02' } })
    const Harness = {
      components: { TorrentCard },
      data: () => ({ context }),
      template: '<div><TorrentCard :torrent="context" /><TorrentCard :torrent="context" /></div>',
    }
    const { container } = await renderWithProviders(Harness, {
      global: { stubs: { VImg: ImageStub } },
    })

    await fireEvent.click(container.querySelector('.torrent-card') as Element)
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const { events, options, props } = getDialogCall()

    expect(props).toEqual({
      media: context.media_info,
      title: '测试电影 (2026) S01E02',
      torrent: context.torrent_info,
    })
    expect(options).toEqual({ closeOn: ['close', 'done', 'error'] })

    events.done('')
    expect(container.querySelectorAll('.torrent-card.border-success')).toHaveLength(0)

    events.done(context.torrent_info.enclosure)
    await waitFor(() => expect(container.querySelectorAll('.torrent-card.border-success')).toHaveLength(2))

    events.error('下载失败')
    expect(console.error).toHaveBeenCalledWith('下载失败')
  })

  it('opens more sources with candidate icons and keeps alternative download and detail Context intact', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const primary = createContext()
    const alternative = createContext({
      media: { title: '备选媒体', title_year: '备选媒体 (2025)' },
      meta: { name: '备选名称', season_episode: 'S03E04' },
      torrent: {
        enclosure: 'https://downloads.example.com/alternative.torrent',
        page_url: 'https://tracker.example.com/details/202',
        site: 202,
        site_name: '备选站',
        title: 'Alternative.Media.S03E04',
      },
    })
    const { container } = await renderCard(primary, [alternative])

    await fireEvent.click(screen.getByRole('button', { name: /更多来源/ }))
    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    const moreDialog = getDialogCall()
    expect(moreDialog.props.items).toEqual([alternative])
    expect(moreDialog.options).toEqual({ closeOn: ['close', 'update:modelValue'] })
    await waitFor(() =>
      expect(moreDialog.props.siteIcons).toEqual(
        expect.objectContaining({ 202: 'https://images.example.com/site-202.png' }),
      ),
    )

    moreDialog.events.download(alternative)
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledTimes(2))
    expect(getDialogCall(1).props).toEqual({
      media: alternative.media_info,
      title: '备选媒体 (2025) S03E04',
      torrent: alternative.torrent_info,
    })

    moreDialog.events.detail(alternative)
    expect(open).toHaveBeenCalledWith(alternative.torrent_info.page_url, '_blank')
    expect(container.querySelector('.torrent-card')).toBeInTheDocument()
  })

  it('opens an available primary detail URL without starting a download', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const context = createContext()
    const { container } = await renderCard(context)

    await fireEvent.click(getDetailButton(container))

    expect(open).toHaveBeenCalledWith(context.torrent_info.page_url, '_blank')
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })
})
