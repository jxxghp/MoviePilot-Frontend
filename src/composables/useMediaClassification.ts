import { computed, readonly, ref } from 'vue'
import { cloneDeep, isEqual } from 'lodash-es'
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
  type ClassificationEvaluation,
  type ClassificationFacts,
  type ClassificationFieldCatalog,
  type ClassificationImpactAnalysis,
  type ClassificationPolicy,
  type ClassificationPolicyHistory,
  type ClassificationPolicyRollbackResult,
  type ClassificationPreviewInput,
  type ClassificationRevisionConflict,
  type ClassificationValidationResult,
} from '@/api/mediaClassification'
import { normalizeClassificationPolicy } from '@/utils/mediaClassification'

/** 分类影响分析的可选采样参数。 */
export interface ClassificationImpactOptions {
  policy?: ClassificationPolicy
  sampleLimit?: number
  exampleLimit?: number
  samples?: ClassificationFacts[]
}

/** 分类预览可显式选择草稿策略或活动策略。 */
export interface ClassificationPreviewOptions {
  /** undefined 使用当前草稿，null 使用服务端活动策略。 */
  policy?: ClassificationPolicy | null
}

let fieldCatalogCache: ClassificationFieldCatalog | null = null
let fieldCatalogPromise: Promise<ClassificationFieldCatalog> | null = null
let fieldCatalogEpoch = 0

/** 清除共享字段目录缓存，供插件字段注册变化或测试隔离时显式刷新。 */
export function clearMediaClassificationFieldCatalogCache(): void {
  fieldCatalogEpoch += 1
  fieldCatalogCache = null
  fieldCatalogPromise = null
}

/** 读取共享字段目录，并隔离每个调用方拿到的可变对象。 */
async function resolveFieldCatalog(force: boolean): Promise<ClassificationFieldCatalog> {
  if (!force && fieldCatalogCache) return cloneDeep(fieldCatalogCache)
  if (!force && fieldCatalogPromise) return cloneDeep(await fieldCatalogPromise)

  if (force) clearMediaClassificationFieldCatalogCache()
  const requestEpoch = fieldCatalogEpoch
  const request = getClassificationFields()
    .then(catalog => {
      const snapshot = cloneDeep(catalog)
      if (requestEpoch === fieldCatalogEpoch) fieldCatalogCache = snapshot
      return cloneDeep(snapshot)
    })
    .finally(() => {
      if (fieldCatalogPromise === request) fieldCatalogPromise = null
    })

  fieldCatalogPromise = request
  return request
}

/**
 * 管理媒体分类策略的活动快照、可编辑草稿和全部只读分析操作。
 *
 * 活动策略始终与草稿深拷贝隔离；刷新只在草稿干净时同步草稿，避免后台刷新覆盖未保存编辑。
 */
