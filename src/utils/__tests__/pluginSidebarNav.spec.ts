import type { PluginSidebarNavItem } from '@/api/types'
import { filterPluginSidebarNavEntries, navMenuFromPluginSidebarItem } from '@/utils/pluginSidebarNav'
import type { Composer } from 'vue-i18n'
import { describe, expect, it } from 'vitest'

const t = ((key: string) => key) as Composer['t']

function createNavItem(overrides: Partial<PluginSidebarNavItem> = {}): PluginSidebarNavItem {
  return {
    icon: 'mdi-puzzle-outline',
    nav_key: 'main',
    order: 1,
    plugin_id: 'demo',
    section: 'system',
    title: 'Demo',
    ...overrides,
  }
}

describe('plugin sidebar navigation utilities', () => {
  it('projects stable route params, permission and feature keys into a shared menu entry', () => {
    const menu = navMenuFromPluginSidebarItem(
      createNavItem({ nav_key: 'settings', permission: 'manage', plugin_id: 'workflow' }),
      t,
    )

    expect(menu).toMatchObject({
      feature: 'plugin.workflow.settings',
      header: 'menu.system',
      permission: 'manage',
      to: {
        name: 'plugin-app',
        params: { navKey: 'settings', pluginId: 'workflow' },
      },
    })
  })

  it('defaults an omitted section to system without adding a category permission', () => {
    const item = {
      icon: 'mdi-puzzle-outline',
      nav_key: 'main',
      order: 1,
      permission: null,
      plugin_id: 'demo',
      title: 'Demo',
    } satisfies Omit<PluginSidebarNavItem, 'section'>

    const [entry] = filterPluginSidebarNavEntries([item as PluginSidebarNavItem], t, {
      features: {},
    })

    expect(entry.section).toBe('system')
    expect(entry.navMenu.header).toBe('menu.system')
    expect(entry.navMenu.permission).toBeUndefined()
  })

  it('applies category, admin and feature denials through the shared permission filter', () => {
    const entries = filterPluginSidebarNavEntries(
      [
        createNavItem({ permission: null, plugin_id: 'open', title: 'Open' }),
        createNavItem({ permission: 'manage', plugin_id: 'category-denied', title: 'Category denied' }),
        createNavItem({ permission: 'admin', plugin_id: 'admin-denied', title: 'Admin denied' }),
        createNavItem({ permission: 'discovery', plugin_id: 'feature-denied', title: 'Feature denied' }),
        createNavItem({ permission: 'discovery', plugin_id: 'allowed', title: 'Allowed' }),
      ],
      t,
      {
        admin: true,
        discovery: true,
        features: {
          'plugin.allowed.main': true,
          'plugin.feature-denied.main': false,
        },
        is_superuser: false,
        manage: false,
      },
    )

    expect(entries.map(entry => entry.navMenu.title)).toEqual(['Open', 'Allowed'])
  })

  it('keeps the declared section for layout placement independently of its translated header', () => {
    const [entry] = filterPluginSidebarNavEntries(
      [createNavItem({ plugin_id: 'discover-demo', section: 'discovery' })],
      t,
      { discovery: true, features: {} },
    )

    expect(entry.section).toBe('discovery')
    expect(entry.navMenu.header).toBe('menu.discovery')
  })
})
