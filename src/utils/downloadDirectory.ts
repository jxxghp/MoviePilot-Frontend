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
