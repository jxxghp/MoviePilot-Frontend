/** 分类体系支持的媒体类型。 */
export type ClassificationMediaType = '电影' | '电视剧' | '音乐'

/** 分类规则输出类型。 */
export type ClassificationRuleKind = 'category' | 'label'

/** 主分类规则求值模式。 */
export type ClassificationPolicyMode = 'first_match'

/** 分类前是否允许已登记数据源补充缺失的标准事实。 */
export type ClassificationEnrichmentMode = 'primary_only' | 'enrich_missing'

/** 数据源对分类字段的支持等级。 */
export type ClassificationSourceSupport = 'native' | 'derived' | 'partial' | 'extension' | 'unavailable'

/** 条件叶子支持的操作符。 */
export type ClassificationOperator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'contains_any'
  | 'contains_all'
  | 'contains_none'
  | 'is_true'
  | 'is_false'
  | 'exists'
  | 'not_exists'

/** 分类事实允许的 JSON 标量。 */
export type ClassificationFactScalar = string | number | boolean | null

/** 分类事实和条件值允许的形状。 */
export type ClassificationFactValue = ClassificationFactScalar | ClassificationFactScalar[]

/** 动态字段对应的输入控件和值语义。 */
export type ClassificationFieldValueType = 'string' | 'enum' | 'integer' | 'number' | 'year' | 'string_list' | 'boolean'

/** 分类结果的求值状态。 */
export type ClassificationResultState = 'complete' | 'partial' | 'not_evaluated' | 'invalid_policy'

/** 稳定分类定义。 */
export interface ClassificationCategory {
  id: string
  media_type: ClassificationMediaType
  name: string
  path: string[]
  enabled: boolean
  labels: string[]
}

/** 条件树叶子节点。 */
export interface ClassificationCondition {
  field: string
  operator: ClassificationOperator
  value?: ClassificationFactValue
}

/** 递归条件组，每个节点只能声明 all、any、not 中的一种。 */
export interface ClassificationConditionGroup {
  all?: ClassificationConditionNode[] | null
  any?: ClassificationConditionNode[] | null
  not?: ClassificationConditionNode | null
}

/** 条件树节点。 */
export type ClassificationConditionNode = ClassificationCondition | ClassificationConditionGroup

/** 规则命中后的主分类和标签输出。 */
export interface ClassificationTarget {
  category_id?: string | null
  labels: string[]
}

/** 全局有序的分类规则。 */
export interface ClassificationRule {
  id: string
  name: string
  kind: ClassificationRuleKind
  enabled: boolean
  priority: number
  media_types: ClassificationMediaType[]
  sources: string[]
  when: ClassificationConditionNode
  target: ClassificationTarget
}

/** 可版本化发布的完整分类策略。 */
export interface ClassificationPolicy {
  schema_version: 2
  revision: number
  mode: ClassificationPolicyMode
  enrichment_mode: ClassificationEnrichmentMode
  categories: ClassificationCategory[]
  rules: ClassificationRule[]
  fallbacks: Partial<Record<ClassificationMediaType, string>>
  source_fallbacks: Record<string, Partial<Record<ClassificationMediaType, string>>>
  field_aliases: Record<string, Record<string, string>>
  updated_at?: string | null
}

/** 活动策略及其有界历史快照。 */
export interface ClassificationPolicyState {
  active: ClassificationPolicy
  history: ClassificationPolicy[]
}

/** 分类事实中的稳定媒体身份。 */
export interface ClassificationIdentityFacts {
  media_source: string
  media_id: string
}

/** 电影、电视剧和音乐共享的标准事实。 */
export interface ClassificationMediaFacts {
  type: ClassificationMediaType
  title?: string | null
  year?: number | null
  language?: string | null
  countries?: string[] | null
  genre_keys?: string[] | null
  genre_names?: string[] | null
  adult?: boolean | null
  runtime?: number | null
  content_rating?: string | null
  companies?: string[] | null
  networks?: string[] | null
}

/** 音乐实体专用标准事实。 */
export interface ClassificationMusicFacts {
  entity_type?: string | null
  album_type?: string | null
  secondary_types?: string[] | null
  genres?: string[] | null
  tags?: string[] | null
  artists?: string[] | null
  artist_country?: string | null
  release_status?: string | null
}

/** 单个标准事实的可信数据源和提供者来源。 */
export interface ClassificationFactSource {
  media_source: string
  provider_id: string
  provider_name: string
}

/** 规则求值器使用的完整标准事实。 */
export interface ClassificationFacts {
  identity: ClassificationIdentityFacts
  media: ClassificationMediaFacts
  music?: ClassificationMusicFacts | null
  extensions: Record<string, Record<string, ClassificationFactValue>>
  field_sources: Record<string, ClassificationFactSource>
}

/** 推荐或最终生效的分类选择快照。 */
export interface ClassificationSelection {
  category_id?: string | null
  category_path: string[]
  rule_id?: string | null
  source?: string | null
}

/** 分类求值产生的推荐、生效结果和状态。 */
export interface ClassificationResult {
  recommended?: ClassificationSelection | null
  effective?: ClassificationSelection | null
  labels: string[]
  policy_revision: number
  state: ClassificationResultState
}

/** 单个条件叶子的求值记录。 */
export interface ClassificationConditionTrace {
  field: string
  operator: ClassificationOperator
  expected?: ClassificationFactValue
  actual?: ClassificationFactValue
  matched: boolean
  path: (string | number)[]
  source?: ClassificationFactSource | null
}

