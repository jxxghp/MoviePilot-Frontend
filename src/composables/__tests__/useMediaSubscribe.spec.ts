import type { MediaInfo, MediaSeason, Subscribe } from '@/api/types'
import {
  getMediaSubscribeId,
  getMediaSubscribeIdentity,
  getSubscribeMode,
  type SeasonSubscribeModes,
  type SubscribeMode,
  useMediaSubscribe,
} from '@/composables/useMediaSubscribe'
import { getActiveRequestsCount } from '@/utils/requestOptimizer'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { createSubscribe, createSubscribeMovie, createSubscribeTv } from '@tests/support/factories/subscribe'
import {
  createSubscribeHandler,
  defaultSubscribeConfigHandler,
  deleteSubscribeByMediaHandler,
  querySubscribeByMediaHandler,
  updateSubscribeHandler,
} from '@tests/support/msw/handlers/subscribe'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cacheStatus: vi.fn(),
  confirm: vi.fn(),
  doneProgress: vi.fn(),
  onEditRemove: vi.fn(),
  openSharedDialog: vi.fn(),
  startProgress: vi.fn(),
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

vi.mock('@/api/nprogress', () => ({
  configureNProgress: vi.fn(),
  doneNProgress: mocks.doneProgress,
  startNProgress: mocks.startProgress,
}))

vi.mock('@/utils/mediaStatusCache', () => ({
  setCachedMediaSubscribeStatus: (...args: unknown[]) => mocks.cacheStatus(...args),
}))

interface MultiSeasonInput {
  modes?: SubscribeMode | SeasonSubscribeModes
  seasons?: MediaSeason[]
  visible?: number[]
}

interface HarnessOptions {
  actionSeason?: number | null
  canSubscribe?: boolean
  isExists?: boolean
  isSubscribed?: boolean
  media?: MediaInfo
  modes?: SeasonSubscribeModes
  multi?: MultiSeasonInput
  seasonsMap?: Record<number, boolean>
  subscribedSeasons?: number[]
  useSeasonMap?: boolean
}

async function renderSubscribeHarness(options: HarnessOptions = {}) {
  const media = options.media
  const actionSeason = options.actionSeason ?? (media?.type === '电视剧' ? (media.season ?? 1) : null)
  const Harness = defineComponent({
    name: 'MediaSubscribeHarness',
    setup() {
      const isSubscribed = ref(options.isSubscribed ?? false)
      const seasonsSubscribed = ref<Record<number, boolean>>({ ...(options.seasonsMap ?? {}) })
      const subscribedSeasons = ref([...(options.subscribedSeasons ?? [])])
      const subscribedSeasonModes = ref<SeasonSubscribeModes>({ ...(options.modes ?? {}) })
      const checkResult = ref('idle')
      const actions = useMediaSubscribe({
        canSubscribe: () => options.canSubscribe ?? true,
        getSubscribeStatusKey: season => `status:${season ?? 'all'}`,
        isExists: () => options.isExists ?? false,
        isSubscribed,
        media: () => media,
        onEditRemove: mocks.onEditRemove,
        primarySeason: () => media?.season ?? null,
        seasonsSubscribed: options.useSeasonMap ? seasonsSubscribed : undefined,
        subscribedSeasonModes,
        subscribedSeasons,
      })

      async function check() {
        try {
          checkResult.value = (await actions.checkSubscribe(actionSeason)) ? 'subscribed' : 'missing'
        } catch {
          checkResult.value = 'error'
        }
      }

      function alignSeasons() {
        actions.subscribeSeasons(
          options.multi?.seasons ?? [],
          {},
          'episode-group-1',
          options.multi?.modes ?? 'normal',
          options.multi?.visible ?? [],
        )
      }

      return {
        addBestFull: () => actions.addSubscribe(actionSeason, { best_version: 1, best_version_full: 1 }),
        addNormal: () => actions.addSubscribe(actionSeason),
        alignSeasons,
        check,
        checkResult,
        handlePrimary: () => actions.handleSubscribe(),
        handleSeason: () => actions.handleSubscribe(actionSeason, 'episode-group-entry'),
        isSubscribed,
        modes: subscribedSeasonModes,
        openSeason: () => actions.openSubscribeSeasonDialog(actionSeason, 'episode-group-entry'),
        remove: () => actions.removeSubscribe(actionSeason),
        seasons: subscribedSeasons,
        seasonsMap: seasonsSubscribed,
      }
    },
    template: `
      <button type="button" @click="handlePrimary">primary</button>
      <button type="button" @click="handleSeason">season</button>
      <button type="button" @click="addNormal">add-normal</button>
      <button type="button" @click="addBestFull">add-best-full</button>
      <button type="button" @click="remove">remove</button>
      <button type="button" @click="check">check</button>
      <button type="button" @click="openSeason">open-season</button>
      <button type="button" @click="alignSeasons">align-seasons</button>
      <output data-testid="subscribed">{{ String(isSubscribed) }}</output>
      <output data-testid="seasons">{{ JSON.stringify(seasons) }}</output>
      <output data-testid="season-map">{{ JSON.stringify(seasonsMap) }}</output>
      <output data-testid="modes">{{ JSON.stringify(modes) }}</output>
      <output data-testid="check-result">{{ checkResult }}</output>
    `,
  })

  return renderWithProviders(Harness, {
    initialState: {
      user: {
        superUser: false,
        userName: 'tester',
      },
    },
  })
}

