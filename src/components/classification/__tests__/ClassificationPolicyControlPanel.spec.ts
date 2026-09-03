import type {
  ClassificationImpactAnalysis,
  ClassificationPolicy,
  ClassificationPolicyHistory,
  ClassificationRevisionConflict,
  ClassificationValidationResult,
} from '@/api/mediaClassificationTypes'
import ClassificationPolicyControlPanel from '@/components/classification/ClassificationPolicyControlPanel.vue'
import userEvent from '@testing-library/user-event'
import { screen, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it } from 'vitest'

/** 创建可计数的历史策略快照。 */
function createPolicy(revision: number, categoryCount: number, ruleCount: number): ClassificationPolicy {
  return {
    schema_version: 2,
    revision,
    mode: 'first_match',
    enrichment_mode: 'primary_only',
    categories: Array.from({ length: categoryCount }, (_, index) => ({
      id: 'category-' + revision + '-' + index,
      media_type: '电影' as const,
      name: '分类 ' + (index + 1),
      path: ['电影', '分类 ' + (index + 1)],
      enabled: true,
      labels: [],
    })),
    rules: Array.from({ length: ruleCount }, (_, index) => ({
      id: 'rule-' + revision + '-' + index,
      name: '规则 ' + (index + 1),
      kind: 'category' as const,
      enabled: true,
      priority: index,
      media_types: ['电影' as const],
      sources: [],
      when: { all: [] },
      target: { category_id: categoryCount ? 'category-' + revision + '-0' : null, labels: [] },
    })),
    fallbacks: {},
    source_fallbacks: {},
    field_aliases: {},
    updated_at: revision === 6 ? '2026-09-01T08:30:00+08:00' : '2026-08-31T08:30:00+08:00',
  }
}

/** 创建与当前活动 revision 对齐的影响分析。 */
function createImpact(baselineRevision = 7, sampledAt = '2026-09-02T09:30:00+08:00'): ClassificationImpactAnalysis {
  return {
    estimated: true,
    sampled_at: sampledAt,
    sample_source: 'recent_history',
    baseline_revision: baselineRevision,
    candidate_revision: baselineRevision,
    requested_limit: 100,
    scanned_count: 24,
    skipped_count: 0,
    truncated: false,
    sample_count: 24,
    changed_count: 5,
    unchanged_count: 19,
    category_changed_count: 3,
    path_only_changed_count: 1,
    rule_changed_only_count: 1,
    became_fallback_count: 0,
    partial_count: 0,
    degraded_count: 1,
    previous_categories: {},
    candidate_categories: {},
    groups: [],
    changes: [],
    warnings: [],
  }
}

const validResult: ClassificationValidationResult = { valid: true, issues: [] }

/** 使用常规空闲状态渲染控制面板，单个用例只覆盖必要差异。 */
async function renderPanel(overrides: Partial<InstanceType<typeof ClassificationPolicyControlPanel>['$props']> = {}) {
  return renderWithProviders(ClassificationPolicyControlPanel, {
    props: {
      activeRevision: 7,
      isDirty: true,
      validationResult: null,
      conflict: null,
      history: null,
      ...overrides,
    },
  })
}

