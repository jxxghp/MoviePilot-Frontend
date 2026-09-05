import api from '@/api'

/** 插件命令的安全只读元数据。 */
export interface PluginRuntimeCommandCapability {
  cmd: string
  desc?: string
  plugin_id?: string
}

/** 插件动作的安全只读元数据。 */
export interface PluginRuntimeActionCapability {
  id: string
  name?: string
}

/** 按插件归组的动作元数据。 */
export interface PluginRuntimeActionGroup {
  plugin_id?: string
  plugin_name?: string
  actions: PluginRuntimeActionCapability[]
}

/** 插件定时服务的安全只读元数据。 */
export interface PluginRuntimeServiceCapability {
  id: string
  name?: string
  trigger?: string
}

/** 插件运行时公开能力快照。 */
export interface PluginRuntimeCapabilities {
  commands: PluginRuntimeCommandCapability[]
  actions: PluginRuntimeActionGroup[]
  services: PluginRuntimeServiceCapability[]
}

/** 读取对象中的非空字符串字段。 */
function readText(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (typeof value !== 'string') return undefined
  return value.trim() || undefined
}

/** 把后端响应收窄为只包含安全展示字段的插件能力快照。 */
function normalizePluginRuntimeCapabilities(value: unknown): PluginRuntimeCapabilities {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const commands = Array.isArray(source.commands)
    ? source.commands.flatMap(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const record = item as Record<string, unknown>
        const cmd = readText(record, 'cmd')
        return cmd
          ? [
              {
                cmd,
                ...(readText(record, 'desc') ? { desc: readText(record, 'desc') } : {}),
                ...(readText(record, 'plugin_id') ? { plugin_id: readText(record, 'plugin_id') } : {}),
              },
            ]
          : []
      })
    : []
  const actions = Array.isArray(source.actions)
    ? source.actions.flatMap(group => {
        if (!group || typeof group !== 'object' || Array.isArray(group)) return []
        const record = group as Record<string, unknown>
        const items = Array.isArray(record.actions)
          ? record.actions.flatMap(item => {
              if (!item || typeof item !== 'object' || Array.isArray(item)) return []
              const action = item as Record<string, unknown>
              const id = readText(action, 'id')
              return id ? [{ id, ...(readText(action, 'name') ? { name: readText(action, 'name') } : {}) }] : []
            })
          : []
        if (!items.length) return []
        return [
          {
            actions: items,
            ...(readText(record, 'plugin_id') ? { plugin_id: readText(record, 'plugin_id') } : {}),
            ...(readText(record, 'plugin_name') ? { plugin_name: readText(record, 'plugin_name') } : {}),
          },
        ]
      })
    : []
  const services = Array.isArray(source.services)
    ? source.services.flatMap(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const record = item as Record<string, unknown>
        const id = readText(record, 'id')
        return id
          ? [
              {
                id,
                ...(readText(record, 'name') ? { name: readText(record, 'name') } : {}),
                ...(readText(record, 'trigger') ? { trigger: readText(record, 'trigger') } : {}),
              },
            ]
          : []
      })
    : []

  return { actions, commands, services }
}

/** 按插件 ID 查询运行中插件注册的安全能力元数据。 */
export async function getPluginRuntimeCapabilities(pluginId: string): Promise<PluginRuntimeCapabilities> {
  const result = await api.get<unknown>('plugin/runtime/capabilities', {
    feedback: 'silent',
    params: { plugin_id: pluginId },
  })
  return normalizePluginRuntimeCapabilities(result)
}

/** 通过有副作用语义正确的 POST 请求重新加载一个插件。 */
export async function reloadPluginRuntime(pluginId: string): Promise<void> {
  await api.post(`plugin/reload/${encodeURIComponent(pluginId)}`, undefined, { feedback: 'silent' })
}
