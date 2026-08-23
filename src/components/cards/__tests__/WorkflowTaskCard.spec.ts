import { formatDateDifference } from '@/@core/utils/formatters'
import type { Workflow } from '@/api/types'
import WorkflowTaskCard from '@/components/cards/WorkflowTaskCard.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiPost: vi.fn(),
  confirm: vi.fn(),
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  },
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

function createWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    actions: [
      { id: 'scan', name: '扫描目录', type: 'ScanFile' },
      { id: 'scrape', name: '刮削文件', type: 'ScrapeFile' },
      { id: 'transfer', name: '整理文件', type: 'TransferFile' },
    ],
    current_action: undefined,
    execution_state: {},
    id: 'workflow-1',
    name: '扫描和刮削',
    run_count: 0,
    state: 'W',
    trigger_type: 'manual',
    ...overrides,
  }
}

async function renderCard(workflowOverrides: Partial<Workflow> = {}) {
  return renderWithProviders(WorkflowTaskCard, {
    props: {
      eventTypes: [{ title: '下载完成', value: 'download.completed' }],
      workflow: createWorkflow(workflowOverrides),
    },
  })
}

async function openAction(container: Element, label: string) {
  const menuButton = container.querySelector<HTMLButtonElement>('.workflow-task-card__menu')
  expect(menuButton).not.toBeNull()
  await fireEvent.click(menuButton!)
  return screen.getByText(label, { exact: true })
}