function getDialogCall(index = 0) {
  const [, props, events, options] = mocks.openSharedDialog.mock.calls[index] as [
    unknown,
    Record<string, unknown>,
    Record<string, (...args: any[]) => unknown>,
    Record<string, unknown>,
  ]
  return { events, options, props }
}

describe('media subscribe identifiers and modes', () => {
  it.each([
    ['TMDB before all fallback identifiers', { bangumi_id: '30', douban_id: '20', tmdb_id: 10 }, 'tmdb:10'],
    [
      'Douban before Bangumi and generic identifiers',
      { bangumi_id: '30', douban_id: '20', tmdb_id: undefined },
      'douban:20',
    ],
    [
      'Bangumi before a generic identifier',
      { bangumi_id: '30', douban_id: undefined, tmdb_id: undefined },
      'bangumi:30',
    ],
    ['AniList after Bangumi', { anilist_id: 40, bangumi_id: undefined, tmdb_id: undefined }, 'anilist:40'],
    [
      'generic identifiers when provider ids are absent',
      { bangumi_id: undefined, douban_id: undefined, media_id: 'abc', mediaid_prefix: 'custom', tmdb_id: undefined },
      'custom:abc',
    ],
  ])('uses %s', (_case, overrides, expected) => {
    expect(getMediaSubscribeId(createSubscribeMovie(overrides))).toBe(expected)
  })

  it('keeps the declared AniList identity when TMDB is only auxiliary data', () => {
    const media = createSubscribeTv({
      anilist_id: 154587,
      source: 'anilist',
      tmdb_id: 209867,
    })

    expect(getMediaSubscribeIdentity(media)).toEqual({
      mediaId: '154587',
      mediaKey: 'anilist:154587',
      source: 'anilist',
    })
  })

  it.each([
    [{ best_version: false, best_version_full: true }, 'normal'],
    [{ best_version: 0, best_version_full: 1 }, 'normal'],
    [{ best_version: '0', best_version_full: '1' }, 'normal'],
    [{ best_version: true, best_version_full: false }, 'best_version'],
    [{ best_version: 1, best_version_full: 0 }, 'best_version'],
    [{ best_version: '1', best_version_full: '1' }, 'best_version_full'],
  ] as const)('normalizes compatible mode flags %#', (subscribe, expected) => {
    expect(getSubscribeMode(subscribe)).toBe(expected)
  })
})

