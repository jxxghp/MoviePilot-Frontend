import MediaServerLatest from '@/views/dashboard/MediaServerLatest.vue'
import MediaServerLibrary from '@/views/dashboard/MediaServerLibrary.vue'
import MediaServerPlaying from '@/views/dashboard/MediaServerPlaying.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { defineComponent, ref, type Component } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  mediaGridItemCount: undefined as unknown as { value: number },
  refreshCapacity: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

vi.mock('@/composables/useDashboardMediaGridCapacity', async () => {
  const { ref } = await import('vue')
  const itemCount = ref(4)
  mocks.mediaGridItemCount = itemCount

  return {
    useDashboardMediaGridCapacity: () => ({
      containerRef: ref(null),
      itemCount,
      refreshCapacity: (...args: unknown[]) => mocks.refreshCapacity(...args),
    }),
  }
})

vi.mock('@/components/misc/ProgressiveCardGrid.vue', async () => {
  const { defineComponent } = await import('vue')

  return {
    default: defineComponent({
      props: { items: { type: Array, default: () => [] } },
      template: '<div><slot v-for="item in items" :key="item.id || item.name" :item="item" /></div>',
    }),
  }
})

vi.mock('@/components/cards/PlayingBackdropCard.vue', async () => {
  const { defineComponent } = await import('vue')

  return {
    default: defineComponent({
      props: { media: { type: Object, required: true } },
      template: '<span>{{ media.title }}</span>',
    }),
  }
})

vi.mock('@/components/cards/PosterCard.vue', async () => {
  const { defineComponent } = await import('vue')

  return {
    default: defineComponent({
      props: { media: { type: Object, required: true } },
      template: '<span>{{ media.title }}</span>',
    }),
  }
})

vi.mock('@/components/cards/LibraryCard.vue', async () => {
  const { defineComponent } = await import('vue')

  return {
    default: defineComponent({
      props: { media: { type: Object, required: true } },
      template: '<span>{{ media.name }}</span>',
    }),
  }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, reject, resolve }
}

function keepAliveHarness(component: Component) {
  return defineComponent({
    components: { TestedCard: component },
    setup() {
      const active = ref(true)

      return { active }
    },
    template: `
      <button type="button" @click="active = false">停用卡片</button>
      <button type="button" @click="active = true">启用卡片</button>
      <KeepAlive><TestedCard v-if="active" /></KeepAlive>
    `,
  })
}

async function reactivateCard() {
  await fireEvent.click(screen.getByRole('button', { name: '停用卡片' }))
  await fireEvent.click(screen.getByRole('button', { name: '启用卡片' }))
}

