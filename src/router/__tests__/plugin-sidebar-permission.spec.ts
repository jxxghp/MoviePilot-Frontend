import type { PluginSidebarNavItem } from '@/api/types'
import '@/router'
import { useAuthStore } from '@/stores/auth'
import { usePluginSidebarNavStore } from '@/stores/pluginSidebarNav'
import { useUserStore } from '@/stores/user'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type NavigationGuard = (
  to: Record<string, unknown>,
  from: Record<string, unknown>,
  next: ReturnType<typeof vi.fn>,
) => Promise<void>

const routerMocks = vi.hoisted(() => ({
  getInitializationState: vi.fn(),
  guard: undefined as NavigationGuard | undefined,
  next: vi.fn(),
  push: vi.fn(),
  setRequestNavigatingState: vi.fn(),
}))

vi.mock('vue-router', () => ({
  createRouter: () => ({
    afterEach: vi.fn(),
    beforeEach: (guard: NavigationGuard) => {
      routerMocks.guard = guard
    },
    push: routerMocks.push,
  }),
  createWebHashHistory: vi.fn(),
}))

vi.mock('@/api/nprogress', () => ({
  configureNProgress: vi.fn(),
}))

vi.mock('@/utils/initialization', () => ({
  getInitializationState: routerMocks.getInitializationState,
}))

vi.mock('@/utils/requestOptimizer', () => ({
  abortAllRequests: vi.fn(),
  initializeRequestOptimizer: vi.fn(),
  setNavigatingState: routerMocks.setRequestNavigatingState,
}))

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

async function runGuard(path: string, pluginId: string, navKey: string) {
  await routerMocks.guard?.(
    {
      fullPath: path,
      meta: { requiresAuth: true },
      name: 'plugin-app',
      params: { navKey, pluginId },
      path,
    },
    {},
    routerMocks.next,
  )
}

describe('plugin sidebar route permission', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAuthStore().login({ remember: false, token: 'test-token' })
    routerMocks.getInitializationState.mockReset()
    routerMocks.getInitializationState.mockResolvedValue(true)
    routerMocks.next.mockReset()
  })

  it('matches menu feature denial and preserves undeclared deep-link compatibility', async () => {
    const userStore = useUserStore()
    const sidebarStore = usePluginSidebarNavStore()
    userStore.setPermissions({
      discovery: true,
      features: { 'plugin.demo.settings': false },
    })
    sidebarStore.$patch({
      items: [createNavItem({ nav_key: 'settings', permission: 'discovery' })],
      loaded: true,
    })

    await runGuard('/plugin-app/demo/settings', 'demo', 'settings')
    expect(routerMocks.next).toHaveBeenLastCalledWith('/apps')

    routerMocks.next.mockClear()
    sidebarStore.$patch({
      items: [createNavItem({ nav_key: 'settings', permission: 'manage' })],
      loaded: true,
    })
    userStore.setPermissions({
      discovery: true,
      features: { 'plugin.demo.settings': true },
      manage: false,
      search: true,
      subscribe: true,
    })
    await runGuard('/plugin-app/demo/settings', 'demo', 'settings')
    expect(routerMocks.next).toHaveBeenLastCalledWith('/apps')

    routerMocks.next.mockClear()
    sidebarStore.$patch({
      items: [createNavItem({ nav_key: 'settings', permission: 'admin' })],
      loaded: true,
    })
    userStore.setPermissions({
      admin: true,
      discovery: true,
      features: { 'plugin.demo.settings': true },
      manage: true,
      search: true,
      subscribe: true,
    })
    userStore.setSuperUser(false)
    await runGuard('/plugin-app/demo/settings', 'demo', 'settings')
    expect(routerMocks.next).toHaveBeenLastCalledWith('/apps')

    routerMocks.next.mockClear()
    userStore.setSuperUser(true)
    await runGuard('/plugin-app/demo/settings', 'demo', 'settings')
    expect(routerMocks.next).toHaveBeenLastCalledWith()

    routerMocks.next.mockClear()
    userStore.setSuperUser(false)
    sidebarStore.$patch({
      items: [createNavItem({ nav_key: 'settings', permission: 'discovery' })],
      loaded: true,
    })
    userStore.setPermissions({
      discovery: true,
      features: { 'plugin.demo.settings': true },
    })
    await runGuard('/plugin-app/demo/settings', 'demo', 'settings')
    expect(routerMocks.next).toHaveBeenLastCalledWith()

    routerMocks.next.mockClear()
    sidebarStore.$patch({ items: [], loaded: true })
    await runGuard('/plugin-app/undeclared/details', 'undeclared', 'details')
    expect(routerMocks.next).toHaveBeenLastCalledWith()
  })
})
