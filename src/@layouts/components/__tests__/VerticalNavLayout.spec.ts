import VerticalNavLayout from '@/@layouts/components/VerticalNavLayout.vue'
import { mount } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appMode: false,
  direction: 'idle' as 'idle' | 'up' | 'down',
  hasPwaStatus: true,
  isStandaloneDisplayMode: false,
  isStandaloneMode: false,
  mdAndDown: false,
  revision: undefined as { value: number } | undefined,
  state: 'expanded' as 'expanded' | 'compact' | 'revealed',
}))

vi.mock('@/composables/useShellScrollState', async () => {
  const { computed } = await import('vue')

  return {
    useShellScrollState: () => ({
      direction: computed(() => mocks.direction),
      state: computed(() => mocks.state),
    }),
  }
})

vi.mock('@/composables/usePWA', async () => {
  const { computed, ref } = await import('vue')

  mocks.revision ??= ref(0)

  return {
    usePWA: () => ({
      appMode: computed(() => {
        void mocks.revision!.value

        return mocks.appMode
      }),
      isStandaloneMode: computed(() => {
        void mocks.revision!.value

        return mocks.hasPwaStatus ? mocks.isStandaloneMode : mocks.isStandaloneDisplayMode
      }),
      pwaStatus: computed(() => {
        void mocks.revision!.value

        return mocks.hasPwaStatus ? { isStandaloneMode: mocks.isStandaloneMode } : null
      }),
    }),
  }
})

vi.mock('@/composables/useGlassFixedShellBackplate', async () => {
  const { ref } = await import('vue')

  return {
    useGlassFixedShellBackplate: () => ({
      layers: ref([]),
      transitionDurationMs: 0,
    }),
  }
})

vi.mock('@/composables/useThemeCustomizer', () => ({
  readThemeCustomizerSettings: () => ({ layout: 'vertical' }),
  THEME_CUSTOMIZER_CHANGE_EVENT: 'moviepilot:theme-customizer-change',
}))

vi.mock('@/components/theme/GlassFixedShellBackplate.vue', () => ({
  default: { template: '<div data-testid="fixed-shell-backplate" />' },
}))

vi.mock('@layouts/components/VerticalNav.vue', () => ({
  default: { template: '<aside data-testid="vertical-nav"><slot /></aside>' },
}))

vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ meta: {} }),
}))

vi.mock('vuetify', async importOriginal => ({
  ...(await importOriginal<typeof import('vuetify')>()),
  useDisplay: () => ({
    mdAndDown: {
      get value() {
        void mocks.revision!.value

        return mocks.mdAndDown
      },
    },
  }),
}))

function mountLayout() {
  return mount(VerticalNavLayout, {
    slots: {
      default: () => h('div', 'content'),
      footer: () => h('div', { 'data-testid': 'footer-state' }),
      navbar: ({ toggleVerticalOverlayNavActive }: { toggleVerticalOverlayNavActive: (value: boolean) => void }) =>
        h('button', { class: 'theme-navbar-row', onClick: () => toggleVerticalOverlayNavActive(true) }, 'navbar'),
    },
  })
}

async function refreshShell() {
  mocks.revision!.value += 1
  await nextTick()
}

