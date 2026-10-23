import type { NavMenu } from '@/@layouts/types'

/** 将已过滤权限的内置与插件入口按现有应用中心规则分组，供网页与原生菜单共同消费。 */
export function groupAppMenus(menus: NavMenu[], pluginMenus: NavMenu[], fallbackHeader: string) {
  const grouped: Record<string, NavMenu[]> = {}
  for (const menu of [...menus.filter(item => !item.footer), ...pluginMenus]) {
    const header = menu.header || fallbackHeader
    ;(grouped[header] ??= []).push(menu)
  }
  return grouped
}
