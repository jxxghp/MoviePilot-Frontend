import type { Workflow } from '@/api/types'
import WorkflowListView from '@/views/workflow/WorkflowListView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, ref, type Component, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  keepAliveRefresh: undefined as undefined | (() => unknown),
  openSharedDialog: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

vi.mock('@/composables/useKeepAliveRefresh', () => ({
  useKeepAliveRefresh: (handler: () => unknown) => {
    mocks.keepAliveRefresh = handler
  },
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

const LoadingBannerStub = defineComponent({
  name: 'LoadingBanner',
  template: '<div role="status">正在加载工作流</div>',
})

const NoDataFoundStub = defineComponent({
  name: 'NoDataFound',
  props: {
    errorCode: String,
    errorDescription: String,
    errorTitle: String,
  },
  template:
    '<section role="region" aria-label="工作流状态" :data-error-code="errorCode">{{ errorTitle }} {{ errorDescription }}<slot name="button" /></section>',
})

const ButtonStub = defineComponent({
  name: 'VBtn',
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => h('button', { ...attrs, type: 'button' }, slots.default?.())
  },
})

const ProgressiveCardGridStub = defineComponent({
  name: 'ProgressiveCardGrid',
  props: {
    getItemKey: { type: Function as PropType<(item: Workflow) => string | undefined>, required: true },
    items: { type: Array as PropType<Workflow[]>, required: true },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'section',
        { 'data-testid': 'workflow-grid' },
        props.items.flatMap(item => {
          props.getItemKey(item)
          return slots.default?.({ item }) ?? []
        }),
      )
  },
})

const WorkflowTaskCardStub = defineComponent({
  name: 'WorkflowTaskCard',
  props: {
    workflow: { type: Object as PropType<Workflow>, required: true },
  },
  emits: ['refresh'],
  setup(props, { emit }) {
    return () =>
      h('article', { 'data-testid': `workflow-card-${props.workflow.id}` }, [
        h('span', props.workflow.name),
        h(
          'button',
          {
            'aria-label': `刷新-${props.workflow.id}`,
            onClick: () => emit('refresh'),
            type: 'button',
          },
          '刷新',
        ),
      ])
  },
})

const WorkflowListHost = defineComponent({
  name: 'WorkflowListHost',
  components: { WorkflowListView },
  setup() {
    const view = ref<{ openAddDialog: () => void } | null>(null)
    const openAddDialog = () => {
      view.value?.openAddDialog()
    }
    return { openAddDialog, view }
  },
  template: `
    <WorkflowListView ref="view" />
    <button type="button" @click="openAddDialog">打开新增</button>
  `,
})

function createWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    actions: [{ id: 'scan', name: '扫描目录', type: 'ScanFile' }],
    id: 'workflow-1',
    name: '扫描和刮削',
    state: 'W',
    trigger_type: 'manual',
    ...overrides,
  }
}

function listRequests() {
  return mocks.apiGet.mock.calls.filter(([endpoint]) => endpoint === 'workflow/')
}

async function renderList(component: Component = WorkflowListView) {
  return renderWithProviders(component, {
    initialRoute: '/workflow',
    global: {
      stubs: {
        LoadingBanner: LoadingBannerStub,
        NoDataFound: NoDataFoundStub,
        ProgressiveCardGrid: ProgressiveCardGridStub,
        VBtn: ButtonStub,
        WorkflowTaskCard: WorkflowTaskCardStub,
      },
    },
  })
}