describe('VerticalNavLayout shell states', () => {
  beforeEach(() => {
    mocks.appMode = false
    mocks.direction = 'idle'
    mocks.hasPwaStatus = true
    mocks.isStandaloneDisplayMode = false
    mocks.isStandaloneMode = false
    mocks.mdAndDown = false
    mocks.state = 'expanded'
  })

  it('keeps compact and reverse-scroll revealed states distinct while away from the top', async () => {
    const expandedWrapper = mountLayout()

    expect(expandedWrapper.get('.layout-wrapper').attributes('data-shell-mode')).toBe('desktop')
    expect(expandedWrapper.get('.layout-navbar').attributes('data-shell-navbar-state')).toBe('expanded')
    expect(expandedWrapper.get('.layout-wrapper').classes()).not.toContain('window-scrolled')
    expandedWrapper.unmount()

    mocks.state = 'compact'
    mocks.direction = 'down'
    const compactWrapper = mountLayout()

    expect(compactWrapper.get('.layout-wrapper').classes()).toEqual(
      expect.arrayContaining(['layout-navbar-away-from-top', 'layout-navbar-compact', 'window-scrolled']),
    )
    expect(compactWrapper.get('.layout-navbar').attributes('data-shell-navbar-state')).toBe('compact')
    compactWrapper.unmount()

    mocks.state = 'revealed'
    mocks.direction = 'up'
    const revealedWrapper = mountLayout()
    const revealedRoot = revealedWrapper.get('.layout-wrapper')

    expect(revealedRoot.classes()).toEqual(
      expect.arrayContaining(['layout-navbar-away-from-top', 'layout-navbar-revealed', 'window-scrolled']),
    )
    expect(revealedRoot.classes()).not.toContain('layout-navbar-compact')
    expect(revealedWrapper.get('.layout-navbar').attributes('data-shell-navbar-state')).toBe('revealed')
  })

  it('keeps the footer contract stable across App and drawer shells', async () => {
    mocks.appMode = true
    mocks.mdAndDown = true
    const appWrapper = mountLayout()

    expect(appWrapper.get('.layout-wrapper').attributes('data-shell-mode')).toBe('app')
    expect(appWrapper.get('.layout-wrapper').classes()).not.toContain('layout-overlay-nav')
    expect(appWrapper.find('[data-testid="vertical-nav"]').exists()).toBe(false)
    expect(appWrapper.find('.layout-overlay').exists()).toBe(false)
    expect(appWrapper.get('.footer-content-container').classes()).toContain('footer-content-container-noheight')
    expect(appWrapper.get('[data-testid="footer-state"]').attributes()).not.toHaveProperty('data-minimized')
    appWrapper.unmount()

    mocks.appMode = false
    const drawerWrapper = mountLayout()
    await nextTick()

    expect(drawerWrapper.get('.layout-wrapper').attributes('data-shell-mode')).toBe('drawer')
    expect(drawerWrapper.get('.layout-wrapper').classes()).toContain('layout-mobile-drawer-shell')
    expect(drawerWrapper.get('.layout-wrapper').classes()).toContain('layout-overlay-nav')
    expect(drawerWrapper.find('[data-testid="vertical-nav"]').exists()).toBe(true)
    expect(drawerWrapper.find('.layout-overlay').exists()).toBe(true)
    expect(drawerWrapper.get('[data-testid="footer-state"]').attributes()).not.toHaveProperty('data-minimized')
  })

  it('uses only the App navigation model at a wide viewport', () => {
    mocks.appMode = true
    mocks.mdAndDown = false

    const appWrapper = mountLayout()
    const root = appWrapper.get('.layout-wrapper')

    expect(root.attributes('data-shell-mode')).toBe('app')
    expect(root.classes()).toContain('layout-app-shell')
    expect(root.classes()).not.toContain('layout-horizontal-nav-active')
    expect(root.classes()).not.toContain('layout-vertical-nav-collapsed')
    expect(root.classes()).not.toContain('layout-overlay-nav')
    expect(appWrapper.find('[data-testid="vertical-nav"]').exists()).toBe(false)
    expect(appWrapper.find('.layout-overlay').exists()).toBe(false)
    expect(appWrapper.get('.footer-content-container').classes()).toContain('footer-content-container-noheight')
  })

  it('closes and removes the Drawer overlay when the active Shell changes', async () => {
    mocks.mdAndDown = true
    const wrapper = mountLayout()

    await wrapper.get('.theme-navbar-row').trigger('click')
    expect(wrapper.get('.layout-overlay').classes()).toContain('visible')

    mocks.appMode = true
    await refreshShell()
    expect(wrapper.get('.layout-wrapper').attributes('data-shell-mode')).toBe('app')
    expect(wrapper.find('.layout-overlay').exists()).toBe(false)

    mocks.appMode = false
    await refreshShell()
    expect(wrapper.get('.layout-wrapper').attributes('data-shell-mode')).toBe('drawer')
    expect(wrapper.get('.layout-overlay').classes()).not.toContain('visible')

    await wrapper.get('.theme-navbar-row').trigger('click')
    mocks.mdAndDown = false
    await refreshShell()
    expect(wrapper.get('.layout-wrapper').attributes('data-shell-mode')).toBe('desktop')
    expect(wrapper.find('.layout-overlay').exists()).toBe(false)
  })

  it('uses compact as a mobile drawer visibility state without changing App shell ownership', () => {
    mocks.mdAndDown = true
    mocks.state = 'compact'
    mocks.direction = 'down'
    const drawerWrapper = mountLayout()

    expect(drawerWrapper.get('.layout-wrapper').classes()).toEqual(
      expect.arrayContaining(['layout-mobile-drawer-shell', 'layout-navbar-compact']),
    )
    expect(drawerWrapper.get('.layout-navbar').attributes()).not.toHaveProperty('inert')
    drawerWrapper.unmount()

    mocks.appMode = true
    const appWrapper = mountLayout()

    expect(appWrapper.get('.layout-wrapper').classes()).toContain('layout-app-shell')
    expect(appWrapper.get('.layout-wrapper').classes()).not.toContain('layout-mobile-drawer-shell')
    expect(appWrapper.get('.layout-navbar').attributes()).toHaveProperty('inert')
  })

  it('marks standalone PWA separately from browser App mode', () => {
    mocks.appMode = true
    mocks.mdAndDown = true
    const browserAppWrapper = mountLayout()

    expect(browserAppWrapper.get('.layout-wrapper').classes()).not.toContain('layout-standalone-pwa-shell')
    browserAppWrapper.unmount()

    mocks.isStandaloneMode = true
    const standaloneWrapper = mountLayout()

    expect(standaloneWrapper.get('.layout-wrapper').classes()).toContain('layout-standalone-pwa-shell')
  })

  it('protects the standalone safe-area before async PWA status resolves', () => {
    mocks.appMode = true
    mocks.direction = 'down'
    mocks.hasPwaStatus = false
    mocks.isStandaloneDisplayMode = true
    mocks.mdAndDown = true
    mocks.state = 'compact'

    const standaloneWrapper = mountLayout()
    const root = standaloneWrapper.get('.layout-wrapper')

    expect(root.classes()).toEqual(
      expect.arrayContaining(['layout-app-shell', 'layout-standalone-pwa-shell', 'layout-navbar-compact']),
    )
    expect(standaloneWrapper.get('.layout-navbar').attributes()).toHaveProperty('inert')
  })
})
