import { formatDateDifference } from '@/@core/utils/formatters'
import type { Subscribe } from '@/api/types'
import SubscribeCard from '@/components/cards/SubscribeCard.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { createSubscribe } from '@tests/support/factories/subscribe'
import {
  deleteSubscribeByIdHandler,
  resetSubscribeByIdHandler,
  searchSubscribeByIdHandler,
  updateSubscribeStatusHandler,
} from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  openSharedDialog: vi.fn(),
  routerPush: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => mocks.confirm,
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/router', () => ({
  default: { push: (...args: unknown[]) => mocks.routerPush(...args) },
}))

function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width, writable: true })
  window.dispatchEvent(new Event('resize'))
}

function observeElementsImmediately() {
  class ImmediateIntersectionObserver {
    readonly root = null
    readonly rootMargin = '0px'
    readonly thresholds = [0]

    constructor(private readonly callback: IntersectionObserverCallback) {}

    disconnect() {}

    observe(target: Element) {
      this.callback([{ intersectionRatio: 1, isIntersecting: true, target } as IntersectionObserverEntry], this)
    }

    takeRecords(): IntersectionObserverEntry[] {
      return []
    }

    unobserve() {}
  }

  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver)
}

async function renderCard(
  mediaOverrides: Partial<Subscribe> = {},
  props: Partial<{ batchMode: boolean; selected: boolean; sortable: boolean }> = {},
  globalImageCache = false,
) {
  const media = createSubscribe({
    backdrop: 'https://images.example.com/backdrop.jpg',
    id: 2501,
    last_update: '2026-07-16 12:00:00',
    name: '卡片测试媒体',
    poster: 'https://images.example.com/poster.jpg',
    ...mediaOverrides,
  })
  const result = await renderWithProviders(SubscribeCard, {
    initialState: {
      globalSettings: {
        data: { GLOBAL_IMAGE_CACHE: globalImageCache },
        initialized: true,
        loading: false,
      },
    },
    props: { media, ...props },
  })
  return { ...result, media }
}

function getMenuButton(container: Element) {
  const selector = window.innerWidth < 600 ? '.subscribe-card-mobile-menu' : '.absolute.top-1.right-4 .v-btn'
  const button = container.querySelector<HTMLButtonElement>(selector)
  expect(button).not.toBeNull()
  return button as HTMLButtonElement
}

async function openMenu(container: Element) {
  await fireEvent.click(getMenuButton(container))
}

async function chooseMenuItem(container: Element, label: string) {
  await openMenu(container)
  await fireEvent.click(await screen.findByText(label))
}

function getDialogCall(index = 0) {
  const [, props, events, options] = mocks.openSharedDialog.mock.calls[index] as [
    unknown,
    Record<string, unknown>,
    Record<string, () => void>,
    Record<string, unknown>,
  ]
  return { events, options, props }
}

