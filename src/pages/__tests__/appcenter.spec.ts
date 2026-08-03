import AppCenter from '@/pages/appcenter.vue'
import type { PluginSidebarNavItem } from '@/api/types'
import { usePluginSidebarNavStore } from '@/stores/pluginSidebarNav'
import { useUserStore } from '@/stores/user'
import { screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { server } from '@tests/support/msw/server'
import { http, HttpResponse } from 'msw'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'

const SIDEBAR_NAV_URL = 'http://localhost/api/v1/plugin/sidebar_nav'

const ListItemStub = defineComponent({
  name: 'VListItem',
  setup(_, { slots }) {
    return () => h('div', [slots.prepend?.(), slots.default?.(), slots.append?.()])
  },
})

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

function sidebarNavHandler(items: PluginSidebarNavItem[]) {
  return http.get(SIDEBAR_NAV_URL, () => HttpResponse.json(items))
}

async function renderAppCenter(items: PluginSidebarNavItem[], permissions: Record<string, unknown> = {}) {
  server.use(sidebarNavHandler(items))
  return renderWithProviders(AppCenter, {
    global: {
      stubs: {
        VListItem: ListItemStub,
      },
    },
    initialRoute: '/apps',
    initialState: {
      user: {
        permissions: {
          admin: false,
          discovery: true,
          features: {},
          manage: false,
          search: true,
          subscribe: true,
          ...permissions,
        },
        superUser: false,
      },
    },
    stubActions: false,
  })
}

describe('app center plugin navigation', () => {
  it('uses the shared category, admin and feature permission semantics', async () => {
    await renderAppCenter(
      [
        createNavItem({ permission: null, plugin_id: 'open', title: 'Open plugin' }),
        createNavItem({ permission: 'manage', plugin_id: 'category-denied', title: 'Category denied plugin' }),
        createNavItem({ permission: 'admin', plugin_id: 'admin-denied', title: 'Admin denied plugin' }),
        createNavItem({ permission: 'discovery', plugin_id: 'feature-denied', title: 'Feature denied plugin' }),
        createNavItem({ permission: 'discovery', plugin_id: 'allowed', title: 'Allowed plugin' }),
      ],
      {
        admin: true,
        discovery: true,
        features: {
          'plugin.allowed.main': true,
          'plugin.feature-denied.main': false,
        },
        manage: false,
      },
    )

    expect(await screen.findByText('Open plugin')).toBeInTheDocument()
    expect(screen.getByText('Allowed plugin')).toBeInTheDocument()
    expect(screen.queryByText('Category denied plugin')).not.toBeInTheDocument()
    expect(screen.queryByText('Admin denied plugin')).not.toBeInTheDocument()
    expect(screen.queryByText('Feature denied plugin')).not.toBeInTheDocument()

    const userStore = useUserStore()
    userStore.setPermissions({
      admin: true,
      discovery: true,
      features: {
        'plugin.allowed.main': true,
        'plugin.feature-denied.main': true,
      },
      manage: true,
      search: true,
      subscribe: true,
    })
    userStore.setSuperUser(true)

    await waitFor(() => {
      expect(screen.getByText('Category denied plugin')).toBeInTheDocument()
      expect(screen.getByText('Admin denied plugin')).toBeInTheDocument()
      expect(screen.getByText('Feature denied plugin')).toBeInTheDocument()
    })
  })

  it('updates an already mounted consumer after the shared snapshot is force-refreshed', async () => {
    await renderAppCenter([createNavItem({ plugin_id: 'old', title: 'Old plugin' })])
    expect(await screen.findByText('Old plugin')).toBeInTheDocument()

    server.use(sidebarNavHandler([createNavItem({ plugin_id: 'new', title: 'New plugin' })]))
    await usePluginSidebarNavStore().ensureSidebarNav(true)

    await waitFor(() => {
      expect(screen.getByText('New plugin')).toBeInTheDocument()
      expect(screen.queryByText('Old plugin')).not.toBeInTheDocument()
    })
  })
})
