import type { WorkflowShare } from '@/api/types'
import WorkflowShareCard from '@/components/cards/WorkflowShareCard.vue'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { readFileSync } from 'node:fs'
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

  it('renders usage, author avatar and date metadata inside the static dock with ID-derived accent channels', async () => {
    const { container } = await renderCard(createWorkflowShare({ count: 1234 }))

    expect(screen.getByText('1,234')).toBeInTheDocument()
    expect(container.querySelector('.workflow-share-card__avatar-initial')).toHaveTextContent('测')
    expect(container.querySelector('.workflow-share-card__date')).not.toHaveTextContent('')
    expect(container.querySelector('.workflow-share-card')?.getAttribute('style')).toContain(
      '--workflow-share-gradient-start-rgb',
    )
  })

  it('uses a fallback gradient and omits optional metadata when identity and usage are absent', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25)
    const { container } = await renderCard(createWorkflowShare({ count: undefined, date: undefined, id: undefined }))

    expect(screen.queryByText('1,234')).not.toBeInTheDocument()
    expect(container.querySelector('.workflow-share-card__date')).toBeNull()
    expect(container.querySelector('.workflow-share-card')?.getAttribute('style')).toContain(
      '--workflow-share-gradient-start-rgb',
    )
  })

  it('renders trigger metadata and topologically ordered JSON action steps', async () => {
    const { container } = await renderCard(
      createWorkflowShare({
        actions: JSON.stringify([
          { id: 'n4', name: '发送通知', type: 'SendMessageAction' },
          { id: 'n1', name: '获取RSS资源', type: 'FetchRssAction' },
          { id: 'n2', name: '过滤资源', type: 'FilterTorrentsAction' },
          { id: 'n3', name: '添加下载', type: 'AddDownloadAction' },
        ]),
        event_type: 'download_complete',
        flows: JSON.stringify([
          { source: 'n1', target: 'n2' },
          { source: 'n2', target: 'n3' },
          { source: 'n3', target: 'n4' },
        ]),
        trigger_type: 'event',
      }),
    )

    expect(screen.getByText('4 个动作')).toBeInTheDocument()
    expect(screen.getByText('下载完成')).toBeInTheDocument()
    const steps = [...container.querySelectorAll('.workflow-share-card__step[role="img"]')]
    const stepLabels = steps.map(node => node.getAttribute('aria-label'))
    expect(stepLabels).toEqual(['获取RSS资源', '过滤资源', '添加下载'])
    expect(container.querySelector('.workflow-share-card__step-label')).toBeNull()
    expect(container.querySelector('.workflow-share-card__step-more')).toHaveTextContent('+1')
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

  it('uses semantic theme tokens without hardcoded white text or hex colors', () => {
    const source = readFileSync('src/components/cards/WorkflowShareCard.vue', 'utf8')

    expect(source).toContain('var(--mp-fg')
    expect(source).toContain('var(--mp-muted-fg')
    expect(source).toContain('var(--mp-card-dock-bg')
    expect(source).toContain('workflow-share-card__banner')
    expect(source).toContain('workflow-share-card__dock')
    expect(source).not.toContain('text-white')
    expect(source).not.toContain('backdrop-filter')
    expect(source).not.toMatch(/#[\da-f]{3,8}\b/i)
  })
})
