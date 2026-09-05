import api from '@/api'

export type PluginDataValueType = 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object' | 'unknown'

/** 单个插件持久化键的不含值摘要。 */
export interface PluginDataKeySummary {
  key: string
  value_type: PluginDataValueType
  serialized_chars: number | null
  sensitive: boolean
}

/** 插件持久化数据的不含原值诊断摘要。 */
export interface PluginDataSummary {
  plugin_id: string
  plugin_name?: string
  plugin_version?: string
  state?: boolean
  count: number
  total_chars: number
  keys: PluginDataKeySummary[]
  keys_truncated: boolean
}

const valueTypes = new Set<PluginDataValueType>(['null', 'boolean', 'number', 'string', 'array', 'object', 'unknown'])

/** 读取对象中的非空字符串字段。 */
function readText(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** 读取非负有限数值，否则使用回退值。 */
function readCount(record: Record<string, unknown>, key: string, fallback = 0): number {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

/** 将后端摘要再次收窄为前端允许展示的字段集合。 */
function normalizePluginDataSummary(value: unknown, fallbackPluginId: string): PluginDataSummary {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const keys = Array.isArray(source.keys)
    ? source.keys.flatMap(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const record = item as Record<string, unknown>
        const key = readText(record, 'key')
        const rawType = readText(record, 'value_type') as PluginDataValueType | undefined
        if (!key || !rawType || !valueTypes.has(rawType)) return []
        const rawChars = record.serialized_chars
        const serializedChars =
          typeof rawChars === 'number' && Number.isFinite(rawChars) && rawChars >= 0 ? rawChars : null
        return [
          {
            key,
            value_type: rawType,
            serialized_chars: serializedChars,
            sensitive: record.sensitive === true,
          },
        ]
      })
    : []

  return {
    plugin_id: readText(source, 'plugin_id') || fallbackPluginId,
    ...(readText(source, 'plugin_name') ? { plugin_name: readText(source, 'plugin_name') } : {}),
    ...(readText(source, 'plugin_version') ? { plugin_version: readText(source, 'plugin_version') } : {}),
    ...(typeof source.state === 'boolean' ? { state: source.state } : {}),
    count: readCount(source, 'count', keys.length),
    total_chars: readCount(source, 'total_chars'),
    keys,
    keys_truncated: source.keys_truncated === true,
  }
}

/** 查询一个插件不包含持久化原值的数据诊断摘要。 */
export async function getPluginDataSummary(pluginId: string): Promise<PluginDataSummary> {
  const result = await api.get<unknown>(`plugin/runtime/${encodeURIComponent(pluginId)}/data/summary`, {
    feedback: 'silent',
  })
  return normalizePluginDataSummary(result, pluginId)
}
