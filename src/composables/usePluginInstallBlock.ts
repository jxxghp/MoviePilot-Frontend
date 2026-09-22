import type { Plugin } from '@/api/types'

/** 阻止安装或更新的兼容性原因；与后端 check_plugin_install_compatibility 的判定顺序保持一致 */
export interface PluginInstallBlock {
  // 后端给出的用户可读原因，缺失时由 fallbackKey 兜底
  message?: string
  // 后端未给出原因时使用的本地文案 key
  fallbackKey: string
}

/**
 * 解析插件当前是否被兼容性判据挡住安装。
 *
 * 运行时判据先于主程序版本判据，否则 free-threaded（v3t）运行时下
 * "该插件不支持 v3t" 会被报成一条与版本有关的提示。
 *
 * @param plugin 市场或已安装插件条目
 * @returns 被挡住时返回原因，可安装时返回 null
 */
export function resolvePluginInstallBlock(plugin?: Plugin | null): PluginInstallBlock | null {
  if (plugin?.runtime_compatible === false)
    return { message: plugin.runtime_message, fallbackKey: 'plugin.incompatibleRuntime' }

  if (plugin?.system_version_compatible === false)
    return { message: plugin.system_version_message, fallbackKey: 'plugin.incompatibleSystemVersion' }

  return null
}
