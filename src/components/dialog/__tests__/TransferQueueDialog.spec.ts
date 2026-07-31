import type { MetaInfo, TransferQueue } from '@/api/types'
import TransferQueueDialog from '@/components/dialog/TransferQueueDialog.vue'
import { screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  progressControllers: [] as Array<{
    handler: (event: MessageEvent) => void
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
  }>,
  toastError: vi.fn(),
  useProgressSSE: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useProgressSSE: mocks.useProgressSSE,
  }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError }),
}))

function createMetaInfo(): MetaInfo {
  return {
    apply_words: [],
    audio_term: '',
    edition: '',
    episode: '',
    episode_list: [],
    episode_seq: '',
    episode_seqs: '',
    episodes: '',
    isfile: true,
    name: '',
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
  }
}

function createQueueItem({
  id,
  path,
  season,
  state = 'running',
  title,
  titleYear = `${title} (2026)`,
}: {
  id: number
  path: string
  season?: number
  state?: string
  title: string
  titleYear?: string
}): TransferQueue {
  return {
    media: {
      episode_run_time: [],
      origin_country: [],
      media_id: String(id),
      mediaid_prefix: 'themoviedb',
      source: 'themoviedb',
      title,
      title_year: titleYear,
      year: '2026',
    },
    season,
    tasks: [
      {
        fileitem: {
          name: `${title}.mkv`,
          path,
          size: 1024,
          storage: 'local',
          type: 'file',
        },
        meta: createMetaInfo(),
        state,
      },
    ],
  }
}