export function useMediaClassification() {
  const activePolicyState = ref<ClassificationPolicy | null>(null)
  const draftPolicy = ref<ClassificationPolicy | null>(null)
  const fieldCatalogState = ref<ClassificationFieldCatalog | null>(null)
  const historyState = ref<ClassificationPolicyHistory | null>(null)
  const validationState = ref<ClassificationValidationResult | null>(null)
  const previewState = ref<ClassificationEvaluation | null>(null)
  const impactState = ref<ClassificationImpactAnalysis | null>(null)
  const conflictState = ref<ClassificationRevisionConflict | null>(null)
  const lastError = ref<unknown>(null)

  const loadingPolicy = ref(false)
  const loadingFields = ref(false)
  const loadingHistory = ref(false)
  const validating = ref(false)
  const previewing = ref(false)
  const analyzingImpact = ref(false)
  const publishing = ref(false)
  const rollingBack = ref(false)

  const activeRevision = computed(() => activePolicyState.value?.revision ?? 0)
  const isDirty = computed(() => {
    if (!draftPolicy.value) return false
    if (!activePolicyState.value) return true
    return !isEqual(draftPolicy.value, activePolicyState.value)
  })

  /** 返回当前草稿；未加载策略时拒绝执行依赖草稿的操作。 */
  function requireDraft(): ClassificationPolicy {
    if (!draftPolicy.value) throw new Error('分类策略草稿尚未加载')
    return draftPolicy.value
  }

  /** 返回活动策略；未加载策略时拒绝 CAS 写操作。 */
  function requireActive(): ClassificationPolicy {
    if (!activePolicyState.value) throw new Error('活动分类策略尚未加载')
    return activePolicyState.value
  }

  /** 记录结构化冲突或校验错误，同时保留原始异常供 UI 决定提示方式。 */
  function captureError(error: unknown): void {
    lastError.value = error
    const conflict = getClassificationRevisionConflict(error)
    if (conflict) conflictState.value = cloneDeep(conflict)
    const validation = getClassificationValidationFailure(error)
    if (validation) validationState.value = cloneDeep(validation)
  }

  /** 应用服务端活动快照，并按调用语义决定是否同步草稿。 */
  function applyActivePolicy(policy: ClassificationPolicy, preserveDirtyDraft: boolean): void {
    const normalizedPolicy = normalizeClassificationPolicy(policy)
    activePolicyState.value = cloneDeep(normalizedPolicy)
    if (!preserveDirtyDraft || !draftPolicy.value) draftPolicy.value = cloneDeep(normalizedPolicy)
  }

  /** 刷新活动策略；响应到达时若草稿已脏则只更新活动快照。 */
  async function refreshPolicy(): Promise<ClassificationPolicy> {
    loadingPolicy.value = true
    lastError.value = null
    try {
      const policy = await getClassificationPolicy()
      const preserveDirtyDraft = isDirty.value
      applyActivePolicy(policy, preserveDirtyDraft)
      conflictState.value = null
      return normalizeClassificationPolicy(policy)
    } catch (error) {
      captureError(error)
      throw error
    } finally {
      loadingPolicy.value = false
    }
  }

  /** 读取字段目录；默认复用跨组件缓存，force=true 时重新请求。 */
  async function loadFields(force = false): Promise<ClassificationFieldCatalog> {
    loadingFields.value = true
    lastError.value = null
    try {
      const catalog = await resolveFieldCatalog(force)
      fieldCatalogState.value = cloneDeep(catalog)
      return cloneDeep(catalog)
    } catch (error) {
      captureError(error)
      throw error
    } finally {
      loadingFields.value = false
    }
  }

  /** 读取有界策略历史。 */
  async function loadHistory(): Promise<ClassificationPolicyHistory> {
    loadingHistory.value = true
    lastError.value = null
    try {
      const history = await getClassificationHistory()
      historyState.value = cloneDeep(history)
      return cloneDeep(history)
    } catch (error) {
      captureError(error)
      throw error
    } finally {
      loadingHistory.value = false
    }
  }

  /** 使用服务端真实字段目录校验指定策略或当前草稿。 */
  async function validateDraft(policy: ClassificationPolicy = requireDraft()): Promise<ClassificationValidationResult> {
    validating.value = true
    lastError.value = null
    validationState.value = null
    try {
      const result = await validateClassificationPolicy({ policy: normalizeClassificationPolicy(policy) })
      validationState.value = cloneDeep(result)
      return cloneDeep(result)
    } catch (error) {
      captureError(error)
      throw error
    } finally {
      validating.value = false
    }
  }

  /** 对显式事实执行当前草稿预览；policy=null 时预览服务端活动策略。 */
  async function preview(
    input: ClassificationPreviewInput,
    options: ClassificationPreviewOptions = {},
  ): Promise<ClassificationEvaluation> {
    previewing.value = true
    lastError.value = null
    previewState.value = null
    try {
      const selectedPolicy = options.policy === null ? null : (options.policy ?? requireDraft())
      const result = await previewClassificationPolicy({
        input: cloneDeep(input),
        ...(selectedPolicy ? { policy: normalizeClassificationPolicy(selectedPolicy) } : {}),
      })
      previewState.value = cloneDeep(result)
      return cloneDeep(result)
    } catch (error) {
      captureError(error)
      throw error
    } finally {
      previewing.value = false
    }
  }

  /** 比较活动 revision 和当前草稿，并保存有界影响分析结果。 */
  async function analyzeImpact(options: ClassificationImpactOptions = {}): Promise<ClassificationImpactAnalysis> {
    analyzingImpact.value = true
    lastError.value = null
    impactState.value = null
    conflictState.value = null
    try {
      const active = requireActive()
      const policy = options.policy ?? requireDraft()
      const result = await analyzeClassificationImpact({
        expected_revision: active.revision,
        policy: normalizeClassificationPolicy(policy),
        ...(options.sampleLimit === undefined ? {} : { sample_limit: options.sampleLimit }),
        ...(options.exampleLimit === undefined ? {} : { example_limit: options.exampleLimit }),
        ...(options.samples === undefined ? {} : { samples: cloneDeep(options.samples) }),
      })
      impactState.value = cloneDeep(result)
      return cloneDeep(result)
    } catch (error) {
      captureError(error)
      throw error
    } finally {
      analyzingImpact.value = false
    }
  }

  /** 以活动 revision 发布当前草稿，并用服务端返回的新版本重建快照和草稿。 */
  async function publishDraft(): Promise<ClassificationPolicy> {
    publishing.value = true
    lastError.value = null
    conflictState.value = null
    validationState.value = null
    try {
      const active = requireActive()
      const policy = await publishClassificationPolicy({
        expected_revision: active.revision,
        policy: normalizeClassificationPolicy(requireDraft()),
      })
      applyActivePolicy(policy, false)
      historyState.value = null
      previewState.value = null
      impactState.value = null
      return cloneDeep(policy)
    } catch (error) {
      captureError(error)
      throw error
    } finally {
      publishing.value = false
    }
  }

  /** 回滚历史内容为新 revision；已有未保存草稿不会被回滚响应覆盖。 */
  async function rollback(revision: number): Promise<ClassificationPolicyRollbackResult> {
    rollingBack.value = true
    lastError.value = null
    conflictState.value = null
    validationState.value = null
    try {
      const active = requireActive()
      const preserveDirtyDraft = isDirty.value
      const result = await rollbackClassificationPolicy(revision, {
        expected_revision: active.revision,
      })
      applyActivePolicy(result.policy, preserveDirtyDraft)
      historyState.value = null
      previewState.value = null
      impactState.value = null
      return cloneDeep(result)
    } catch (error) {
      captureError(error)
      throw error
    } finally {
      rollingBack.value = false
    }
  }

  /** 用指定策略替换可编辑草稿，不修改活动快照。 */
  function replaceDraft(policy: ClassificationPolicy): void {
    draftPolicy.value = normalizeClassificationPolicy(policy)
    validationState.value = null
    previewState.value = null
    impactState.value = null
    conflictState.value = null
  }

  /** 放弃未保存编辑并从当前活动快照重建草稿。 */
  function resetDraft(): void {
    const active = requireActive()
    replaceDraft(active)
  }

  /** 并行加载首屏必需的活动策略和动态字段目录。 */
  async function initialize(): Promise<void> {
    await Promise.all([refreshPolicy(), loadFields()])
  }

  return {
    activePolicy: readonly(activePolicyState),
    draftPolicy,
    fieldCatalog: readonly(fieldCatalogState),
    history: readonly(historyState),
    validationResult: readonly(validationState),
    previewResult: readonly(previewState),
    impactResult: readonly(impactState),
    conflict: readonly(conflictState),
    lastError: readonly(lastError),
    activeRevision,
    isDirty,
    loadingPolicy: readonly(loadingPolicy),
    loadingFields: readonly(loadingFields),
    loadingHistory: readonly(loadingHistory),
    validating: readonly(validating),
    previewing: readonly(previewing),
    analyzingImpact: readonly(analyzingImpact),
    publishing: readonly(publishing),
    rollingBack: readonly(rollingBack),
    initialize,
    refreshPolicy,
    loadFields,
    loadHistory,
    validateDraft,
    preview,
    analyzeImpact,
    publishDraft,
    rollback,
    replaceDraft,
    resetDraft,
  }
}