/** 单条规则及其条件求值记录。 */
export interface ClassificationRuleTrace {
  rule_id: string
  matched: boolean
  conditions: ClassificationConditionTrace[]
}

/** 预览中的结构化事实缺失或来源提示。 */
export interface ClassificationEvaluationWarning {
  code: string
  message: string
  path: (string | number)[]
  field?: string | null
  source?: string | null
}

/** 分类预览的事实、结果和命中解释。 */
export interface ClassificationEvaluation {
  facts: ClassificationFacts
  result: ClassificationResult
  trace: ClassificationRuleTrace[]
  warnings: ClassificationEvaluationWarning[]
}

/** 动态枚举字段的稳定值和显示文本。 */
export interface ClassificationFieldOption {
  value: ClassificationFactScalar
  label: string
}

/** 动态条件编辑器使用的字段能力目录项。 */
export interface ClassificationFieldDefinition {
  id: string
  label: string
  group: string
  description?: string | null
  value_type: ClassificationFieldValueType
  operators: ClassificationOperator[]
  media_types: ClassificationMediaType[]
  options: ClassificationFieldOption[]
  allow_custom_values: boolean
  source_support: Record<string, ClassificationSourceSupport>
  selectable?: boolean
  replacement_field?: string | null
}

/** 策略编辑器必须遵守的服务端结构限制。 */
export interface ClassificationPolicyLimits {
  max_category_depth: number
  max_category_segment_length: number
  max_category_path_length: number
  max_condition_depth: number
  max_conditions_per_rule: number
  max_rules: number
  max_total_conditions: number
}

/** 标准字段、扩展字段和服务端限制目录。 */
export interface ClassificationFieldCatalog {
  fields: ClassificationFieldDefinition[]
  retired_fields?: ClassificationFieldDefinition[]
  limits: ClassificationPolicyLimits
}

/** 单条策略校验错误或警告。 */
export interface ClassificationValidationIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  path: (string | number)[]
}

/** 完整策略校验结果。 */
export interface ClassificationValidationResult {
  valid: boolean
  issues: ClassificationValidationIssue[]
}

/** CAS 发布完整策略的请求。 */
export interface ClassificationPolicyPublishRequest {
  expected_revision: number
  policy: ClassificationPolicy
}

/** 回滚历史策略的 CAS 请求。 */
export interface ClassificationPolicyRollbackRequest {
  expected_revision: number
}

/** 仅校验完整策略草稿的请求。 */
export interface ClassificationPolicyValidateRequest {
  policy: ClassificationPolicy
}

/** 由调用方直接提供标准事实的预览输入。 */
export interface ClassificationFactsPreviewInput {
  kind: 'facts'
  facts: ClassificationFacts
}

/** 当前后端支持的可判别预览输入。 */
export type ClassificationPreviewInput = ClassificationFactsPreviewInput

/** 使用活动策略或未发布草稿执行预览的请求。 */
export interface ClassificationPreviewRequest {
  input: ClassificationPreviewInput
  policy?: ClassificationPolicy | null
}

/** 比较活动策略与草稿的有界影响分析请求。 */
export interface ClassificationImpactRequest {
  expected_revision: number
  policy: ClassificationPolicy
  sample_limit?: number
  example_limit?: number
  samples?: ClassificationFacts[]
}

/** 单个样本在两版策略之间的分类变化。 */
export interface ClassificationImpactChange {
  identity: ClassificationIdentityFacts
  media_type: ClassificationMediaType
  title?: string | null
  changed_fields: string[]
  previous: ClassificationResult
  candidate: ClassificationResult
}

/** 按媒体类型和数据源聚合的影响统计。 */
export interface ClassificationImpactGroup {
  media_type: ClassificationMediaType
  media_source: string
  sampled: number
  changed: number
  degraded: number
}

/** 有边界的近期样本分类影响统计。 */
export interface ClassificationImpactAnalysis {
  estimated: true
  sampled_at: string
  sample_source: 'request' | 'recent_history'
  baseline_revision: number
  candidate_revision: number
  requested_limit: number
  scanned_count: number
  skipped_count: number
  truncated: boolean
  sample_count: number
  changed_count: number
  unchanged_count: number
  category_changed_count: number
  path_only_changed_count: number
  rule_changed_only_count: number
  became_fallback_count: number
  partial_count: number
  degraded_count: number
  previous_categories: Record<string, number>
  candidate_categories: Record<string, number>
  groups: ClassificationImpactGroup[]
  changes: ClassificationImpactChange[]
  warnings: string[]
}

/** 发布、影响分析或回滚遇到的 revision 冲突。 */
export interface ClassificationRevisionConflict {
  code: 'classification_revision_conflict'
  expected_revision: number
  current_revision: number
}

/** 当前 revision 与有界历史完整策略列表。 */
export interface ClassificationPolicyHistory {
  active_revision: number
  items: ClassificationPolicy[]
}

/** 历史内容被发布为新 revision 后的结果。 */
export interface ClassificationPolicyRollbackResult {
  restored_from_revision: number
  policy: ClassificationPolicy
}

/** 分类接口可保留在错误 envelope 中的结构化业务数据。 */
export type ClassificationStructuredErrorData = ClassificationRevisionConflict | ClassificationValidationResult
