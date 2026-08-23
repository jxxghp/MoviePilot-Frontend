import type { Workflow } from '@/api/types'
import WorkflowShareDialog from '@/components/dialog/WorkflowShareDialog.vue'
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

function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

async function renderDialog(workflow: Workflow | null = { id: '81', name: '待分享工作流' }) {
  const close = vi.fn()
  const result = await renderWithProviders(WorkflowShareDialog, {
    global: {
      components: {
        VDialogCloseBtn: DialogCloseButtonStub,
      },
    },
    props: {
      modelValue: true,
      onClose: close,
      workflow: workflow ?? undefined,
    },
  })

  return { ...result, close, workflow }
}

async function fillRequiredFields(comment = '覆盖工作流分享契约', shareUser = '测试分享人') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('说明'), comment)
  await user.type(screen.getByLabelText('分享用户'), shareUser)
  return user
}

describe('WorkflowShareDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it.each([
    ['description', '', '测试分享人'],
    ['sharing user', '覆盖工作流分享契约', ''],
  ])('blocks submission when the %s is missing', async (_case, comment, shareUser) => {
    const requested = vi.fn()
    server.use(
      http.post('/api/v1/workflow/share', () => {
        requested()
        return apiJson(null)
      }),
    )
    await renderDialog()
    const user = userEvent.setup()

    if (comment) await user.type(screen.getByLabelText('说明'), comment)
    if (shareUser) await user.type(screen.getByLabelText('分享用户'), shareUser)
    await user.click(screen.getByRole('button', { name: '确认分享' }))

    expect(requested).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('submits the exact payload once, stays pending, and closes after success', async () => {
    const deferred = createDeferred()
    const payloads: unknown[] = []
    server.use(
      http.post('/api/v1/workflow/share', async ({ request }) => {
        payloads.push(await request.json())
        await deferred.promise
        return apiJson(null)
      }),
    )
    const { close, workflow } = await renderDialog()
    const expectedWorkflow = workflow!
    const user = await fillRequiredFields('只提交分享字段', '分享者甲')
    const button = screen.getByRole('button', { name: '确认分享' })

    await user.click(button)
    await waitFor(() => expect(payloads).toHaveLength(1))
    expect(payloads[0]).toEqual({
      id: expectedWorkflow.id,
      share_comment: '只提交分享字段',
      share_title: expectedWorkflow.name,
      share_user: '分享者甲',
    })
    expect(button).toBeDisabled()
    expect(close).not.toHaveBeenCalled()

    deferred.resolve()
    await waitFor(() => expect(close).toHaveBeenCalledOnce())
    expect(mocks.toastSuccess).toHaveBeenCalledWith('待分享工作流 分享成功！')
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('keeps the dialog retryable after business and HTTP failures', async () => {
    const { close } = await renderDialog()
    const user = await fillRequiredFields()
    const button = screen.getByRole('button', { name: '确认分享' })

    server.use(http.post('/api/v1/workflow/share', () => apiFailureJson('远端拒绝')))
    await user.click(button)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('待分享工作流 分享失败：远端拒绝！'))
    expect(close).not.toHaveBeenCalled()
    expect(button).not.toBeDisabled()

    mocks.toastError.mockClear()
    server.use(http.post('/api/v1/workflow/share', () => HttpResponse.json({}, { status: 500 })))
    await user.click(button)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('待分享工作流 分享失败')))
    expect(close).not.toHaveBeenCalled()
    expect(button).not.toBeDisabled()
  })

  it('tracks a replaced workflow in the submitted share identity', async () => {
    const payloads: unknown[] = []
    server.use(
      http.post('/api/v1/workflow/share', async ({ request }) => {
        payloads.push(await request.json())
        return apiJson(null)
      }),
    )
    const { rerender } = await renderDialog(null)
    expect(screen.getByLabelText('标题')).toHaveValue('')
    await rerender({ workflow: { id: '82', name: '替换后的工作流' } })
    const user = await fillRequiredFields()

    await user.click(screen.getByRole('button', { name: '确认分享' }))

    await waitFor(() => expect(payloads).toHaveLength(1))
    expect(payloads[0]).toMatchObject({ id: '82', share_title: '替换后的工作流' })
  })

  it('emits close from the dialog close control', async () => {
    const user = userEvent.setup()
    const { close } = await renderDialog()

    await user.click(screen.getByRole('button', { name: '关闭' }))

    expect(close).toHaveBeenCalledOnce()
  })
})
