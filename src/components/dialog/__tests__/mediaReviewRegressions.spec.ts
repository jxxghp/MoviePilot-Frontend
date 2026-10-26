import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { nextTick, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/plugins/i18n'
import vuetify from '@/plugins/vuetify'
import { useGlobalSettingsStore } from '@/stores'
import { seedMediaSourceCatalog } from '@tests/support/msw/handlers/catalog'
import ReorganizeDialog from '../ReorganizeDialog.vue'
import SubscribeSeasonDialog from '../SubscribeSeasonDialog.vue'
import AddSubtitleDownloadDialog from '../AddSubtitleDownloadDialog.vue'
import DownloadHistoryDialog from '../DownloadHistoryDialog.vue'
import SubscribeHistoryDialog from '../SubscribeHistoryDialog.vue'
import SiteResourceDialog from '../SiteResourceDialog.vue'
import UserAddEditDialog from '../UserAddEditDialog.vue'
import AliyunAuthDialog from '../AliyunAuthDialog.vue'
import U115AuthDialog from '../U115AuthDialog.vue'
import NotificationChannelInfoDialog from '../NotificationChannelInfoDialog.vue'
import SourceClassificationDialog from '../SourceClassificationDialog.vue'
import SearchBarDialog from '../SearchBarDialog.vue'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
  storage: vi.fn(),
  notification: vi.fn(),
}))
vi.mock('@/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/api')>()),
  default: createDataApiMock({ get: mocks.get, post: mocks.post, delete: mocks.delete }),
}))
vi.mock('@/api/manage', async importOriginal => ({
  ...(await importOriginal<typeof import('@/api/manage')>()),
  manageStorage: (...args: unknown[]) => mocks.storage(...args),
  manageNotificationChannel: (...args: unknown[]) => mocks.notification(...args),
}))
vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({ useProgressSSE: () => ({ start: vi.fn(), stop: vi.fn() }) }),
}))
vi.mock('vue-toastification', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }) }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
const mounted: VueWrapper[] = []
function mountDialog(component: Component, props: Record<string, unknown> = {}) {
  const pinia = createTestingPinia({
    createSpy: vi.fn,
    stubActions: false,
    initialState: { globalSettings: { data: { RECOGNIZE_SOURCE: 'themoviedb' } }, user: { superUser: true } },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  const wrapper = shallowMount(component, {
    props,
    global: {
      plugins: [pinia, i18n, vuetify, router],
      renderStubDefaultSlot: component === SourceClassificationDialog,
      stubs: {
        VDialogCloseBtn: true,
        VVirtualScroll: { name: 'VVirtualScroll', template: '<div />' },
        VInfiniteScroll: { name: 'VInfiniteScroll', template: '<div />' },
      },
    },
  })
  mounted.push(wrapper)
  return wrapper
}
function setup<T>(wrapper: VueWrapper) {
  return wrapper.vm as unknown as T
}

beforeEach(() => {
  seedMediaSourceCatalog()
  mocks.get.mockImplementation(async (path: string) =>
    path.includes('setting/') || path.includes('target-path') ? {} : [],
  )
  mocks.post.mockResolvedValue([])
  mocks.delete.mockResolvedValue(null)
  mocks.storage.mockResolvedValue({})
  mocks.notification.mockResolvedValue({ connected: true })
})
afterEach(() => {
  for (const wrapper of mounted.splice(0)) if (wrapper.exists()) wrapper.unmount()
})

describe('media review regression ownership and serialization', () => {
  it('A001 rejects the previous media episode groups even when its reply arrives last', async () => {
    const old = deferred<unknown[]>()
    const latest = [{ id: 'new-group', name: 'new group', group_count: 1, episode_count: 8 }]
    mocks.get.mockImplementation(async (path: string) =>
      path === 'media/groups/100' ? old.promise : path === 'media/groups/200' ? latest : [],
    )
    const wrapper = mountDialog(ReorganizeDialog, { items: [] })
    const vm = setup<{ getEpisodeGroups: (id: number) => Promise<void>; episodeGroups: unknown[] }>(wrapper)
    const pending = vm.getEpisodeGroups(100)
    await vm.getEpisodeGroups(200)
    old.resolve([{ id: 'old-group', name: 'old group' }])
    await pending
    expect(vm.episodeGroups).toEqual(latest)
  })

  it('A001 invalidates a media lookup during the next media debounce window', async () => {
    vi.useFakeTimers()
    const old = deferred<unknown[]>()
    mocks.get.mockImplementation(async (path: string) => (path === 'media/groups/100' ? old.promise : []))
    const wrapper = mountDialog(ReorganizeDialog, { items: [] })
    const vm = setup<{
      transferForm: { media_id: number; type_name: string; media_source: string }
      getEpisodeGroups: (id: number) => Promise<void>
      episodeGroups: unknown[]
    }>(wrapper)
    vm.transferForm.type_name = '电视剧'
    vm.transferForm.media_source = 'themoviedb'
    await nextTick()
    vm.transferForm.media_id = 100
    const pending = vm.getEpisodeGroups(100)
    vm.transferForm.media_id = 200
    old.resolve([{ id: 'old-group' }])
    await pending
    expect(vm.episodeGroups).toEqual([])
    await vi.advanceTimersByTimeAsync(401)
    expect(mocks.get.mock.calls.some(([path]) => path === 'media/groups/200')).toBe(true)
  })

  it('A002 keeps group seasons and missing status in the selected group generation', async () => {
    const oldSeasons = deferred<unknown[]>()
    const oldMissing = deferred<unknown[]>()
    mocks.get.mockImplementation(async (path: string) =>
      path === 'media/seasons'
        ? oldSeasons.promise
        : path === 'media/group/seasons/group-B'
          ? [{ season_number: 8, episode_count: 10 }]
          : [],
    )
    mocks.post.mockImplementation(async (_path: string, payload: { episode_group: string }) =>
      payload.episode_group === 'group-B' ? [{ season: 8, episodes: [], total_episode: 10 }] : oldMissing.promise,
    )
    const wrapper = mountDialog(SubscribeSeasonDialog, {
      media: { tmdb_id: 100, media_id: '100', media_source: 'themoviedb', title: 'test', type: '电视剧' },
    })
    const vm = setup<{
      setEpisodeGroup: (group: string) => void
      seasonInfos: Array<{ season_number: number }>
      seasonsNotExisted: Record<number, number>
      setSeasonSelected: (season: number, selected: boolean) => void
      subscribeSeasons: () => void
    }>(wrapper)
    vm.setEpisodeGroup('group-B')
    await flushPromises()
    oldSeasons.resolve([{ season_number: 1, episode_count: 2 }])
    oldMissing.resolve([{ season: 1, episodes: [], total_episode: 2 }])
    await flushPromises()
    expect(vm.seasonInfos.map(item => item.season_number)).toEqual([8])
    expect(vm.seasonsNotExisted).toEqual({ 8: 2 })
    vm.setSeasonSelected(8, true)
    vm.subscribeSeasons()
    expect(wrapper.emitted('subscribe')?.[0]?.slice(0, 3)).toMatchObject([[{ season_number: 8 }], { 8: 2 }, 'group-B'])
  })

  it('A002 refuses to submit while the newly selected group is still loading', async () => {
    const pending = deferred<unknown[]>()
    mocks.get.mockImplementation(async (path: string) =>
      path.startsWith('media/group/seasons/')
        ? pending.promise
        : path === 'media/seasons'
          ? [{ season_number: 1 }]
          : [],
    )
    const wrapper = mountDialog(SubscribeSeasonDialog, {
      media: { tmdb_id: 100, media_id: '100', media_source: 'themoviedb', type: '电视剧' },
    })
    await flushPromises()
    const vm = setup<{ setEpisodeGroup: (group: string) => void; subscribeSeasons: () => void }>(wrapper)
    vm.setEpisodeGroup('group-B')
    vm.subscribeSeasons()
    expect(wrapper.emitted('subscribe')).toBeUndefined()
    pending.resolve([{ season_number: 8 }])
    await flushPromises()
  })

  it('A003 clears a subtitle media ID synchronously when changing its source', async () => {
    const wrapper = mountDialog(AddSubtitleDownloadDialog, { mediaSource: 'themoviedb', mediaId: '123' })
    const vm = setup<{
      mediaSource: string
      selectedMediaId: string | undefined
      addSubtitleDownload: () => Promise<void>
    }>(wrapper)
    vm.mediaSource = 'douban'
    await vm.addSubtitleDownload()
    expect(vm.selectedMediaId).toBeUndefined()
    expect(mocks.post.mock.calls.some(([path]) => path === 'download/subtitle')).toBe(false)
  })

  it.each([
    ['download', DownloadHistoryDialog],
    ['subscribe', SubscribeHistoryDialog],
  ] as const)(
    'A004 reloads an overlap without losing or duplicating the boundary item after deleting %s history',
    async (kind, component) => {
      let records = Array.from({ length: 31 }, (_, i) => ({
        id: i + 1,
        name: `record-${i + 1}`,
        title: `record-${i + 1}`,
      }))
      mocks.get.mockImplementation(async (path: string, config?: { params?: { page: number; count: number } }) => {
        if (path === 'history/download' || path.startsWith('subscribe/history/')) {
          const { page, count } = config!.params!
          return records.slice((page - 1) * count, page * count)
        }
        return []
      })
      mocks.delete.mockImplementation(async () => {
        records = records.filter(item => item.id !== 1)
      })
      const wrapper = mountDialog(component, { type: '电影' })
      const vm = setup<{
        loadHistory: (event: { done: ReturnType<typeof vi.fn> }) => Promise<void>
        deleteHistory: (item: { id: number }) => Promise<void>
        historyList: Array<{ id: number }>
      }>(wrapper)
      await vm.loadHistory({ done: vi.fn() })
      expect(vm.historyList).toHaveLength(30)
      await vm.deleteHistory({ id: 1 })
      await vm.loadHistory({ done: vi.fn() })
      expect(vm.historyList.map(item => item.id)).toEqual(records.map(item => item.id))
      expect(new Set(vm.historyList.map(item => item.id)).size).toBe(30)
    },
  )

  it('A005 releases obsolete pagination ownership immediately when starting a new search', async () => {
    const oldPage = deferred<unknown[]>()
    const firstPage = Array.from({ length: 100 }, (_, i) => ({ title: `item-${i}`, enclosure: `url-${i}` }))
    mocks.get.mockImplementation(async (path: string, config?: { params?: { page: number; keyword?: string } }) => {
      if (!path.startsWith('site/resource/')) return []
      return config?.params?.page === 1 && !config.params.keyword ? oldPage.promise : firstPage
    })
    const wrapper = mountDialog(SiteResourceDialog, { site: { id: 1 } })
    await flushPromises()
    const vm = setup<{
      keyword: string
      getResourceList: () => Promise<void>
      loadMoreResources: () => Promise<void>
      resourceLoadingMore: boolean
    }>(wrapper)
    const old = vm.loadMoreResources()
    await flushPromises()
    vm.keyword = 'new search'
    await vm.getResourceList()
    expect(vm.resourceLoadingMore).toBe(false)
    await vm.loadMoreResources()
    expect(
      mocks.get.mock.calls.some(
        ([path, config]) =>
          path === 'site/resource/1' && config?.params?.page === 1 && config.params.keyword === 'new search',
      ),
    ).toBe(true)
    oldPage.resolve([])
    await old
  })

  it.each([
    ['download', DownloadHistoryDialog],
    ['subscribe', SubscribeHistoryDialog],
  ] as const)(
    'A004 invalidates a captured %s page when deletion finishes before that page',
    async (_kind, component) => {
      let records = Array.from({ length: 61 }, (_, i) => ({ id: i + 1 }))
      const pending = deferred<Array<{ id: number }>>()
      let requests = 0
      mocks.get.mockImplementation(async (path: string, config?: { params?: { page: number; count: number } }) => {
        if (path === 'history/download' || path.startsWith('subscribe/history/')) {
          const { page, count } = config!.params!
          if (++requests === 2) return pending.promise
          return records.slice((page - 1) * count, page * count)
        }
        return []
      })
      mocks.delete.mockImplementation(async () => {
        records = records.filter(item => item.id !== 1)
      })
      const wrapper = mountDialog(component, { type: '电影' })
      const vm = setup<{
        loadHistory: (event: { done: ReturnType<typeof vi.fn> }) => Promise<void>
        deleteHistory: (item: { id: number }) => Promise<void>
        historyList: Array<{ id: number }>
      }>(wrapper)
      await vm.loadHistory({ done: vi.fn() })
      const captured = records.slice(30, 60)
      const old = vm.loadHistory({ done: vi.fn() })
      await flushPromises()
      await vm.deleteHistory({ id: 1 })
      pending.resolve(captured)
      await old
      expect(vm.historyList.map(item => item.id)).toEqual(Array.from({ length: 29 }, (_, i) => i + 2))
      await vm.loadHistory({ done: vi.fn() })
      await vm.loadHistory({ done: vi.fn() })
      expect(vm.historyList.map(item => item.id)).toEqual(records.map(item => item.id))
    },
  )

  it('B001 sends the pending avatar and nickname through the backend user-create contract', async () => {
    const wrapper = mountDialog(UserAddEditDialog, { oper: 'add', usernames: [] })
    const vm = setup<{
      currentUserName: string
      currentAvatar: string
      userForm: { nickname: string }
      newPassword: string
      confirmPassword: string
      addUser: () => Promise<void>
    }>(wrapper)
    vm.currentUserName = 'new-user'
    vm.currentAvatar = 'data:image/png;base64,fixture'
    vm.userForm.nickname = 'new nickname'
    vm.newPassword = vm.confirmPassword = crypto.randomUUID()
    await vm.addUser()
    expect(mocks.post).toHaveBeenCalledWith(
      'user/',
      expect.objectContaining({
        avatar: 'data:image/png;base64,fixture',
        settings: expect.objectContaining({ nickname: 'new nickname' }),
      }),
    )
  })

  it.each([
    ['aliyun', AliyunAuthDialog],
    ['u115', U115AuthDialog],
  ] as const)(
    'B002 does not revive %s polling after a pending response arrives on an unmounted dialog',
    async (kind, component) => {
      vi.useFakeTimers()
      const pending = deferred<unknown>()
      mocks.storage.mockImplementation(async (_storage: string, action: string) =>
        action === 'generate_qrcode' || action === 'check_login'
          ? pending.promise
          : { authUrl: 'https://fixture.invalid', state: 'test' },
      )
      const wrapper = mountDialog(component, { conf: {} })
      if (kind === 'u115') {
        await flushPromises()
        const vm = setup<{ checkAuthStatus: () => Promise<void> }>(wrapper)
        void vm.checkAuthStatus()
      }
      wrapper.unmount()
      pending.resolve(kind === 'aliyun' ? { codeUrl: 'fixture-qr' } : { status: 0 })
      await flushPromises()
      await vi.advanceTimersByTimeAsync(10000)
      expect(mocks.storage.mock.calls.filter(([, action]) => action === 'check_login')).toHaveLength(
        kind === 'aliyun' ? 0 : 1,
      )
    },
  )

  it('B002 stops WechatClawBot polling even when shared host removes it without setting modelValue false', async () => {
    vi.useFakeTimers()
    const pending = deferred<unknown>()
    mocks.notification.mockReturnValue(pending.promise)
    const wrapper = mountDialog(NotificationChannelInfoDialog, {
      notification: { id: 'wechat', name: 'fixture', type: 'wechatclawbot', config: {} },
      notifications: [],
    })
    wrapper.unmount()
    pending.resolve({ connected: true })
    await flushPromises()
    await vi.advanceTimersByTimeAsync(20000)
    expect(mocks.notification).toHaveBeenCalledTimes(1)
  })

  it('B002 cancels an already scheduled WechatClawBot refresh on unmount', async () => {
    vi.useFakeTimers()
    const wrapper = mountDialog(NotificationChannelInfoDialog, {
      notification: { id: 'wechat', name: 'fixture', type: 'wechatclawbot', config: {} },
      notifications: [],
    })
    await flushPromises()
    expect(mocks.notification).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(20000)
    expect(mocks.notification).toHaveBeenCalledTimes(1)
  })

  it('B003 normalizes a configured combobox directory object before previewing', async () => {
    mocks.post.mockResolvedValue({
      secondary_categories: [],
      changed: false,
      current_save_path: '/downloads/old',
      target_save_path: '/downloads/movies',
    })
    const wrapper = mountDialog(SourceClassificationDialog, { task: { download_hash: 'fixture-hash', type: '电影' } })
    const vm = setup<{ mode: string; submit: () => Promise<void> }>(wrapper)
    vm.mode = 'manual'
    await nextTick()
    const combo = wrapper.findComponent({ name: 'AppCombobox' })
    combo.vm.$emit('update:modelValue', { title: 'Downloads', value: '/downloads/movies' })
    const preview = vm.submit()
    vm.mode = 'recognize'
    await preview
    expect(mocks.post).toHaveBeenCalledWith(
      'download/fixture-hash/classify-source',
      expect.objectContaining({ target_path: '/downloads/movies' }),
    )
  })

  it('B004 applies delayed global defaults until an actual user source edit occurs', async () => {
    const wrapper = mountDialog(SearchBarDialog, { modelValue: false })
    const vm = setup<{ selectedMediaSearchSources: { media: string[] } }>(wrapper)
    await nextTick()
    useGlobalSettingsStore().data.SEARCH_SOURCE = 'douban'
    await nextTick()
    expect(vm.selectedMediaSearchSources.media).toEqual(['douban'])
    vm.selectedMediaSearchSources.media = ['themoviedb']
    await nextTick()
    useGlobalSettingsStore().data.SEARCH_SOURCE = 'douban,themoviedb'
    await nextTick()
    expect(vm.selectedMediaSearchSources.media).toEqual(['themoviedb'])
  })
})

describe('independent continuation ownership checks', () => {
  it.each([
    ['download', DownloadHistoryDialog],
    ['subscribe', SubscribeHistoryDialog],
  ] as const)(
    'does not leave %s history in an error state for a request invalidated by deletion',
    async (_kind, component) => {
      let rejectOld!: (error: unknown) => void
      const oldPage = new Promise<unknown[]>((_resolve, reject) => {
        rejectOld = reject
      })
      let count = 0
      mocks.get.mockImplementation(async (path: string) => {
        if (path === 'history/download' || path.startsWith('subscribe/history/')) {
          count++
          if (count === 2) return oldPage
          return Array.from({ length: 30 }, (_, index) => ({ id: index + 1 }))
        }
        return []
      })
      const wrapper = mountDialog(component, { type: '电影' })
      const vm = setup<{
        loadHistory: (event: { done: ReturnType<typeof vi.fn> }) => Promise<void>
        deleteHistory: (item: { id: number }) => Promise<void>
      }>(wrapper)
      await vm.loadHistory({ done: vi.fn() })
      const oldDone = vi.fn()
      const pending = vm.loadHistory({ done: oldDone })
      await flushPromises()
      await vm.deleteHistory({ id: 1 })
      rejectOld(new Error('obsolete request failed'))
      await pending
      expect(oldDone).not.toHaveBeenCalledWith('error')
    },
  )

  it('does not release the active season loading state from a stale finally', async () => {
    let rejectOld!: (error: unknown) => void
    const old = new Promise<unknown[]>((_resolve, reject) => {
      rejectOld = reject
    })
    const next = deferred<unknown[]>()
    mocks.get.mockImplementation(async (path: string) =>
      path === 'media/seasons' ? old : path.startsWith('media/group/seasons/') ? next.promise : [],
    )
    const wrapper = mountDialog(SubscribeSeasonDialog, {
      media: { tmdb_id: 100, media_id: '100', media_source: 'themoviedb', type: '电视剧' },
    })
    const vm = setup<{ setEpisodeGroup: (group: string) => void; isRefreshed: boolean; subscribeSeasons: () => void }>(
      wrapper,
    )
    vm.setEpisodeGroup('group-B')
    rejectOld(new Error('old media lookup failed'))
    await flushPromises()
    expect(vm.isRefreshed).toBe(false)
    vm.subscribeSeasons()
    expect(wrapper.emitted('subscribe')).toBeUndefined()
    next.resolve([{ season_number: 8 }])
    await flushPromises()
    expect(vm.isRefreshed).toBe(true)
  })

  it('does not emit a wrong default subscription mode before the selected group missing-state request settles', async () => {
    const missing = deferred<unknown[]>()
    mocks.get.mockImplementation(async (path: string) =>
      path === 'media/seasons'
        ? [{ season_number: 1 }]
        : path.startsWith('media/group/seasons/')
          ? [{ season_number: 8 }]
          : [],
    )
    mocks.post.mockImplementation(async (_path: string, payload: { episode_group?: string }) =>
      payload.episode_group === 'group-B' ? missing.promise : [],
    )
    const wrapper = mountDialog(SubscribeSeasonDialog, {
      media: { tmdb_id: 100, media_id: '100', media_source: 'themoviedb', type: '电视剧' },
      defaultSubscribeMode: 'normal',
    })
    await flushPromises()
    const vm = setup<{
      setEpisodeGroup: (group: string) => void
      setSeasonSelected: (season: number, selected: boolean) => void
      subscribeSeasons: () => void
    }>(wrapper)
    vm.setEpisodeGroup('group-B')
    await flushPromises()
    vm.setSeasonSelected(8, true)
    vm.subscribeSeasons()
    expect(wrapper.emitted('subscribe')).toBeUndefined()
    missing.resolve([{ season: 8, episodes: [], total_episode: 10 }])
    await flushPromises()
    vm.subscribeSeasons()
    expect(wrapper.emitted('subscribe')?.at(-1)?.[3]).toMatchObject({ 8: 'normal' })
  })
})

describe('missing-state submission evidence', () => {
  it('keeps automatic subscription blocked after failure until a successful retry resolves the current group', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const retry = deferred<unknown[]>()
    mocks.get.mockImplementation(async (path: string) => (path === 'media/seasons' ? [{ season_number: 1 }] : []))
    mocks.post.mockRejectedValueOnce(new Error('missing-state unavailable')).mockReturnValueOnce(retry.promise)
    const wrapper = mountDialog(SubscribeSeasonDialog, {
      media: { tmdb_id: 100, media_id: '100', media_source: 'themoviedb', type: '电视剧' },
      defaultSubscribeMode: 'normal',
    })
    await flushPromises()
    const vm = setup<{
      seasonRequestId: number
      checkSeasonsNotExists: (id: number) => Promise<void>
      setSeasonSelected: (season: number, selected: boolean) => void
      subscribeSeasons: () => void
      missingStateStatus: string
    }>(wrapper)
    vm.setSeasonSelected(1, true)
    expect(vm.missingStateStatus).toBe('error')
    vm.subscribeSeasons()
    expect(wrapper.emitted('subscribe')).toBeUndefined()
    const pending = vm.checkSeasonsNotExists(vm.seasonRequestId)
    vm.subscribeSeasons()
    expect(wrapper.emitted('subscribe')).toBeUndefined()
    retry.resolve([{ season: 1, episodes: [], total_episode: 8 }])
    await pending
    await flushPromises()
    vm.subscribeSeasons()
    expect(wrapper.emitted('subscribe')?.at(-1)?.[3]).toMatchObject({ 1: 'normal' })
  })

  it('never queues a submit from group B while missing-state is pending and then carries it into group C', async () => {
    const missingB = deferred<unknown[]>()
    const missingC = deferred<unknown[]>()
    mocks.get.mockImplementation(async (path: string) =>
      path === 'media/seasons'
        ? [{ season_number: 1 }]
        : path.endsWith('/group-B')
          ? [{ season_number: 8 }]
          : path.endsWith('/group-C')
            ? [{ season_number: 9 }]
            : [],
    )
    mocks.post.mockImplementation(async (_path: string, payload: { episode_group?: string }) =>
      payload.episode_group === 'group-B'
        ? missingB.promise
        : payload.episode_group === 'group-C'
          ? missingC.promise
          : [],
    )
    const wrapper = mountDialog(SubscribeSeasonDialog, {
      media: { tmdb_id: 100, media_id: '100', media_source: 'themoviedb', type: '电视剧' },
      defaultSubscribeMode: 'normal',
    })
    await flushPromises()
    const vm = setup<{
      setEpisodeGroup: (group: string) => void
      setSeasonSelected: (season: number, selected: boolean) => void
      subscribeSeasons: () => void
      missingStateStatus: string
    }>(wrapper)
    vm.setEpisodeGroup('group-B')
    await flushPromises()
    vm.setSeasonSelected(8, true)
    vm.subscribeSeasons()
    vm.setEpisodeGroup('group-C')
    await flushPromises()
    vm.setSeasonSelected(9, true)
    missingB.resolve([])
    await flushPromises()
    expect(vm.missingStateStatus).toBe('loading')
    vm.subscribeSeasons()
    expect(wrapper.emitted('subscribe')).toBeUndefined()
    missingC.resolve([{ season: 9, episodes: [], total_episode: 8 }])
    await flushPromises()
    vm.subscribeSeasons()
    expect(wrapper.emitted('subscribe')?.at(-1)?.slice(0, 4)).toMatchObject([
      [{ season_number: 9 }],
      { 9: 2 },
      'group-C',
      { 9: 'normal' },
    ])
  })

  it('does not interpret an invalid missing-state payload as an empty known library result', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.get.mockImplementation(async (path: string) => (path === 'media/seasons' ? [{ season_number: 1 }] : []))
    mocks.post.mockResolvedValue(null)
    const wrapper = mountDialog(SubscribeSeasonDialog, {
      media: { tmdb_id: 100, media_id: '100', media_source: 'themoviedb', type: '电视剧' },
    })
    await flushPromises()
    const vm = setup<{
      setSeasonSelected: (season: number, selected: boolean) => void
      subscribeSeasons: () => void
      missingStateStatus: string
    }>(wrapper)
    vm.setSeasonSelected(1, true)
    vm.subscribeSeasons()
    expect(vm.missingStateStatus).toBe('error')
    expect(wrapper.emitted('subscribe')).toBeUndefined()
  })
})

