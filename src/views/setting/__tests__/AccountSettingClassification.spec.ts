import type {
  ClassificationFieldDefinition,
  ClassificationImpactAnalysis,
  ClassificationPolicy,
} from '@/api/mediaClassificationTypes'
import AccountSettingClassification from '@/views/setting/AccountSettingClassification.vue'
import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { computed, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiErrorMessage: vi.fn(),
  analyzeImpact: vi.fn(),
  initialize: vi.fn(),
  loadHistory: vi.fn(),
  preview: vi.fn(),
  publishDraft: vi.fn(),
  refreshPolicy: vi.fn(),
  resetDraft: vi.fn(),
  rollback: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  useMediaClassification: vi.fn(),
  validateDraft: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: { get: mocks.apiGet },
  getApiErrorMessage: mocks.apiErrorMessage,
}))

vi.mock('@/composables/useMediaClassification', () => ({
  useMediaClassification: mocks.useMediaClassification,
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, info: mocks.toastInfo, success: mocks.toastSuccess }),
}))

vi.mock('@/components/classification/ClassificationCategoryEditor.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'ClassificationCategoryEditorStub',
      props: {
        categories: { type: Array, required: true },
        fallbacks: { type: Object, required: true },
        referencedCategoryIds: { type: Array, default: () => [] },
        directoryReferences: { type: Array, default: () => [] },
      },
      emits: ['update:categories', 'update:fallbacks'],
      template: `
        <section aria-label="category-editor">
          <output aria-label="category-references">{{ referencedCategoryIds.join(',') }}</output>
          <output aria-label="directory-references">{{ JSON.stringify(directoryReferences) }}</output>
          <button aria-label="replace-categories" @click="$emit('update:categories', [{ ...categories[0], name: '新电影' }])">categories</button>
          <button aria-label="replace-fallbacks" @click="$emit('update:fallbacks', { ...fallbacks, 电影: 'movie.new' })">fallbacks</button>
        </section>
      `,
    }),
  }
})

vi.mock('@/components/classification/ClassificationRuleEditor.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'ClassificationRuleEditorStub',
      props: {
        rules: { type: Array, required: true },
        fields: { type: Array, required: true },
      },
      emits: ['update:rules'],
      template: `
        <section aria-label="rule-editor">
          <output aria-label="editor-field-ids">{{ fields.map(field => field.id).join(',') }}</output>
          <output aria-label="editor-field-labels">{{ fields.map(field => field.label).join(',') }}</output>
          <button aria-label="replace-rules" @click="$emit('update:rules', [{ ...rules[0], name: '新规则' }])">rules</button>
        </section>
      `,
    }),
  }
})

vi.mock('@/components/classification/ClassificationPreviewPanel.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'ClassificationPreviewPanelStub',
      emits: ['request-preview'],
      template: `
        <section aria-label="preview-panel">
          <button
            aria-label="request-active-preview"
            @click="$emit('request-preview', {
              input: {
                kind: 'facts',
                facts: {
                  identity: { media_source: 'themoviedb', media_id: '550' },
                  media: { type: '电影' },
                  extensions: {},
                  field_sources: {},
                },
              },
              policyMode: 'active',
            })"
          >preview</button>
        </section>
      `,
    }),
  }
})

vi.mock('@/components/classification/ClassificationImpactPanel.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'ClassificationImpactPanelStub',
      emits: ['analyze'],
      template: `
        <section aria-label="impact-panel">
          <button aria-label="request-impact" @click="$emit('analyze', { sampleLimit: 30, exampleLimit: 5 })">
            impact
          </button>
        </section>
      `,
    }),
  }
})

vi.mock('@/components/classification/ClassificationPolicyControlPanel.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'ClassificationPolicyControlPanelStub',
      props: {
        validationIsCurrent: Boolean,
        impactIsCurrent: Boolean,
      },
      emits: ['validate', 'analyze', 'publish', 'refresh', 'keep-draft', 'load-history', 'rollback'],
      template: `
        <section aria-label="policy-control-panel">
          <output aria-label="validation-current">{{ validationIsCurrent }}</output>
          <output aria-label="impact-current">{{ impactIsCurrent }}</output>
          <button aria-label="control-validate" @click="$emit('validate')">validate</button>
          <button aria-label="control-analyze" @click="$emit('analyze')">analyze</button>
          <button aria-label="control-publish" @click="$emit('publish')">publish</button>
          <button aria-label="control-refresh" @click="$emit('refresh')">refresh</button>
          <button aria-label="control-keep-draft" @click="$emit('keep-draft')">keep</button>
          <button aria-label="control-load-history" @click="$emit('load-history')">history</button>
          <button aria-label="control-rollback" @click="$emit('rollback', 3)">rollback</button>
        </section>
      `,
    }),
  }
})

