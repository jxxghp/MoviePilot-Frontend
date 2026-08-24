import DefaultLayout from '@/layouts/default/components/DefaultLayout.vue'
import { THEME_CUSTOMIZER_CHANGE_EVENT, THEME_CUSTOMIZER_OPEN_EVENT } from '@/composables/useThemeCustomizer'
import { flushPromises, shallowMount } from '@vue/test-utils'
import type { PluginSidebarNavItem } from '@/api/types'
import { nextTick, type Component } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface SidebarStoreMock {
  ensureSidebarNav: ReturnType<typeof vi.fn>
  items: PluginSidebarNavItem[]
}

interface RuntimeStoreMock {
  reconciliation: number
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

interface UserStoreMock {
  permissions: Record<string, unknown>
  superUser: boolean
}

const mocks = vi.hoisted(() => ({
  emptyComponent: { template: '<div><slot /></div>' },
  ensureSidebarNav: vi.fn(),
  loadUserSettings: vi.fn(),
  navLink: {
    name: 'VerticalNavLink',
    props: ['item'],
    template: '<span data-testid="vertical-nav-link">{{ item.title }}</span>',
  },
  runtimeStore: undefined as RuntimeStoreMock | undefined,
  sidebarStore: undefined as SidebarStoreMock | undefined,
  startPluginRuntime: vi.fn(),
  stopPluginRuntime: vi.fn(),
  userStore: undefined as UserStoreMock | undefined,
  verticalNavLayout: { template: '<div><slot name="vertical-nav-content" /></div>' },
}))

vi.mock('@layouts/components/VerticalNavLayout.vue', () => ({ default: mocks.verticalNavLayout }))
vi.mock('@layouts/components/VerticalNavLink.vue', () => ({ default: mocks.navLink }))
vi.mock('@layouts/components/VerticalNavSectionTitle.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/components/agent/AgentAssistantWidget.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/components/misc/ThemeLogoMark.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/components/system/SystemUpdatePrompt.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/components/theme/ThemeCustomizer.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/Footer.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/HeaderTab.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/OfflinePage.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/QuickAccess.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/SearchBar.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/ShortcutBar.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/UserNotification.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/UserProfile.vue', () => ({ default: mocks.emptyComponent }))

vi.mock('@/stores', async () => {
  const { reactive } = await import('vue')
  mocks.sidebarStore = reactive({
    ensureSidebarNav: mocks.ensureSidebarNav,
    items: [] as PluginSidebarNavItem[],
  })
  mocks.runtimeStore = reactive({
    reconciliation: 0,
    start: mocks.startPluginRuntime,
    stop: mocks.stopPluginRuntime,
  })
  mocks.userStore = reactive({
    permissions: {
      admin: false,
      discovery: true,
      features: {},
      manage: false,
      search: true,
      subscribe: true,
    },
    superUser: false,
  })

  return {
    useGlobalSettingsStore: () => ({
      get: vi.fn(() => false),
      loadUserSettings: mocks.loadUserSettings,
    }),
    usePluginRuntimeStore: () => mocks.runtimeStore,
    usePluginSidebarNavStore: () => mocks.sidebarStore,
    useUserStore: () => mocks.userStore,
  }
})

vi.mock('@/router/i18n-menu', () => ({
  getNavMenus: () => [{ header: 'menu.start', title: 'Built-in dashboard', to: '/dashboard' }],
  pluginSidebarSectionToHeaderKey: (section: string) => `menu.${section}`,
}))
vi.mock('@/composables/useOfflineStatus', () => ({
  useGlobalOfflineStatus: () => ({ isOffline: { value: false } }),
}))
vi.mock('@/composables/usePullDownGesture', () => ({
  usePullDownGesture: () => ({
    config: {
      MAX_PULL_DISTANCE: 220,
      SHOW_INDICATOR: 80,
      TRIGGER_THRESHOLD: 140,
    },
    contentTransform: { value: '' },
    contentTransition: { value: '' },
    indicatorOpacity: { value: 0 },
    indicatorRotation: { value: 0 },
    indicatorTransform: { value: '' },
    pullDistance: { value: 0 },
    showPullIndicator: { value: false },
  }),
}))
vi.mock('@/composables/usePWA', () => ({ usePWA: () => ({ appMode: { value: false } }) }))
vi.mock('vue-i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}))
vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ path: '/' }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('vuetify', async importOriginal => ({
  ...(await importOriginal<typeof import('vuetify')>()),
  useDisplay: () => ({ mdAndDown: { value: false } }),
}))

describe('DefaultLayout', () => {
  beforeEach(() => {
    mocks.ensureSidebarNav.mockReset()
    mocks.ensureSidebarNav.mockResolvedValue(undefined)
    mocks.loadUserSettings.mockReset()
    mocks.loadUserSettings.mockResolvedValue(undefined)
    mocks.startPluginRuntime.mockReset()
    mocks.stopPluginRuntime.mockReset()
    mocks.runtimeStore!.reconciliation = 0
    mocks.sidebarStore!.items = []
    mocks.userStore!.permissions = {
      admin: false,
      discovery: true,
      features: {},
      manage: false,
      search: true,
      subscribe: true,
    }
    mocks.userStore!.superUser = false
  })

  it('removes theme customizer listeners while sidebar loading is still pending', async () => {
    let resolveSidebarNav!: () => void
    mocks.ensureSidebarNav.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          resolveSidebarNav = resolve
        }),
    )
    const addEventListener = vi.spyOn(window, 'addEventListener')
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    const wrapper = shallowMount(DefaultLayout, {
      global: {
        renderStubDefaultSlot: true,
        stubs: {
          IconBtn: mocks.emptyComponent,
          RouterLink: mocks.emptyComponent,
          VerticalNavLayout: mocks.verticalNavLayout,
          VerticalNavLink: mocks.navLink,
        },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Built-in dashboard')

    const changeHandler = addEventListener.mock.calls.find(
      ([event]) => String(event) === THEME_CUSTOMIZER_CHANGE_EVENT,
    )?.[1]
    const openHandler = addEventListener.mock.calls.find(
      ([event]) => String(event) === THEME_CUSTOMIZER_OPEN_EVENT,
    )?.[1]

    expect(changeHandler).toBeTypeOf('function')
    expect(openHandler).toBeTypeOf('function')

    wrapper.unmount()

    expect(removeEventListener).toHaveBeenCalledWith(THEME_CUSTOMIZER_CHANGE_EVENT, changeHandler)
    expect(removeEventListener).toHaveBeenCalledWith(THEME_CUSTOMIZER_OPEN_EVENT, openHandler)

    resolveSidebarNav()
    await flushPromises()
  })

  it('does not poll the superuser runtime endpoint for an ordinary authenticated user', async () => {
    const wrapper = shallowMount(DefaultLayout, {
      global: {
        renderStubDefaultSlot: true,
        stubs: {
          IconBtn: mocks.emptyComponent,
          RouterLink: mocks.emptyComponent,
          VerticalNavLayout: mocks.verticalNavLayout,
          VerticalNavLink: mocks.navLink,
        },
      },
    })
    await flushPromises()

    expect(mocks.startPluginRuntime).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('replaces plugin links when the shared snapshot refreshes after mount', async () => {
    mocks.sidebarStore!.items = [
      {
        icon: 'mdi-puzzle-outline',
        nav_key: 'main',
        order: 1,
        plugin_id: 'old',
        section: 'system',
        title: 'Old plugin',
      },
    ]
    const wrapper = shallowMount(DefaultLayout, {
      global: {
        renderStubDefaultSlot: true,
        stubs: {
          IconBtn: mocks.emptyComponent as Component,
          RouterLink: mocks.emptyComponent as Component,
          VerticalNavLayout: mocks.verticalNavLayout,
          VerticalNavLink: mocks.navLink,
        },
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Old plugin')

    mocks.sidebarStore!.items = [
      {
        icon: 'mdi-puzzle-outline',
        nav_key: 'main',
        order: 1,
        plugin_id: 'new',
        section: 'system',
        title: 'New plugin',
      },
    ]
    await nextTick()

    expect(wrapper.text()).toContain('New plugin')
    expect(wrapper.text()).not.toContain('Old plugin')
  })

  it('refreshes plugin navigation for the first runtime reconciliation and later generations', async () => {
    mocks.userStore!.superUser = true
    const wrapper = shallowMount(DefaultLayout, {
      global: {
        renderStubDefaultSlot: true,
        stubs: {
          IconBtn: mocks.emptyComponent,
          RouterLink: mocks.emptyComponent,
          VerticalNavLayout: mocks.verticalNavLayout,
          VerticalNavLink: mocks.navLink,
        },
      },
    })
    await flushPromises()

    expect(mocks.startPluginRuntime).toHaveBeenCalled()
    mocks.ensureSidebarNav.mockClear()

    mocks.runtimeStore!.reconciliation = 1
    await nextTick()
    expect(mocks.ensureSidebarNav).toHaveBeenCalledWith(true)
    expect(mocks.loadUserSettings).toHaveBeenCalled()
    mocks.ensureSidebarNav.mockClear()
    mocks.loadUserSettings.mockClear()

    mocks.runtimeStore!.reconciliation = 2
    await nextTick()
    expect(mocks.ensureSidebarNav).toHaveBeenCalledWith(true)
    expect(mocks.loadUserSettings).toHaveBeenCalled()

    wrapper.unmount()
    expect(mocks.stopPluginRuntime).toHaveBeenCalledTimes(1)
  })

  it('rebuilds plugin links when permissions change after mount', async () => {
    mocks.sidebarStore!.items = [
      {
        icon: 'mdi-puzzle-outline',
        nav_key: 'main',
        order: 1,
        plugin_id: 'visible',
        section: 'system',
        title: 'Visible plugin',
      },
      {
        icon: 'mdi-puzzle-outline',
        nav_key: 'main',
        order: 2,
        plugin_id: 'hidden',
        section: 'system',
        title: 'Hidden plugin',
      },
    ]
    const wrapper = shallowMount(DefaultLayout, {
      global: {
        renderStubDefaultSlot: true,
        stubs: {
          IconBtn: mocks.emptyComponent as Component,
          RouterLink: mocks.emptyComponent as Component,
          VerticalNavLayout: mocks.verticalNavLayout,
          VerticalNavLink: mocks.navLink,
        },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Visible plugin')
    expect(wrapper.text()).toContain('Hidden plugin')

    mocks.userStore!.permissions = {
      ...mocks.userStore!.permissions,
      features: { 'plugin.hidden.main': false },
    }
    await nextTick()

    expect(wrapper.text()).not.toContain('Hidden plugin')
  })
})
