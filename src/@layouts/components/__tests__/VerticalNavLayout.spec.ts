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
  navbarRefractionSupported: false,
  scrollY: 0,
  scrollRevision: undefined as { value: number } | undefined,
  revision: undefined as { value: number } | undefined,
  state: 'expanded' as 'expanded' | 'compact' | 'revealed',
}))

vi.mock('@/composables/useShellScrollState', async () => {
  const { computed, ref } = await import('vue')
  mocks.scrollRevision ??= ref(0)

  return {
    useShellScrollState: () => ({
      direction: computed(() => mocks.direction),
      state: computed(() => mocks.state),
      scrollY: computed(() => {
        void mocks.scrollRevision!.value
        return mocks.scrollY
      }),
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

vi.mock('@/utils/glassNavbarRefraction', () => ({
  supportsGlassNavbarLiveRefraction: () => mocks.navbarRefractionSupported,
}))

vi.mock('@/composables/useThemeCustomizer', () => ({
  readThemeCustomizerSettings: () => ({ layout: 'vertical' }),
  THEME_CUSTOMIZER_CHANGE_EVENT: 'moviepilot:theme-customizer-change',
}))

vi.mock('@/components/theme/GlassFixedShellBackplate.vue', () => ({
  default: { template: '<div data-testid="fixed-shell-backplate" />' },
}))

vi.mock('@/components/theme/GlassNavbarRefractionDefs.vue', () => ({
  default: { template: '<svg data-testid="navbar-refraction-defs" />' },
}))

vi.mock('@/components/theme/GlassPanelRefractionDefs.vue', () => ({
  default: { template: '<svg data-testid="panel-refraction-defs" />' },
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
  mocks.scrollRevision!.value += 1
  await nextTick()
}

async function refreshScroll() {
  // 只使滚动依赖失效，不能用布局断点的刷新模拟滚动，否则无法检测额外 slot 重渲染。
  mocks.scrollRevision!.value += 1
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
    mocks.navbarRefractionSupported = false
    mocks.scrollY = 0
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

  it('mounts live backdrop definitions only for the verified Chromium path', () => {
    const goal1Wrapper = mountLayout()

    expect(goal1Wrapper.get('.layout-wrapper').attributes('data-glass-navbar-refraction')).toBe('goal1')
    expect(goal1Wrapper.find('[data-testid="navbar-refraction-defs"]').exists()).toBe(false)
    expect(goal1Wrapper.find('[data-testid="panel-refraction-defs"]').exists()).toBe(false)
    goal1Wrapper.unmount()

    mocks.navbarRefractionSupported = true
    const chromiumWrapper = mountLayout()

    expect(chromiumWrapper.get('.layout-wrapper').attributes('data-glass-navbar-refraction')).toBe('chromium')
    expect(chromiumWrapper.find('[data-testid="navbar-refraction-defs"]').exists()).toBe(true)
    expect(chromiumWrapper.find('[data-testid="panel-refraction-defs"]').exists()).toBe(true)
  })

  it.each(['vertical', 'collapsed', 'horizontal'])(
    'protects glass %s navigation before the App collapse threshold',
    async layout => {
      const wrapper = mountLayout()
      window.dispatchEvent(
        new CustomEvent('moviepilot:theme-customizer-change', { detail: { theme: 'glass', layout } }),
      )
      await nextTick()
      const root = wrapper.get('.layout-wrapper')
      expect(root.classes()).not.toContain('layout-navbar-away-from-top')

      mocks.scrollY = 12
      await refreshShell()
      expect(root.classes()).toContain('layout-navbar-away-from-top')
      expect(root.classes()).not.toContain('layout-navbar-compact')

      mocks.scrollY = 7
      await refreshShell()
      expect(root.classes()).toContain('layout-navbar-away-from-top')
      mocks.scrollY = 4
      await refreshShell()
      expect(root.classes()).not.toContain('layout-navbar-away-from-top')
      wrapper.unmount()
    },
  )

  it('does not apply desktop glass material thresholds to the contextual App header', async () => {
    mocks.appMode = true
    const wrapper = mountLayout()
    window.dispatchEvent(
      new CustomEvent('moviepilot:theme-customizer-change', { detail: { theme: 'glass', layout: 'vertical' } }),
    )
    mocks.scrollY = 24
    await refreshShell()

    expect(wrapper.get('.layout-wrapper').classes()).not.toContain('layout-navbar-away-from-top')
    expect(wrapper.get('.layout-navbar').attributes()).not.toHaveProperty('inert')
    wrapper.unmount()
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

  it('responds to glass floating early with hysteresis without compacting App controls', async () => {
    const wrapper = mountLayout()
    window.dispatchEvent(
      new CustomEvent('moviepilot:theme-customizer-change', { detail: { layout: 'horizontal', theme: 'glass' } }),
    )
    await nextTick()
    const root = wrapper.get('.layout-wrapper')
    mocks.scrollY = 12
    await refreshShell()
    expect(root.classes()).toContain('layout-navbar-away-from-top')
    expect(wrapper.get('.layout-navbar').attributes('data-shell-navbar-state')).toBe('expanded')
    mocks.scrollY = 8
    await refreshShell()
    expect(root.classes()).toContain('layout-navbar-away-from-top')
    mocks.scrollY = 4
    await refreshShell()
    expect(root.classes()).not.toContain('layout-navbar-away-from-top')
    wrapper.unmount()
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

  it.each([
    [1920, 224],
    [2560, 544],
    [3440, 560],
    [1280, 200],
  ])('tracks reversible horizontal expansion at viewport %ipx without rerendering slots', async (width, distance) => {
    const navbarSlot = vi.fn(() => h('button', 'navbar'))
    const wrapper = mount(VerticalNavLayout, { slots: { navbar: navbarSlot } })
    const viewport = vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(width)
    const content = wrapper.get('.layout-page-content').element
    const geometry = vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
      width: Math.min(width, 1440),
    } as DOMRect)
    window.dispatchEvent(
      new CustomEvent('moviepilot:theme-customizer-change', { detail: { theme: 'glass', layout: 'horizontal' } }),
    )
    await nextTick()
    const navbar = wrapper.get('.layout-navbar').element as HTMLElement
    const progress = () => Number(navbar.style.getPropertyValue('--shell-navbar-scroll-progress'))
    expect(progress()).toBe(0)

    mocks.scrollY = distance / 2
    await refreshScroll()
    expect(progress()).toBeCloseTo(0.5)
    navbarSlot.mockClear()
    mocks.scrollY = distance * 0.75
    await refreshScroll()
    expect(progress()).toBeCloseTo(0.84375)
    expect(navbarSlot).not.toHaveBeenCalled()

    mocks.scrollY = distance * 2
    await refreshScroll()
    expect(progress()).toBe(1)
    mocks.scrollY = distance / 4
    await refreshScroll()
    expect(progress()).toBeCloseTo(0.15625)
    mocks.scrollY = 0
    await refreshScroll()
    expect(progress()).toBe(0)

    geometry.mockRestore()
    viewport.mockRestore()
    wrapper.unmount()
  })

  it('resets expansion outside eligible glass desktop horizontal layouts', async () => {
    const wrapper = mountLayout()
    const navbar = wrapper.get('.layout-navbar').element as HTMLElement
    const progress = () => Number(navbar.style.getPropertyValue('--shell-navbar-scroll-progress'))
    mocks.scrollY = 1000
    for (const layout of ['vertical', 'collapsed']) {
      window.dispatchEvent(
        new CustomEvent('moviepilot:theme-customizer-change', { detail: { theme: 'glass', layout } }),
      )
      await refreshShell()
      expect(progress()).toBe(0)
    }
    window.dispatchEvent(
      new CustomEvent('moviepilot:theme-customizer-change', { detail: { theme: 'glass', layout: 'horizontal' } }),
    )
    await refreshShell()
    expect(progress()).toBe(1)
    mocks.isWindowControlsOverlayMode = true
    await refreshShell()
    expect(progress()).toBe(0)
    mocks.isWindowControlsOverlayMode = false
    mocks.mdAndDown = true
    await refreshShell()
    expect(progress()).toBe(0)
    mocks.mdAndDown = false
    mocks.appMode = true
    await refreshShell()
    expect(progress()).toBe(0)
    mocks.appMode = false
    window.dispatchEvent(
      new CustomEvent('moviepilot:theme-customizer-change', { detail: { theme: 'transparent', layout: 'horizontal' } }),
    )
    await refreshShell()
    expect(progress()).toBe(0)
    wrapper.unmount()
  })
})