function createQueue(title: string, path: string, state = 'running'): TransferQueue[] {
  return [createQueueItem({ id: path.length, path, state, title })]
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

async function renderDialog() {
  return renderWithProviders(TransferQueueDialog, {
    global: {
      stubs: {
        VDialog: { template: '<div><slot /></div>' },
        VDialogCloseBtn: { template: '<button type="button">关闭</button>' },
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
  })
}

describe('TransferQueueDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.progressControllers.length = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.useProgressSSE.mockImplementation((_url: string, handler: (event: MessageEvent) => void) => {
      const controller = {
        handler,
        start: vi.fn(),
        stop: vi.fn(),
      }
      mocks.progressControllers.push(controller)
      return controller
    })
  })

  it('loads immediately, renders a real empty state, and polls again after three seconds', async () => {
    vi.useFakeTimers()
    mocks.apiGet.mockResolvedValue([])

    await renderDialog()
    await flushPromises()

    expect(screen.getByText('没有正在整理的任务')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(3000)

    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
  })

  it('keeps media with different real identities in separate tabs even when title_year matches', async () => {
    const user = userEvent.setup()
    mocks.apiGet.mockResolvedValue([
      createQueueItem({
        id: 7101,
        path: '/downloads/source-a.mkv',
        title: '来源 A',
        titleYear: '同名作品 (2026)',
      }),
      createQueueItem({
        id: 7102,
        path: '/downloads/source-b.mkv',
        title: '来源 B',
        titleYear: '同名作品 (2026)',
      }),
    ])

    await renderDialog()

    const mediaList = await screen.findByRole('navigation', { name: '媒体队列' })
    const mediaButtons = within(mediaList).getAllByRole('button')
    expect(mediaButtons).toHaveLength(2)
    expect(screen.getByText('来源 A.mkv')).toBeInTheDocument()
    expect(screen.queryByText('来源 B.mkv')).not.toBeInTheDocument()

    await user.click(mediaButtons[1])

    expect(screen.getByText('来源 B.mkv')).toBeInTheDocument()
    expect(screen.queryByText('来源 A.mkv')).not.toBeInTheDocument()
  })

  it('uses canonical built-in and custom identities before falling back to the title', async () => {
    const builtIn = createQueueItem({
      id: 7301,
      path: '/downloads/built-in.mkv',
      title: '内置来源',
      titleYear: '重复标题 (2026)',
    })
    const custom = createQueueItem({
      id: 7302,
      path: '/downloads/custom.mkv',
      title: '自定义来源',
      titleYear: '重复标题 (2026)',
    })
    custom.media.source = 'custom-source'
    custom.media.mediaid_prefix = 'custom-source'
    custom.media.media_id = 'custom-7302'
    const fallback = createQueueItem({
      id: 7399,
      path: '/downloads/title-fallback.mkv',
      title: '标题回退',
      titleYear: '唯一回退标题 (2026)',
    })
    fallback.media.source = undefined
    fallback.media.mediaid_prefix = undefined
    fallback.media.media_id = undefined
    mocks.apiGet.mockResolvedValue([builtIn, custom, fallback])

    await renderDialog()

    const mediaList = await screen.findByRole('navigation', { name: '媒体队列' })
    expect(within(mediaList).getAllByRole('button')).toHaveLength(3)
    expect(screen.getByText('3 部媒体 · 3 个文件')).toBeInTheDocument()
  })

  it('keeps different seasons of the same media in independent tabs', async () => {
    const user = userEvent.setup()
    mocks.apiGet.mockResolvedValue([
      createQueueItem({
        id: 7350,
        path: '/downloads/season-1.mkv',
        season: 1,
        title: '季度作品 S01',
        titleYear: '季度作品 (2026)',
      }),
      createQueueItem({
        id: 7350,
        path: '/downloads/season-2.mkv',
        season: 2,
        title: '季度作品 S02',
        titleYear: '季度作品 (2026)',
      }),
    ])

    await renderDialog()

    const mediaList = await screen.findByRole('navigation', { name: '媒体队列' })
    expect(within(mediaList).getByRole('button', { name: /季度作品 \(2026\) S01/ })).toBeInTheDocument()
    const seasonTwoButton = within(mediaList).getByRole('button', { name: /季度作品 \(2026\) S02/ })
    expect(screen.getByText('季度作品 S01.mkv')).toBeInTheDocument()

    await user.click(seasonTwoButton)

    expect(screen.getByText('季度作品 S02.mkv')).toBeInTheDocument()
    expect(screen.queryByText('季度作品 S01.mkv')).not.toBeInTheDocument()
  })

  it('preserves the active media tab when polling returns the same jobs in a different order', async () => {
    vi.useFakeTimers()
    const first = createQueueItem({
      id: 7361,
      path: '/downloads/order-a.mkv',
      title: '顺序 A',
    })
    const second = createQueueItem({
      id: 7362,
      path: '/downloads/order-b.mkv',
      title: '顺序 B',
    })
    mocks.apiGet.mockResolvedValueOnce([first, second]).mockResolvedValueOnce([second, first])

    await renderDialog()
    await flushPromises()
    const mediaList = screen.getByRole('navigation', { name: '媒体队列' })
    within(mediaList).getAllByRole('button')[1].click()
    await flushPromises()
    expect(screen.getByText('顺序 B.mkv')).toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()

    expect(screen.getByText('顺序 B.mkv')).toBeInTheDocument()
    expect(screen.queryByText('顺序 A.mkv')).not.toBeInTheDocument()
    expect(within(mediaList).getAllByRole('button')[0]).toHaveAttribute('aria-current', 'true')
  })

  it('renders task states and applies dynamic SSE progress to the matching running file', async () => {
    const running = createQueueItem({
      id: 7201,
      path: '/downloads/running-progress.mkv',
      title: '进度文件',
    })
    running.tasks.push({
      fileitem: {
        name: '已经完成.mkv',
        path: '/downloads/completed.mkv',
        size: 2048,
        storage: 'local',
        type: 'file',
      },
      meta: createMetaInfo(),
      state: 'completed',
    })
    mocks.apiGet.mockResolvedValue([running])

    await renderDialog()

    await waitFor(() => expect(mocks.progressControllers).toHaveLength(1))
    mocks.progressControllers[0].handler(
      new MessageEvent('message', {
        data: JSON.stringify({ enable: true, value: 42 }),
      }),
    )
    await flushPromises()

    expect(screen.getByText('正在整理')).toBeInTheDocument()
    expect(screen.getByText('完成')).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getAllByText('1 / 2 个文件')).toHaveLength(2)
  })

  it('renders waiting, failed, and cancelled task states without starting progress streams', async () => {
    const queue = createQueueItem({
      id: 7401,
      path: '/downloads/waiting.mkv',
      state: 'waiting',
      title: '终态展示',
    })
    queue.tasks.push(
      {
        fileitem: {
          name: '失败.mkv',
          path: '/downloads/failed.mkv',
          size: 2048,
          storage: 'local',
          type: 'file',
        },
        meta: createMetaInfo(),
        state: 'failed',
      },
      {
        fileitem: {
          name: '已取消.mkv',
          path: '/downloads/cancelled.mkv',
          size: 4096,
          storage: 'local',
          type: 'file',
        },
        meta: createMetaInfo(),
        state: 'cancelled',
      },
    )
    mocks.apiGet.mockResolvedValue([queue])

    await renderDialog()

    expect(await screen.findByText('等待中')).toBeInTheDocument()
    expect(screen.getByText('失败')).toBeInTheDocument()
    expect(screen.getByText('已取消')).toBeInTheDocument()
    expect(mocks.progressControllers).toHaveLength(0)
    expect(screen.getAllByText('0%')).toHaveLength(5)
  })

  it('stops a file stream when the task reaches a terminal state on the next poll', async () => {
    vi.useFakeTimers()
    mocks.apiGet
      .mockResolvedValueOnce(createQueue('状态迁移', '/downloads/terminal.mkv'))
      .mockResolvedValueOnce(createQueue('状态迁移', '/downloads/terminal.mkv', 'completed'))

    await renderDialog()
    await flushPromises()
    expect(mocks.progressControllers).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()

    expect(mocks.progressControllers[0].stop).toHaveBeenCalledOnce()
    expect(screen.getByText('完成')).toBeInTheDocument()
  })

  it('stops every running file progress stream when the dialog unmounts with a non-empty queue', async () => {
    mocks.apiGet.mockResolvedValue(createQueue('仍在整理', '/downloads/running.mkv'))

    const { unmount } = await renderDialog()

    await waitFor(() => expect(mocks.progressControllers).toHaveLength(1))
    expect(mocks.progressControllers[0].start).toHaveBeenCalledOnce()

    unmount()

    expect(mocks.progressControllers[0].stop).toHaveBeenCalledOnce()
  })

  it('keeps the latest queue snapshot when an earlier polling response resolves later', async () => {
    vi.useFakeTimers()
    const older = createDeferred<TransferQueue[]>()
    const newer = createDeferred<TransferQueue[]>()
    mocks.apiGet.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)

    await renderDialog()
    await vi.advanceTimersByTimeAsync(3000)
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)

    newer.resolve(createQueue('较新快照', '/downloads/newer.mkv'))
    await flushPromises()
    await vi.waitFor(() => expect(screen.getAllByText('较新快照 (2026)')).toHaveLength(2))

    older.resolve(createQueue('较旧快照', '/downloads/older.mkv'))
    await flushPromises()
    await vi.waitFor(() => expect(screen.queryAllByText('较旧快照 (2026)')).toHaveLength(0))
    expect(screen.getAllByText('较新快照 (2026)')).toHaveLength(2)
  })

  it('commits an older response while the next slow poll is still pending', async () => {
    vi.useFakeTimers()
    const first = createDeferred<TransferQueue[]>()
    const second = createDeferred<TransferQueue[]>()
    mocks.apiGet.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    await renderDialog()
    await vi.advanceTimersByTimeAsync(3000)
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)

    first.resolve(createQueue('首个可用快照', '/downloads/first-available.mkv'))
    await flushPromises()
    expect(screen.getAllByText('首个可用快照 (2026)')).toHaveLength(2)

    second.resolve(createQueue('后续快照', '/downloads/follow-up.mkv'))
    await flushPromises()
    expect(screen.queryAllByText('首个可用快照 (2026)')).toHaveLength(0)
    expect(screen.getAllByText('后续快照 (2026)')).toHaveLength(2)
  })

  it('ignores a pending queue response after the dialog unmounts', async () => {
    const pendingQueue = createDeferred<TransferQueue[]>()
    mocks.apiGet.mockReturnValue(pendingQueue.promise)

    const { unmount } = await renderDialog()
    expect(mocks.apiGet).toHaveBeenCalledOnce()
    unmount()

    pendingQueue.resolve(createQueue('卸载后快照', '/downloads/after-unmount.mkv'))
    await flushPromises()

    expect(mocks.useProgressSSE).not.toHaveBeenCalled()
  })

  it('refreshes after DELETE regardless of a response body that resembles success false', async () => {
    const user = userEvent.setup()
    const queue = createQueue('待取消', '/downloads/cancel.mkv')
    mocks.apiGet.mockResolvedValueOnce(queue).mockResolvedValueOnce([])
    mocks.apiDelete.mockResolvedValue({ success: false })

    await renderDialog()
    await user.click(await screen.findByRole('button', { name: '取消任务' }))
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(2))

    expect(mocks.apiDelete).toHaveBeenCalledWith('transfer/queue', {
      data: queue[0].tasks[0].fileitem,
    })
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(await screen.findByText('没有正在整理的任务')).toBeInTheDocument()
  })

  it('does not refresh or recreate progress streams when DELETE resolves after unmount', async () => {
    const user = userEvent.setup()
    const pendingDelete = createDeferred<unknown>()
    mocks.apiGet.mockResolvedValue(createQueue('卸载中取消', '/downloads/unmounted-delete.mkv'))
    mocks.apiDelete.mockReturnValue(pendingDelete.promise)

    const { unmount } = await renderDialog()
    await user.click(await screen.findByRole('button', { name: '取消任务' }))
    expect(mocks.apiDelete).toHaveBeenCalledOnce()
    expect(mocks.useProgressSSE).toHaveBeenCalledOnce()

    unmount()
    pendingDelete.resolve(undefined)
    await flushPromises()

    expect(mocks.apiGet).toHaveBeenCalledOnce()
    expect(mocks.useProgressSSE).toHaveBeenCalledOnce()
    expect(mocks.progressControllers[0].stop).toHaveBeenCalledOnce()
  })

  it('shows the existing error toast when DELETE fails and keeps the current queue visible', async () => {
    const user = userEvent.setup()
    mocks.apiGet.mockResolvedValue(createQueue('取消失败', '/downloads/cancel-failed.mkv'))
    mocks.apiDelete.mockRejectedValue(new Error('network failure'))

    await renderDialog()
    await user.click(await screen.findByRole('button', { name: '取消任务' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('服务器连接失败'))
    expect(screen.getByText('取消失败.mkv')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledOnce()
  })

  it('separates GET failure from an empty queue and retries in place', async () => {
    const user = userEvent.setup()
    mocks.apiGet.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])

    await renderDialog()

    expect(await screen.findByText('服务器连接失败')).toBeInTheDocument()
    expect(screen.queryByText('没有正在整理的任务')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(await screen.findByText('没有正在整理的任务')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
  })
})
