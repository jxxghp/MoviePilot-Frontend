import { AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '@/api/client'
import type { ApiResponse } from '@/api/types'
import {
  analyzeClassificationImpact,
  getClassificationFields,
  getClassificationHistory,
  getClassificationPolicy,
  getClassificationRevisionConflict,
  getClassificationValidationFailure,
  previewClassificationPolicy,
  publishClassificationPolicy,
  rollbackClassificationPolicy,
  validateClassificationPolicy,
  type ClassificationFacts,
  type ClassificationPolicy,
  type ClassificationRevisionConflict,
  type ClassificationValidationResult,
} from '@/api/mediaClassification'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: mocks,
}))

function createPolicy(revision = 1): ClassificationPolicy {
  return {
    schema_version: 2,
    revision,
    mode: 'first_match',
    enrichment_mode: 'primary_only',
    categories: [{ id: 'movie', media_type: '电影', name: '电影', path: ['电影'], enabled: true, labels: [] }],
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
    source_fallbacks: {},
    field_aliases: {},
    updated_at: '2026-09-02T00:00:00Z',
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

describe('media classification API', () => {
  beforeEach(() => {
    mocks.get.mockReset()
    mocks.post.mockReset()
    mocks.put.mockReset()
  })

  it('覆盖 policy、fields、history 三个读取端点', async () => {
    mocks.get.mockResolvedValue({ ok: true })

    await getClassificationPolicy()
    await getClassificationFields()
    await getClassificationHistory()

    expect(mocks.get.mock.calls).toEqual([
      ['media/classification/policy', { feedback: 'silent' }],
      ['media/classification/fields', { feedback: 'silent' }],
      ['media/classification/history', { feedback: 'silent' }],
    ])
  })

  it('覆盖发布、校验、预览、影响和回滚写端点', async () => {
    const policy = createPolicy()
    const facts = createFacts()
    mocks.put.mockResolvedValue(policy)
    mocks.post.mockResolvedValue({ ok: true })

    await publishClassificationPolicy({ expected_revision: 1, policy })
    await validateClassificationPolicy({ policy })
    await previewClassificationPolicy({ input: { kind: 'facts', facts }, policy })
    await analyzeClassificationImpact({
      expected_revision: 1,
      policy,
      sample_limit: 30,
      example_limit: 5,
      samples: [facts],
    })
    await rollbackClassificationPolicy(7, { expected_revision: 8 })

    expect(mocks.put).toHaveBeenCalledWith(
      'media/classification/policy',
      { expected_revision: 1, policy },
      { feedback: 'silent' },
    )
    expect(mocks.post.mock.calls).toEqual([
      ['media/classification/validate', { policy }, { feedback: 'silent' }],
      ['media/classification/preview', { input: { kind: 'facts', facts }, policy }, { feedback: 'silent' }],
      [
        'media/classification/impact',
        { expected_revision: 1, policy, sample_limit: 30, example_limit: 5, samples: [facts] },
        { feedback: 'silent' },
      ],
      ['media/classification/rollback/7', { expected_revision: 8 }, { feedback: 'silent' }],
    ])
  })

  it('从 409 错误中保留结构化 revision 冲突 data', () => {
    const data: ClassificationRevisionConflict = {
      code: 'classification_revision_conflict',
      expected_revision: 3,
      current_revision: 4,
    }
    const error = createHttpError(409, { success: false, message: 'revision 冲突', data })

    expect(getClassificationRevisionConflict(error)).toEqual(data)
    expect(getClassificationValidationFailure(error)).toBeNull()
  })

  it('从 422 错误中保留完整校验路径和问题代码', () => {
    const data: ClassificationValidationResult = {
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
    const error = createHttpError(422, { success: false, message: '校验失败', data })

    expect(getClassificationValidationFailure(error)).toEqual(data)
    expect(getClassificationRevisionConflict(error)).toBeNull()
  })

  it('拒绝错误状态或非标准 envelope 中的伪结构化数据', () => {
    const data: ClassificationRevisionConflict = {
      code: 'classification_revision_conflict',
      expected_revision: 1,
      current_revision: 2,
    }

    expect(
      getClassificationRevisionConflict(createHttpError(422, { success: false, message: '错误状态', data })),
    ).toBeNull()
    expect(
      getClassificationRevisionConflict(
        new ApiRequestError('坏响应', {
          payload: { message: '缺少标准 envelope', data },
          response: { status: 409 } as AxiosResponse,
        }),
      ),
    ).toBeNull()
  })
})
