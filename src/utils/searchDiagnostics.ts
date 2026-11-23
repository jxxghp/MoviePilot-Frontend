import type { SearchDiagnostics } from '@/api/types'

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === 'string')

/** 配置错误与普通资源不匹配不同，不能提示用户仅调整搜索条件。 */
export const ruleConfigurationWarningCodes = new Set(['rule_id_invalid', 'rule_id_missing', 'rule_syntax_invalid'])

/** 仅根据后端的配置诊断判断，不从保留数量推测规则故障。 */
export function hasRuleConfigurationError(diagnostics: SearchDiagnostics | null): boolean {
  return diagnostics?.warnings.some(warning => ruleConfigurationWarningCodes.has(warning.code)) ?? false
}

/** 校验可选诊断合同；旧后端、未知版本和损坏数据均不展示，扩展原因码交给界面通用文案。 */
export function normalizeSearchDiagnostics(value: unknown): SearchDiagnostics | null {
  if (
    !record(value) ||
    value.version !== 1 ||
    typeof value.search_id !== 'string' ||
    !value.search_id ||
    typeof value.scope !== 'string' ||
    !['page', 'search'].includes(value.scope) ||
    !record(value.stage_counts) ||
    !count(value.stage_counts.candidates) ||
    !count(value.stage_counts.retained) ||
    !Array.isArray(value.searched_sites) ||
    !Array.isArray(value.rejection_reasons) ||
    !Array.isArray(value.rule_groups) ||
    !Array.isArray(value.warnings)
  )
    return null

  if (
    !value.searched_sites.every(
      site =>
        record(site) &&
        (site.site_id === null || count(site.site_id)) &&
        typeof site.site_name === 'string' &&
        typeof site.attempted === 'boolean' &&
        typeof site.outcome === 'string' &&
        ['success', 'empty', 'error', 'cooldown', 'unknown'].includes(site.outcome) &&
        count(site.raw_count),
    )
  )
    return null
  if (
    !value.rejection_reasons.every(reason => record(reason) && typeof reason.code === 'string' && count(reason.count))
  )
    return null
  if (
    !value.rule_groups.every(
      group =>
        record(group) &&
        typeof group.name === 'string' &&
        typeof group.status === 'string' &&
        ['effective', 'skipped'].includes(group.status) &&
        (group.reason === null ||
          (typeof group.reason === 'string' &&
            ['rule_group_not_applicable', 'rule_group_missing'].includes(group.reason))) &&
        (group.media_type === null || typeof group.media_type === 'string') &&
        strings(group.categories),
    )
  )
    return null
  if (
    !value.warnings.every(
      warning =>
        record(warning) &&
        typeof warning.code === 'string' &&
        (warning.rule_group == null || typeof warning.rule_group === 'string') &&
        (warning.rule_ids === undefined || strings(warning.rule_ids)),
    )
  )
    return null

  return value as unknown as SearchDiagnostics
}
