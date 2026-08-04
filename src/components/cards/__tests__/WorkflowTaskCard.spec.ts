import { formatDateDifference } from '@/@core/utils/formatters'
import type { Workflow } from '@/api/types'
import WorkflowTaskCard from '@/components/cards/WorkflowTaskCard.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('renders structured node states as segmented action progress', async () => {
    const { container } = await renderCard({
      execution_state: {
        nodes: {
          scan: { state: 'success' },
          scrape: { state: 'skipped' },
          transfer: { state: 'running' },
        },
        runtime: { finished_actions: 2 },
      },
      state: 'R',
    })

    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(container.querySelectorAll('.workflow-task-card__action-segment--complete')).toHaveLength(2)
    expect(container.querySelectorAll('.workflow-task-card__action-segment--active')).toHaveLength(1)
    expect(screen.getByText('正在执行 整理文件')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '动作进度: 2 / 3' })).toHaveAttribute('aria-valuenow', '2')
  })

  it('falls back to unique legacy current-action ids and clamps the count', async () => {
    const { container } = await renderCard({ current_action: ',scan,,scrape,scan,unknown,', state: 'P' })

    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(container.querySelectorAll('.workflow-task-card__action-segment--complete')).toHaveLength(2)
    expect(container.querySelectorAll('.workflow-task-card__action-segment--pending')).toHaveLength(1)
    expect(screen.getByText('上次执行尚未完成')).toBeInTheDocument()
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