describe('ClassificationPolicyControlPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('仅在当前校验、当前影响分析和人工审阅全部完成后允许发布', async () => {
    const user = userEvent.setup()
    const panel = await renderPanel()
    const publish = screen.getByRole('button', { name: '发布分类策略新版本' })

    expect(publish).toBeDisabled()
    expect(screen.getByText('当前草稿尚未通过服务端校验')).toBeInTheDocument()
    expect(screen.getByText('需要对当前草稿执行最新影响分析')).toBeInTheDocument()
    expect(screen.getByText('尚未确认审阅影响分析')).toBeInTheDocument()

    await panel.rerender({
      activeRevision: 7,
      isDirty: true,
      validationResult: validResult,
      validationIsCurrent: true,
      impactResult: createImpact(),
      impactIsCurrent: true,
      conflict: null,
      history: null,
    })

    expect(publish).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: '我已审阅最新影响分析，并确认可以发布' }))
    expect(publish).toBeEnabled()
    await user.click(publish)

    expect(panel.emitted().publish).toHaveLength(1)
    expect(screen.getByText('当前草稿已通过服务端校验')).toBeInTheDocument()
    expect(screen.getByText('影响分析基于当前 revision 7')).toBeInTheDocument()
  })

  it('草稿门禁操作发出独立事件，并在影响分析变旧后撤销审阅确认', async () => {
    const user = userEvent.setup()
    const panel = await renderPanel({
      validationResult: validResult,
      validationIsCurrent: true,
      impactResult: createImpact(),
      impactIsCurrent: true,
    })

    await user.click(screen.getByRole('button', { name: '校验当前草稿' }))
    await user.click(screen.getByRole('button', { name: '分析草稿影响' }))
    const review = screen.getByRole('checkbox', { name: '我已审阅最新影响分析，并确认可以发布' })
    await user.click(review)
    expect(review).toBeChecked()

    await panel.rerender({
      activeRevision: 8,
      isDirty: true,
      validationResult: validResult,
      validationIsCurrent: true,
      impactResult: createImpact(7),
      impactIsCurrent: false,
      conflict: null,
      history: null,
    })

    expect(panel.emitted().validate).toHaveLength(1)
    expect(panel.emitted().analyze).toHaveLength(1)
    expect(review).not.toBeChecked()
    expect(review).toBeDisabled()
    expect(screen.getByText('该结果已过期，请重新执行影响分析。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发布分类策略新版本' })).toBeDisabled()
  })

  it('冲突明确展示 expected/current revision，并保留草稿后按顺序重新分析', async () => {
    const user = userEvent.setup()
    const conflict: ClassificationRevisionConflict = {
      code: 'classification_revision_conflict',
      expected_revision: 7,
      current_revision: 9,
    }
    const panel = await renderPanel({
      validationResult: validResult,
      validationIsCurrent: true,
      impactResult: createImpact(),
      impactIsCurrent: true,
      conflict,
    })

    const alert = screen.getByText('检测到 revision 冲突').closest('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert).toHaveTextContent('本地操作基于 revision 7')
    expect(alert).toHaveTextContent('服务端当前为 revision 9')
    expect(alert).toHaveTextContent('本地草稿已保留')

    await user.click(screen.getByRole('button', { name: '重新加载远端状态' }))
    await user.click(screen.getByRole('button', { name: '保留草稿并重新分析' }))

    expect(panel.emitted().refresh).toHaveLength(1)
    expect(panel.emitted()['keep-draft']).toHaveLength(1)
    expect(panel.emitted().analyze).toBeUndefined()
    expect(screen.getByRole('button', { name: '发布分类策略新版本' })).toBeDisabled()
  })

  it('历史版本展示 revision、时间和规模，并将所选 revision 作为 CAS 回滚目标发出', async () => {
    const user = userEvent.setup()
    const history: ClassificationPolicyHistory = {
      active_revision: 7,
      items: [createPolicy(5, 3, 4), createPolicy(6, 2, 7)],
    }
    const panel = await renderPanel({ history })

    const revision6 = screen.getByTestId('classification-history-revision-6')
    const revision5 = screen.getByTestId('classification-history-revision-5')
    expect(revision6.compareDocumentPosition(revision5) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(revision5).getByText('revision 5')).toBeInTheDocument()
    expect(within(revision5).getByText('3 个分类')).toBeInTheDocument()
    expect(within(revision5).getByText('4 条规则')).toBeInTheDocument()
    expect(within(revision5).getByText(/2026/)).toBeInTheDocument()
    expect(screen.getByText(/回滚不会改写或删除旧版本/)).toBeInTheDocument()
    expect(screen.getByText(/创建一个新 revision/)).toBeInTheDocument()

    const rollback = screen.getByRole('button', { name: '将所选历史版本发布为新版本' })
    expect(rollback).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: /选择 revision 5，3 个分类，4 条规则/ }))
    expect(rollback).toBeEnabled()
    expect(rollback).toHaveTextContent('将 revision 5 回滚为新版本')
    await user.click(rollback)

    expect(panel.emitted().rollback).toEqual([[5]])
  })

  it('加载和写入状态禁用竞争操作，并允许独立刷新历史', async () => {
    const user = userEvent.setup()
    const panel = await renderPanel({
      history: { active_revision: 7, items: [createPolicy(6, 1, 1)] },
      analyzingImpact: true,
    })

    expect(screen.getByRole('button', { name: '校验当前草稿' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '分析草稿影响' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: '刷新版本历史' })).toBeDisabled()
    await user.click(screen.getByRole('radio', { name: /选择 revision 6/ }))
    expect(screen.getByRole('button', { name: '将所选历史版本发布为新版本' })).toBeDisabled()

    await panel.rerender({
      activeRevision: 7,
      isDirty: true,
      validationResult: null,
      conflict: null,
      history: null,
      loadingHistory: false,
      analyzingImpact: false,
    })
    await user.click(screen.getByRole('button', { name: '刷新版本历史' }))
    expect(panel.emitted()['load-history']).toHaveLength(1)
    expect(screen.getByText('尚未加载版本历史')).toBeInTheDocument()
  })
})
