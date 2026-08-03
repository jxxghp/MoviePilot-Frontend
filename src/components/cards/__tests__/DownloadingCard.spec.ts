import type { DownloadingInfo } from '@/api/types'
import DownloadingCard from '@/components/cards/DownloadingCard.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { deleteDownloadHandler, downloadActionHandler } from '@tests/support/msw/handlers/download'
import { server } from '@tests/support/msw/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

type DownloadingCardInfo = DownloadingInfo & {
  site_name?: string
  trackers?: string[]
}

function downloading(overrides: Partial<DownloadingCardInfo> = {}): DownloadingCardInfo {
  return {
    dlspeed: '2 MiB',
    hash: 'hash-1',
    left_time: '1 小时',
    media: {
      episode: 'E02',
      poster: 'https://images.example.com/poster.jpg',
      season: 'S01',
      title: '测试媒体',
    },
    name: 'fallback-name',
    progress: 40,
    season_episode: 'S01E02',
    size: 1024,
    state: 'downloading',
    title: '下载任务标题',
    upspeed: '1 MiB',
    ...overrides,
  }
}

async function renderCard(info = downloading(), downloaderName = 'qb-main') {
  return renderWithProviders(DownloadingCard, {
    props: { downloaderName, info },
  })
}

function actionButtons(container: Element) {
  const buttons = [...container.querySelectorAll<HTMLButtonElement>('.v-card-actions button')]
  expect(buttons).toHaveLength(2)
  return { deleteButton: buttons[1]!, toggleButton: buttons[0]! }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('DownloadingCard display and pause state', () => {
  it('renders task metadata, progress, speed and the current download state', async () => {
    const { container } = await renderCard()

    expect(screen.getByText(/测试媒体/)).toBeInTheDocument()
    expect(screen.getByText(/S01 E02/)).toBeInTheDocument()
    expect(screen.getByText('下载任务标题')).toBeInTheDocument()
    expect(screen.getByText(/1 小时/)).toBeInTheDocument()
    expect(container.querySelector('.v-card-text .v-progress-linear')).toBeInTheDocument()
  })

  it('falls back to the task name and season string when media recognition is incomplete', async () => {
    const { container } = await renderCard(
      downloading({
        media: {},
        name: '未识别任务',
        progress: 0,
        season_episode: 'S03E04',
        state: 'stopped',
      }),
    )

    expect(screen.getByText(/未识别任务/)).toBeInTheDocument()
    expect(screen.getByText(/S03E04/)).toBeInTheDocument()
    expect(container.querySelector('.v-card-text .v-progress-linear')).not.toBeInTheDocument()
  })

  it('only renders a centered cover image when a poster is available', async () => {
    const { container, rerender } = await renderCard()

    expect(container.querySelector('.downloading-card__image')).toBeInTheDocument()

    await rerender({
      downloaderName: 'qb-main',
      info: downloading({ media: { backdrop: 'https://images.example.com/backdrop.jpg' } }),
    })

    expect(container.querySelector('.downloading-card')).toHaveClass('downloading-card--no-image')
    expect(container.querySelector('.downloading-card__image')).not.toBeInTheDocument()
  })

  it('applies the shared lift state to the outer shell on hover', async () => {
    const { container } = await renderCard()
    const hoverArea = container.querySelector('.downloading-card-hover-area')!
    const shell = container.querySelector('.downloading-card-shell')!

    await fireEvent.mouseEnter(hoverArea)
    await waitFor(() => expect(shell).toHaveClass('app-hover-lift-card--hovering'))

    await fireEvent.mouseLeave(hoverArea)
    await waitFor(() => expect(shell).not.toHaveClass('app-hover-lift-card--hovering'))
  })

  it('normalizes media type, source host, speeds and missing time without exposing tracker details', async () => {
    await renderCard(
      downloading({
        dlspeed: '2 MiB/s',
        left_time: ' ',
        media: {
          poster: 'https://images.example.com/movie.jpg',
          season: 'S01',
          title: '测试电影',
          type: 'movie',
        },
        trackers: ['', 'invalid tracker', 'https://www.tracker.example/announce?passkey=private'],
        upspeed: '',
        year: ' 2026 ',
      }),
    )

    expect(screen.getByText('电影')).toBeInTheDocument()
    expect(screen.getByText('tracker.example')).toBeInTheDocument()
    expect(screen.queryByText(/passkey|private/)).not.toBeInTheDocument()
    expect(screen.getByText(/2026/)).toBeInTheDocument()
    expect(screen.getByText('2 MiB/s')).toBeInTheDocument()
    expect(screen.getByText('0 B/s')).toBeInTheDocument()
    expect(screen.getByText(/--/)).toBeInTheDocument()
  })

  it('uses explicit site and TV metadata before inferred fallbacks', async () => {
    await renderCard(
      downloading({
        media: {
          poster: '',
          title: '测试剧集',
          type: '电视剧',
        },
        season_episode: '',
        site_name: '主站点',
        trackers: ['https://tracker.example/announce'],
      }),
    )

    expect(screen.getByText('电视剧')).toBeInTheDocument()
    expect(screen.getByText('主站点')).toBeInTheDocument()
    expect(screen.queryByText('tracker.example')).not.toBeInTheDocument()
  })

  it('clamps finite progress and hides invalid or non-positive progress', async () => {
    const { container, rerender } = await renderCard(downloading({ progress: Number.NaN }))

    expect(container.querySelector('.v-card-text .v-progress-linear')).not.toBeInTheDocument()

    await rerender({ downloaderName: 'qb-main', info: downloading({ progress: 150 }) })
    expect(screen.getByText('100%')).toBeInTheDocument()

    await rerender({ downloaderName: 'qb-main', info: downloading({ progress: -10 }) })
    expect(container.querySelector('.v-card-text .v-progress-linear')).not.toBeInTheDocument()
  })

  it('hides a failed poster and restores image rendering when the media poster changes', async () => {
    const ImageStub = defineComponent({
      name: 'VImg',
      emits: ['error'],
      setup(_, { attrs, emit }) {
        return () =>
          h('img', {
            ...attrs,
            'data-testid': 'poster-image',
            onError: () => emit('error'),
          })
      },
    })
    const { container, rerender } = await renderWithProviders(DownloadingCard, {
      global: { stubs: { VImg: ImageStub } },
      props: { downloaderName: 'qb-main', info: downloading() },
    })

    await fireEvent.error(screen.getByTestId('poster-image'))
    await waitFor(() => expect(container.querySelector('.downloading-card__poster')).not.toBeInTheDocument())

    await rerender({
      downloaderName: 'qb-main',
      info: downloading({
        media: {
          poster: 'https://images.example.com/replacement.jpg',
          title: '替换海报',
        },
      }),
    })
    await waitFor(() => expect(container.querySelector('.downloading-card__poster')).toBeInTheDocument())
  })

  it('uses the current operation and downloader name, changing state only on business success', async () => {
    const stopRequested = vi.fn()
    const startRequested = vi.fn()
    server.use(
      downloadActionHandler('stop', 'hash-1', { success: false }, 200, stopRequested),
      downloadActionHandler('start', 'hash-1', { success: true }, 200, startRequested),
    )
    const { container, rerender } = await renderCard()
    const { toggleButton } = actionButtons(container)

    await fireEvent.click(toggleButton)
    await waitFor(() => expect(stopRequested).toHaveBeenCalledOnce())
    expect(stopRequested.mock.calls[0][0].searchParams.get('name')).toBe('qb-main')
    await fireEvent.click(toggleButton)
    await waitFor(() => expect(stopRequested).toHaveBeenCalledTimes(2))

    await rerender({ downloaderName: 'transmission', info: downloading({ state: 'stopped' }) })
    await fireEvent.click(toggleButton)
    await waitFor(() => expect(startRequested).toHaveBeenCalledOnce())
    expect(startRequested.mock.calls[0][0].searchParams.get('name')).toBe('transmission')
    await fireEvent.click(toggleButton)
    await waitFor(() => expect(stopRequested).toHaveBeenCalledTimes(3))
  })

  it('keeps the current state when the pause request fails at the HTTP boundary', async () => {
    server.use(downloadActionHandler('stop', 'hash-1', { success: false }, 503))
    const { container } = await renderCard()

    await fireEvent.click(actionButtons(container).toggleButton)

    await waitFor(() => expect(console.error).toHaveBeenCalled())
  })
})

describe('DownloadingCard deletion', () => {
  it('keeps the card visible when HTTP 200 reports business failure', async () => {
    const requested = vi.fn()
    server.use(deleteDownloadHandler('hash-1', { success: false, message: '任务仍在运行' }, 200, requested))
    const { container } = await renderCard()

    await fireEvent.click(actionButtons(container).deleteButton)

    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    expect(requested.mock.calls[0][0].searchParams.get('name')).toBe('qb-main')
    expect(container.querySelector('.downloading-card')).toBeInTheDocument()
  })

  it('hides the card only after business success', async () => {
    server.use(deleteDownloadHandler('hash-1', { success: true }))
    const { container } = await renderCard()

    await fireEvent.click(actionButtons(container).deleteButton)

    await waitFor(() => expect(container.querySelector('.downloading-card')).not.toBeInTheDocument())
  })

  it('keeps the card visible when deletion fails at the HTTP boundary', async () => {
    server.use(deleteDownloadHandler('hash-1', { success: false }, 503))
    const { container } = await renderCard()

    await fireEvent.click(actionButtons(container).deleteButton)

    await waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(container.querySelector('.downloading-card')).toBeInTheDocument()
  })
})