function createPolicy(): ClassificationPolicy {
  return {
    schema_version: 2,
    revision: 7,
    mode: 'first_match',
    enrichment_mode: 'primary_only',
    categories: [{ id: 'movie.base', media_type: '电影', name: '电影', path: ['电影'], enabled: true, labels: [] }],
    rules: [
      {
        id: 'rule.movie',
        name: '电影规则',
        kind: 'category',
        enabled: true,
        priority: 0,
        media_types: ['电影'],
        sources: [],
        when: { field: 'media.type', operator: 'equals', value: '电影' },
        target: { category_id: 'movie.base', labels: [] },
      },
    ],
    fallbacks: { 电影: 'movie.base' },
    field_aliases: {},
  }
}

/** 构造迁移后只应在旧规则仍引用时保留的 TMDB 兼容字段。 */
function createLegacyTmdbField(): ClassificationFieldDefinition {
  return {
    id: 'extensions.themoviedb.genre_ids',
    label: 'TMDB 旧字段 genre_ids',
    group: 'TMDB 兼容',
    value_type: 'string_list',
    operators: ['contains_any'],
    media_types: ['电影'],
    options: [],
    allow_custom_values: true,
    source_support: { themoviedb: 'extension' },
  }
}

/** 构造与活动 revision 对齐的有界影响分析结果。 */
function createImpact(): ClassificationImpactAnalysis {
  return {
    estimated: true,
    sampled_at: '2026-09-02T00:00:00Z',
    sample_source: 'recent_history',
    baseline_revision: 7,
    candidate_revision: 8,
    requested_limit: 30,
    scanned_count: 10,
    skipped_count: 0,
    unresolved_count: 0,
    truncated: false,
    sample_count: 10,
    changed_count: 1,
    unchanged_count: 9,
    category_changed_count: 1,
    path_only_changed_count: 0,
    rule_changed_only_count: 0,
    became_fallback_count: 0,
    partial_count: 0,
    degraded_count: 0,
    previous_categories: { 'movie.base': 10 },
    candidate_categories: { 'movie.base': 10 },
    groups: [],
    changes: [],
    warnings: [],
  }
}