describe('explicit subscription modes with unknown library state', () => {
  it.each([
    ['pending', 'normal'],
    ['pending', 'best_version'],
    ['pending', 'best_version_full'],
    ['failed', 'normal'],
    ['failed', 'best_version'],
    ['failed', 'best_version_full'],
  ] as const)('honors an explicit %s choice of %s without inferring a default', async (state, mode) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const missing = deferred<unknown[]>()
    mocks.get.mockImplementation(async (path: string) => (path === 'media/seasons' ? [{ season_number: 1 }] : []))
    if (state === 'failed') mocks.post.mockRejectedValueOnce(new Error('unavailable'))
    else mocks.post.mockReturnValueOnce(missing.promise)
    const wrapper = mountDialog(SubscribeSeasonDialog, {
      media: { tmdb_id: 100, media_id: '100', media_source: 'themoviedb', type: '电视剧' },
    })
    await flushPromises()
    const vm = setup<{
      setSeasonSelected: (season: number, selected: boolean) => void
      updateSeasonMode: (season: number, mode: string) => void
      subscribeSeasons: () => void
    }>(wrapper)
    vm.setSeasonSelected(1, true)
    vm.subscribeSeasons()
    expect(wrapper.emitted('subscribe')).toBeUndefined()
    vm.updateSeasonMode(1, mode)
    vm.subscribeSeasons()
    expect(wrapper.emitted('subscribe')?.at(-1)?.[3]).toEqual({ 1: mode })
    missing.resolve([{ season: 1, episodes: [], total_episode: 8 }])
    await flushPromises()
  })
})
