import WorkflowSummaryPreview from '@/components/workflow/WorkflowSummaryPreview.vue'
import { screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

describe('WorkflowSummaryPreview', () => {
  it('orders actions by their connections and collapses the remaining actions', async () => {
    const { container } = await renderWithProviders(WorkflowSummaryPreview, {
      props: {
        actions: [
          { id: 'download', name: '创建下载', type: 'AddDownloadAction' },
          { id: 'rss', name: '读取源', type: 'FetchRssAction' },
          { id: 'filter', name: '筛选候选', type: 'FilterTorrentsAction' },
          { id: 'notify', name: '发送提醒', type: 'SendMessageAction' },
          { id: 'organize', name: '整理结果', type: 'TransferFileAction' },
        ],
        flows: [
          { source: 'rss', target: 'filter' },
          { source: 'filter', target: 'download' },
          { source: 'download', target: 'organize' },
          { source: 'organize', target: 'notify' },
        ],
      },
    })

    expect(screen.getByText('流程概览')).toBeInTheDocument()
    expect(screen.getByText('5 个动作')).toBeInTheDocument()
    expect(screen.getByText('另有 1 个')).toBeInTheDocument()
    expect(screen.getByText('4 条连接')).toBeInTheDocument()

    const steps = screen.getAllByRole('listitem')
    expect(steps[0]).toHaveTextContent('读取源')
    expect(steps[1]).toHaveTextContent('筛选候选')
    expect(steps[2]).toHaveTextContent('创建下载')
    expect(steps[3]).toHaveTextContent('整理结果')
    expect(container.querySelector('.vue-flow')).not.toBeInTheDocument()
    expect(container.querySelectorAll('button, input, textarea, select')).toHaveLength(0)
  })

  it('marks branching workflows without exposing an interactive graph', async () => {
    await renderWithProviders(WorkflowSummaryPreview, {
      props: {
        actions: [
          { id: 'source', name: '获取媒体', type: 'FetchMediasAction' },
          { id: 'left', name: '过滤媒体', type: 'FilterMediasAction' },
          { id: 'right', name: '发送事件', type: 'SendEventAction' },
        ],
        flows: [
          { source: 'source', target: 'left' },
          { source: 'source', target: 'right' },
        ],
      },
    })

    expect(screen.getByText('含分支')).toBeInTheDocument()
    expect(screen.getByText('2 条连接')).toBeInTheDocument()
  })

  it('shows a quiet empty state when the workflow has no actions', async () => {
    const { container } = await renderWithProviders(WorkflowSummaryPreview)

    expect(screen.getByText('暂无动作')).toBeInTheDocument()
    expect(container.querySelector('.workflow-summary-preview__steps')).not.toBeInTheDocument()
  })
})
