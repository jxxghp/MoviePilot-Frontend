import AppCenter from '@/pages/appcenter.vue'
import type { PluginSidebarNavItem } from '@/api/types'
import { usePluginSidebarNavStore } from '@/stores/pluginSidebarNav'
import { useUserStore } from '@/stores/user'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { server } from '@tests/support/msw/server'
import { http } from 'msw'
import { apiJson } from '@tests/support/msw/response'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface DynamicButtonOptions {
  icon: string
  onClick: () => void
  show: { value: boolean }
}

const mocks = vi.hoisted(() => ({
  dynamicButtonOptions: null as DynamicButtonOptions | null,
}))

vi.mock('@/composables/useDynamicButton', () => ({
  useDynamicButton: (options: DynamicButtonOptions) => {
    mocks.dynamicButtonOptions = options
    return {}
  },
}))

vi.mock('@/composables/usePWA', async () => {
  const { computed } = await import('vue')
  return {
    usePWA: () => ({ appMode: computed(() => true) }),
  }
})

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
  return http.get(SIDEBAR_NAV_URL, () => apiJson(items))
}

function getDynamicButtonOptions() {
  if (!mocks.dynamicButtonOptions) throw new Error('动态搜索按钮尚未注册')
  return mocks.dynamicButtonOptions
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

beforeEach(() => {
  mocks.dynamicButtonOptions = null
})

describe('app center plugin navigation', () => {
  it('registers the app search button and filters both built-in and plugin entries', async () => {
    await renderAppCenter([createNavItem({ title: '插件入口' })])
    expect(await screen.findByText('搜索结果')).toBeInTheDocument()

    const dynamicButton = getDynamicButtonOptions()
    expect(dynamicButton.icon).toBe('mdi-magnify')
    expect(dynamicButton.show.value).toBe(true)
    expect(screen.queryByRole('textbox', { name: '搜索应用入口' })).not.toBeInTheDocument()

    dynamicButton.onClick()
    const searchInput = await screen.findByRole('textbox', { name: '搜索应用入口' })
    await waitFor(() => expect(searchInput).toHaveFocus())

    await fireEvent.update(searchInput, '搜索结果')
    expect(screen.getByText('搜索结果')).toBeInTheDocument()
    expect(screen.queryByText('插件入口')).not.toBeInTheDocument()

    await fireEvent.update(searchInput, '插件入口')
    expect(screen.getByText('插件入口')).toBeInTheDocument()
    expect(screen.queryByText('搜索结果')).not.toBeInTheDocument()
  })

  it('keeps permission filtering in search results and shows a localized empty state', async () => {
    await renderAppCenter([
      createNavItem({ permission: 'manage', plugin_id: 'hidden', title: '隐藏插件入口' }),
      createNavItem({ permission: null, plugin_id: 'visible', title: '可见插件入口' }),
    ])
    expect(await screen.findByText('搜索结果')).toBeInTheDocument()

    getDynamicButtonOptions().onClick()
    const searchInput = await screen.findByRole('textbox', { name: '搜索应用入口' })

    await fireEvent.update(searchInput, '插件入口')
    expect(screen.getByText('可见插件入口')).toBeInTheDocument()
    expect(screen.queryByText('隐藏插件入口')).not.toBeInTheDocument()

    await fireEvent.update(searchInput, '不存在的入口')
    expect(await screen.findByTestId('appcenter-no-results')).toHaveTextContent('没有找到匹配的应用入口')
    expect(screen.queryByText('可见插件入口')).not.toBeInTheDocument()
  })

  it('clears the query and exits search without losing the complete entry list', async () => {
    await renderAppCenter([createNavItem({ title: '插件入口' })])
    expect(await screen.findByText('搜索结果')).toBeInTheDocument()

    getDynamicButtonOptions().onClick()
    const searchInput = await screen.findByRole('textbox', { name: '搜索应用入口' })
    await fireEvent.update(searchInput, '插件入口')
    expect(screen.queryByText('搜索结果')).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: /^Clear/i }))
    await waitFor(() => {
      expect(screen.getByText('搜索结果')).toBeInTheDocument()
      expect(screen.getByText('插件入口')).toBeInTheDocument()
    })

    await fireEvent.click(screen.getByRole('button', { name: '退出应用搜索' }))
    expect(screen.queryByRole('textbox', { name: '搜索应用入口' })).not.toBeInTheDocument()
    expect(screen.getByText('搜索结果')).toBeInTheDocument()
    expect(screen.getByText('插件入口')).toBeInTheDocument()
  })

  it('keeps resource search and omits the standalone music search menu', async () => {
    await renderAppCenter([])

    expect(await screen.findByText('搜索结果')).toBeInTheDocument()
    expect(screen.queryByText('音乐搜索')).not.toBeInTheDocument()
  })

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
