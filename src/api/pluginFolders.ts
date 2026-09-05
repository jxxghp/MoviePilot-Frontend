import api from '@/api'

/** 插件文件夹的成员和可选展示配置。 */
export interface PluginFolderConfig {
  plugins: string[]
  order?: number
  background?: string
  icon?: string
  color?: string
  gradient?: string
  showIcon?: boolean
}

/** 插件文件夹增量展示配置请求。 */
export interface PluginFolderUpdateInput {
  new_name?: string
  background?: string
  icon?: string
  color?: string
  gradient?: string
  showIcon?: boolean
}

export type PluginFolderEntry = PluginFolderConfig | string[]
export type PluginFolderMap = Record<string, PluginFolderEntry>

/** 将插件文件夹响应收窄为兼容的新旧配置映射。 */
function normalizePluginFolders(value: unknown): PluginFolderMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  const folders: PluginFolderMap = {}
  Object.entries(value).forEach(([name, entry]) => {
    if (Array.isArray(entry)) {
      folders[name] = entry.filter((pluginId): pluginId is string => typeof pluginId === 'string')
      return
    }
    if (!entry || typeof entry !== 'object') return

    const config = entry as Partial<PluginFolderConfig>
    folders[name] = {
      ...config,
      plugins: Array.isArray(config.plugins)
        ? config.plugins.filter((pluginId): pluginId is string => typeof pluginId === 'string')
        : [],
    }
  })
  return folders
}

/** 查询完整的插件文件夹配置。 */
export async function listPluginFolders(): Promise<PluginFolderMap> {
  return normalizePluginFolders(await api.get('plugin/folders', { feedback: 'silent' }))
}

/** 创建一个空插件文件夹。 */
export async function createPluginFolder(folderName: string): Promise<void> {
  await api.post(`plugin/folders/${encodeURIComponent(folderName)}`, undefined, { feedback: 'silent' })
}

/** 增量更新插件文件夹名称或展示配置。 */
export async function updatePluginFolder(folderName: string, payload: PluginFolderUpdateInput): Promise<void> {
  await api.patch(`plugin/folders/${encodeURIComponent(folderName)}`, payload, { feedback: 'silent' })
}

/** 删除一个插件文件夹但不卸载其中插件。 */
export async function deletePluginFolder(folderName: string): Promise<void> {
  await api.delete(`plugin/folders/${encodeURIComponent(folderName)}`, { feedback: 'silent' })
}

/** 基于上次读取的成员顺序条件替换一个文件夹的插件列表。 */
export async function replacePluginFolderMembers(
  folderName: string,
  plugins: string[],
  expectedPlugins: string[],
): Promise<void> {
  await api.put(
    `plugin/folders/${encodeURIComponent(folderName)}/plugins`,
    { expected_plugins: expectedPlugins, plugins },
    { feedback: 'silent' },
  )
}

/** 把一个插件原子迁移到目标文件夹。 */
export async function assignPluginToFolder(folderName: string, pluginId: string): Promise<void> {
  await api.put(`plugin/folders/${encodeURIComponent(folderName)}/plugins/${encodeURIComponent(pluginId)}`, undefined, {
    feedback: 'silent',
  })
}

/** 从指定文件夹移除一个插件。 */
export async function removePluginFromFolder(folderName: string, pluginId: string): Promise<void> {
  await api.delete(`plugin/folders/${encodeURIComponent(folderName)}/plugins/${encodeURIComponent(pluginId)}`, {
    feedback: 'silent',
  })
}