describe('WorkflowListView', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.keepAliveRefresh = undefined
    mocks.openSharedDialog.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('loads event types and workflows on the initial mount', async () => {
    const workflow = createWorkflow()
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'workflow/event_types') return [{ title: '下载完成', value: 'download.completed' }]
      if (endpoint === 'workflow/') return [workflow]
      throw new Error(`Unexpected GET ${endpoint}`)
    })

    await renderList()

    expect(await screen.findByText(workflow.name!)).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledWith('workflow/event_types')
    expect(mocks.apiGet).toHaveBeenCalledWith('workflow/')
    expect(listRequests()).toHaveLength(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the empty state for a successful empty workflow response', async () => {
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'workflow/event_types') return []
      if (endpoint === 'workflow/') return []
      throw new Error(`Unexpected GET ${endpoint}`)
    })

    await renderList()

    expect(await screen.findByRole('region', { name: '工作流状态' })).toHaveTextContent('没有工作流')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByTestId('workflow-grid')).not.toBeInTheDocument()
  })

  it('leaves the loading state and offers same-page retry after an initial failure', async () => {
    const workflow = createWorkflow({ name: '恢复后的工作流' })
    let workflowAttempt = 0
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'workflow/event_types') return []
      if (endpoint === 'workflow/') {
        workflowAttempt += 1
        if (workflowAttempt === 1) return Promise.reject(new Error('network unavailable'))
        return [workflow]
      }
      throw new Error(`Unexpected GET ${endpoint}`)
    })

    await renderList()

    const retry = await screen.findByRole('button', { name: '重试' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await fireEvent.click(retry)
    expect(await screen.findByText(workflow.name!)).toBeInTheDocument()
    expect(listRequests()).toHaveLength(2)
  })

  it('reloads the workflow list when a card emits refresh', async () => {
    const workflow = createWorkflow()
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'workflow/event_types') return []
      if (endpoint === 'workflow/') return [workflow]
      throw new Error(`Unexpected GET ${endpoint}`)
    })

    await renderList()
    await screen.findByText(workflow.name!)

    await fireEvent.click(screen.getByRole('button', { name: '刷新-workflow-1' }))

    await waitFor(() => expect(listRequests()).toHaveLength(2))
  })

  it('keeps stale workflows visible and offers retry when a refresh fails', async () => {
    const staleWorkflow = createWorkflow({ name: '已有工作流' })
    const recoveredWorkflow = createWorkflow({ name: '恢复后的工作流' })
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'workflow/event_types') return []
      if (endpoint === 'workflow/') return [staleWorkflow]
      throw new Error(`Unexpected GET ${endpoint}`)
    })

    await renderList()
    expect(await screen.findByText(staleWorkflow.name!)).toBeInTheDocument()

    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'workflow/') return Promise.reject(new Error('network unavailable'))
      throw new Error(`Unexpected GET ${endpoint}`)
    })
    await mocks.keepAliveRefresh?.()

    const retry = await screen.findByRole('button', { name: '重试' })
    expect(screen.getByText(staleWorkflow.name!)).toBeInTheDocument()

    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'workflow/') return [recoveredWorkflow]
      throw new Error(`Unexpected GET ${endpoint}`)
    })
    await fireEvent.click(retry)

    expect(await screen.findByText(recoveredWorkflow.name!)).toBeInTheDocument()
    expect(screen.queryByText(staleWorkflow.name!)).not.toBeInTheDocument()
  })

  it('ignores an older failed refresh after a newer request succeeds', async () => {
    const initialWorkflow = createWorkflow({ name: '初始工作流' })
    const latestWorkflow = createWorkflow({ name: '最新工作流' })
    let rejectOlder!: (reason: Error) => void
    let requestCount = 0
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'workflow/event_types') return []
      if (endpoint !== 'workflow/') throw new Error(`Unexpected GET ${endpoint}`)
      requestCount += 1
      if (requestCount === 1) return [initialWorkflow]
      if (requestCount === 2) {
        return new Promise((_resolve, reject) => {
          rejectOlder = reject
        })
      }
      return [latestWorkflow]
    })

    await renderList()
    expect(await screen.findByText(initialWorkflow.name!)).toBeInTheDocument()

    const olderRefresh = mocks.keepAliveRefresh?.()
    await mocks.keepAliveRefresh?.()
    expect(await screen.findByText(latestWorkflow.name!)).toBeInTheDocument()

    rejectOlder(new Error('stale network failure'))
    await olderRefresh

    expect(screen.getByText(latestWorkflow.name!)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument()
  })

  it('ignores an older successful response after a newer request succeeds', async () => {
    const initialWorkflow = createWorkflow({ name: '初始工作流' })
    const staleWorkflow = createWorkflow({ name: '迟到工作流' })
    const latestWorkflow = createWorkflow({ name: '最新工作流' })
    let resolveOlder!: (value: Workflow[]) => void
    let requestCount = 0
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'workflow/event_types') return []
      if (endpoint !== 'workflow/') throw new Error(`Unexpected GET ${endpoint}`)
      requestCount += 1
      if (requestCount === 1) return [initialWorkflow]
      if (requestCount === 2) {
        return new Promise(resolve => {
          resolveOlder = resolve
        })
      }
      return [latestWorkflow]
    })

    await renderList()
    expect(await screen.findByText(initialWorkflow.name!)).toBeInTheDocument()

    const olderRefresh = mocks.keepAliveRefresh?.()
    await mocks.keepAliveRefresh?.()
    expect(await screen.findByText(latestWorkflow.name!)).toBeInTheDocument()

    resolveOlder([staleWorkflow])
    await olderRefresh

    expect(screen.getByText(latestWorkflow.name!)).toBeInTheDocument()
    expect(screen.queryByText(staleWorkflow.name!)).not.toBeInTheDocument()
  })

  it('reloads the workflow list after the add dialog emits save', async () => {
    const workflow = createWorkflow()
    let saveHandler: (() => unknown) | undefined
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'workflow/event_types') return []
      if (endpoint === 'workflow/') return [workflow]
      throw new Error(`Unexpected GET ${endpoint}`)
    })
    mocks.openSharedDialog.mockImplementation(
      (_component: unknown, _props: unknown, events: { save?: () => unknown }) => {
        saveHandler = events.save
        return { close: vi.fn(), id: 1, updateProps: vi.fn() }
      },
    )

    await renderList(WorkflowListHost)
    await screen.findByText(workflow.name!)
    await fireEvent.click(screen.getByRole('button', { name: '打开新增' }))

    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    saveHandler?.()
    await waitFor(() => expect(listRequests()).toHaveLength(2))
  })
})