describe('useMediaSubscribe entry flows', () => {
  beforeEach(() => {
    mocks.confirm.mockResolvedValue(true)
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
  })

  afterEach(async () => {
    await flushPromises()
    await waitFor(() => expect(getActiveRequestsCount()).toBe(0))
  })

  it('creates a normal movie subscription and synchronizes public state', async () => {
    const media = createSubscribeMovie({ title: '普通电影', tmdb_id: 101, year: '2025' })
    const created = vi.fn()
    server.use(
      createSubscribeHandler({ data: { id: 501 }, success: true }, 200, created),
      defaultSubscribeConfigHandler('电影', { show_edit_dialog: false }),
    )
    await renderSubscribeHarness({ media })

    await fireEvent.click(screen.getByRole('button', { name: 'primary' }))

    await waitFor(() => expect(created).toHaveBeenCalledOnce())
    await waitFor(() => expect(mocks.doneProgress).toHaveBeenCalledOnce())
    expect(created).toHaveBeenCalledWith({
      episode_group: '',
      media_id: '101',
      media_source: 'themoviedb',
      mediaid: 'tmdb:101',
      name: '普通电影',
      season: null,
      tmdbid: 101,
      type: '电影',
      year: '2025',
    })
    expect(screen.getByTestId('subscribed')).toHaveTextContent('true')
    expect(mocks.cacheStatus).toHaveBeenCalledWith('status:all', true)
    expect(mocks.toastSuccess).toHaveBeenCalled()
    expect(mocks.startProgress).toHaveBeenCalledOnce()
    expect(mocks.doneProgress).toHaveBeenCalledOnce()
  })

  it('creates an AniList subscription without promoting its auxiliary TMDB ID', async () => {
    const media = createSubscribeTv({
      anilist_id: 154587,
      source: 'anilist',
      title: 'AniList 订阅剧集',
      tmdb_id: 209867,
    })
    const created = vi.fn()
    server.use(
      createSubscribeHandler({ data: { id: 512 }, success: true }, 200, created),
      defaultSubscribeConfigHandler('电视剧', { show_edit_dialog: false }),
    )
    await renderSubscribeHarness({ media })

    await fireEvent.click(screen.getByRole('button', { name: 'add-normal' }))

    await waitFor(() => expect(created).toHaveBeenCalledOnce())
    expect(created.mock.calls[0][0]).toMatchObject({
      anilistid: 154587,
      media_id: '154587',
      media_source: 'anilist',
      mediaid: 'anilist:154587',
      season: 1,
      tmdbid: 209867,
    })
  })

  it('keeps a successful creation successful when default configuration loading fails', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const media = createSubscribeMovie({ title: '辅助查询失败电影', tmdb_id: 111 })
    const created = vi.fn()
    const configQueried = vi.fn()
    server.use(
      createSubscribeHandler({ data: { id: 511 }, success: true }, 200, created),
      defaultSubscribeConfigHandler('电影', {}, 500, configQueried),
    )
    await renderSubscribeHarness({ media })

    await fireEvent.click(screen.getByRole('button', { name: 'primary' }))

    await waitFor(() => expect(created).toHaveBeenCalledOnce())
    await waitFor(() => expect(configQueried).toHaveBeenCalledOnce())
    await waitFor(() => expect(mocks.doneProgress).toHaveBeenCalledOnce())
    expect(screen.getByTestId('subscribed')).toHaveTextContent('true')
    expect(mocks.cacheStatus).toHaveBeenCalledWith('status:all', true)
    expect(mocks.toastSuccess).toHaveBeenCalledOnce()
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
    expect(consoleLog).toHaveBeenCalledOnce()
  })

  it('opens the mode chooser for an existing movie and creates the selected mode', async () => {
    const media = createSubscribeMovie({ title: '已入库电影', tmdb_id: 102 })
    const created = vi.fn()
    server.use(
      createSubscribeHandler({ data: { id: 502 }, success: true }, 200, created),
      defaultSubscribeConfigHandler('电影', { show_edit_dialog: false }),
    )
    await renderSubscribeHarness({ isExists: true, media })

    await fireEvent.click(screen.getByRole('button', { name: 'primary' }))
    const modeDialog = getDialogCall()
    expect(modeDialog.props).toMatchObject({ modes: ['normal', 'best_version'], type: '电影' })

    modeDialog.events.choose('best_version')
    await waitFor(() => expect(created).toHaveBeenCalledOnce())
    await waitFor(() => expect(mocks.doneProgress).toHaveBeenCalledOnce())
    expect(created.mock.calls[0][0]).toMatchObject({ best_version: 1, best_version_full: 0, season: null })
  })

  it('opens the TV season chooser with current state and the default mode', async () => {
    const media = createSubscribeTv({ season: 2, title: '季选择剧集', tmdb_id: 103 })
    server.use(defaultSubscribeConfigHandler('电视剧', { best_version: '1', best_version_full: '1' }))
    await renderSubscribeHarness({
      media,
      modes: { 1: 'normal', 2: 'best_version' },
      subscribedSeasons: [1, 2],
    })

    await fireEvent.click(screen.getByRole('button', { name: 'primary' }))

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const dialog = getDialogCall()
    expect(dialog.props).toMatchObject({
      defaultSubscribeMode: 'best_version_full',
      selectedSeason: undefined,
      subscribedSeasonModes: { 1: 'normal', 2: 'best_version' },
      subscribedSeasons: [1, 2],
    })
    expect(dialog.options).toEqual({ closeOn: ['close', 'subscribe'] })
  })

  it('opens the season chooser from an unsubscribed TV season entry', async () => {
    const media = createSubscribeTv({ season: 2, title: '单季入口剧集', tmdb_id: 1031 })
    server.use(defaultSubscribeConfigHandler('电视剧', { best_version: 0 }))
    await renderSubscribeHarness({ actionSeason: 2, media })

    await fireEvent.click(screen.getByRole('button', { name: 'season' }))

    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const dialog = getDialogCall()
    expect(dialog.props).toMatchObject({
      initialEpisodeGroup: 'episode-group-entry',
      selectedSeason: 2,
    })
  })

  it('cancels a subscribed movie from the primary entry', async () => {
    const deleted = vi.fn()
    server.use(deleteSubscribeByMediaHandler('tmdb:1032', { success: true }, 200, url => deleted(url)))
    await renderSubscribeHarness({
      isSubscribed: true,
      media: createSubscribeMovie({ title: '主入口取消电影', tmdb_id: 1032 }),
    })

    await fireEvent.click(screen.getByRole('button', { name: 'primary' }))

    await waitFor(() => expect(deleted).toHaveBeenCalledOnce())
    expect((deleted.mock.calls[0][0] as URL).searchParams.has('season')).toBe(false)
    expect(screen.getByTestId('subscribed')).toHaveTextContent('false')
    expect(mocks.cacheStatus).toHaveBeenCalledWith('status:all', false)
  })

  it('cancels a subscribed TV season only after confirmation', async () => {
    const media = createSubscribeTv({ season: 2, title: '取消季剧集', tmdb_id: 104 })
    const deleted = vi.fn()
    server.use(deleteSubscribeByMediaHandler('tmdb:104', { success: true }, 200, url => deleted(url)))
    await renderSubscribeHarness({
      isSubscribed: true,
      media,
      modes: { 1: 'normal', 2: 'best_version' },
      seasonsMap: { 1: true, 2: true },
      subscribedSeasons: [1, 2],
      useSeasonMap: true,
    })
    mocks.confirm.mockResolvedValueOnce(false)

    await fireEvent.click(screen.getByRole('button', { name: 'season' }))
    expect(deleted).not.toHaveBeenCalled()

    await fireEvent.click(screen.getByRole('button', { name: 'season' }))
    await waitFor(() => expect(deleted).toHaveBeenCalledOnce())
    expect((deleted.mock.calls[0][0] as URL).searchParams.get('season')).toBe('2')
    expect(screen.getByTestId('season-map')).toHaveTextContent('"2":false')
    expect(screen.getByTestId('modes')).not.toHaveTextContent('"2"')
    expect(screen.getByTestId('subscribed')).toHaveTextContent('true')
    expect(mocks.cacheStatus).toHaveBeenCalledWith('status:2', false)
  })

  it.each([
    {
      label: 'Douban',
      media: createSubscribeTv({ douban_id: 'db-1', tmdb_id: undefined }),
      mediaId: 'douban:db-1',
      record: createSubscribe({ doubanid: 'db-1', season: 2, tmdbid: 0, type: '电视剧' }),
    },
    {
      label: 'Bangumi',
      media: createSubscribeTv({ bangumi_id: '42', tmdb_id: undefined }),
      mediaId: 'bangumi:42',
      record: createSubscribe({ bangumiid: 42, season: 2, tmdbid: 0, type: '电视剧' }),
    },
    {
      label: 'AniList',
      media: createSubscribeTv({ anilist_id: 154587, tmdb_id: undefined }),
      mediaId: 'anilist:154587',
      record: createSubscribe({ anilistid: 154587, season: 2, tmdbid: 0, type: '电视剧' }),
    },
    {
      label: 'generic provider',
      media: createSubscribeTv({ media_id: 'series-1', mediaid_prefix: 'custom', tmdb_id: undefined }),
      mediaId: 'custom:series-1',
      record: createSubscribe({ mediaid: 'custom:series-1', season: 2, tmdbid: 0, type: '电视剧' }),
    },
  ])('queries $label subscriptions through the media endpoint', async ({ media, mediaId, record }) => {
    const queried = vi.fn()
    server.use(querySubscribeByMediaHandler(mediaId, record, 200, url => queried(url)))
    await renderSubscribeHarness({ actionSeason: 2, media })

    await fireEvent.click(screen.getByRole('button', { name: 'check' }))

    await waitFor(() => expect(screen.getByTestId('check-result')).toHaveTextContent('subscribed'))
    expect(queried).toHaveBeenCalledOnce()
    expect((queried.mock.calls[0][0] as URL).searchParams.get('season')).toBe('2')
  })

  it('cancels a non-TMDB season through the media endpoint', async () => {
    const media = createSubscribeTv({ douban_id: 'db-delete', tmdb_id: undefined })
    const deleted = vi.fn()
    server.use(deleteSubscribeByMediaHandler('douban:db-delete', { success: true }, 200, url => deleted(url)))
    await renderSubscribeHarness({
      actionSeason: 2,
      isSubscribed: true,
      media,
      seasonsMap: { 2: true },
      useSeasonMap: true,
    })

    await fireEvent.click(screen.getByRole('button', { name: 'remove' }))

    await waitFor(() => expect(deleted).toHaveBeenCalledOnce())
    expect((deleted.mock.calls[0][0] as URL).searchParams.get('season')).toBe('2')
    expect(screen.getByTestId('season-map')).toHaveTextContent('"2":false')
  })

  it('aligns visible seasons while preserving hidden subscriptions', async () => {
    const media = createSubscribeTv({ title: '多季剧集', tmdb_id: 105 })
    const deleted = vi.fn()
    const queried = vi.fn()
    const updated = vi.fn()
    const created = vi.fn()
    server.use(
      deleteSubscribeByMediaHandler('tmdb:105', { success: true }, 200, url => deleted(url)),
      querySubscribeByMediaHandler(
        'tmdb:105',
        createSubscribe({ id: 605, season: 2, tmdbid: 105, type: '电视剧' }),
        200,
        url => queried(url),
      ),
      updateSubscribeHandler({ success: true }, 200, updated),
      createSubscribeHandler({ data: { id: 606 }, success: true }, 200, created),
    )
    await renderSubscribeHarness({
      isSubscribed: true,
      media,
      modes: { 1: 'normal', 2: 'normal', 4: 'best_version' },
      multi: {
        modes: { 2: 'best_version', 3: 'best_version_full' },
        seasons: [{ season_number: 2 }, { season_number: 3 }],
        visible: [1, 2, 3],
      },
      subscribedSeasons: [1, 2, 4],
    })

    await fireEvent.click(screen.getByRole('button', { name: 'align-seasons' }))

    await waitFor(() => expect(deleted).toHaveBeenCalledOnce())
    await waitFor(() => expect(updated).toHaveBeenCalledOnce())
    await waitFor(() => expect(created).toHaveBeenCalledOnce())
    expect((deleted.mock.calls[0][0] as URL).searchParams.get('season')).toBe('1')
    expect((queried.mock.calls[0][0] as URL).searchParams.get('season')).toBe('2')
    expect(updated.mock.calls[0][0]).toMatchObject({ best_version: 1, best_version_full: 0, id: 605, season: 2 })
    expect(created.mock.calls[0][0]).toMatchObject({
      best_version: 1,
      best_version_full: 1,
      episode_group: 'episode-group-1',
      season: 3,
    })
    await waitFor(() => expect(screen.getByTestId('seasons')).toHaveTextContent('[2,3,4]'))
    expect(screen.getByTestId('modes')).toHaveTextContent('"2":"best_version"')
    expect(screen.getByTestId('modes')).toHaveTextContent('"3":"best_version_full"')
    expect(screen.getByTestId('modes')).toHaveTextContent('"4":"best_version"')
  })

  it('synchronizes the created season after edit save and remove events', async () => {
    const media = createSubscribeTv({ season: 2, title: '编辑后同步', tmdb_id: 106 })
    server.use(
      createSubscribeHandler({ data: { id: 701 }, success: true }),
      defaultSubscribeConfigHandler('电视剧', { show_edit_dialog: true }),
    )
    await renderSubscribeHarness({
      isSubscribed: true,
      media,
      modes: { 1: 'normal' },
      subscribedSeasons: [1],
    })

    await fireEvent.click(screen.getByRole('button', { name: 'add-best-full' }))
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    expect(screen.getByTestId('seasons')).toHaveTextContent('[1,2]')
    const editDialog = getDialogCall()
    expect(editDialog.props).toEqual({ subid: 701 })

    editDialog.events.save(
      createSubscribe({ best_version: 1, best_version_full: 0, id: 701, season: 2, type: '电视剧' }),
    )
    await waitFor(() => expect(screen.getByTestId('modes')).toHaveTextContent('"2":"best_version"'))

    editDialog.events.remove()
    await waitFor(() => expect(screen.getByTestId('seasons')).toHaveTextContent('[1]'))
    expect(screen.getByTestId('subscribed')).toHaveTextContent('true')
    expect(screen.getByTestId('modes')).not.toHaveTextContent('"2"')
    expect(mocks.cacheStatus).toHaveBeenLastCalledWith('status:2', false)
    expect(mocks.onEditRemove).toHaveBeenCalledOnce()
  })

  it.each([
    ['business failure', 200, { message: 'duplicate', success: false }],
    ['HTTP failure', 500, { message: 'server down', success: false }],
  ])('keeps state unchanged when create returns a %s', async (_case, status, response) => {
    const consoleError = status === 500 ? vi.spyOn(console, 'error').mockImplementation(() => {}) : undefined
    server.use(createSubscribeHandler(response, status))
    await renderSubscribeHarness({ media: createSubscribeMovie({ tmdb_id: 107 }) })

    await fireEvent.click(screen.getByRole('button', { name: 'add-normal' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    expect(screen.getByTestId('subscribed')).toHaveTextContent('false')
    expect(mocks.cacheStatus).not.toHaveBeenCalled()
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
    expect(mocks.doneProgress).toHaveBeenCalledOnce()
    if (status === 500) expect(consoleError).toHaveBeenCalledOnce()
  })

  it.each([
    ['business failure', 200, { message: 'delete rejected', success: false }],
    ['HTTP failure', 500, { message: 'server down', success: false }],
  ])('keeps subscription state when removal returns a %s', async (_case, status, response) => {
    const consoleError = status === 500 ? vi.spyOn(console, 'error').mockImplementation(() => {}) : undefined
    const deleted = vi.fn()
    server.use(deleteSubscribeByMediaHandler('tmdb:108', response, status, url => deleted(url)))
    await renderSubscribeHarness({
      actionSeason: 2,
      isSubscribed: true,
      media: createSubscribeTv({ season: 2, tmdb_id: 108 }),
      modes: { 1: 'normal', 2: 'best_version' },
      seasonsMap: { 1: true, 2: true },
      subscribedSeasons: [1, 2],
      useSeasonMap: true,
    })

    await fireEvent.click(screen.getByRole('button', { name: 'remove' }))

    await waitFor(() => expect(deleted).toHaveBeenCalledOnce())
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    expect((deleted.mock.calls[0][0] as URL).searchParams.get('season')).toBe('2')
    expect(screen.getByTestId('subscribed')).toHaveTextContent('true')
    expect(screen.getByTestId('seasons')).toHaveTextContent('[1,2]')
    expect(screen.getByTestId('season-map')).toHaveTextContent('"2":true')
    expect(screen.getByTestId('modes')).toHaveTextContent('"2":"best_version"')
    expect(mocks.cacheStatus).not.toHaveBeenCalled()
    expect(mocks.doneProgress).toHaveBeenCalledOnce()
    if (status === 500) expect(consoleError).toHaveBeenCalledOnce()
  })

  it.each([
    ['business failure', 200, { message: 'update rejected', success: false }],
    ['HTTP failure', 500, { message: 'server down', success: false }],
  ])('keeps the subscribed mode when an update returns a %s', async (_case, status, response) => {
    const consoleError = status === 500 ? vi.spyOn(console, 'error').mockImplementation(() => {}) : undefined
    const media = createSubscribeTv({ title: '模式更新失败剧集', tmdb_id: 110 })
    const updated = vi.fn()
    server.use(
      querySubscribeByMediaHandler('tmdb:110', createSubscribe({ id: 710, season: 2, tmdbid: 110, type: '电视剧' })),
      updateSubscribeHandler(response, status, updated),
    )
    await renderSubscribeHarness({
      isSubscribed: true,
      media,
      modes: { 2: 'normal' },
      multi: {
        modes: { 2: 'best_version' },
        seasons: [{ season_number: 2 }],
        visible: [2],
      },
      subscribedSeasons: [2],
    })

    await fireEvent.click(screen.getByRole('button', { name: 'align-seasons' }))

    await waitFor(() => expect(updated).toHaveBeenCalledOnce())
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce())
    expect(screen.getByTestId('subscribed')).toHaveTextContent('true')
    expect(screen.getByTestId('seasons')).toHaveTextContent('[2]')
    expect(screen.getByTestId('modes')).toHaveTextContent('"2":"normal"')
    expect(mocks.cacheStatus).not.toHaveBeenCalled()
    expect(mocks.doneProgress).toHaveBeenCalledOnce()
    if (status === 500) expect(consoleError).toHaveBeenCalledOnce()
  })

  it('maps a 404 query to missing and propagates other HTTP errors', async () => {
    const media = createSubscribeMovie({ tmdb_id: 109 })
    server.use(querySubscribeByMediaHandler('tmdb:109', {}, 404))
    await renderSubscribeHarness({ media })

    await fireEvent.click(screen.getByRole('button', { name: 'check' }))
    await waitFor(() => expect(screen.getByTestId('check-result')).toHaveTextContent('missing'))

    server.use(querySubscribeByMediaHandler('tmdb:109', {}, 500))
    await fireEvent.click(screen.getByRole('button', { name: 'check' }))
    await waitFor(() => expect(screen.getByTestId('check-result')).toHaveTextContent('error'))
  })

  it('does nothing when the current media is unavailable', async () => {
    await renderSubscribeHarness()

    await fireEvent.click(screen.getByRole('button', { name: 'primary' }))
    await fireEvent.click(screen.getByRole('button', { name: 'add-normal' }))
    await fireEvent.click(screen.getByRole('button', { name: 'open-season' }))

    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
    expect(mocks.startProgress).not.toHaveBeenCalled()
  })
})
