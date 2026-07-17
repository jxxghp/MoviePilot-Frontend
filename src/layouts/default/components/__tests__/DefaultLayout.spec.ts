import DefaultLayout from '@/layouts/default/components/DefaultLayout.vue'
import {
  THEME_CUSTOMIZER_CHANGE_EVENT,
  THEME_CUSTOMIZER_OPEN_EVENT,
} from '@/composables/useThemeCustomizer'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  emptyComponent: { template: '<div><slot /></div>' },
  ensureSidebarNav: vi.fn(),
}))

vi.mock('@layouts/components/VerticalNavLayout.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@layouts/components/VerticalNavLink.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@layouts/components/VerticalNavSectionTitle.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/components/agent/AgentAssistantWidget.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/components/misc/ThemeLogoMark.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/components/theme/ThemeCustomizer.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/Footer.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/HeaderTab.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/OfflinePage.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/QuickAccess.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/SearchBar.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/ShortcutBar.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/UserNotification.vue', () => ({ default: mocks.emptyComponent }))
vi.mock('@/layouts/default/components/UserProfile.vue', () => ({ default: mocks.emptyComponent }))

vi.mock('@/stores', () => ({
  useGlobalSettingsStore: () => ({ get: vi.fn(() => false) }),
  usePluginSidebarNavStore: () => ({
    ensureSidebarNav: mocks.ensureSidebarNav,
    items: [],
  }),
  useUserStore: () => ({ permissions: [], superUser: true }),
}))

vi.mock('@/router/i18n-menu', () => ({ getNavMenus: () => [] }))
vi.mock('@/utils/pluginSidebarNav', () => ({ filterPluginSidebarNavEntries: () => [] }))
vi.mock('@/utils/permission', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/permission')>()),
  buildUserPermissionContext: () => ({}),
  filterItemsByPermission: <T>(items: T[]) => items,
  filterMenusByPermission: () => [],
  hasItemPermission: () => true,
  hasPermission: () => true,
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
        stubs: {
          IconBtn: mocks.emptyComponent,
          RouterLink: mocks.emptyComponent,
        },
      },
    })
    await flushPromises()

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
})
