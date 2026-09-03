import type { ClassificationImpactAnalysis, ClassificationResult } from '@/api/mediaClassificationTypes'
import ClassificationImpactPanel from '@/components/classification/ClassificationImpactPanel.vue'
import userEvent from '@testing-library/user-event'
import { fireEvent, screen, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

/** 构造影响示例中的分类结果。 */
function createResult(
  revision: number,
  categoryId: string,
  categoryPath: string[],
  ruleId: string,
  source: string,
  state: ClassificationResult['state'] = 'complete',
): ClassificationResult {
  return {
    recommended: { category_id: categoryId, category_path: categoryPath, rule_id: ruleId, source },
    effective: null,
    labels: [],
    policy_revision: revision,
    state,
  }
}

/** 构造覆盖统计、分组、示例和警告的完整影响分析。 */
function createAnalysis(overrides: Partial<ClassificationImpactAnalysis> = {}): ClassificationImpactAnalysis {
  return {
    estimated: true,
    sampled_at: '2026-09-02T08:30:00Z',
    sample_source: 'recent_history',
    baseline_revision: 7,
    candidate_revision: 8,
    requested_limit: 100,
    scanned_count: 128,
    skipped_count: 8,
    truncated: true,
    sample_count: 100,
    changed_count: 3,
    unchanged_count: 97,
    category_changed_count: 1,
    path_only_changed_count: 1,
    rule_changed_only_count: 1,
    became_fallback_count: 1,
    partial_count: 2,
    degraded_count: 1,
    previous_categories: { 'movie.scifi': 70, 'music.lossless': 30 },
    candidate_categories: { 'movie.china': 1, 'movie.scifi': 69, 'music.lossless': 30 },
    groups: [
      { media_type: '电影', media_source: 'themoviedb', sampled: 70, changed: 2, degraded: 1 },
      { media_type: '音乐', media_source: 'musicbrainz', sampled: 30, changed: 1, degraded: 0 },
    ],
    changes: [
      {
        identity: { media_source: 'themoviedb', media_id: 'movie-1' },
        media_type: '电影',
        title: '流浪地球',
        changed_fields: ['category_id', 'category_path', 'rule_id'],
        previous: createResult(7, 'movie.scifi', ['电影', '科幻'], 'rule-scifi', 'rule'),
        candidate: createResult(8, 'movie.china', ['电影', '华语'], 'rule-china', 'source_fallback', 'partial'),
      },
    ],
    warnings: ['近期历史仅保留有限事实，结果只反映当前可用字段。'],
    ...overrides,
  }
}

/** 渲染影响分析面板。 */
async function renderPanel(
  overrides: {
    analysis?: ClassificationImpactAnalysis | null
    loading?: boolean
    disabled?: boolean
  } = {},
) {
  return renderWithProviders(ClassificationImpactPanel, {
    props: {
      analysis: overrides.analysis ?? null,
      loading: overrides.loading ?? false,
      disabled: overrides.disabled ?? false,
    },
  })
}

describe('ClassificationImpactPanel', () => {
  it('明确说明有界估算，并携带规范化后的样本和示例上限触发分析', async () => {
    const user = userEvent.setup()
    const panel = await renderPanel()

    expect(screen.getByRole('region', { name: '影响分析' })).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByText('使用有限样本比较活动策略与当前草稿，不代表全库精确统计。')).toBeInTheDocument()
    expect(screen.getByText(/结果将始终以有界样本估算展示/)).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '最大样本数' })).toHaveValue(100)
    expect(screen.getByRole('spinbutton', { name: '变化示例上限' })).toHaveValue(20)

    await fireEvent.update(screen.getByRole('spinbutton', { name: '最大样本数' }), '260.8')
    await fireEvent.update(screen.getByRole('spinbutton', { name: '变化示例上限' }), '-4')
    await user.click(screen.getByRole('button', { name: '分析当前分类草稿影响' }))

    expect(panel.emitted().analyze).toEqual([[{ sampleLimit: 200, exampleLimit: 0 }]])
    expect(screen.getByRole('spinbutton', { name: '最大样本数' })).toHaveValue(200)
    expect(screen.getByRole('spinbutton', { name: '变化示例上限' })).toHaveValue(0)
  })

  it('在加载或外部禁用时锁定参数和触发按钮', async () => {
    const user = userEvent.setup()
    const panel = await renderPanel({ loading: true })
    const region = screen.getByRole('region', { name: '影响分析' })
    const analyzeButton = screen.getByRole('button', { name: '分析当前分类草稿影响' })

    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('正在生成有界样本估算')
    expect(screen.getByRole('spinbutton', { name: '最大样本数' })).toBeDisabled()
    expect(analyzeButton).toBeDisabled()
    await user.click(analyzeButton)
    expect(panel.emitted().analyze).toBeUndefined()

    await panel.rerender({ analysis: null, loading: false, disabled: true })
    expect(region).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByRole('spinbutton', { name: '变化示例上限' })).toBeDisabled()
    expect(analyzeButton).toBeDisabled()
  })

  it('展示有界样本统计、变化类型、前后分类计数和截断语义', async () => {
    const analysis = createAnalysis()
    await renderPanel({ analysis })

    expect(screen.getByText('sample_source: recent_history（近期下载与整理历史）')).toBeInTheDocument()
    expect(screen.getByText('活动 revision 7')).toBeInTheDocument()
    expect(screen.getByText('候选 revision 8')).toBeInTheDocument()

    const expectedMetrics: Record<string, string> = {
      requested_limit: '100',
      scanned_count: '128',
      skipped_count: '8',
      truncated: '是',
      sample_count: '100',
      changed_count: '3',
      unchanged_count: '97',
      category_changed_count: '1',
      path_only_changed_count: '1',
      rule_changed_only_count: '1',
      became_fallback_count: '1',
      partial_count: '2',
      degraded_count: '1',
    }
    for (const [key, value] of Object.entries(expectedMetrics)) {
      expect(screen.getByTestId(`impact-metric-${key}`)).toHaveTextContent(value)
    }

    expect(screen.getByRole('note')).toHaveTextContent('未展示的记录不应推断为无变化')
    expect(screen.getByLabelText('活动策略分类计数')).toHaveTextContent('movie.scifi70')
    expect(screen.getByLabelText('候选策略分类计数')).toHaveTextContent('movie.china1')
    expect(screen.getByLabelText('候选策略分类计数')).toHaveTextContent('music.lossless30')
  })

  it('按媒体类型和来源展示分组，并完整呈现有限变化示例的前后结果', async () => {
    await renderPanel({ analysis: createAnalysis() })

    const groupTable = screen.getByRole('region', { name: '媒体类型与来源影响分组表' })
    expect(groupTable).toHaveAttribute('tabindex', '0')
    expect(within(groupTable).getByRole('row', { name: '电影 themoviedb 70 2 1' })).toBeInTheDocument()
    expect(within(groupTable).getByRole('row', { name: '音乐 musicbrainz 30 1 0' })).toBeInTheDocument()

    expect(screen.getByText('返回 1 条，共检测到 3 条变化')).toBeInTheDocument()
    const example = screen.getByRole('article', { name: '变化示例 1：流浪地球' })
    expect(example).toHaveTextContent('themoviedb:movie-1')
    expect(within(example).getByRole('list', { name: '变化字段' })).toHaveTextContent('分类 ID分类路径命中规则')

    const previous = within(example).getByRole('region', { name: '变化示例 1 的活动策略结果' })
    expect(previous).toHaveTextContent('movie.scifi')
    expect(previous).toHaveTextContent('电影 / 科幻')
    expect(previous).toHaveTextContent('rule-scifi')
    expect(previous).toHaveTextContent('完整')

    const candidate = within(example).getByRole('region', { name: '变化示例 1 的候选策略结果' })
    expect(candidate).toHaveTextContent('movie.china')
    expect(candidate).toHaveTextContent('电影 / 华语')
    expect(candidate).toHaveTextContent('source_fallback')
    expect(candidate).toHaveTextContent('事实不完整')

    expect(screen.getByRole('alert')).toHaveTextContent('近期历史仅保留有限事实')
  })

  it('区分显式请求样本来源，并为无分组和无变化结果提供清晰空状态', async () => {
    await renderPanel({
      analysis: createAnalysis({
        sample_source: 'request',
        truncated: false,
        sample_count: 1,
        changed_count: 0,
        unchanged_count: 1,
        groups: [],
        changes: [],
        warnings: [],
      }),
    })

    expect(screen.getByText('sample_source: request（请求内显式事实）')).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    expect(screen.getByText('本次样本没有可展示的媒体类型与来源分组。')).toBeInTheDocument()
    expect(screen.getByText('有限样本内未返回分类变化示例。')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
