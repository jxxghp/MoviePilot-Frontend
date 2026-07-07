import type { Composer } from 'vue-i18n'
import type { NavMenu } from '@/@layouts/types'
import type { PluginSidebarNavItem } from '@/api/types'
import { pluginSidebarSectionToHeaderKey } from '@/router/i18n-menu'
import { buildPluginPermissionFeatureKey, filterMenusByPermission } from '@/utils/permission'

export type PluginNavMenuEntry = {
  navMenu: NavMenu & { permission?: string }
  section: string
}

/**
 * 将后端 sidebar_nav 单项转为侧栏 / 应用中心 共用的 NavMenu
 */
export function navMenuFromPluginSidebarItem(
  item: PluginSidebarNavItem,
  t: Composer['t'],
): NavMenu & { permission?: string } {
  const section = item.section || 'system'
  const header = pluginSidebarSectionToHeaderKey(section, t)
  return {
    title: item.title,
    icon: item.icon,
    iconColor: 'primary',
    to: {
      name: 'plugin-app',
      params: {
        pluginId: item.plugin_id,
        navKey: item.nav_key,
      },
    },
    header,
    permission: item.permission ?? undefined,
    feature: buildPluginPermissionFeatureKey(item.plugin_id, item.nav_key),
  } as NavMenu & { permission?: string }
}

/**
 * 过滤有权限的插件导航项，并保留 section 供 DefaultLayout 分栏插入
 */
export function filterPluginSidebarNavEntries(
  items: PluginSidebarNavItem[],
  t: Composer['t'],
  userPermissions: Record<string, unknown>,
): PluginNavMenuEntry[] {
  const out: PluginNavMenuEntry[] = []
  for (const item of items) {
    const section = item.section || 'system'
    const navMenu = navMenuFromPluginSidebarItem(item, t)
    if (!filterMenusByPermission([navMenu], userPermissions).length) {
      continue
    }
    out.push({ navMenu, section })
  }
  return out
}
