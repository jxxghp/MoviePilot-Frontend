import type { DownloadDirectory } from '@/api/types'

/** 下载目录下拉项：标题展示「别名 (路径)」，值始终是可直接提交给接口的路径。 */
export interface DownloadDirectoryOption {
  title: string
  value: string
}

/** 取路径的字段：下载弹窗用 save_path，订阅弹窗沿用历史的 download_path。 */
export type DownloadDirectoryPathField = 'save_path' | 'download_path'

/**
 * 把下载目录配置转换为下拉项。
 * 按路径去重并保持后端返回顺序（即 priority 顺序）；同一路径的多个别名用 " / " 合并，没有别名的目录只显示路径；别名与路径相同时不重复显示。
 */
export function buildDownloadDirectoryOptions(
  directories: DownloadDirectory[],
  pathField: DownloadDirectoryPathField = 'save_path',
): DownloadDirectoryOption[] {
  const namesByPath = new Map<string, string[]>()
  for (const directory of directories) {
    const path = directory[pathField]?.trim()
    if (!path) continue
    const names = namesByPath.get(path) ?? []
    namesByPath.set(path, names)
    const name = directory.name?.trim()
    if (name && name !== path && !names.includes(name)) names.push(name)
  }
  return [...namesByPath.entries()].map(([path, names]) => ({
    title: names.length ? `${names.join(' / ')} (${path})` : path,
    value: path,
  }))
}

/** VCombobox 选中选项时回传整个对象、自由输入时回传字符串，统一归一为可提交的路径字符串。 */
export function toDownloadDirectoryValue(value: string | DownloadDirectoryOption | null | undefined): string | null {
  if (value == null) return null
  return typeof value === 'string' ? value : value.value
}

/** VCombobox 自定义过滤：按「别名 (路径)」标签匹配，而不是只按作为 title 的路径匹配。 */
export function filterDownloadDirectoryOption(_value: string, query: string, item?: { raw?: unknown }): boolean {
  const label = (item?.raw as Partial<DownloadDirectoryOption> | undefined)?.title ?? ''
  return label.toLowerCase().includes(query.trim().toLowerCase())
}
