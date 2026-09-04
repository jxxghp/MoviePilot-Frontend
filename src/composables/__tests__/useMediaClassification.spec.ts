import { AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '@/api/client'
import type { ApiResponse } from '@/api/types'
import type {
  ClassificationEvaluation,
  ClassificationFacts,
  ClassificationFieldCatalog,
  ClassificationImpactAnalysis,
  ClassificationPolicy,
  ClassificationPolicyHistory,
  ClassificationRevisionConflict,
  ClassificationValidationResult,
} from '@/api/mediaClassification'
import { clearMediaClassificationFieldCatalogCache, useMediaClassification } from '@/composables/useMediaClassification'

const mocks = vi.hoisted(() => ({
  analyzeImpact: vi.fn(),
  getFields: vi.fn(),
  getHistory: vi.fn(),
  getPolicy: vi.fn(),
  preview: vi.fn(),
  publish: vi.fn(),
  rollback: vi.fn(),
  validate: vi.fn(),
}))

vi.mock('@/api/mediaClassification', async importOriginal => ({
  ...(await importOriginal<typeof import('@/api/mediaClassification')>()),
  analyzeClassificationImpact: (...args: unknown[]) => mocks.analyzeImpact(...args),
  getClassificationFields: (...args: unknown[]) => mocks.getFields(...args),
  getClassificationHistory: (...args: unknown[]) => mocks.getHistory(...args),
  getClassificationPolicy: (...args: unknown[]) => mocks.getPolicy(...args),
  previewClassificationPolicy: (...args: unknown[]) => mocks.preview(...args),
  publishClassificationPolicy: (...args: unknown[]) => mocks.publish(...args),
  rollbackClassificationPolicy: (...args: unknown[]) => mocks.rollback(...args),
  validateClassificationPolicy: (...args: unknown[]) => mocks.validate(...args),
}))

function createPolicy(revision = 1, name = '电影'): ClassificationPolicy {
  return {
    schema_version: 2,
    revision,
    mode: 'first_match',
    enrichment_mode: 'primary_only',
    categories: [{ id: 'movie', media_type: '电影', name, path: [name], enabled: true, labels: [] }],
    rules: [
      {
        id: 'movie-rule',
        name: '电影规则',
        kind: 'category',
        enabled: true,
        priority: 0,
        media_types: ['电影'],
        sources: [],
        when: { field: 'media.type', operator: 'equals', value: '电影' },
        target: { category_id: 'movie', labels: [] },
      },
    ],
    fallbacks: { 电影: 'movie' },
    field_aliases: {},
    updated_at: `2026-09-02T00:00:0${revision}Z`,
  }
}

function createFacts(): ClassificationFacts {
  return {
    identity: { media_source: 'themoviedb', media_id: '1' },
    media: { type: '电影', title: '示例电影' },
    extensions: {},
    field_sources: {},
  }
}

function createFieldCatalog(label = '媒体类型'): ClassificationFieldCatalog {
  return {
    fields: [
      {
        id: 'media.type',
        label,
        group: '通用',
        value_type: 'enum',
        operators: ['equals'],
        media_types: ['电影', '电视剧', '音乐'],
        options: [{ value: '电影', label: '电影' }],
        allow_custom_values: false,
        source_support: { themoviedb: 'native' },
      },
    ],
    limits: {
      max_category_depth: 4,
      max_category_segment_length: 80,
      max_category_path_length: 240,
      max_condition_depth: 6,
      max_conditions_per_rule: 50,
      max_rules: 200,
      max_total_conditions: 1000,
    },
  }
}

function createHttpError<T>(status: number, payload: ApiResponse<T>): ApiRequestError<ApiResponse<T>> {
  const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig
  const response: AxiosResponse<ApiResponse<T>> = {
    config,
    data: payload,
    headers: new AxiosHeaders(),
    status,
    statusText: String(status),
  }
  return new ApiRequestError(payload.message, { payload, response })
}

describe('useMediaClassification', () => {
  beforeEach(() => {
    clearMediaClassificationFieldCatalogCache()
    for (const mock of Object.values(mocks)) mock.mockReset()
  })

  it('深拷贝活动快照和草稿，并在刷新时保留未保存编辑', async () => {
    const first = createPolicy(1)
    const second = createPolicy(2, '新电影')
    mocks.getPolicy.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const classification = useMediaClassification()

    await classification.refreshPolicy()
    expect(classification.activePolicy.value).toEqual(first)
    expect(classification.draftPolicy.value).toEqual(first)
    expect(classification.activePolicy.value).not.toBe(classification.draftPolicy.value)
    expect(classification.activePolicy.value?.categories[0]).not.toBe(classification.draftPolicy.value?.categories[0])

    classification.draftPolicy.value!.categories[0].name = '本地编辑'
    expect(classification.isDirty.value).toBe(true)
    expect(classification.activePolicy.value?.categories[0].name).toBe('电影')

    await classification.refreshPolicy()
    expect(classification.activePolicy.value).toEqual(second)
    expect(classification.draftPolicy.value?.categories[0].name).toBe('本地编辑')
    expect(classification.isDirty.value).toBe(true)
  })

  it('草稿干净时随刷新同步，并可显式重置本地编辑', async () => {
    mocks.getPolicy.mockResolvedValueOnce(createPolicy(1)).mockResolvedValueOnce(createPolicy(2, '新版'))
    const classification = useMediaClassification()

    await classification.refreshPolicy()
    await classification.refreshPolicy()
    expect(classification.draftPolicy.value).toEqual(createPolicy(2, '新版'))

    classification.draftPolicy.value!.categories[0].name = '临时名称'
    classification.resetDraft()
    expect(classification.draftPolicy.value).toEqual(classification.activePolicy.value)
    expect(classification.draftPolicy.value).not.toBe(classification.activePolicy.value)
    expect(classification.isDirty.value).toBe(false)
  })

  it('跨 composable 实例缓存字段目录，并支持强制刷新', async () => {
    mocks.getFields.mockResolvedValueOnce(createFieldCatalog()).mockResolvedValueOnce(createFieldCatalog('新目录'))
    const first = useMediaClassification()
    const second = useMediaClassification()

    await expect(first.loadFields()).resolves.toEqual(createFieldCatalog())
    await expect(second.loadFields()).resolves.toEqual(createFieldCatalog())
    expect(mocks.getFields).toHaveBeenCalledTimes(1)
    expect(first.fieldCatalog.value).not.toBe(second.fieldCatalog.value)

    await expect(second.loadFields(true)).resolves.toEqual(createFieldCatalog('新目录'))
    expect(mocks.getFields).toHaveBeenCalledTimes(2)
    expect(second.fieldCatalog.value?.fields[0].label).toBe('新目录')
  })

  it('以当前草稿和活动 revision 驱动校验、预览、影响及历史查询', async () => {
    const policy = createPolicy(4)
    const facts = createFacts()
    const validation: ClassificationValidationResult = { valid: true, issues: [] }
    const evaluation: ClassificationEvaluation = {
      facts,
      result: { recommended: null, effective: null, labels: [], policy_revision: 4, state: 'complete' },
      trace: [],
      warnings: [],
    }
    const impact: ClassificationImpactAnalysis = {
      estimated: true,
      sampled_at: '2026-09-02T00:00:00Z',
      sample_source: 'request',
      baseline_revision: 4,
      candidate_revision: 5,
      requested_limit: 10,
      scanned_count: 1,
      skipped_count: 0,
      unresolved_count: 0,
      truncated: false,
      sample_count: 1,
      changed_count: 0,
      unchanged_count: 1,
      category_changed_count: 0,
      path_only_changed_count: 0,
      rule_changed_only_count: 0,
      became_fallback_count: 0,
      partial_count: 0,
      degraded_count: 0,
      previous_categories: { movie: 1 },
      candidate_categories: { movie: 1 },
      groups: [],
      changes: [],
      warnings: [],
    }
    const history: ClassificationPolicyHistory = { active_revision: 4, items: [createPolicy(3)] }
    mocks.getPolicy.mockResolvedValue(policy)
    mocks.validate.mockResolvedValue(validation)
    mocks.preview.mockResolvedValue(evaluation)
    mocks.analyzeImpact.mockResolvedValue(impact)
    mocks.getHistory.mockResolvedValue(history)
    const classification = useMediaClassification()
    await classification.refreshPolicy()

    await expect(classification.validateDraft()).resolves.toEqual(validation)
    await expect(classification.preview({ kind: 'facts', facts })).resolves.toEqual(evaluation)
    await expect(classification.preview({ kind: 'facts', facts }, { policy: undefined })).resolves.toEqual(evaluation)
    await expect(classification.preview({ kind: 'facts', facts }, { policy: null })).resolves.toEqual(evaluation)
    await expect(classification.analyzeImpact({ sampleLimit: 10, exampleLimit: 2, samples: [facts] })).resolves.toEqual(
      impact,
    )
    await expect(classification.loadHistory()).resolves.toEqual(history)

    expect(mocks.validate).toHaveBeenCalledWith({ policy })
    expect(mocks.preview).toHaveBeenNthCalledWith(1, { input: { kind: 'facts', facts }, policy })
    expect(mocks.preview).toHaveBeenNthCalledWith(2, { input: { kind: 'facts', facts }, policy })
    expect(mocks.preview).toHaveBeenNthCalledWith(3, { input: { kind: 'facts', facts } })
    expect(mocks.analyzeImpact).toHaveBeenCalledWith({
      expected_revision: 4,
      policy,
      sample_limit: 10,
      example_limit: 2,
      samples: [facts],
    })
    expect(classification.validationResult.value).toEqual(validation)
    expect(classification.previewResult.value).toEqual(evaluation)
    expect(classification.impactResult.value).toEqual(impact)
    expect(classification.history.value).toEqual(history)
  })

  it('保留发布冲突和 422 校验 data，成功发布后重建干净草稿', async () => {
    const initial = createPolicy(1)
    const published = createPolicy(2, '已发布')
    const conflict: ClassificationRevisionConflict = {
      code: 'classification_revision_conflict',
      expected_revision: 1,
      current_revision: 2,
    }
    const conflictError = createHttpError(409, { success: false, message: 'revision 冲突', data: conflict })
    const validation: ClassificationValidationResult = {
      valid: false,
      issues: [
        {
          severity: 'error',
          code: 'unknown_field',
          message: '字段不存在',
          path: ['rules', 0, 'when', 'field'],
        },
      ],
    }
    const validationError = createHttpError(422, { success: false, message: '校验失败', data: validation })
    mocks.getPolicy.mockResolvedValue(initial)
    mocks.publish.mockRejectedValueOnce(conflictError).mockResolvedValueOnce(published)
    mocks.validate.mockRejectedValueOnce(validationError)
    const classification = useMediaClassification()
    await classification.refreshPolicy()
    classification.draftPolicy.value!.categories[0].name = '本地编辑'

    await expect(classification.publishDraft()).rejects.toBe(conflictError)
    expect(classification.conflict.value).toEqual(conflict)
    expect(classification.draftPolicy.value?.categories[0].name).toBe('本地编辑')

    await expect(classification.validateDraft()).rejects.toBe(validationError)
    expect(classification.validationResult.value).toEqual(validation)

    const publishedDraft = JSON.parse(JSON.stringify(classification.draftPolicy.value)) as ClassificationPolicy
    await expect(classification.publishDraft()).resolves.toEqual(published)
    expect(mocks.publish).toHaveBeenLastCalledWith({ expected_revision: 1, policy: publishedDraft })
    expect(classification.activePolicy.value).toEqual(published)
    expect(classification.draftPolicy.value).toEqual(published)
    expect(classification.draftPolicy.value).not.toBe(classification.activePolicy.value)
    expect(classification.isDirty.value).toBe(false)
    expect(classification.conflict.value).toBeNull()
  })

  it('回滚更新活动快照但不覆盖已有未保存草稿', async () => {
    const initial = createPolicy(5)
    const rolledBack = createPolicy(6, '回滚版本')
    const facts = createFacts()
    const evaluation: ClassificationEvaluation = {
      facts,
      result: { recommended: null, effective: null, labels: [], policy_revision: 5, state: 'complete' },
      trace: [],
      warnings: [],
    }
    const impact = {
      estimated: true,
      sampled_at: '2026-09-02T00:00:00Z',
      sample_source: 'request',
      baseline_revision: 5,
      candidate_revision: 6,
      requested_limit: 1,
      scanned_count: 1,
      skipped_count: 0,
      unresolved_count: 0,
      truncated: false,
      sample_count: 1,
      changed_count: 0,
      unchanged_count: 1,
      category_changed_count: 0,
      path_only_changed_count: 0,
      rule_changed_only_count: 0,
      became_fallback_count: 0,
      partial_count: 0,
      degraded_count: 0,
      previous_categories: {},
      candidate_categories: {},
      groups: [],
      changes: [],
      warnings: [],
    } satisfies ClassificationImpactAnalysis
    mocks.getPolicy.mockResolvedValue(initial)
    mocks.preview.mockResolvedValue(evaluation)
    mocks.analyzeImpact.mockResolvedValue(impact)
    mocks.rollback.mockResolvedValue({ restored_from_revision: 2, policy: rolledBack })
    const classification = useMediaClassification()
    await classification.refreshPolicy()
    await classification.preview({ kind: 'facts', facts })
    await classification.analyzeImpact({ samples: [facts] })
    classification.draftPolicy.value!.categories[0].name = '待发布草稿'

    await expect(classification.rollback(2)).resolves.toEqual({
      restored_from_revision: 2,
      policy: rolledBack,
    })

    expect(mocks.rollback).toHaveBeenCalledWith(2, { expected_revision: 5 })
    expect(classification.activePolicy.value).toEqual(rolledBack)
    expect(classification.draftPolicy.value?.categories[0].name).toBe('待发布草稿')
    expect(classification.isDirty.value).toBe(true)
    expect(classification.previewResult.value).toBeNull()
    expect(classification.impactResult.value).toBeNull()
  })
})