describe('WorkflowTaskCard redesign', () => {
  beforeEach(() => {
    mocks.apiDelete.mockReset()
    mocks.apiPost.mockReset()
    mocks.confirm.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.apiPost.mockResolvedValue({ success: true })
    mocks.confirm.mockResolvedValue(true)
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('maps the generated card icon to the workflow trigger type', async () => {
    const { container, rerender } = await renderCard()

    expect(container.querySelector('[data-workflow-trigger-icon="mdi-hand-pointing-up"]')).toBeInTheDocument()
    expect(screen.getByText('手动')).toBeInTheDocument()

    await rerender({
      eventTypes: [{ title: '下载完成', value: 'download.completed' }],
      workflow: createWorkflow({ timer: '10 * * * *', trigger_type: 'timer' }),
    })
    expect(container.querySelector('[data-workflow-trigger-icon="mdi-clock-outline"]')).toBeInTheDocument()
    expect(screen.getByText('10 * * * *')).toBeInTheDocument()

    await rerender({
      eventTypes: [{ title: '下载完成', value: 'download.completed' }],
      workflow: createWorkflow({ event_type: 'download.completed', trigger_type: 'event' }),
    })
    expect(container.querySelector('[data-workflow-trigger-icon="mdi-calendar-check-outline"]')).toBeInTheDocument()
    expect(screen.getByText('下载完成')).toBeInTheDocument()
  })

  it.each([
    ['W', 'warning', '待执行'],
    ['R', 'primary', '运行中'],
    ['S', 'success', '成功'],
    ['P', 'secondary', '暂停'],
    ['F', 'error', '失败'],
  ] as const)('maps %s to the semantic %s status color', async (state, color, label) => {
    const { container } = await renderCard({ state })

    expect(container.querySelector('.workflow-task-card')).toHaveClass(`workflow-task-card--status-${color}`)
    expect(container.querySelector('.v-chip')).toHaveTextContent(label)
  })

  it('renders the global runtime progress on the bottom progress bar', async () => {
    const { container } = await renderCard({
      execution_state: {
        nodes: {
          scan: { state: 'success' },
          scrape: { state: 'skipped' },
          transfer: { state: 'running' },
        },
        runtime: { finished_actions: 2, progress: 66 },
      },
      state: 'R',
    })

    expect(screen.getByText('正在执行 整理文件')).toBeInTheDocument()
    const fill = container.querySelector('.workflow-task-card__progress-fill') as HTMLElement
    expect(fill.style.inlineSize).toBe('66%')
    expect(screen.getByRole('progressbar', { name: '扫描和刮削' })).toHaveAttribute('aria-valuenow', '66')
  })

  it('falls back to legacy current-action counts and clamps the progress', async () => {
    const { container } = await renderCard({ current_action: ',scan,,scrape,scan,unknown,', state: 'P' })

    const fill = container.querySelector('.workflow-task-card__progress-fill') as HTMLElement
    expect(fill.style.inlineSize).toBe('67%')
    expect(screen.getByText('上次执行尚未完成')).toBeInTheDocument()
  })

  it('shows the run count after the last execution time', async () => {
    const lastTime = '2026-08-03 08:00:00'
    const { rerender } = await renderCard({ last_time: lastTime, run_count: 3, state: 'S' })

    expect(screen.getByText(`上次执行 ${formatDateDifference(lastTime)} · 已执行 3 次`)).toBeInTheDocument()

    await rerender({
      eventTypes: [],
      workflow: createWorkflow({ last_time: lastTime, run_count: 0, state: 'S' }),
    })
    expect(screen.getByText(`上次执行 ${formatDateDifference(lastTime)}`)).toBeInTheDocument()
  })

  it('always renders the progress bar at the bottom of the card', async () => {
    const { container, rerender } = await renderCard({ state: 'W' })

    const idleBar = container.querySelector('.workflow-task-card__progress') as HTMLElement
    expect(idleBar).toBeInTheDocument()
    expect(idleBar).toHaveAttribute('aria-valuenow', '0')

    await rerender({
      eventTypes: [],
      workflow: createWorkflow({ execution_state: { runtime: { progress: 100 } }, state: 'S' }),
    })
    expect(container.querySelector('.workflow-task-card__progress')).toHaveAttribute('aria-valuenow', '100')
  })

  it('shows failure, last-run and never-run execution details at the bottom', async () => {
    const lastTime = '2026-08-03 08:00:00'
    const { rerender } = await renderCard({ result: '目录无访问权限', state: 'F' })

    expect(screen.getByText('目录无访问权限')).toBeInTheDocument()

    await rerender({
      eventTypes: [],
      workflow: createWorkflow({ last_time: lastTime, state: 'S' }),
    })
    expect(screen.getByText(`上次执行 ${formatDateDifference(lastTime)}`)).toBeInTheDocument()

    await rerender({ eventTypes: [], workflow: createWorkflow() })
    expect(screen.getByText('从未执行')).toBeInTheDocument()
  })

  it('keeps card navigation and enable controls as separate actions', async () => {
    const { container } = await renderCard({ state: 'P' })

    await fireEvent.click(screen.getByRole('button', { name: '启用' }))
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith('workflow/workflow-1/start'))
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()

    await fireEvent.click(container.querySelector('.workflow-task-card') as Element)
    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    expect(mocks.openSharedDialog.mock.calls[0][1]).toEqual({ workflow: expect.objectContaining({ id: 'workflow-1' }) })
  })

  it('opens the edit dialog and refreshes after its save event', async () => {
    const { container, emitted } = await renderCard()

    await fireEvent.click(await openAction(container, '编辑任务'))
    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    expect(mocks.openSharedDialog.mock.calls[0][1]).toEqual({ workflow: expect.objectContaining({ id: 'workflow-1' }) })
    const editEvents = mocks.openSharedDialog.mock.calls[0][2] as { save?: () => void }
    editEvents.save?.()
    expect(emitted().refresh).toHaveLength(1)
  })

  it('opens the share dialog without assigning edit callbacks', async () => {
    const { container } = await renderCard()

    await fireEvent.click(await openAction(container, '分享'))
    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    expect(mocks.openSharedDialog.mock.calls[0][1]).toEqual({ workflow: expect.objectContaining({ id: 'workflow-1' }) })
    expect(mocks.openSharedDialog.mock.calls[0][2]).toEqual({})
  })

  it('requires deletion confirmation and leaves the card untouched when cancelled', async () => {
    mocks.confirm.mockResolvedValueOnce(false)
    const { container, emitted } = await renderCard()

    await fireEvent.click(await openAction(container, '删除任务'))

    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('扫描和刮削') }),
    )
    expect(mocks.apiDelete).not.toHaveBeenCalled()
    expect(emitted().refresh ?? []).toHaveLength(0)
  })

  it('deletes the workflow and refreshes the list after confirmation', async () => {
    mocks.apiDelete.mockResolvedValueOnce({ success: true })
    const { container, emitted } = await renderCard()

    await fireEvent.click(await openAction(container, '删除任务'))

    await waitFor(() => expect(mocks.apiDelete).toHaveBeenCalledWith('workflow/workflow-1'))
    await waitFor(() => expect(emitted().refresh).toHaveLength(1))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('删除任务成功！')
  })

  it('does not refresh after deletion fails at the HTTP boundary', async () => {
    mocks.apiDelete.mockRejectedValueOnce(new Error('network unavailable'))
    const { container, emitted } = await renderCard()

    await fireEvent.click(await openAction(container, '删除任务'))

    await waitFor(() => expect(mocks.apiDelete).toHaveBeenCalledWith('workflow/workflow-1'))
    await waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(emitted().refresh).toBeUndefined()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it.each([
    ['启用', 'P', 'workflow/workflow-1/start', '启用任务成功！'],
    ['暂停', 'W', 'workflow/workflow-1/pause', '停用任务成功！'],
  ] as const)('posts the %s action and refreshes after success', async (label, state, endpoint, toast) => {
    const { emitted } = await renderCard({ state })

    await fireEvent.click(screen.getByRole('button', { name: label }))

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(endpoint))
    await waitFor(() => expect(emitted().refresh).toHaveLength(1))
    expect(mocks.toastSuccess).toHaveBeenCalledWith(toast)
  })

  it.each([
    ['启用', 'P', 'workflow/workflow-1/start'],
    ['暂停', 'W', 'workflow/workflow-1/pause'],
  ] as const)('does not refresh or show success after the %s action fails', async (label, state, endpoint) => {
    mocks.apiPost.mockRejectedValueOnce(new Error('network unavailable'))
    const { emitted } = await renderCard({ state })

    await fireEvent.click(screen.getByRole('button', { name: label }))

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith(endpoint))
    await waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(emitted().refresh).toBeUndefined()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it.each([
    ['继续执行', false, 'workflow/workflow-1/run?from_begin=false'],
    ['重新执行', true, 'workflow/workflow-1/run?from_begin=true'],
  ] as const)('%s passes from_begin=%s and keeps the two-refresh sequence', async (label, fromBegin, endpoint) => {
    vi.useFakeTimers()
    const { container, emitted } = await renderCard({ current_action: 'scan' })

    await fireEvent.click(await openAction(container, label))

    expect(mocks.apiPost).toHaveBeenCalledWith(endpoint, { from_begin: fromBegin })
    await vi.advanceTimersByTimeAsync(0)
    expect(emitted().refresh).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(499)
    expect(emitted().refresh).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(emitted().refresh).toHaveLength(2)
  })

  it('starts a fresh workflow from the run menu when no action is in progress', async () => {
    const { container, emitted } = await renderCard()

    await fireEvent.click(await openAction(container, '立即执行'))

    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith('workflow/workflow-1/run?from_begin=true', { from_begin: true }),
    )
    await waitFor(() => expect(emitted().refresh?.length).toBeGreaterThan(0))
  })

  it('keeps the card loading while an enable request is pending and refreshes once it resolves', async () => {
    let resolvePost!: (value: unknown) => void
    mocks.apiPost.mockReturnValueOnce(
      new Promise(resolve => {
        resolvePost = resolve
      }),
    )
    const { container, emitted } = await renderCard({ state: 'P' })

    await fireEvent.click(screen.getByRole('button', { name: '启用' }))
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith('workflow/workflow-1/start'))
    const loader = container.querySelector('.v-card__loader .v-progress-linear')
    expect(loader).toHaveStyle({ height: '2px' })

    resolvePost({ success: true })
    await waitFor(() => expect(loader).toHaveStyle({ height: '0px' }))
    expect(emitted().refresh).toHaveLength(1)
  })

  it('resets the workflow only after confirmation and refreshes on success', async () => {
    const { container, emitted } = await renderCard()

    await fireEvent.click(await openAction(container, '重置任务'))

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith('workflow/workflow-1/reset'))
    await waitFor(() => expect(emitted().refresh).toHaveLength(1))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('重置任务成功！')
  })

  it('does not refresh after reset confirmation is cancelled or the request fails', async () => {
    mocks.confirm.mockResolvedValueOnce(false)
    const cancelled = await renderCard()
    await fireEvent.click(await openAction(cancelled.container, '重置任务'))
    expect(mocks.apiPost).not.toHaveBeenCalled()
    expect(cancelled.emitted().refresh).toBeUndefined()
    cancelled.unmount()

    mocks.confirm.mockResolvedValueOnce(true)
    mocks.apiPost.mockRejectedValueOnce(new Error('network unavailable'))
    const failed = await renderCard()
    await fireEvent.click(await openAction(failed.container, '重置任务'))
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith('workflow/workflow-1/reset'))
    await waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(failed.emitted().refresh).toBeUndefined()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('closes loading and avoids a success toast after a failed run request', async () => {
    vi.useFakeTimers()
    mocks.apiPost.mockRejectedValueOnce(new Error('network unavailable'))
    const { container } = await renderCard()

    await fireEvent.click(await openAction(container, '立即执行'))
    expect(mocks.apiPost).toHaveBeenCalled()
    await vi.runAllTimersAsync()

    const loader = container.querySelector('.v-card__loader .v-progress-linear')
    expect(loader).toHaveStyle({ height: '0px' })
    expect(mocks.apiPost).toHaveBeenCalledWith('workflow/workflow-1/run?from_begin=true', { from_begin: true })
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('keeps the delayed refresh after a failed run request', async () => {
    vi.useFakeTimers()
    mocks.apiPost.mockRejectedValueOnce(new Error('network unavailable'))
    const { container, emitted } = await renderCard()

    await fireEvent.click(await openAction(container, '立即执行'))
    await vi.advanceTimersByTimeAsync(499)
    expect(emitted().refresh).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(emitted().refresh).toHaveLength(1)
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('derives all custom card colors and geometry from global theme tokens', () => {
    const source = readFileSync('src/components/cards/WorkflowTaskCard.vue', 'utf8')
    const transparentTheme = readFileSync('src/styles/themes/transparent.scss', 'utf8')
    const glassTheme = readFileSync('src/styles/themes/glass.scss', 'utf8')

    expect(source).toContain('var(--v-theme-primary)')
    expect(source).toContain('var(--v-theme-info)')
    expect(source).toContain('var(--v-theme-success)')
    expect(source).toContain('var(--v-theme-warning)')
    expect(source).toContain('var(--v-theme-error)')
    expect(source).toContain('var(--v-theme-on-surface)')
    expect(source).toContain('var(--app-control-radius)')
    expect(source).toContain('linear-gradient(')
    expect(source).toContain('var(--workflow-card-header-background)')
    expect(source).not.toContain('--workflow-card-header-border')
    expect(source).not.toMatch(/#[\da-f]{3,8}\b/i)

    expect(transparentTheme).toContain('.workflow-task-card')
    expect(transparentTheme).toContain('var(--transparent-opacity-heavy)')
    expect(transparentTheme).not.toContain('--workflow-card-header-border')
    expect(glassTheme).toContain('var(--glass-sheen)')
    expect(glassTheme).toContain("&[data-glass-appearance='frosted'] .workflow-task-card")
    expect(glassTheme).toContain("&[data-glass-appearance='tinted'] .workflow-task-card")
    expect(glassTheme).not.toContain('--workflow-card-header-border')
  })
})
