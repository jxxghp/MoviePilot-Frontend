import VerticalNavLayout from '@/@layouts/components/VerticalNavLayout.vue'
import { mount } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appMode: false,
  direction: 'idle' as 'idle' | 'up' | 'down',
  hasPwaStatus: true,
  displayEnvironment: 'browser' as 'browser' | 'standalone' | 'window-controls-overlay',
  footerDockHeight: undefined as { value: number | null } | undefined,
  isStandaloneDisplayMode: false,
  isStandaloneMode: false,
  isWindowControlsOverlayMode: false,
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

vi.mock('@/composables/useFooterDockHeight', async () => {
  const { ref } = await import('vue')

  mocks.footerDockHeight ??= ref<number | null>(null)

  return {
    useFooterDockHeight: () => ({ footerDockHeight: mocks.footerDockHeight }),
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
      displayEnvironment: computed(() => {
        void mocks.revision!.value

        return mocks.displayEnvironment
      }),
      isStandaloneMode: computed(() => {
        void mocks.revision!.value

        return mocks.hasPwaStatus ? mocks.isStandaloneMode : mocks.isStandaloneDisplayMode
      }),
      isWindowControlsOverlayMode: computed(() => {
        void mocks.revision!.value

        return mocks.isWindowControlsOverlayMode
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
    mocks.displayEnvironment = 'browser'
    mocks.direction = 'idle'
    mocks.hasPwaStatus = true
    mocks.footerDockHeight!.value = null
    mocks.isStandaloneDisplayMode = false
    mocks.isStandaloneMode = false
    mocks.isWindowControlsOverlayMode = false
    mocks.mdAndDown = false
    mocks.state = 'expanded'
  })

  it('keeps raw scroll states without applying App presentation classes to the desktop shell', async () => {
    const expandedWrapper = mountLayout()

    expect(expandedWrapper.get('.layout-wrapper').attributes('data-shell-mode')).toBe('desktop')
    expect(expandedWrapper.get('.layout-wrapper').attributes('data-shell-display-environment')).toBe('browser')
    expect(expandedWrapper.get('.layout-navbar').attributes('data-shell-navbar-state')).toBe('expanded')
    expect(expandedWrapper.get('.layout-wrapper').classes()).not.toContain('window-scrolled')
    expandedWrapper.unmount()

    mocks.state = 'compact'
    mocks.direction = 'down'
    const compactWrapper = mountLayout()

    expect(compactWrapper.get('.layout-wrapper').classes()).toEqual(
      expect.arrayContaining(['layout-navbar-away-from-top', 'window-scrolled']),
    )
    expect(compactWrapper.get('.layout-wrapper').classes()).not.toContain('layout-navbar-compact')
    expect(compactWrapper.get('.layout-navbar').attributes('data-shell-navbar-state')).toBe('compact')
    compactWrapper.unmount()

    mocks.state = 'revealed'
    mocks.direction = 'up'
    const revealedWrapper = mountLayout()
    const revealedRoot = revealedWrapper.get('.layout-wrapper')

    expect(revealedRoot.classes()).toEqual(expect.arrayContaining(['layout-navbar-away-from-top', 'window-scrolled']))
    expect(revealedRoot.classes()).not.toContain('layout-navbar-compact')
    expect(revealedRoot.classes()).not.toContain('layout-navbar-revealed')
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

  it('publishes the measured App Dock height to the layout shell', async () => {
    mocks.appMode = true
    mocks.mdAndDown = true
    const wrapper = mountLayout()

    mocks.footerDockHeight!.value = 104
    await nextTick()

    expect(wrapper.get('.layout-wrapper').attributes('style')).toContain('--layout-footer-dock-height: 104px')
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

  it('keeps the compact Drawer gateway visible while App consumes the compact presentation', () => {
    mocks.mdAndDown = true
    mocks.state = 'compact'
    mocks.direction = 'down'
    const drawerWrapper = mountLayout()

    expect(drawerWrapper.get('.layout-wrapper').classes()).toContain('layout-mobile-drawer-shell')
    expect(drawerWrapper.get('.layout-wrapper').classes()).not.toContain('layout-navbar-compact')
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

  it('keeps standalone safe-area ownership when Side navigation resolves to Drawer or desktop', () => {
    mocks.isStandaloneMode = true
    mocks.displayEnvironment = 'standalone'
    mocks.mdAndDown = true

    const drawerWrapper = mountLayout()
    const drawerRoot = drawerWrapper.get('.layout-wrapper')

    expect(drawerRoot.attributes('data-shell-mode')).toBe('drawer')
    expect(drawerRoot.classes()).toEqual(
      expect.arrayContaining(['layout-mobile-drawer-shell', 'layout-standalone-pwa-shell']),
    )
    expect(drawerRoot.classes()).not.toContain('layout-app-shell')
    drawerWrapper.unmount()

    mocks.mdAndDown = false
    const desktopWrapper = mountLayout()
    const desktopRoot = desktopWrapper.get('.layout-wrapper')

    expect(desktopRoot.attributes('data-shell-mode')).toBe('desktop')
    expect(desktopRoot.classes()).toContain('layout-standalone-pwa-shell')
    expect(desktopRoot.classes()).not.toContain('layout-app-shell')
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

  it('keeps WCO titlebar ownership separate from standalone safe-area treatment', () => {
    mocks.appMode = false
    mocks.displayEnvironment = 'window-controls-overlay'
    mocks.isWindowControlsOverlayMode = true
    mocks.state = 'compact'

    const desktopWrapper = mountLayout()
    const desktopRoot = desktopWrapper.get('.layout-wrapper')

    expect(desktopRoot.attributes('data-shell-mode')).toBe('desktop')
    expect(desktopRoot.attributes('data-shell-display-environment')).toBe('window-controls-overlay')
    expect(desktopRoot.classes()).toContain('layout-window-controls-overlay-shell')
    expect(desktopRoot.classes()).not.toContain('layout-standalone-pwa-shell')
    expect(desktopRoot.classes()).not.toContain('layout-navbar-compact')
    expect(desktopWrapper.get('.layout-navbar').attributes('data-shell-navbar-state')).toBe('compact')
    expect(desktopWrapper.get('.layout-navbar').attributes()).not.toHaveProperty('inert')
    desktopWrapper.unmount()

    mocks.appMode = true
    mocks.state = 'compact'
    const appWrapper = mountLayout()
    const appRoot = appWrapper.get('.layout-wrapper')

    expect(appRoot.classes()).toEqual(
      expect.arrayContaining(['layout-app-shell', 'layout-window-controls-overlay-shell', 'layout-navbar-compact']),
    )
    expect(appRoot.classes()).not.toContain('layout-standalone-pwa-shell')
    expect(appWrapper.get('.layout-navbar').attributes()).toHaveProperty('inert')
  })

  it('exposes floating eligibility only for an ordinary desktop horizontal environment', async () => {
    mocks.state = 'compact'
    const browserWrapper = mountLayout()

    window.dispatchEvent(new CustomEvent('moviepilot:theme-customizer-change', { detail: { layout: 'horizontal' } }))
    await nextTick()

    const browserRoot = browserWrapper.get('.layout-wrapper')
    expect(browserRoot.classes()).toEqual(
      expect.arrayContaining([
        'layout-horizontal-nav-active',
        'layout-horizontal-nav-scrolled',
        'layout-navbar-floating-eligible',
      ]),
    )
    expect(browserRoot.attributes('data-shell-navbar-attachment')).toBe('theme-qualified')
    browserWrapper.unmount()

    mocks.displayEnvironment = 'window-controls-overlay'
    mocks.isWindowControlsOverlayMode = true
    const wcoWrapper = mountLayout()

    window.dispatchEvent(new CustomEvent('moviepilot:theme-customizer-change', { detail: { layout: 'horizontal' } }))
    await nextTick()

    const wcoRoot = wcoWrapper.get('.layout-wrapper')
    expect(wcoRoot.classes()).toContain('layout-horizontal-nav-active')
    expect(wcoRoot.classes()).not.toContain('layout-navbar-floating-eligible')
    expect(wcoRoot.attributes('data-shell-navbar-attachment')).toBe('connected')
  })
})
