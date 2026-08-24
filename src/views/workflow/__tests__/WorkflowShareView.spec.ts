import type { WorkflowShare } from '@/api/types'
import WorkflowShareView from '@/views/workflow/WorkflowShareView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, onMounted, ref, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

const LoadingBannerStub = defineComponent({
  name: 'LoadingBanner',
  template: '<div role="status">正在加载共享工作流</div>',
})

const NoDataFoundStub = defineComponent({
  name: 'NoDataFound',
  props: {
    errorTitle: String,
  },
  template: '<section role="region" aria-label="共享工作流状态">{{ errorTitle }}</section>',
})

const InfiniteScrollStub = defineComponent({
  name: 'VInfiniteScroll',
  emits: ['load'],
  setup(_props, { emit, slots }) {
    const status = ref<string>()
    const load = () => emit('load', { done: (value: string) => (status.value = value) })
    onMounted(load)
    return () =>
      h('div', { 'data-testid': 'share-scroll', 'data-status': status.value }, [
        slots.default?.(),
        status.value === 'error' ? slots.error?.({ props: { onClick: load }, side: 'end' }) : undefined,
      ])
  },
})

const ProgressiveCardGridStub = defineComponent({
  name: 'ProgressiveCardGrid',
  props: {
    getItemKey: { type: Function as PropType<(item: WorkflowShare) => string | undefined>, required: true },
    items: { type: Array as PropType<WorkflowShare[]>, required: true },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'section',
        { 'data-testid': 'share-grid' },
        props.items.flatMap(item => {
          props.getItemKey(item)
          return slots.default?.({ item }) ?? []
        }),
      )
  },
})

const WorkflowShareCardStub = defineComponent({
  name: 'WorkflowShareCard',
  props: {
    workflow: { type: Object as PropType<WorkflowShare>, required: true },
  },
  emits: ['delete', 'update'],
  setup(props, { emit }) {
    return () =>
      h('article', { 'data-testid': `share-card-${props.workflow.id}` }, [
        h('span', props.workflow.share_title),
        h(
          'button',
          {
            'aria-label': `删除-${props.workflow.id}`,
            onClick: () => emit('delete'),
            type: 'button',
          },
          '删除',
        ),
        h(
          'button',
          {
            'aria-label': `刷新-${props.workflow.id}`,
            onClick: () => emit('update'),
            type: 'button',
          },
          '刷新',
        ),
      ])
  },
})

function createWorkflowShare(overrides: Partial<WorkflowShare> = {}): WorkflowShare {
  return {
    id: 'share-1',
    share_title: '共享工作流',
    share_user: '测试用户',
    ...overrides,
  }
}

function shareRequests() {
  return mocks.apiGet.mock.calls.filter(([endpoint]) => endpoint === 'workflow/shares')
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, reject, resolve }
}

async function renderList(keyword = '') {
  return renderWithProviders(WorkflowShareView, {
    global: {
      stubs: {
        LoadingBanner: LoadingBannerStub,
        NoDataFound: NoDataFoundStub,
        ProgressiveCardGrid: ProgressiveCardGridStub,
        VInfiniteScroll: InfiniteScrollStub,
        VPageContentTitle: true,
        WorkflowShareCard: WorkflowShareCardStub,
      },
    },
    props: { keyword },
  })
}

