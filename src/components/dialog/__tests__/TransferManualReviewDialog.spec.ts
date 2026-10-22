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

/** 构造带冻结目标意图的待复核任务。 */
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

/** 构造上传已成功、仅源文件清理冲突的任务，保留具体叶文件的冻结路径。 */
function createCleanupReview(): TransferManualReviewTask {
  const review = createManualReview({ identity_error: '文件的 size 已变化，禁止清理' })
  review.source.path = '/downloads/needs-review'
  review.step.kind = 'delete_move_source'
  review.step.intent.source = { storage: 'local', path: '/downloads/needs-review/episode.mkv' }
  return review
}

/** 隔离弹窗容器，验证用户复核操作及请求。 */
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

  it('allows retry without review notes and still requires evidence for applied', async () => {
    const user = userEvent.setup()

    await renderDialog()
    await user.click(screen.getByRole('button', { name: '确认未完成，重新整理' }))

    expect(mocks.apiPost).toHaveBeenCalledWith(
      'transfer/tasks/manual-review-task-1/manual-review',
      { operation_id: 'manual-review-operation-1', decision: 'not_applied', reason: '' },
      { feedback: 'silent' },
    )
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '确认已完成，继续后续步骤' })).toBeDisabled()
  })

  it('submits not_applied and emits resolved after success', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderDialog()

    await user.type(screen.getByLabelText('复核说明（选填）'), '确认目标目录中没有完整文件')
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

    await user.type(screen.getByLabelText('复核说明（选填）'), '   ')
    await user.click(appliedButton)
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledOnce())

    expect(mocks.apiPost).toHaveBeenCalledWith(
      'transfer/tasks/manual-review-task-1/manual-review',
      {
        operation_id: 'manual-review-operation-1',
        decision: 'applied',
        reason: '',
        result_payload: evidence,
      },
      { feedback: 'silent' },
    )
  })

  it('retries source cleanup without claiming deletion or repeating the upload', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderDialog(createCleanupReview())

    expect(screen.getByText('/downloads/needs-review/episode.mkv')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认源文件已删除，继续' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '源文件仍在，重新校验并清理' }))
    await flushPromises()

    expect(mocks.apiPost).toHaveBeenCalledExactlyOnceWith(
      'transfer/tasks/manual-review-task-1/manual-review',
      { operation_id: 'manual-review-operation-1', decision: 'not_applied', reason: '' },
      { feedback: 'silent' },
    )
    expect(emitted('resolved')).toEqual([['not_applied']])
  })

  it('submits deletion evidence only after the user confirms target integrity and source removal', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderDialog(createCleanupReview())
    const appliedButton = screen.getByRole('button', { name: '确认源文件已删除，继续' })
    expect(appliedButton).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: '我已核验目标文件完整，且源文件已删除' }))
    expect(appliedButton).toBeEnabled()
    await user.type(screen.getByLabelText('复核说明（选填）'), '已比对目标并手动清理源文件')
    await user.click(appliedButton)
    await flushPromises()

    expect(mocks.apiPost).toHaveBeenCalledExactlyOnceWith(
      'transfer/tasks/manual-review-task-1/manual-review',
      {
        operation_id: 'manual-review-operation-1',
        decision: 'applied',
        reason: '已比对目标并手动清理源文件',
        result_payload: { source_path: '/downloads/needs-review/episode.mkv', deleted: true },
      },
      { feedback: 'silent' },
    )
    expect(emitted('resolved')).toEqual([['applied']])
  })

  it('does not treat target-item evidence as proof that the source was deleted', async () => {
    const review = createCleanupReview()
    review.step.evidence = { item: { path: '/media/episode.mkv' } }
    await renderDialog(review)

    expect(screen.getByRole('button', { name: '确认源文件已删除，继续' })).toBeDisabled()
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })

  it.each([undefined, null, 'source.mkv', {}, { path: 123 }, { path: '' }])(
    'keeps cleanup completion disabled when the frozen source path is invalid: %s',
    async source => {
      const review = createCleanupReview()
      review.step.intent.source = source
      await renderDialog(review)

      expect(screen.getByRole('checkbox', { name: '我已核验目标文件完整，且源文件已删除' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '确认源文件已删除，继续' })).toBeDisabled()
    },
  )

  it.each(['task', 'operation', 'revision'])('clears cleanup confirmation when the review %s changes', async change => {
    const user = userEvent.setup()
    const review = createCleanupReview()
    const { rerender } = await renderDialog(review)
    await user.click(screen.getByRole('checkbox', { name: '我已核验目标文件完整，且源文件已删除' }))
    expect(screen.getByRole('button', { name: '确认源文件已删除，继续' })).toBeEnabled()

    const next = createCleanupReview()
    if (change === 'task') next.task_id = 'other-task'
    if (change === 'operation') next.step.operation_id = 'other-operation'
    if (change === 'revision') next.review_revision += 1
    await rerender({ review: next })

    expect(screen.getByRole('checkbox', { name: '我已核验目标文件完整，且源文件已删除' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: '确认源文件已删除，继续' })).toBeDisabled()
  })

  it('does not enable legacy execution completion even when target evidence exists', async () => {
    const review = createManualReview({ item: { path: '/media/episode.mkv' } })
    review.step.kind = 'legacy_execution_review'
    await renderDialog(review)

    expect(screen.getByRole('button', { name: '确认已完成，继续后续步骤' })).toBeDisabled()
  })

  it('preserves backend rejection and review notes so the user can recover', async () => {
    const user = userEvent.setup()
    mocks.apiPost.mockRejectedValueOnce(new Error('任务状态已变化，请刷新队列'))
    const { emitted } = await renderDialog()
    await user.type(screen.getByLabelText('复核说明（选填）'), '目标不存在')
    await user.click(screen.getByRole('button', { name: '确认未完成，重新整理' }))
    expect(await screen.findByText('任务状态已变化，请刷新队列')).toBeInTheDocument()
    expect(screen.getByLabelText('复核说明（选填）')).toHaveValue('目标不存在')
    expect(emitted('resolved')).toBeUndefined()
  })
})