describe('dashboard media server cards', () => {
  beforeEach(() => {
    localStorage.clear()
    mocks.apiGet.mockReset()
    mocks.mediaGridItemCount.value = 4
    mocks.refreshCapacity.mockReset()
  })

  it('loads media libraries on an ordinary initial mount', async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'system/setting/MediaServers') return { data: { value: [{ enabled: true, name: 'home' }] } }
      if (url === 'mediaserver/library') return [{ id: 'movies', name: '电影库' }]
      throw new Error(`Unexpected GET ${url}`)
    })

    await renderWithProviders(MediaServerLibrary)

    expect(await screen.findByText('电影库')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledWith('mediaserver/library', {
      params: { hidden: true, server: 'home' },
    })
  })

  it.each([
    [MediaServerLatest, 'mediaserver/latest', '暂无最近入库记录'],
    [MediaServerPlaying, 'mediaserver/playing', '暂无继续观看记录'],
    [MediaServerLibrary, 'mediaserver/library', '暂无媒体库数据'],
  ])('shows the explicit empty state for %s', async (component, endpoint, emptyText) => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'system/setting/MediaServers') return { data: { value: [{ enabled: true, name: 'home' }] } }
      if (url === endpoint) return []
      throw new Error(`Unexpected GET ${url}`)
    })

    await renderWithProviders(keepAliveHarness(component))

    expect(await screen.findByText(emptyText)).toBeInTheDocument()
  })

  it.each([
    [MediaServerLatest, 'mediaserver/latest', '暂无最近入库记录'],
    [MediaServerPlaying, 'mediaserver/playing', '暂无继续观看记录'],
    [MediaServerLibrary, 'mediaserver/library', '暂无媒体库数据'],
  ])('keeps the successful empty snapshot when %s later fails', async (component, endpoint, emptyText) => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    let endpointReads = 0
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'system/setting/MediaServers') return { data: { value: [{ enabled: true, name: 'home' }] } }
      if (url === endpoint) {
        endpointReads += 1
        if (endpointReads === 1) return []
        throw new Error('remote unavailable')
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    await renderWithProviders(keepAliveHarness(component))
    expect(await screen.findByText(emptyText)).toBeInTheDocument()

    await reactivateCard()

    await waitFor(() => expect(endpointReads).toBe(2))
    expect(screen.getByText(emptyText)).toBeInTheDocument()
    expect(screen.queryByText('媒体服务器数据加载失败')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '刷新失败，当前显示上次数据' })).toBeInTheDocument()
    expect(consoleLog).toHaveBeenCalledOnce()
  })

  it.each([
    [MediaServerLatest, 'mediaserver/latest', '恢复的最近入库'],
    [MediaServerPlaying, 'mediaserver/playing', '恢复的继续观看'],
    [MediaServerLibrary, 'mediaserver/library', '恢复的媒体库'],
  ])('shows a retry state when %s fails without a snapshot', async (component, endpoint, recoveredText) => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    let endpointReads = 0
    let shouldFail = true
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'system/setting/MediaServers') return { data: { value: [{ enabled: true, name: 'home' }] } }
      if (url === endpoint) {
        endpointReads += 1
        if (shouldFail) throw new Error('remote unavailable')

        if (endpoint === 'mediaserver/library') return [{ id: 'library', name: recoveredText }]
        return [{ id: 'media', title: recoveredText }]
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    await renderWithProviders(keepAliveHarness(component))

    const failureAlert = await screen.findByRole('alert')
    expect(within(failureAlert).getByText('媒体服务器数据加载失败')).toBeInTheDocument()
    const failedReads = endpointReads
    shouldFail = false
    await fireEvent.click(screen.getByRole('button', { name: '媒体服务器数据加载失败' }))
    expect(await screen.findByText(recoveredText)).toBeInTheDocument()
    expect(endpointReads).toBe(failedReads + 1)
    expect(consoleLog).toHaveBeenCalledOnce()
  })

  it('restores the last successful library snapshot before F5 revalidation completes', async () => {
    const pendingSettings = deferred<{ data: { value: Array<{ enabled: boolean; name: string }> } }>()
    let reload = false
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'system/setting/MediaServers') {
        return reload ? pendingSettings.promise : { data: { value: [{ enabled: true, name: 'home' }] } }
      }
      if (url === 'mediaserver/library') return [{ id: 'movies', name: '已缓存媒体库' }]
      throw new Error(`Unexpected GET ${url}`)
    })

    const renderOptions = { initialState: { user: { userID: 7 } } }
    const firstRender = await renderWithProviders(MediaServerLibrary, renderOptions)
    await screen.findByText('已缓存媒体库')
    firstRender.unmount()

    reload = true
    await renderWithProviders(MediaServerLibrary, renderOptions)

    expect(screen.getByText('已缓存媒体库')).toBeInTheDocument()
  })

  it('does not duplicate the settings request when reactivation changes media capacity', async () => {
    let settingReads = 0
    let playingReads = 0
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'system/setting/MediaServers') {
        settingReads += 1
        return { data: { value: [{ enabled: true, name: 'home' }] } }
      }
      if (url === 'mediaserver/playing') {
        playingReads += 1
        return [{ id: `playing-${playingReads}`, title: `继续观看 ${playingReads}` }]
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    await renderWithProviders(keepAliveHarness(MediaServerPlaying))
    await screen.findByText('继续观看 1')

    mocks.mediaGridItemCount.value = 0
    mocks.refreshCapacity.mockImplementationOnce(() => {
      mocks.mediaGridItemCount.value = 6
    })
    await reactivateCard()

    await screen.findByText('继续观看 2')
    expect(settingReads).toBe(2)
    expect(playingReads).toBe(2)
  })

  it('keeps continue-watching content when a warm refresh fails', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const refresh = deferred<Array<{ id: string; title: string }>>()
    let playingReads = 0
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'system/setting/MediaServers') return { data: { value: [{ enabled: true, name: 'home' }] } }
      if (url === 'mediaserver/playing') {
        playingReads += 1
        return playingReads === 1 ? [{ id: 'old', title: '旧继续观看' }] : refresh.promise
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    await renderWithProviders(keepAliveHarness(MediaServerPlaying))
    await screen.findByText('旧继续观看')
    expect(mocks.apiGet).toHaveBeenCalledWith('mediaserver/playing', {
      params: { count: 4, server: 'home' },
    })

    await reactivateCard()
    expect(screen.getByText('旧继续观看')).toBeInTheDocument()

    refresh.reject(new Error('remote unavailable'))
    await waitFor(() => expect(playingReads).toBe(2))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(screen.getByText('旧继续观看')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新失败，当前显示上次数据' })).toBeInTheDocument()
    expect(consoleLog).toHaveBeenCalledOnce()
  })

  it('keeps recent-library content when a warm refresh fails', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const refresh = deferred<Array<{ id: string; title: string }>>()
    let latestReads = 0
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'system/setting/MediaServers') return { data: { value: [{ enabled: true, name: 'home' }] } }
      if (url === 'mediaserver/latest') {
        latestReads += 1
        return latestReads === 1 ? [{ id: 'old', title: '旧最近入库' }] : refresh.promise
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    await renderWithProviders(keepAliveHarness(MediaServerLatest))
    await screen.findByText('旧最近入库')
    expect(mocks.apiGet).toHaveBeenCalledWith('mediaserver/latest', {
      params: { count: 4, server: 'home' },
    })

    await reactivateCard()
    refresh.reject(new Error('remote unavailable'))
    await waitFor(() => expect(latestReads).toBe(2))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(screen.getByText('旧最近入库')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新失败，当前显示上次数据' })).toBeInTheDocument()
    expect(consoleLog).toHaveBeenCalledOnce()
  })

  it('keeps media-library content when a warm refresh fails', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const refresh = deferred<Array<{ id: string; name: string }>>()
    let libraryReads = 0
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'system/setting/MediaServers') return { data: { value: [{ enabled: true, name: 'home' }] } }
      if (url === 'mediaserver/library') {
        libraryReads += 1
        return libraryReads === 1 ? [{ id: 'old', name: '旧媒体库' }] : refresh.promise
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    await renderWithProviders(keepAliveHarness(MediaServerLibrary))
    await screen.findByText('旧媒体库')

    await reactivateCard()
    refresh.reject(new Error('remote unavailable'))
    await waitFor(() => expect(libraryReads).toBe(2))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(screen.getByText('旧媒体库')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新失败，当前显示上次数据' })).toBeInTheDocument()
    expect(consoleLog).toHaveBeenCalledOnce()
  })

  it('replaces the media-library snapshot atomically after a warm refresh', async () => {
    const refresh = deferred<Array<{ id: string; name: string }>>()
    let libraryReads = 0
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'system/setting/MediaServers') return { data: { value: [{ enabled: true, name: 'home' }] } }
      if (url === 'mediaserver/library') {
        libraryReads += 1
        return libraryReads === 1 ? [{ id: 'old', name: '旧媒体库' }] : refresh.promise
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    await renderWithProviders(keepAliveHarness(MediaServerLibrary))
    await screen.findByText('旧媒体库')
    expect(libraryReads).toBe(1)
    expect(mocks.apiGet).toHaveBeenCalledWith('mediaserver/library', {
      params: { hidden: true, server: 'home' },
    })

    await reactivateCard()
    expect(screen.getByText('旧媒体库')).toBeInTheDocument()
    await waitFor(() => expect(libraryReads).toBe(2))

    refresh.resolve([{ id: 'new', name: '新媒体库' }])
    await screen.findByText('新媒体库')
    expect(screen.queryByText('旧媒体库')).not.toBeInTheDocument()
  })

  it('keeps same-id libraries from different media servers', async () => {
    mocks.apiGet.mockImplementation((url: string, options?: { params?: { server?: string } }) => {
      if (url === 'system/setting/MediaServers') {
        return {
          data: {
            value: [
              { enabled: true, name: 'home-a' },
              { enabled: true, name: 'home-b' },
            ],
          },
        }
      }
      if (url === 'mediaserver/library') {
        const server = options?.params?.server
        return [
          {
            id: 'movies',
            name: server === 'home-a' ? '媒体库 A' : '媒体库 B',
            server: 'emby',
          },
        ]
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    await renderWithProviders(keepAliveHarness(MediaServerLibrary))

    expect(await screen.findByText('媒体库 A')).toBeInTheDocument()
    expect(screen.getByText('媒体库 B')).toBeInTheDocument()
  })

  it('keeps same-id continue-watching items from different media servers', async () => {
    mocks.apiGet.mockImplementation((url: string, options?: { params?: { server?: string } }) => {
      if (url === 'system/setting/MediaServers') {
        return {
          data: {
            value: [
              { enabled: true, name: 'home-a' },
              { enabled: true, name: 'home-b' },
            ],
          },
        }
      }
      if (url === 'mediaserver/playing') {
        const server = options?.params?.server
        return [
          {
            id: 'shared-item',
            title: server === 'home-a' ? '继续观看 A' : '继续观看 B',
          },
        ]
      }
      throw new Error(`Unexpected GET ${url}`)
    })

    await renderWithProviders(keepAliveHarness(MediaServerPlaying))

    expect(await screen.findByText('继续观看 A')).toBeInTheDocument()
    expect(screen.getByText('继续观看 B')).toBeInTheDocument()
  })
})