describe('WorkflowShareView', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.defineProperty(document.body, 'scrollHeight', { configurable: true, value: 1200 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 })
  })

  it('loads the current page with the exact keyword and renders shared workflows', async () => {
    const share = createWorkflowShare()
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'workflow/event_types') return []
      if (endpoint === 'workflow/shares') return [share]
      throw new Error(`Unexpected GET ${endpoint}`)
    })

    await renderList('自动整理')

    expect(await screen.findByText(share.share_title!)).toBeInTheDocument()
    expect(shareRequests()).toEqual([
      [
        'workflow/shares',
        {
          params: { count: 30, name: '自动整理', page: 1 },
        },
      ],
    ])
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the legitimate empty state after a successful empty response', async () => {
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'workflow/event_types') return []
      if (endpoint === 'workflow/shares') return []
      throw new Error(`Unexpected GET ${endpoint}`)
    })

    await renderList()

    expect(await screen.findByRole('region', { name: '共享工作流状态' })).toHaveTextContent('暂无数据')
    expect(screen.getByTestId('share-scroll')).toHaveAttribute('data-status', 'empty')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('prefills consecutive pages until the viewport is full or the backend is exhausted', async () => {
    Object.defineProperty(document.body, 'scrollHeight', { configurable: true, value: 600 })
    const firstPage = createWorkflowShare({ share_title: '首个预加载结果' })
    mocks.apiGet.mockImplementation((endpoint: string, options?: { params?: { page?: number } }) => {
      if (endpoint === 'workflow/event_types') return []
      if (endpoint !== 'workflow/shares') throw new Error(`Unexpected GET ${endpoint}`)
      return options?.params?.page === 1 ? [firstPage] : []
    })

    await renderList()

    expect(await screen.findByText(firstPage.share_title!)).toBeInTheDocument()
    await waitFor(() => expect(shareRequests()).toHaveLength(2))
    expect(shareRequests().map(([, options]) => options)).toEqual([
      { params: { count: 30, name: '', page: 1 } },
      { params: { count: 30, name: '', page: 2 } },
    ])
    expect(screen.getByTestId('share-scroll')).toHaveAttribute('data-status', 'empty')
  })

  it('leaves the loading state and retries the same page after an initial failure', async () => {
    const recovered = createWorkflowShare({ share_title: '恢复后的共享工作流' })
    let attempt = 0
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'workflow/event_types') return []
      if (endpoint === 'workflow/shares') {
        attempt += 1
        if (attempt === 1) return Promise.reject(new Error('network unavailable'))
        return [recovered]
      }
      throw new Error(`Unexpected GET ${endpoint}`)
    })

    await renderList()

    const failure = await screen.findByRole('alert')
    expect(failure).toHaveTextContent('请求失败')
    expect(screen.queryByRole('region', { name: '共享工作流状态' })).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    const retry = screen.getByRole('button', { name: '重试' })
    await fireEvent.click(retry)

    expect(await screen.findByText(recovered.share_title!)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(shareRequests()).toHaveLength(2)
    expect(shareRequests()[1][1]).toEqual({ params: { count: 30, name: '', page: 1 } })
  })

  it('keeps the newest keyword result when an older request finishes later', async () => {
    const oldRequest = createDeferred<WorkflowShare[]>()
    const latest = createWorkflowShare({ id: 'share-new', share_title: '新关键字结果' })
    mocks.apiGet.mockImplementation((endpoint: string, options?: { params?: { name?: string } }) => {
      if (endpoint === 'workflow/event_types') return []
      if (endpoint !== 'workflow/shares') throw new Error(`Unexpected GET ${endpoint}`)
      if (options?.params?.name === '旧关键字') return oldRequest.promise
      if (options?.params?.name === '新关键字') return [latest]
      throw new Error(`Unexpected keyword ${options?.params?.name}`)
    })

    const { rerender } = await renderList('旧关键字')
    await waitFor(() => expect(shareRequests()).toHaveLength(1))
    await rerender({ keyword: '新关键字' })

    expect(await screen.findByText(latest.share_title!)).toBeInTheDocument()
    oldRequest.resolve([createWorkflowShare({ share_title: '迟到旧结果' })])
    await oldRequest.promise

    expect(screen.getByText(latest.share_title!)).toBeInTheDocument()
    expect(screen.queryByText('迟到旧结果')).not.toBeInTheDocument()
  })

  it('ignores an older keyword failure after the newest request succeeds', async () => {
    const oldRequest = createDeferred<WorkflowShare[]>()
    const latest = createWorkflowShare({ id: 'share-new', share_title: '新关键字成功结果' })
    mocks.apiGet.mockImplementation((endpoint: string, options?: { params?: { name?: string } }) => {
      if (endpoint === 'workflow/event_types') return []
      if (endpoint !== 'workflow/shares') throw new Error(`Unexpected GET ${endpoint}`)
      if (options?.params?.name === '旧关键字') return oldRequest.promise
      if (options?.params?.name === '新关键字') return [latest]
      throw new Error(`Unexpected keyword ${options?.params?.name}`)
    })

    const { rerender } = await renderList('旧关键字')
    await waitFor(() => expect(shareRequests()).toHaveLength(1))
    await rerender({ keyword: '新关键字' })
    expect(await screen.findByText(latest.share_title!)).toBeInTheDocument()

    oldRequest.reject(new Error('stale network failure'))
    await waitFor(() => expect(screen.getByText(latest.share_title!)).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: '重试共享列表' })).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('removes a deleted share locally and forwards fork completion to the parent', async () => {
    const share = createWorkflowShare()
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'workflow/event_types') return []
      if (endpoint === 'workflow/shares') return [share]
      throw new Error(`Unexpected GET ${endpoint}`)
    })
    const update = vi.fn()
    await renderWithProviders(WorkflowShareView, {
      global: {
        stubs: {
          LoadingBanner: LoadingBannerStub,
          NoDataFound: NoDataFoundStub,
          ProgressiveCardGrid: ProgressiveCardGridStub,
          VInfiniteScroll: InfiniteScrollStub,
          VPageContentTitle: true,
          WorkflowShareCard: WorkflowShareCardStub,
        },
      },
      props: { onUpdate: update },
    })
    expect(await screen.findByText(share.share_title!)).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '刷新-share-1' }))
    await fireEvent.click(screen.getByRole('button', { name: '删除-share-1' }))

    expect(update).toHaveBeenCalledOnce()
    expect(screen.queryByText(share.share_title!)).not.toBeInTheDocument()
  })
})
