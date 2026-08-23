import type { WorkflowShare } from '@/api/types'
import WorkflowShareCard from '@/components/cards/WorkflowShareCard.vue'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openSharedDialog: vi.fn(),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

function createWorkflowShare(overrides: Partial<WorkflowShare> = {}): WorkflowShare {
  return {
    date: '2026-08-23 12:00:00',
    id: '91',
    share_comment: '用于验证工作流分享卡片',
    share_title: '分享工作流',
    share_user: '测试用户',
    ...overrides,
  }
}

async function renderCard(workflow = createWorkflowShare()) {
  const events = {
    delete: vi.fn(),
    update: vi.fn(),
  }
  const result = await renderWithProviders(WorkflowShareCard, {
    props: {
      eventTypes: [{ title: '下载完成', value: 'download_complete' }],
      onDelete: events.delete,
      onUpdate: events.update,
      workflow,
    },
  })

  return { ...result, events, workflow }
}

describe('WorkflowShareCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the fork dialog with the current workflow and closes on terminal events', async () => {
    const user = userEvent.setup()
    const { workflow } = await renderCard()

    await user.click(screen.getByText('分享工作流'))

    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    expect(mocks.openSharedDialog.mock.calls[0][1]).toEqual({
      eventTypes: [{ title: '下载完成', value: 'download_complete' }],
      workflow,
    })
    expect(mocks.openSharedDialog.mock.calls[0][3]).toEqual({ closeOn: ['close', 'fork', 'delete'] })
  })

  it('renders usage and date metadata with an ID-derived gradient', async () => {
    const { container } = await renderCard(createWorkflowShare({ count: 1234 }))

    expect(screen.getByText('1,234')).toBeInTheDocument()
    expect(container.querySelector('.absolute.right-0.bottom-0')).not.toHaveTextContent('')
    expect(container.querySelector('.workflow-share-card')?.getAttribute('style')).toContain('linear-gradient')
  })

  it('uses a fallback gradient and omits optional metadata when identity and usage are absent', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25)
    const { container } = await renderCard(createWorkflowShare({ count: undefined, date: undefined, id: undefined }))

    expect(screen.queryByText('1,234')).not.toBeInTheDocument()
    expect(container.querySelector('.workflow-share-card')?.getAttribute('style')).toContain('linear-gradient')
  })

  it('maps payload-free fork and delete completion to parent refresh events', async () => {
    const user = userEvent.setup()
    const { events } = await renderCard()
    await user.click(screen.getByText('分享工作流'))
    const dialogEvents = mocks.openSharedDialog.mock.calls[0][2] as {
      delete: () => void
      fork: () => void
    }

    dialogEvents.fork()
    dialogEvents.delete()

    expect(events.update).toHaveBeenCalledOnce()
    expect(events.delete).toHaveBeenCalledOnce()
  })
})