describe('SubscribeCard display and progress', () => {
  beforeEach(() => {
    setViewport(1024)
    observeElementsImmediately()
    mocks.confirm.mockResolvedValue(true)
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('renders stable movie metadata and omits episode progress without a total', async () => {
    const { container, media } = await renderCard({ total_episode: undefined, type: '电影', year: '2025' }, {}, true)

    expect(screen.getByText(media.name)).toBeInTheDocument()
    expect(screen.getByText('2025')).toBeInTheDocument()
    expect(screen.getByText(media.username)).toHaveAttribute('title', media.username)
    const image = container.querySelector<HTMLImageElement>('img')
    expect(image).not.toBeNull()
    expect((image as HTMLImageElement).src).toContain('system/cache/image?url=')
    expect((image as HTMLImageElement).src).toContain(encodeURIComponent(media.backdrop || ''))
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText(/^\d{1,4} \/ \d{1,4}$/)).not.toBeInTheDocument()
  })

  it('uses the poster as the background fallback and replaces failed images with the placeholder', async () => {
    const { container, media } = await renderCard({ backdrop: undefined })
    const image = container.querySelector<HTMLImageElement>('img')

    expect(image).not.toBeNull()
    expect((image as HTMLImageElement).src).toContain(media.poster || '')

    await fireEvent.error(image as HTMLImageElement)

    await waitFor(() => expect(container.querySelector('.subscribe-card-placeholder')).toBeInTheDocument())
  })

  it('falls back from backdrop to poster for music subscriptions, then to the album placeholder', async () => {
    // 仅海报：背景图回退到海报
    const { container: posterOnly } = await renderCard(
      {
        backdrop: undefined,
        poster: 'https://images.example.com/music-poster.jpg',
        type: '音乐',
      },
      {},
      true,
    )
    const posterOnlyImage = posterOnly.querySelector<HTMLImageElement>('img')
    expect(posterOnlyImage).not.toBeNull()
    expect((posterOnlyImage as HTMLImageElement).src).toContain('system/cache/image?url=')
    expect((posterOnlyImage as HTMLImageElement).src).toContain(
      encodeURIComponent('https://images.example.com/music-poster.jpg'),
    )

    // 背景图与海报都缺失：渲染与音乐媒体卡片一致的胶片占位背景
    const { container } = await renderCard({ backdrop: undefined, poster: undefined, type: '音乐' })
    const placeholder = container.querySelector('.subscribe-card-placeholder')
    expect(placeholder).toBeInTheDocument()
    expect(placeholder?.querySelector('.v-icon, [class*="mdi-album"]')).not.toBeNull()
    expect(container.querySelector('img')).toBeNull()
  })

  it.each([480, 1024])('shows whole-album track count without fake episode progress at %ipx', async width => {
    setViewport(width)
    await renderCard({
      music_type: 'album',
      name: '叶惠美',
      total_episode: undefined,
      total_tracks: 11,
      type: '音乐',
    })

    expect(screen.getByText('专辑 · 11 首')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText(/^\d{1,4} \/ \d{1,4}$/)).not.toBeInTheDocument()
  })

  it('shows the current music quality on a music subscription card', async () => {
    await renderCard({
      current_audio_format: 'FLAC',
      current_bit_depth: 24,
      current_bitrate: 2304000,
      current_sample_rate: 96000,
      music_type: 'album',
      name: '高解析专辑',
      total_tracks: 11,
      type: '音乐',
    })

    expect(screen.getByText('专辑 · 11 首 · FLAC · 24-bit · 96 kHz · 2,304 kbps')).toBeInTheDocument()
  })

  it.each([480, 1024])('identifies recording subscriptions at %ipx', async width => {
    setViewport(width)
    await renderCard({ music_type: 'recording', name: '晴天', total_tracks: undefined, type: '音乐' })

    expect(screen.getByText('单曲')).toBeInTheDocument()
    expect(screen.queryByText(/首$/)).not.toBeInTheDocument()
  })

  it('keeps the album identity visible when a legacy subscription has no track count', async () => {
    await renderCard({ music_type: 'album', name: '旧专辑', total_tracks: undefined, type: '音乐' })

    expect(screen.getByText('专辑')).toBeInTheDocument()
  })

  it.each([
    ['regular progress', 10, 4, '6 / 10', '60'],
    ['negative missing episodes', 10, -2, '10 / 10', '100'],
    ['missing episodes above the total', 10, 12, '0 / 10', null],
    ['zero total', 0, 0, null, null],
  ])('normalizes %s', async (_case, totalEpisode, lackEpisode, expectedText, expectedProgress) => {
    await renderCard({ lack_episode: lackEpisode, season: 2, total_episode: totalEpisode, type: '电视剧' })

    if (expectedText) expect(screen.getByText(expectedText)).toBeInTheDocument()
    else expect(screen.queryByText(/^\d{1,4} \/ \d{1,4}$/)).not.toBeInTheDocument()

    if (expectedProgress) expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', expectedProgress)
    else expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByText(/卡片测试媒体 S02/)).toBeInTheDocument()
  })

  it.each([
    ['boolean flag with tv type', true, false, 3, 'tv', 30, true, false],
    ['numeric flags with negative completed episodes', 1, 1, -2, '电视剧', 0, true, true],
    ['string flags with completed episodes above the total', '1', '1', 12, '电影', 100, true, true],
    ['disabled flag', false, true, 3, '电视剧', 80, false, false],
  ])(
    'normalizes %s for wash progress and badges',
    async (
      _case,
      bestVersion,
      bestVersionFull,
      completedEpisode,
      type,
      expectedProgress,
      expectedWash,
      expectedFull,
    ) => {
      const { container } = await renderCard({
        best_version: bestVersion,
        best_version_full: bestVersionFull,
        completed_episode: completedEpisode,
        lack_episode: 2,
        total_episode: 10,
        type,
      })
      const image = container.querySelector<HTMLImageElement>('img')
      expect(image).not.toBeNull()
      await fireEvent.load(image as HTMLImageElement)

      const progress = screen.getByRole('progressbar')
      expect(progress).toHaveAttribute('aria-valuenow', String(expectedProgress))
      expect(progress.querySelector('.v-progress-linear__buffer')).toHaveStyle({ width: expectedWash ? '80%' : '0%' })
      expect(Boolean(container.querySelector('.best-version-badge'))).toBe(expectedWash)
      expect(Boolean(container.querySelector('.best-version-badge-full'))).toBe(expectedFull)
      expect(container.querySelector('.subscribe-card')).not.toHaveClass('subscribe-card-best-version-tint')
    },
  )

  it('keeps mobile wash progress compact while preserving P, S, and R metadata', async () => {
    setViewport(480)
    const { container, media, rerender } = await renderCard({
      best_version: true,
      completed_episode: 3,
      lack_episode: 2,
      season: 1,
      state: 'P',
      total_episode: 10,
      type: '电视剧',
    })
    const lastUpdateText = formatDateDifference(media.last_update)

    expect(screen.getByLabelText('待定中')).toBeInTheDocument()
    expect(screen.getByText('8 / 10')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '30')
    expect(screen.getByText(lastUpdateText)).toBeInTheDocument()
    expect(document.querySelector('.subscribe-card-mobile-menu')).toBeInTheDocument()
    expect(document.querySelector('.subscribe-card-mobile-media')).toContainElement(screen.getByText(/卡片测试媒体/))
    expect(document.querySelector('.subscribe-card-mobile-image-meta__updated')).toHaveTextContent(lastUpdateText)
    expect(document.querySelector('.subscribe-card-mobile-body')).not.toHaveTextContent('卡片测试媒体')
    expect(document.querySelector('.subscribe-card-mobile-season')).toHaveTextContent('S01')
    expect(document.querySelector('.subscribe-card-mobile-title-text')).toHaveTextContent('卡片测试媒体S01')
    expect(document.querySelector('.subscribe-card-mobile-best-version-badge')).not.toBeInTheDocument()
    expect(container.querySelector('.subscribe-card')).toHaveClass('subscribe-card-pending-tint')
    expect(container.querySelector('.subscribe-card')).not.toHaveClass('subscribe-card-best-version-tint')

    await rerender({ media: { ...media, state: 'S' } })
    expect(screen.getByLabelText('已暂停')).toBeInTheDocument()
    expect(screen.getByText(lastUpdateText)).toBeInTheDocument()
    expect(container.querySelector('.subscribe-card')).not.toHaveClass('subscribe-card-best-version-tint')

    await rerender({ media: { ...media, state: 'R' } })
    expect(screen.getByLabelText('订阅中')).toBeInTheDocument()
    expect(screen.getByText(lastUpdateText)).toBeInTheDocument()
    expect(container.querySelector('.subscribe-card')).toHaveClass('subscribe-card-best-version-tint')
  })

  it('applies mobile wash visuals to movies without episode progress', async () => {
    setViewport(480)
    const { container } = await renderCard({
      best_version: true,
      state: 'R',
      total_episode: undefined,
      type: '电影',
    })

    expect(container.querySelector('.subscribe-card')).toHaveClass('subscribe-card-best-version-tint')
    expect(container.querySelector('[data-subscribe-state-icon="mdi-shimmer"]')).toBeInTheDocument()
    expect(container.querySelector('.subscribe-card-mobile-state')).toHaveStyle({
      color: 'rgb(var(--v-theme-success))',
    })
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('synchronizes desktop P, S, and R state from updated media props', async () => {
    const { container, media, rerender } = await renderCard({ state: 'P' })
    const lastUpdateText = formatDateDifference(media.last_update)

    expect(screen.getByText('待定中')).toBeInTheDocument()
    expect(screen.queryByText(lastUpdateText)).not.toBeInTheDocument()

    await rerender({ media: { ...media, state: 'S' } })
    expect(screen.getByText('已暂停')).toBeInTheDocument()
    expect(container.querySelector('.subscribe-card')).toHaveClass('subscribe-card-paused')

    await rerender({ media: { ...media, state: 'R' } })
    expect(screen.getByText(lastUpdateText)).toBeInTheDocument()
    expect(screen.queryByText('已暂停')).not.toBeInTheDocument()
    expect(container.querySelector('.subscribe-card')).not.toHaveClass('subscribe-card-paused')
  })

  it.each([480, 1024])('shows governed execution state and safe failure detail at %ipx', async width => {
    setViewport(width)
    await renderCard({
      execution_status: {
        batch_id: 'batch-1',
        can_cancel: true,
        current_site_id: 9,
        error: '站点 9 冷却中',
        phase: 'waiting_site_budget',
        state: 'waiting_site_budget',
        updated_at: '2026-09-01T01:00:00+00:00',
      },
    })

    expect(screen.getByText('等待站点额度')).toBeInTheDocument()
    const status = screen.getByTitle('站点 9 冷却中')
    expect(status).toBeInTheDocument()
    await fireEvent.mouseEnter(status)
    await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('站点 9 冷却中'))
  })

  it.each([480, 1024])('shows a skipped execution as a non-error terminal state at %ipx', async width => {
    setViewport(width)
    await renderCard({
      execution_status: {
        can_cancel: false,
        phase: 'skipped',
        state: 'skipped',
        updated_at: '2026-09-01T01:00:00+00:00',
      },
    })

    expect(screen.getByText('本轮已跳过')).toBeInTheDocument()
    if (width < 600) {
      expect(document.querySelector('[data-subscribe-state-icon="mdi-skip-next-circle-outline"]')).toBeInTheDocument()
    }
  })

  it.each([480, 1024])('briefly shows a fresh completion then restores normal metadata at %ipx', async width => {
    setViewport(width)
    const { media, rerender, unmount } = await renderCard({
      lack_episode: 4,
      state: 'R',
      total_episode: 10,
      type: '电视剧',
    })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-02T12:00:00+08:00'))

    try {
      await rerender({
        media: {
          ...media,
          execution_status: {
            can_cancel: false,
            phase: 'completed',
            state: 'completed',
            updated_at: new Date().toISOString(),
          },
        },
      })

      expect(screen.getByText('执行完成')).toBeInTheDocument()
      if (width < 600) expect(screen.queryByText('6 / 10')).not.toBeInTheDocument()

      await vi.advanceTimersByTimeAsync(5_000)

      expect(screen.queryByText('执行完成')).not.toBeInTheDocument()
      expect(screen.getByText('6 / 10')).toBeInTheDocument()
      if (width >= 600) expect(screen.getByText(formatDateDifference(media.last_update))).toBeInTheDocument()
    } finally {
      unmount()
      vi.useRealTimers()
    }
  })

  it('does not revive an expired completion after the card is reloaded', async () => {
    setViewport(480)
    await renderCard({
      execution_status: {
        can_cancel: false,
        phase: 'completed',
        state: 'completed',
        updated_at: new Date(Date.now() - 6_000).toISOString(),
      },
      lack_episode: 4,
      state: 'R',
      total_episode: 10,
      type: '电视剧',
    })

    expect(screen.queryByText('执行完成')).not.toBeInTheDocument()
    expect(screen.getByText('6 / 10')).toBeInTheDocument()
  })
})

describe('SubscribeCard interaction boundaries', () => {
  beforeEach(() => {
    setViewport(1024)
    observeElementsImmediately()
    mocks.confirm.mockResolvedValue(true)
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('routes normal, batch, selected, and sortable card clicks without overlap', async () => {
    const { container, emitted, media, rerender } = await renderCard()
    const card = container.querySelector('.subscribe-card') as HTMLElement

    await fireEvent.click(card)
    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()

    await rerender({ batchMode: true, media, selected: true })
    await fireEvent.click(card)
    expect(emitted('select')).toHaveLength(1)
    expect(container.querySelector('.subscribe-card-shell')).toHaveClass('subscribe-card-shell--selected')
    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    expect(container.querySelector('.absolute.top-1.right-4 .v-btn')).toBeInTheDocument()

    await rerender({ batchMode: true, media, selected: true, sortable: true })
    await fireEvent.click(card)
    expect(emitted('select')).toHaveLength(1)
    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    expect(container.querySelector('.absolute.top-1.right-4 .v-btn')).not.toBeInTheDocument()
  })

  it('opens page-selected editing and forwards only save and remove events', async () => {
    const { emitted, media } = await renderCard({ page_open: true })

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const dialog = getDialogCall()
    expect(dialog.props).toEqual({ subid: media.id })
    expect(dialog.options).toEqual({ closeOn: ['close', 'save', 'remove'] })

    dialog.events.save()
    dialog.events.remove()
    expect(emitted('save')).toHaveLength(1)
    expect(emitted('remove')).toHaveLength(1)
  })

  it('passes exact file and TV share data while keeping compatibility TV values unshared', async () => {
    const { container, media, rerender } = await renderCard({ season: 1, total_episode: 12, type: '电视剧' })

    await chooseMenuItem(container, '分享')
    expect(getDialogCall().props).toEqual({ sub: media })
    expect(getDialogCall().options).toEqual({ closeOn: ['close'] })

    await chooseMenuItem(container, '文件统计')
    expect(getDialogCall(1).props).toEqual({ subid: media.id })
    expect(getDialogCall(1).options).toEqual({ closeOn: ['close'] })

    await rerender({ media: { ...media, type: 'tv' } })
    await openMenu(container)
    expect(screen.queryByText('分享')).not.toBeInTheDocument()
  })

  it.each([
    ['TMDB', { media_id: '11', media_source: 'themoviedb' }, 'themoviedb', '11'],
    ['Douban', { media_id: '22', media_source: 'douban' }, 'douban', '22'],
    ['Bangumi', { media_id: '33', media_source: 'bangumi' }, 'bangumi', '33'],
    ['AniList', { media_id: '55', media_source: 'anilist' }, 'anilist', '55'],
  ] as const)('routes media details with %s', async (_case, identifiers, mediaSource, mediaId) => {
    const { container, media } = await renderCard(identifiers)

    await chooseMenuItem(container, '媒体详情')

    expect(mocks.routerPush).toHaveBeenCalledWith({
      path: '/media',
      query: {
        media_id: mediaId,
        media_source: mediaSource,
        title: media.name,
        type: media.type,
        year: media.year,
      },
    })
  })
})

describe('SubscribeCard item operations', () => {
  beforeEach(() => {
    setViewport(1024)
    observeElementsImmediately()
    mocks.confirm.mockResolvedValue(true)
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it.each([
    ['success', 200, { success: true }, 'success', '卡片测试媒体 已提交搜索请求'],
    ['business failure', 200, { message: 'rejected', success: false }, 'error', '请求失败，请稍后重试'],
    ['HTTP failure', 500, { message: 'server down', success: false }, 'error', '请求失败，请稍后重试'],
  ] as const)('reports search %s through the exact endpoint', async (_case, status, response, toastType, message) => {
    const requested = vi.fn()
    const { container, media } = await renderCard()
    server.use(searchSubscribeByIdHandler(media.id, response, status, requested))

    await chooseMenuItem(container, '搜索')

    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    const toast = toastType === 'success' ? mocks.toastSuccess : mocks.toastError
    await waitFor(() => expect(toast).toHaveBeenCalledWith(message))
  })

  it('pauses and enables only after confirmed successful status responses', async () => {
    const requested: URL[] = []
    const { container, emitted, media } = await renderCard({ state: 'R' })
    server.use(
      updateSubscribeStatusHandler(media.id, { success: true }, 200, url => {
        requested.push(url)
      }),
    )

    await chooseMenuItem(container, '暂停')
    await waitFor(() => expect(requested).toHaveLength(1))
    expect(requested[0].searchParams.get('state')).toBe('S')
    expect(container.querySelector('.subscribe-card')).toHaveClass('subscribe-card-paused')
    expect(mocks.toastSuccess).toHaveBeenCalledWith(`${media.name} 已暂停！`)

    await chooseMenuItem(container, '启用')
    await waitFor(() => expect(requested).toHaveLength(2))
    expect(requested[1].searchParams.get('state')).toBe('R')
    expect(container.querySelector('.subscribe-card')).not.toHaveClass('subscribe-card-paused')
    expect(mocks.toastSuccess).toHaveBeenCalledWith(`${media.name} 已启用！`)
    expect(emitted('save')).toHaveLength(2)
  })

  it.each([
    ['confirmation cancellation', false, 200, { success: true }, null],
    ['business failure', true, 200, { message: 'rejected', success: false }, '暂停失败：rejected'],
    ['HTTP failure', true, 500, { message: 'server down', success: false }, '请求失败，请稍后重试'],
  ] as const)('keeps status unchanged after %s', async (_case, confirmed, status, response, expectedError) => {
    const requested = vi.fn()
    mocks.confirm.mockResolvedValue(confirmed)
    const { container, emitted, media } = await renderCard({ state: 'R' })
    server.use(updateSubscribeStatusHandler(media.id, response, status, requested))

    await chooseMenuItem(container, '暂停')
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce())

    if (confirmed) await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    else expect(requested).not.toHaveBeenCalled()
    if (expectedError) await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expectedError))
    else expect(mocks.toastError).not.toHaveBeenCalled()
    expect(container.querySelector('.subscribe-card')).not.toHaveClass('subscribe-card-paused')
    expect(emitted('save') ?? []).toHaveLength(0)
  })

  it.each([
    ['success', true, 200, { success: true }, 'success', '卡片测试媒体 重置成功！'],
    ['confirmation cancellation', false, 200, { success: true }, null, null],
    [
      'business failure',
      true,
      200,
      { message: 'rejected', success: false },
      'error',
      '卡片测试媒体 重置失败：rejected',
    ],
    ['HTTP failure', true, 500, { message: 'server down', success: false }, 'error', '请求失败，请稍后重试'],
  ] as const)(
    'handles reset %s without speculative state',
    async (_case, confirmed, status, response, toastType, message) => {
      const requested = vi.fn()
      mocks.confirm.mockResolvedValue(confirmed)
      const { container, emitted, media } = await renderCard({ state: 'S' })
      server.use(resetSubscribeByIdHandler(media.id, response, status, requested))

      await chooseMenuItem(container, '重置')
      await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce())

      if (confirmed) await waitFor(() => expect(requested).toHaveBeenCalledOnce())
      else expect(requested).not.toHaveBeenCalled()
      if (toastType && message) {
        const toast = toastType === 'success' ? mocks.toastSuccess : mocks.toastError
        await waitFor(() => expect(toast).toHaveBeenCalledWith(message))
      } else {
        expect(mocks.toastSuccess).not.toHaveBeenCalled()
        expect(mocks.toastError).not.toHaveBeenCalled()
      }

      if (_case === 'success') {
        expect(container.querySelector('.subscribe-card')).not.toHaveClass('subscribe-card-paused')
        expect(emitted('save')).toHaveLength(1)
      } else {
        expect(container.querySelector('.subscribe-card')).toHaveClass('subscribe-card-paused')
        expect(emitted('save') ?? []).toHaveLength(0)
      }
    },
  )

  it.each([
    ['success', 200, { success: true }, true, null],
    ['HTTP failure', 500, { message: 'server down', success: false }, false, '请求失败，请稍后重试'],
  ] as const)(
    'handles delete %s without a synthetic business-failure branch',
    async (_case, status, response, removed, error) => {
      const requested = vi.fn()
      const { container, emitted, media } = await renderCard()
      server.use(deleteSubscribeByIdHandler(media.id, response, status, requested))

      await chooseMenuItem(container, '取消订阅')

      await waitFor(() => expect(requested).toHaveBeenCalledOnce())
      expect(emitted('remove') ?? []).toHaveLength(removed ? 1 : 0)
      if (error) await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(error))
      else expect(mocks.toastError).not.toHaveBeenCalled()
    },
  )
})
