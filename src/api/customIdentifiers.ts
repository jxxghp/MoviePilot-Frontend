import api from '@/api'

interface CustomIdentifiersResult {
  count?: number
  identifiers?: unknown
}

/** 将自定义识别词接口的未知集合收窄为有序字符串列表。 */
function normalizeCustomIdentifiers(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

/** 查询完整的自定义识别词有序列表。 */
export async function listCustomIdentifiers(): Promise<string[]> {
  const result = await api.get<CustomIdentifiersResult>('system/identifiers', { feedback: 'silent' })
  return normalizeCustomIdentifiers(result?.identifiers)
}

/** 基于上次读取的完整列表条件替换自定义识别词。 */
export async function replaceCustomIdentifiers(
  identifiers: string[],
  expectedIdentifiers: string[],
): Promise<string[]> {
  const result = await api.post<CustomIdentifiersResult>(
    'system/identifiers',
    {
      identifiers,
      expected_identifiers: expectedIdentifiers,
    },
    { feedback: 'silent' },
  )
  return Array.isArray(result?.identifiers) ? normalizeCustomIdentifiers(result.identifiers) : [...identifiers]
}
