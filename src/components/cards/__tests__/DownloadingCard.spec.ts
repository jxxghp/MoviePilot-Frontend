import type { DownloadingInfo } from '@/api/types'
import DownloadingCard from '@/components/cards/DownloadingCard.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { deleteDownloadHandler, downloadActionHandler } from '@tests/support/msw/handlers/download'
import { server } from '@tests/support/msw/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function downloading(overrides: Partial<DownloadingInfo> = {}): DownloadingInfo {
  return {
    dlspeed: '2 MiB',
    hash: 'hash-1',
    left_time: '1 小时',
    media: {
      episode: 'E02',
      image: 'https://images.example.com/poster.jpg',
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