describe('AccountSettingClassification', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset().mockResolvedValue([
      {
        name: '电影目录',
        priority: 0,
        storage: 'local',
        transfer_type: 'copy',
        media_type: '电影',
        media_category_id: 'movie.base',
        media_category: '电影',
      },
    ])
    mocks.apiErrorMessage.mockReset().mockReturnValue(undefined)
    mocks.analyzeImpact.mockReset()
    mocks.initialize.mockReset().mockResolvedValue(undefined)
    mocks.loadHistory.mockReset().mockResolvedValue(undefined)
    mocks.preview.mockReset().mockResolvedValue(undefined)
    mocks.publishDraft.mockReset().mockResolvedValue(createPolicy())
    mocks.refreshPolicy.mockReset().mockResolvedValue(createPolicy())
    mocks.resetDraft.mockReset()
    mocks.rollback.mockReset().mockResolvedValue({ restored_from_revision: 3, policy: createPolicy() })
    mocks.toastError.mockReset()
    mocks.toastInfo.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.validateDraft.mockReset()

    const draftPolicy = ref(createPolicy())
    const activePolicy = ref(createPolicy())
    const validationResult = ref<{ valid: boolean; issues: never[] } | null>(null)
    const impactResult = ref<ClassificationImpactAnalysis | null>(null)
    mocks.validateDraft.mockImplementation(async () => {
      const result = { valid: true, issues: [] as never[] }
      validationResult.value = result
      return result
    })
    mocks.analyzeImpact.mockImplementation(async () => {
      const result = createImpact()
      impactResult.value = result
      return result
    })
    mocks.useMediaClassification.mockReturnValue({
      activeRevision: computed(() => activePolicy.value.revision),
      analyzingImpact: ref(false),
      conflict: ref(null),
      draftPolicy,
      fieldCatalog: ref({
        fields: [
          {
            id: 'media.type',
            label: '媒体类型',
            group: '媒体',
            value_type: 'enum',
            operators: ['equals'],
            media_types: ['电影', '电视剧', '音乐'],
            options: [],
            allow_custom_values: false,
            source_support: { themoviedb: 'native', musicbrainz: 'native' },
          },
          {
            id: 'media.genre_keys',
            label: '规范类型',
            group: '通用',
            value_type: 'string_list',
            operators: ['contains_any'],
            media_types: ['电影', '电视剧', '音乐'],
            options: [],
            allow_custom_values: true,
            source_support: { themoviedb: 'derived', musicbrainz: 'derived' },
          },
          createLegacyTmdbField(),
        ],
        limits: {
          max_category_depth: 4,
          max_category_segment_length: 64,
          max_category_path_length: 240,
          max_condition_depth: 3,
          max_conditions_per_rule: 30,
          max_rules: 1000,
          max_total_conditions: 30000,
        },
      }),
      history: ref(null),
      impactResult,
      isDirty: computed(() => JSON.stringify(draftPolicy.value) !== JSON.stringify(activePolicy.value)),
      loadingHistory: ref(false),
      loadingFields: ref(false),
      loadingPolicy: ref(false),
      previewResult: ref(null),
      previewing: ref(false),
      publishing: ref(false),
      rollingBack: ref(false),
      validationResult,
      validating: ref(false),
      analyzeImpact: mocks.analyzeImpact,
      initialize: mocks.initialize,
      loadHistory: mocks.loadHistory,
      preview: mocks.preview,
      publishDraft: mocks.publishDraft,
      refreshPolicy: mocks.refreshPolicy,
      resetDraft: mocks.resetDraft,
      rollback: mocks.rollback,
      validateDraft: mocks.validateDraft,
    })
  })

  /** 切换一级工作区，模拟移动端按需展示大型编辑面板。 */
  async function openWorkspace(name: '分类树' | '规则' | '验证发布'): Promise<void> {
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name }))
  }

  it('loads only when the settings tab becomes active', async () => {
    const { rerender } = await renderWithProviders(AccountSettingClassification, { props: { active: false } })

    expect(mocks.initialize).not.toHaveBeenCalled()
    await rerender({ active: true })

    await waitFor(() => expect(mocks.initialize).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('region', { name: 'category-editor' })).toBeInTheDocument()
  })

  it('opens the complete automatic classification guide from the top-right help button', async () => {
    const user = userEvent.setup()
    await renderWithProviders(AccountSettingClassification)

    const helpButton = await screen.findByRole('button', { name: '查看自动分类帮助' })
    expect(helpButton.querySelector('.v-icon')).toBeInTheDocument()
    await user.click(helpButton)

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('自动分类使用说明')
    expect(dialog).toHaveTextContent('建立分类')
    expect(dialog).toHaveTextContent('预览分类结果')
    expect(dialog).toHaveTextContent('查看影响范围')
    expect(dialog).toHaveTextContent('查看历史和回退')
    expect(
      screen.getByRole('button', { name: '知道了' }).closest('.classification-help-dialog__actions'),
    ).not.toBeNull()
  })

  it('replaces category, fallback, and rule slices without losing the rest of the draft', async () => {
    const user = userEvent.setup()
    await renderWithProviders(AccountSettingClassification)
    await screen.findByRole('region', { name: 'category-editor' })

    await user.click(screen.getByRole('button', { name: 'replace-categories' }))
    await user.click(screen.getByRole('button', { name: 'replace-fallbacks' }))
    await openWorkspace('规则')
    await user.click(screen.getByRole('button', { name: 'replace-rules' }))

    const state = mocks.useMediaClassification.mock.results[0].value
    expect(state.draftPolicy.value.categories[0].name).toBe('新电影')
    expect(state.draftPolicy.value.fallbacks.电影).toBe('movie.new')
    expect(state.draftPolicy.value.rules[0].name).toBe('新规则')
    expect(screen.getByLabelText('category-references')).toHaveTextContent('movie.base')
    expect(screen.getByLabelText('directory-references')).toHaveTextContent('movie.base')
    expect(screen.getByLabelText('directory-references')).toHaveTextContent('电影目录')
  })

  it('hides migrated TMDB fields but keeps a field visible while an old rule still references it', async () => {
    await renderWithProviders(AccountSettingClassification)
    await openWorkspace('规则')

    expect(screen.getByLabelText('editor-field-ids')).toHaveTextContent('media.type,media.genre_keys')
    expect(screen.getByLabelText('editor-field-ids')).not.toHaveTextContent('extensions.themoviedb.genre_ids')
    expect(screen.getByLabelText('editor-field-labels')).toHaveTextContent('风格')

    const state = mocks.useMediaClassification.mock.results[0].value
    state.draftPolicy.value = {
      ...state.draftPolicy.value,
      rules: [
        {
          ...state.draftPolicy.value.rules[0],
          when: { field: 'extensions.themoviedb.genre_ids', operator: 'contains_any', value: ['16'] },
        },
      ],
    }
    await nextTick()

    expect(screen.getByLabelText('editor-field-ids')).toHaveTextContent('extensions.themoviedb.genre_ids')
  })

  it('switches missing-fact enrichment through the policy draft', async () => {
    const user = userEvent.setup()
    await renderWithProviders(AccountSettingClassification)
    await screen.findByRole('region', { name: 'category-editor' })

    const state = mocks.useMediaClassification.mock.results[0].value
    expect(document.querySelector('.classification-settings__binary-toggle')).toHaveClass(
      'v-btn-group--density-compact',
    )
    expect(state.draftPolicy.value.enrichment_mode).toBe('primary_only')
    await user.click(screen.getByRole('button', { name: '补充缺少的信息' }))

    expect(state.draftPolicy.value.enrichment_mode).toBe('enrich_missing')
    expect(state.isDirty.value).toBe(true)
  })

  it('keeps policy editing available while warning when directory references cannot be loaded', async () => {
    mocks.apiGet.mockRejectedValueOnce(new Error('directory unavailable'))
    await renderWithProviders(AccountSettingClassification)

    expect(await screen.findByText('目录引用加载失败')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'category-editor' })).toBeInTheDocument()
  })

  it('validates the draft and exposes discard as a separate action', async () => {
    const user = userEvent.setup()
    await renderWithProviders(AccountSettingClassification)
    await openWorkspace('规则')
    await screen.findByRole('region', { name: 'rule-editor' })
    await user.click(screen.getByRole('button', { name: 'replace-rules' }))

    await user.click(screen.getByRole('button', { name: '校验草稿' }))
    expect(mocks.validateDraft).toHaveBeenCalledTimes(1)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('草稿校验通过')

    await user.click(screen.getByRole('button', { name: '放弃修改' }))
    expect(mocks.resetDraft).toHaveBeenCalledTimes(1)
    expect(mocks.toastInfo).toHaveBeenCalledWith('已恢复当前活动策略')
  })

  it('surfaces the server reason when validation rejects a changed rule draft', async () => {
    const user = userEvent.setup()
    mocks.validateDraft.mockRejectedValueOnce(new Error('validation rejected'))
    mocks.apiErrorMessage.mockReturnValueOnce('请求参数不正确')
    await renderWithProviders(AccountSettingClassification)
    await openWorkspace('验证发布')

    await user.click(screen.getByRole('button', { name: '校验草稿' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('请求参数不正确'))
  })

  it('只显示分类树、规则和验证发布三个工作区标签', async () => {
    await renderWithProviders(AccountSettingClassification)
    await screen.findByRole('region', { name: 'category-editor' })

    expect(screen.getByRole('tab', { name: '分类树' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '规则' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '验证发布' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '来源' })).not.toBeInTheDocument()
  })

  it('maps fact preview modes and bounded impact options to the composable', async () => {
    const user = userEvent.setup()
    await renderWithProviders(AccountSettingClassification)
    await openWorkspace('验证发布')
    await screen.findByRole('region', { name: 'preview-panel' })

    await user.click(screen.getByRole('button', { name: 'request-active-preview' }))
    expect(mocks.preview).toHaveBeenCalledWith(
      {
        kind: 'facts',
        facts: {
          identity: { media_source: 'themoviedb', media_id: '550' },
          media: { type: '电影' },
          extensions: {},
          field_sources: {},
        },
      },
      { policy: null },
    )

    await user.click(screen.getByRole('tab', { name: '影响分析' }))
    await user.click(await screen.findByRole('button', { name: 'request-impact' }))
    expect(mocks.analyzeImpact).toHaveBeenCalledWith({
      policy: createPolicy(),
      sampleLimit: 30,
      exampleLimit: 5,
    })
  })

  it('keeps validation and impact stale when the draft changes while requests are in flight', async () => {
    const user = userEvent.setup()
    await renderWithProviders(AccountSettingClassification)
    await openWorkspace('规则')
    await screen.findByRole('region', { name: 'rule-editor' })
    await user.click(screen.getByRole('button', { name: 'replace-rules' }))
    await openWorkspace('验证发布')
    await user.click(screen.getByRole('tab', { name: '发布与历史' }))
    await screen.findByRole('region', { name: 'policy-control-panel' })

    const state = mocks.useMediaClassification.mock.results[0].value
    const validation = { valid: true, issues: [] as never[] }
    let resolveValidation!: () => void
    mocks.validateDraft.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveValidation = () => {
            state.validationResult.value = validation
            resolve(validation)
          }
        }),
    )

    await user.click(screen.getByRole('button', { name: 'control-validate' }))
    await waitFor(() => expect(mocks.validateDraft).toHaveBeenCalledTimes(1))
    state.draftPolicy.value.rules[0].name = '校验请求后的编辑'
    await nextTick()
    resolveValidation()
    await waitFor(() => expect(screen.getByLabelText('validation-current')).toHaveTextContent('false'))

    const impact = createImpact()
    let resolveImpact!: () => void
    mocks.analyzeImpact.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveImpact = () => {
            state.impactResult.value = impact
            resolve(impact)
          }
        }),
    )

    await user.click(screen.getByRole('button', { name: 'control-analyze' }))
    await waitFor(() => expect(mocks.analyzeImpact).toHaveBeenCalledTimes(1))
    state.draftPolicy.value.rules[0].name = '影响请求后的编辑'
    await nextTick()
    resolveImpact()
    await waitFor(() => expect(screen.getByRole('tab', { name: '影响分析' })).toHaveAttribute('aria-selected', 'true'))
    await user.click(screen.getByRole('tab', { name: '发布与历史' }))
    await waitFor(() => expect(screen.getByLabelText('impact-current')).toHaveTextContent('false'))
  })

  it('requires current validation and impact snapshots before publishing, then sequences conflict recovery and rollback', async () => {
    const user = userEvent.setup()
    await renderWithProviders(AccountSettingClassification)
    await openWorkspace('规则')
    await screen.findByRole('region', { name: 'rule-editor' })
    await user.click(screen.getByRole('button', { name: 'replace-rules' }))

    await openWorkspace('验证发布')
    await user.click(screen.getByRole('tab', { name: '发布与历史' }))
    await screen.findByRole('region', { name: 'policy-control-panel' })
    await waitFor(() => expect(mocks.loadHistory).toHaveBeenCalledTimes(1))

    expect(screen.getByLabelText('validation-current')).toHaveTextContent('false')
    expect(screen.getByLabelText('impact-current')).toHaveTextContent('false')
    await user.click(screen.getByRole('button', { name: 'control-validate' }))
    await user.click(screen.getByRole('button', { name: 'control-analyze' }))
    await waitFor(() => expect(screen.getByRole('tab', { name: '影响分析' })).toHaveAttribute('aria-selected', 'true'))
    await user.click(screen.getByRole('tab', { name: '发布与历史' }))
    await waitFor(() => expect(screen.getByLabelText('validation-current')).toHaveTextContent('true'))
    await waitFor(() => expect(screen.getByLabelText('impact-current')).toHaveTextContent('true'))

    await user.click(screen.getByRole('button', { name: 'control-publish' }))
    await waitFor(() => expect(mocks.publishDraft).toHaveBeenCalledTimes(1))
    expect(mocks.toastSuccess).toHaveBeenLastCalledWith('分类规则已发布为第 7 版')

    mocks.refreshPolicy.mockClear()
    mocks.analyzeImpact.mockClear()
    await user.click(screen.getByRole('button', { name: 'control-keep-draft' }))
    await waitFor(() => expect(mocks.refreshPolicy).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mocks.analyzeImpact).toHaveBeenCalledTimes(1))
    expect(mocks.refreshPolicy.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.analyzeImpact.mock.invocationCallOrder[0],
    )

    await user.click(screen.getByRole('tab', { name: '发布与历史' }))
    await screen.findByRole('region', { name: 'policy-control-panel' })
    await user.click(screen.getByRole('button', { name: 'control-rollback' }))
    await waitFor(() => expect(mocks.rollback).toHaveBeenCalledWith(3))
    expect(mocks.toastSuccess).toHaveBeenLastCalledWith('第 3 版已恢复，并发布为第 7 版')
  })
})
