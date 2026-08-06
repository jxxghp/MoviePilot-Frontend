import type { DownloadingInfo } from '@/api/types'
import DownloadingCard from '@/components/cards/DownloadingCard.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { deleteDownloadHandler, downloadActionHandler } from '@tests/support/msw/handlers/download'
import { server } from '@tests/support/msw/server'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 扩展卡片会消费但公共下载类型尚未声明的站点字段。 */
interface DownloadingCardInfo extends DownloadingInfo {
  site_name?: string
  trackers?: string[]
}

/** 创建可按用例覆盖字段的下载任务数据。 */
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

/** 使用生产插件和指定下载器渲染下载任务卡片。 */
async function renderCard(info = downloading(), downloaderName = 'qb-main') {
  return renderWithProviders(DownloadingCard, {
    props: { downloaderName, info },
  })
}

/** 获取卡片的继续/暂停和删除操作按钮。 */
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

  it('normalizes media types, progress bounds, speeds and missing metadata', async () => {
    const { container, rerender } = await renderCard(
      downloading({
        dlspeed: ' 3 MiB/s ',
        left_time: ' ',
        media: { title: '英文电影类型', type: 'movie' },
        progress: 101,
        size: 0,
        upspeed: ' ',
      }),
    )

    expect(container.querySelector('.downloading-card__chips')).toHaveTextContent('电影')
    expect(container.querySelector('.downloading-card__progress')).toHaveTextContent('100%')
    expect(container.querySelector('.downloading-card__progress')).toHaveTextContent('--')
    expect(container.querySelector('.downloading-card__speeds')).toHaveTextContent('3 MiB/s')
    expect(container.querySelector('.downloading-card__speeds')).toHaveTextContent('0 B/s')
    expect(container.querySelector('.downloading-card__chips')).toHaveTextContent('0.00 B')

    for (const [type, label] of [
      ['电影', '电影'],
      ['tv', '电视剧'],
      ['电视剧', '电视剧'],
      ['纪录片', '纪录片'],
    ]) {
      await rerender({
        downloaderName: 'qb-main',
        info: downloading({ media: { title: `${type}标题`, type }, progress: -1 }),
      })
      expect(container.querySelector('.downloading-card__chips')).toHaveTextContent(label)
      expect(container.querySelector('.downloading-card__progress')).not.toBeInTheDocument()
    }

    await rerender({
      downloaderName: 'qb-main',
      info: downloading({
        dlspeed: undefined,
        media: { title: '无类型电影' },
        progress: Number.NaN,
        season_episode: undefined,
        upspeed: '1 MiB/s',
      }),
    })
    expect(container.querySelector('.downloading-card__chips')).toHaveTextContent('电影')
    expect(container.querySelector('.downloading-card__speeds')).toHaveTextContent('0 B/s')
    expect(container.querySelector('.downloading-card__speeds')).toHaveTextContent('1 MiB/s')

    await rerender({
      downloaderName: 'qb-main',
      info: downloading({ media: { season: 'S02' }, name: '', season_episode: undefined, title: '任务标题回退' }),
    })
    expect(container.querySelector('.downloading-card__chips')).toHaveTextContent('电视剧')
    expect(container.querySelector('.downloading-card__title')).toHaveTextContent('任务标题回退')

    await rerender({ downloaderName: '', info: undefined })
    expect(container.querySelector('.downloading-card__title')).toHaveTextContent('未知')
    expect(container.querySelectorAll('.downloading-card__chips .v-chip')).toHaveLength(1)
  })

  it('keeps torrent size visible while resolving explicit site names and tracker hostnames', async () => {
    const { container, rerender } = await renderCard(downloading({ site_name: '  M-Team  ' }))

    const heading = container.querySelector('.downloading-card__heading')!
    const chipContainer = container.querySelector('.downloading-card__chips')!
    const chips = [...chipContainer.querySelectorAll('.v-chip')]

    expect(heading.nextElementSibling).toBe(chipContainer)
    expect(chips.map(chip => chip.textContent?.trim())).toEqual(['电视剧', '1.00 KB', 'M-Team'])
    expect(chips.every(chip => !chip.classList.contains('text-primary'))).toBe(true)

    await rerender({
      downloaderName: 'qb-main',
      info: downloading({ media: { ...downloading().media, site_name: '媒体站点' }, site_name: undefined }),
    })
    expect(container.querySelector('.downloading-card__chips')).toHaveTextContent('媒体站点')

    await rerender({
      downloaderName: 'qb-main',
      info: downloading({
        media: downloading().media,
        site_name: undefined,
        trackers: ['', 'not-a-url', 'https://www.tracker.example.com/announce?passkey=secret'],
      }),
    })
    expect(container.querySelector('.downloading-card__chips')).toHaveTextContent('tracker.example.com')
    expect(container).not.toHaveTextContent('passkey')
    expect(container).not.toHaveTextContent('secret')
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

  it('hides a failed poster and retries when the task receives a new poster', async () => {
    const VImgStub = defineComponent({
      name: 'VImg',
      emits: ['error'],
      /** 提供可由用例主动触发失败事件的图片替身。 */
      setup(_props, { emit }) {
        return () => h('button', { 'aria-label': '图片加载失败', onClick: () => emit('error') })
      },
    })
    const { container, rerender } = await renderWithProviders(DownloadingCard, {
      props: { downloaderName: 'qb-main', info: downloading() },
      global: { stubs: { VImg: VImgStub } },
    })

    await fireEvent.click(screen.getByRole('button', { name: '图片加载失败' }))
    await waitFor(() => expect(container.querySelector('.downloading-card')).toHaveClass('downloading-card--no-image'))

    await rerender({
      downloaderName: 'qb-main',
      info: downloading({ media: { ...downloading().media, poster: 'https://images.example.com/new-poster.jpg' } }),
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '图片加载失败' })).toBeInTheDocument())
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
