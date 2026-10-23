import type { NavMenu } from '@/@layouts/types'

/** Dock 的已确定内部路由和图标，不把任意链接对象带入导航声明。 */
export type FooterMenu = NavMenu & { to: string; icon: string }

/** 网页 Dock 和原生 Tab 共用现有菜单优先级，输入必须先按权限过滤。
 */
export function buildFooterMenus(authorizedMenus: NavMenu[]): FooterMenu[] {
  const menus: FooterMenu[] = authorizedMenus
    .filter((menu): menu is NavMenu & { to: string } => typeof menu.to === 'string')
    .map(menu => ({ ...menu, icon: typeof menu.icon === 'string' ? menu.icon : 'mdi-apps' }))
  const preferred = menus.filter(menu => menu.footer === true)
  if (preferred.length >= 3) return preferred.slice(0, 3)
  const remaining = menus.filter(menu => menu.footer !== true && !preferred.some(item => item.to === menu.to))
  return [...preferred, ...remaining.slice(0, 3 - preferred.length)]
}
