import type { DownloadingInfo } from '@/api/types'
import DownloadingListView from '@/views/reorganize/DownloadingListView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { downloadingListHandler } from '@tests/support/msw/handlers/download'
import { server } from '@tests/support/msw/server'
import { defineComponent, ref, type PropType, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const refreshMocks = vi.hoisted(() => ({
  registrations: [] as Array<{
    callback: () => Promise<void> | void
    condition: Ref<boolean>
    id: string
    immediate: boolean
    interval: number
    kind: 'conditional' | 'unconditional'
  }>,
}))

vi.mock('@/composables/useBackground', async () => {
  const { computed, onMounted, ref, watch } = await import('vue')

  function register(
    kind: 'conditional' | 'unconditional',
    id: string,
    callback: () => Promise<void> | void,
    condition: Ref<boolean>,
    interval: number,
    immediate: boolean,
  ) {
    refreshMocks.registrations.push({ callback, condition, id, immediate, interval, kind })
    if (kind === 'conditional') {
      onMounted(() => {
        if (condition.value && immediate) void callback()
      })
      watch(condition, active => {
        if (active && immediate) void callback()
      })
    }
    return {
      isActive: ref(condition.value),
      loading: ref(false),
      refresh: callback,
      start: vi.fn(),
      stop: vi.fn(),
    }
  }

  return {
    useBackground: () => ({
      useConditionalDataRefresh: (
        id: string,
        callback: () => Promise<void> | void,
        condition: Ref<boolean>,
        interval: number,
        immediate = true,
      ) => register('conditional', id, callback, condition, interval, immediate),
      useDataRefresh: (id: string, callback: () => Promise<void> | void, interval: number) =>
        register(
          'unconditional',
          id,
          callback,
          computed(() => true),
          interval,
          true,
        ),
    }),
  }
})

const LoadingBannerStub = defineComponent({
  template: '<div data-testid="loading-banner">loading</div>',
})

const NoDataFoundStub = defineComponent({
  template: '<div data-testid="no-data">empty</div>',
})

const DownloadingCardStub = defineComponent({
  props: {
    downloaderName: String,
    downloaderType: String,
    info: Object,
  },
  emits: ['updated'],
  template: `
    <article :data-testid="\`download-\${info.hash}\`">
      {{ info.title }}|{{ downloaderName }}|{{ downloaderType }}
      <button type="button" @click="$emit('updated')">refresh {{ info.hash }}</button>
    </article>
  `,
})

const ProgressiveCardGridStub = defineComponent({
  props: {
    getItemKey: {
      type: Function as PropType<(item: DownloadingInfo) => string | undefined>,
      required: true,
    },
    items: {
      type: Array as PropType<DownloadingInfo[]>,
      default: () => [],
    },
  },
  template: `
    <div data-testid="grid">
      <div v-for="item in items" :key="getItemKey(item)" :data-item-key="getItemKey(item)">
        <slot :item="item" />
      </div>
    </div>
  `,
})

function downloading(hash: string, title: string, overrides: Partial<DownloadingInfo> = {}): DownloadingInfo {
  return {
    dlspeed: '2 MiB',
    hash,
    left_time: '1 小时',
    media: { title },
    name: title,
    progress: 20,
    size: 1024,
    state: 'downloading',
    title,
    upspeed: '1 MiB',
    userid: 'tester',
    username: 'tester',
    ...overrides,
  }
}

async function renderList(
  props: { active?: boolean; name?: string; type?: string } = {},
  options: {
    onRequest?: (url: URL) => void
    response?: DownloadingInfo[] | ((url: URL) => DownloadingInfo[] | Promise<DownloadingInfo[]>)
    status?: number
    superUser?: boolean
    userName?: string
  } = {},
) {
  server.use(downloadingListHandler(options.response ?? [], options.status ?? 200, options.onRequest))
  return renderWithProviders(DownloadingListView, {
    props: {
      active: props.active ?? true,
      name: props.name ?? 'primary',
      type: props.type ?? 'qbittorrent',
    },
    initialState: {
      user: {
        superUser: options.superUser ?? false,
        userName: options.userName ?? 'tester',
      },
    },
    global: {
      stubs: {
        DownloadingCard: DownloadingCardStub,
        LoadingBanner: LoadingBannerStub,
        NoDataFound: NoDataFoundStub,
        ProgressiveCardGrid: ProgressiveCardGridStub,
      },
    },
  })
}

async function runRegisteredRefreshes() {
  const jobsById = new Map(refreshMocks.registrations.map(registration => [registration.id, registration]))
  await Promise.all(
    [...jobsById.values()]
      .filter(registration => registration.condition.value)
      .map(registration => registration.callback()),
  )
}

beforeEach(() => {
  refreshMocks.registrations.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('DownloadingListView loading and ownership', () => {
  it('queries the selected downloader and filters a normal user by either owner field', async () => {
    const requested = vi.fn()
    await renderList(
      { name: 'qb-main', type: 'qbittorrent' },
      {
        onRequest: requested,
        response: [
          downloading('own-id', 'Own by id', { userid: 'tester', username: 'other' }),
          downloading('', 'Own by name', { userid: 'other', username: 'tester' }),
          downloading('other', 'Other task', { userid: 'other', username: 'other' }),
        ],
      },
    )

    expect(await screen.findByText(/Own by id\|qb-main\|qbittorrent/)).toBeInTheDocument()
    expect(screen.getByText(/Own by name\|qb-main\|qbittorrent/)).toBeInTheDocument()
    expect(screen.getByText(/Own by id\|qb-main\|qbittorrent/).parentElement).toHaveAttribute('data-item-key', 'own-id')
    expect(screen.getByText(/Own by name\|qb-main\|qbittorrent/).parentElement).toHaveAttribute(
      'data-item-key',
      'Own by name',
    )
    expect(screen.queryByText(/Other task\|qb-main\|qbittorrent/)).not.toBeInTheDocument()
    expect(requested).toHaveBeenCalledOnce()
    expect(requested.mock.calls[0][0].searchParams.get('name')).toBe('qb-main')
  })

  it('lets a superuser see every task', async () => {
    await renderList(
      { name: 'transmission' },
      {
        response: [
          downloading('own', 'Own task'),
          downloading('other', 'Other task', { userid: 'other', username: 'other' }),
        ],
        superUser: true,
      },
    )

    expect(await screen.findByText(/Own task\|transmission\|qbittorrent/)).toBeInTheDocument()
    expect(screen.getByText(/Other task\|transmission\|qbittorrent/)).toBeInTheDocument()
  })

  it('replaces the loading state with the successful empty state', async () => {
    let resolveResponse: ((value: DownloadingInfo[]) => void) | undefined
    await renderList(
      {},
      {
        response: () =>
          new Promise<DownloadingInfo[]>(resolve => {
            resolveResponse = resolve
          }),
      },
    )
    expect(screen.getByTestId('loading-banner')).toBeInTheDocument()

    await waitFor(() => expect(resolveResponse).toBeTypeOf('function'))
    resolveResponse?.([])
    expect(await screen.findByTestId('no-data')).toBeInTheDocument()
    expect(screen.queryByTestId('loading-banner')).not.toBeInTheDocument()
  })

  it('does not misrepresent an HTTP failure as a successful empty snapshot', async () => {
    await renderList({}, { status: 503 })

    await waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(screen.queryByTestId('no-data')).not.toBeInTheDocument()
  })
})

describe('DownloadingListView refresh ownership', () => {
  it('refreshes the current downloader after a task settings update', async () => {
    const requested = vi.fn()
    let snapshot = [downloading('task', 'Before update')]
    await renderList(
      { name: 'qb-main' },
      {
        onRequest: requested,
        response: () => snapshot,
        superUser: true,
      },
    )

    expect(await screen.findByText(/Before update\|qb-main\|qbittorrent/)).toBeInTheDocument()
    snapshot = [downloading('task', 'After update')]
    await fireEvent.click(screen.getByRole('button', { name: 'refresh task' }))

    expect(await screen.findByText(/After update\|qb-main\|qbittorrent/)).toBeInTheDocument()
    expect(requested).toHaveBeenCalledTimes(2)
  })

  it('uses downloader-scoped identities and refreshes only the active downloader snapshot', async () => {
    const requested = vi.fn()
    const snapshots: Record<string, DownloadingInfo[]> = {
      alpha: [downloading('alpha-old', 'Alpha old')],
      beta: [downloading('beta-old', 'Beta old')],
    }
    server.use(downloadingListHandler(url => snapshots[url.searchParams.get('name') || ''] ?? [], 200, requested))

    const Host = defineComponent({
      components: { DownloadingListView },
      setup() {
        const activeName = ref('alpha')
        return { activeName }
      },
      template: `
        <button type="button" @click="activeName = 'beta'">activate beta</button>
        <DownloadingListView name="alpha" :active="activeName === 'alpha'" />
        <DownloadingListView name="beta" :active="activeName === 'beta'" />
      `,
    })
    await renderWithProviders(Host, {
      initialState: { user: { superUser: true, userName: 'admin' } },
      global: {
        stubs: {
          DownloadingCard: DownloadingCardStub,
          LoadingBanner: LoadingBannerStub,
          NoDataFound: NoDataFoundStub,
          ProgressiveCardGrid: ProgressiveCardGridStub,
        },
      },
    })

    expect(await screen.findByText(/Alpha old\|alpha\|/)).toBeInTheDocument()
    expect(await screen.findByText(/Beta old\|beta\|/)).toBeInTheDocument()
    expect(requested).toHaveBeenCalledTimes(2)
    expect(requested.mock.calls.map(call => call[0].searchParams.get('name')).sort()).toEqual(['alpha', 'beta'])
    snapshots.alpha = [downloading('alpha-new', 'Alpha new')]
    snapshots.beta = [downloading('beta-new', 'Beta new')]

    await runRegisteredRefreshes()

    await waitFor(() => expect(screen.getByText(/Alpha new\|alpha\|/)).toBeInTheDocument())
    expect(screen.queryByText(/Alpha old\|alpha\|/)).not.toBeInTheDocument()
    expect(screen.getByText(/Beta old\|beta\|/)).toBeInTheDocument()
    expect(screen.queryByText(/Beta new\|beta\|/)).not.toBeInTheDocument()
    expect(requested).toHaveBeenCalledTimes(3)
    expect(requested.mock.calls.filter(call => call[0].searchParams.get('name') === 'alpha')).toHaveLength(2)
    expect(requested.mock.calls.filter(call => call[0].searchParams.get('name') === 'beta')).toHaveLength(1)

    snapshots.alpha = [downloading('alpha-later', 'Alpha later')]
    snapshots.beta = [downloading('beta-activated', 'Beta activated')]
    await fireEvent.click(screen.getByRole('button', { name: 'activate beta' }))

    await waitFor(() => expect(screen.getByText(/Beta activated\|beta\|/)).toBeInTheDocument())
    expect(requested).toHaveBeenCalledTimes(4)
    expect(requested.mock.calls.filter(call => call[0].searchParams.get('name') === 'alpha')).toHaveLength(2)
    expect(requested.mock.calls.filter(call => call[0].searchParams.get('name') === 'beta')).toHaveLength(2)

    snapshots.beta = [downloading('beta-new', 'Beta new')]
    await runRegisteredRefreshes()

    await waitFor(() => expect(screen.getByText(/Beta new\|beta\|/)).toBeInTheDocument())
    expect(screen.getByText(/Alpha new\|alpha\|/)).toBeInTheDocument()
    expect(screen.queryByText(/Alpha later\|alpha\|/)).not.toBeInTheDocument()
    expect(requested).toHaveBeenCalledTimes(5)
    expect(requested.mock.calls.filter(call => call[0].searchParams.get('name') === 'alpha')).toHaveLength(2)
    expect(requested.mock.calls.filter(call => call[0].searchParams.get('name') === 'beta')).toHaveLength(3)
    expect(refreshMocks.registrations).toEqual([
      expect.objectContaining({
        id: 'downloading-list-alpha',
        immediate: false,
        interval: 3000,
        kind: 'conditional',
      }),
      expect.objectContaining({
        id: 'downloading-list-beta',
        immediate: false,
        interval: 3000,
        kind: 'conditional',
      }),
    ])
  })
})
