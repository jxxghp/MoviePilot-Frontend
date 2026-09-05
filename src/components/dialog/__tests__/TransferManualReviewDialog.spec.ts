import type { TransferManualReviewTask } from '@/api/types'
import TransferManualReviewDialog from '@/components/dialog/TransferManualReviewDialog.vue'
import { screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'

const transferManualReviewSource = readFileSync(
  resolve(cwd(), 'src/components/dialog/TransferManualReviewDialog.vue'),
  'utf8',
)

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    post: (...args: unknown[]) => mocks.apiPost(...args),
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

function createManualReview(evidence?: Record<string, unknown>): TransferManualReviewTask {
  return {
    task_id: 'manual-review-task-1',
    source: {
      storage: 'local',
      path: '/downloads/needs-review.mkv',
    },
    state: 'manual_review',
    step: {
      operation_id: 'manual-review-operation-1',
      kind: 'materialize_target',
      intent: {
        target_path: '/media/needs-review.mkv',
      },
      evidence,
      error: '上传 smb 失败',
    },
    review_revision: 1,
  }
}

async function renderDialog(review = createManualReview()) {
  return renderWithProviders(TransferManualReviewDialog, {
    props: { review },
    global: {
      stubs: {
        VDialog: { template: '<div><slot /></div>' },
        VDialogCloseBtn: { template: '<button type="button">关闭</button>' },
      },
    },
  })
}

describe('TransferManualReviewDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.apiPost.mockResolvedValue({})
  })

  it('uses mobile fullscreen and keeps long review content readable', () => {
    expect(transferManualReviewSource).toContain(':fullscreen="!display.mdAndUp.value"')
    expect(transferManualReviewSource).toContain('.manual-review-dialog__error > span')
    expect(transferManualReviewSource).toContain('.manual-review-dialog__notice :deep(.v-alert__content)')
    expect(transferManualReviewSource).toMatch(/\.manual-review-dialog__notice\s*\{[^}]*flex: 0 0 auto;/s)
    expect(transferManualReviewSource).not.toMatch(/\.manual-review-dialog__evidence\s*\{[^}]*border:/s)
  })

  it('requires review notes before submitting a decision', async () => {
    const user = userEvent.setup()

    await renderDialog()
    await user.click(screen.getByRole('button', { name: '确认未完成，重新整理' }))

    expect(mocks.apiPost).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('请填写复核说明')
    expect(screen.getByRole('button', { name: '确认已完成，继续后续步骤' })).toBeDisabled()
  })

  it('submits not_applied and emits resolved after success', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderDialog()

    await user.type(screen.getByLabelText('复核说明'), '确认目标目录中没有完整文件')
    await user.click(screen.getByRole('button', { name: '确认未完成，重新整理' }))
    await flushPromises()

    expect(mocks.apiPost).toHaveBeenCalledWith(
      'transfer/tasks/manual-review-task-1/manual-review',
      {
        operation_id: 'manual-review-operation-1',
        decision: 'not_applied',
        reason: '确认目标目录中没有完整文件',
      },
      { feedback: 'silent' },
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('人工复核已提交')
    expect(emitted('resolved')).toEqual([['not_applied']])
  })

  it('only enables applied when the observed target evidence can resume the plan', async () => {
    const user = userEvent.setup()
    const evidence = {
      source_exists: true,
      target_exists: true,
      item: { name: 'needs-review.mkv' },
    }

    await renderDialog(createManualReview(evidence))
    const appliedButton = screen.getByRole('button', { name: '确认已完成，继续后续步骤' })
    expect(appliedButton).toBeEnabled()

    await user.type(screen.getByLabelText('复核说明'), '确认目标文件已完整上传')
    await user.click(appliedButton)
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledOnce())

    expect(mocks.apiPost).toHaveBeenCalledWith(
      'transfer/tasks/manual-review-task-1/manual-review',
      {
        operation_id: 'manual-review-operation-1',
        decision: 'applied',
        reason: '确认目标文件已完整上传',
        result_payload: evidence,
      },
      { feedback: 'silent' },
    )
  })
})
