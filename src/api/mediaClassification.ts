import api from '@/api'
import type { ApiResponse } from '@/api/types'
import { ApiRequestError, isApiResponse } from './client'
import type {
  ClassificationEvaluation,
  ClassificationFieldCatalog,
  ClassificationImpactAnalysis,
  ClassificationImpactRequest,
  ClassificationPolicy,
  ClassificationPolicyHistory,
  ClassificationPolicyPublishRequest,
  ClassificationPolicyRollbackRequest,
  ClassificationPolicyRollbackResult,
  ClassificationPolicyValidateRequest,
  ClassificationPreviewRequest,
  ClassificationRevisionConflict,
  ClassificationValidationResult,
} from './mediaClassificationTypes'

const CLASSIFICATION_API_BASE = 'media/classification'

/** 读取当前活动分类策略。 */
export function getClassificationPolicy(): Promise<ClassificationPolicy> {
  return api.get(`${CLASSIFICATION_API_BASE}/policy`, { feedback: 'silent' })
}

/** 以 CAS revision 校验并发布完整分类策略。 */
export function publishClassificationPolicy(
  request: ClassificationPolicyPublishRequest,
): Promise<ClassificationPolicy> {
  return api.put<ClassificationPolicy, ClassificationPolicy, ClassificationPolicyPublishRequest>(
    `${CLASSIFICATION_API_BASE}/policy`,
    request,
    { feedback: 'silent' },
  )
}

/** 读取动态字段能力目录和服务端编辑限制。 */
export function getClassificationFields(): Promise<ClassificationFieldCatalog> {
  return api.get(`${CLASSIFICATION_API_BASE}/fields`, { feedback: 'silent' })
}

/** 使用与发布相同的规则校验完整策略草稿。 */
export function validateClassificationPolicy(
  request: ClassificationPolicyValidateRequest,
): Promise<ClassificationValidationResult> {
  return api.post<ClassificationValidationResult, ClassificationValidationResult, ClassificationPolicyValidateRequest>(
    `${CLASSIFICATION_API_BASE}/validate`,
    request,
    { feedback: 'silent' },
  )
}

/** 对显式事实执行活动策略或未发布草稿并返回命中解释。 */
export function previewClassificationPolicy(request: ClassificationPreviewRequest): Promise<ClassificationEvaluation> {
  return api.post<ClassificationEvaluation, ClassificationEvaluation, ClassificationPreviewRequest>(
    `${CLASSIFICATION_API_BASE}/preview`,
    request,
    { feedback: 'silent' },
  )
}

/** 估算未发布草稿对显式或近期历史样本的影响。 */
export function analyzeClassificationImpact(
  request: ClassificationImpactRequest,
): Promise<ClassificationImpactAnalysis> {
  return api.post<ClassificationImpactAnalysis, ClassificationImpactAnalysis, ClassificationImpactRequest>(
    `${CLASSIFICATION_API_BASE}/impact`,
    request,
    { feedback: 'silent' },
  )
}

/** 读取当前 revision 及最近的历史策略快照。 */
export function getClassificationHistory(): Promise<ClassificationPolicyHistory> {
  return api.get(`${CLASSIFICATION_API_BASE}/history`, { feedback: 'silent' })
}

/** 将指定历史策略内容发布为新的单调 revision。 */
export function rollbackClassificationPolicy(
  revision: number,
  request: ClassificationPolicyRollbackRequest,
): Promise<ClassificationPolicyRollbackResult> {
  return api.post<
    ClassificationPolicyRollbackResult,
    ClassificationPolicyRollbackResult,
    ClassificationPolicyRollbackRequest
  >(`${CLASSIFICATION_API_BASE}/rollback/${encodeURIComponent(revision)}`, request, { feedback: 'silent' })
}

/** 从指定 HTTP 状态的标准错误 envelope 中安全提取结构化 data。 */
function getStructuredErrorData<T>(error: unknown, status: number, guard: (value: unknown) => value is T): T | null {
  if (!(error instanceof ApiRequestError) || error.status !== status) return null

  const payload = error.payload ?? error.response?.data
  if (!isApiResponse<T>(payload) || !guard(payload.data)) return null
  return payload.data
}

/** 判断未知值是否是 revision 冲突详情。 */
function isRevisionConflict(value: unknown): value is ClassificationRevisionConflict {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    record.code === 'classification_revision_conflict' &&
    typeof record.expected_revision === 'number' &&
    typeof record.current_revision === 'number'
  )
}

/** 判断未知值是否是完整的策略校验结果。 */
function isValidationResult(value: unknown): value is ClassificationValidationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.valid === 'boolean' && Array.isArray(record.issues)
}

/** 从 409 ApiRequestError 中读取并保留 revision 冲突详情。 */
export function getClassificationRevisionConflict(error: unknown): ClassificationRevisionConflict | null {
  return getStructuredErrorData(error, 409, isRevisionConflict)
}

/** 从 422 ApiRequestError 中读取并保留完整字段路径校验结果。 */
export function getClassificationValidationFailure(error: unknown): ClassificationValidationResult | null {
  return getStructuredErrorData(error, 422, isValidationResult)
}

/** 分类接口的 409 标准错误 envelope。 */
export type ClassificationRevisionConflictEnvelope = ApiResponse<ClassificationRevisionConflict>

/** 分类接口的 422 标准错误 envelope。 */
export type ClassificationValidationFailureEnvelope = ApiResponse<ClassificationValidationResult>

export type * from './mediaClassificationTypes'
