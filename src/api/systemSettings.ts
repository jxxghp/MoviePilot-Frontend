import api from '@/api'

/** 系统设置的稳定定义信息。 */
export interface SystemSettingDefinition {
  declared_type: string
  default_match_field?: string | null
  nullable: boolean
  persistence: string
  sensitive: boolean
  update_operations: string[]
  value_shape: string
}

/** 单个已登记系统设置及其安全查询元数据。 */
export interface SystemSettingItem<T = unknown> {
  definition: SystemSettingDefinition
  group: string
  has_value: boolean
  label: string
  redacted: boolean
  setting_key: string
  source: string
  value?: T
  value_type: string
}

interface SystemSettingsQueryResult<T> {
  include_values: boolean
  matched_count: number
  settings: SystemSettingItem<T>[]
  show_secrets: boolean
}

/** 精确查询一个已登记设置，默认接受后端的敏感值脱敏策略。 */
export async function getSystemSetting<T = unknown>(settingKey: string): Promise<SystemSettingItem<T> | null> {
  const result = await api.get<SystemSettingsQueryResult<T>>('system/settings', {
    feedback: 'silent',
    params: { setting_key: settingKey },
  })
  if (!result || !Array.isArray(result.settings)) return null
  return result.settings.find(item => item?.setting_key === settingKey) ?? null
}
