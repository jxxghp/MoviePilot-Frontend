import type { WorkflowShare } from '@/api/types'
import ForkWorkflowDialog from '@/components/dialog/ForkWorkflowDialog.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { apiFailureJson, apiJson } from '@tests/support/msw/response'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api/nprogress', () => ({
  configureNProgress: vi.fn(),
  doneNProgress: vi.fn(),
  startNProgress: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

const DialogCloseButtonStub = defineComponent({
  name: 'VDialogCloseBtn',
  emits: ['click'],
  setup(_props, { emit }) {
    return () => h('button', { type: 'button', onClick: () => emit('click') }, '关闭')
  },
})

const WorkflowSummaryPreviewStub = defineComponent({
  name: 'WorkflowSummaryPreview',
  props: {
    actions: Array,
    flows: Array,
  },
  setup(props) {
    return () => h('div', { 'data-testid': 'workflow-preview' }, `${props.actions?.length}:${props.flows?.length}`)
  },
})

function createWorkflowShare(overrides: Partial<WorkflowShare> = {}): WorkflowShare {
  return {
    actions: [{ id: 'action-1' }],
    flows: [{ id: 'flow-1' }],
    id: '91',
    share_comment: '用于验证工作流分享契约',
    share_title: '分享工作流',
    share_uid: 'owner-id',
    share_user: '测试用户',
    trigger_type: 'manual',
    ...overrides,
  }
}

function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

async function renderDialog(workflow = createWorkflowShare(), settings: Record<string, unknown> = {}) {
  const events = {
    close: vi.fn(),
    delete: vi.fn(),
    fork: vi.fn(),
  }
  const result = await renderWithProviders(ForkWorkflowDialog, {
    global: {
      components: {
        VDialogCloseBtn: DialogCloseButtonStub,
      },
      stubs: {
        WorkflowSummaryPreview: WorkflowSummaryPreviewStub,
      },
    },
    initialState: {
      globalSettings: {
        data: {
          USER_UNIQUE_ID: 'owner-id',
          WORKFLOW_SHARE_MANAGE: false,
          ...settings,
        },
      },
    },
    props: {
      eventTypes: [{ title: '下载完成', value: 'download_complete' }],
      modelValue: true,
      onClose: events.close,
      onDelete: events.delete,
      onFork: events.fork,
      workflow,
    },
  })

  return { ...result, events, workflow }
}

describe('ForkWorkflowDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders parsed workflow data through the static summary preview', async () => {
    await renderDialog(
      createWorkflowShare({
        actions: JSON.stringify([{ id: 'action-1' }, { id: 'action-2' }]) as unknown as WorkflowShare['actions'],
        flows: JSON.stringify([{ id: 'flow-1' }]) as unknown as WorkflowShare['flows'],
      }),
    )

    expect(screen.getByTestId('workflow-preview')).toHaveTextContent('2:1')
    expect(document.querySelector('.workflow-share-layout')).toBeInTheDocument()
  })

  it.each([
    ['timer', { timer: '0 8 * * *', trigger_type: 'timer' }, '0 8 * * *'],
    ['legacy timer', { timer: '0 9 * * *', trigger_type: undefined }, '0 9 * * *'],
    ['known event', { event_type: 'download_complete', trigger_type: 'event' }, '下载完成'],
    ['unknown event', { event_type: 'custom_event', trigger_type: 'event' }, 'custom_event'],
    ['manual', { trigger_type: 'manual' }, '手动触发'],
  ])('renders the %s trigger contract', async (_case, overrides, expected) => {
    await renderDialog(createWorkflowShare(overrides))

    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('falls back to an empty static preview when serialized workflow data is malformed', async () => {
    await renderDialog(
      createWorkflowShare({
        actions: '{invalid' as unknown as WorkflowShare['actions'],
        flows: 'not-json' as unknown as WorkflowShare['flows'],
      }),
    )

    expect(screen.getByTestId('workflow-preview')).toHaveTextContent('0:0')
    expect(console.error).toHaveBeenCalledWith('解析工作流数据失败:', expect.any(SyntaxError))
  })

  it('keeps the fork action pending and completes a Response[None] success without reading data.id', async () => {
    const deferred = createDeferred()
    const requested = vi.fn(async (payload: unknown) => {
      await deferred.promise
      return payload
    })
    server.use(
      http.post('/api/v1/workflow/fork', async ({ request }) => {
        await requested(await request.json())
        return apiJson(null)
      }),
    )
    const user = userEvent.setup()
    const { events, workflow } = await renderDialog()
    const button = screen.getByRole('button', { name: '复用工作流' })

    await user.click(button)
    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    expect(button).toBeDisabled()
    expect(events.fork).not.toHaveBeenCalled()

    deferred.resolve()
    await waitFor(() => expect(events.fork).toHaveBeenCalledOnce())
    expect(events.fork).toHaveBeenCalledWith()
    expect(requested).toHaveBeenCalledWith(workflow)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('复用 分享工作流 成功！')
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('reports fork business and HTTP failures without emitting completion', async () => {
    const user = userEvent.setup()
    const { events, rerender } = await renderDialog(createWorkflowShare({ share_title: '拒绝复用' }))

    server.use(http.post('/api/v1/workflow/fork', () => apiFailureJson('工作流无效')))
    await user.click(screen.getByRole('button', { name: '复用工作流' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('复用 拒绝复用 失败：工作流无效'))
    expect(events.fork).not.toHaveBeenCalled()

    mocks.toastError.mockClear()
    server.use(http.post('/api/v1/workflow/fork', () => HttpResponse.json({}, { status: 500 })))
    await rerender({ workflow: createWorkflowShare({ share_title: '网络失败' }) })
    await user.click(screen.getByRole('button', { name: '复用工作流' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('复用 网络失败 失败')))
    expect(events.fork).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '复用工作流' })).not.toBeDisabled()
  })

  it.each([
    ['the owner', 'owner-id', false, true],
    ['a share manager', 'other-user', true, true],
    ['another ordinary user', 'other-user', false, false],
  ])('shows delete permission for %s', async (_case, shareUid, canManage, visible) => {
    await renderDialog(createWorkflowShare({ share_uid: shareUid }), { WORKFLOW_SHARE_MANAGE: canManage })

    if (visible) expect(screen.getByRole('button', { name: '取消分享' })).toBeInTheDocument()
    else expect(screen.queryByRole('button', { name: '取消分享' })).not.toBeInTheDocument()
  })

  it('deletes the exact share and completes a Response[None] success without reading data.id', async () => {
    const deferred = createDeferred()
    const requested = vi.fn(async (url: URL) => {
      await deferred.promise
      return url
    })
    server.use(
      http.delete('/api/v1/workflow/share/:id', async ({ request }) => {
        await requested(new URL(request.url))
        return apiJson(null)
      }),
    )
    const user = userEvent.setup()
    const { events } = await renderDialog()
    const button = screen.getByRole('button', { name: '取消分享' })

    await user.click(button)
    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    expect(button).toBeDisabled()
    expect(events.delete).not.toHaveBeenCalled()

    deferred.resolve()
    await waitFor(() => expect(events.delete).toHaveBeenCalledOnce())
    expect(events.delete).toHaveBeenCalledWith()
    expect(requested.mock.calls[0][0].pathname).toBe('/api/v1/workflow/share/91')
    expect(requested.mock.calls[0][0].searchParams.get('share_uid')).toBe('owner-id')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('取消分享成功')
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('reports delete business and HTTP failures without emitting completion', async () => {
    const user = userEvent.setup()
    const { events } = await renderDialog()

    server.use(http.delete('/api/v1/workflow/share/:id', () => apiFailureJson('没有删除权限')))
    await user.click(screen.getByRole('button', { name: '取消分享' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('取消分享失败：没有删除权限'))
    expect(events.delete).not.toHaveBeenCalled()

    mocks.toastError.mockClear()
    server.use(http.delete('/api/v1/workflow/share/:id', () => HttpResponse.json({}, { status: 500 })))
    await user.click(screen.getByRole('button', { name: '取消分享' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('取消分享失败')))
    expect(events.delete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '取消分享' })).not.toBeDisabled()
  })

  it('emits close from the dialog close control', async () => {
    const user = userEvent.setup()
    const { events } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '关闭' }))

    expect(events.close).toHaveBeenCalledOnce()
  })
})
