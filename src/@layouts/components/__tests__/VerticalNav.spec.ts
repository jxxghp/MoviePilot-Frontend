import VerticalNav from '@/@layouts/components/VerticalNav.vue'
import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  freeThreaded: false,
  gilEnabled: true,
}))

vi.mock('@/stores', () => ({
  useGlobalSettingsStore: () => ({
    get: (key: string) => {
      if (key === 'PYTHON_FREE_THREADED') return mocks.freeThreaded
      if (key === 'PYTHON_GIL_ENABLED') return mocks.gilEnabled
      return undefined
    },
  }),
}))

vi.mock('vue-i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ path: '/' }),
}))

vi.mock('vuetify', async importOriginal => ({
  ...(await importOriginal<typeof import('vuetify')>()),
  useDisplay: () => ({ mdAndDown: { value: false } }),
}))

function renderNavigation() {
  return shallowMount(VerticalNav, {
    props: {
      isOverlayNavActive: false,
      toggleIsOverlayNavActive: vi.fn(),
    },
    global: {
      stubs: {
        PerfectScrollbar: { template: '<ul><slot /></ul>' },
        RouterLink: { template: '<a><slot /></a>' },
        ThemeLogoMark: true,
        VIcon: { props: ['ariaLabel'], template: '<span>{{ ariaLabel }}</span>' },
        VTooltip: { template: '<span><slot /></span>' },
      },
    },
  })
}

describe('VerticalNav runtime version', () => {
  beforeEach(() => {
    mocks.freeThreaded = false
    mocks.gilEnabled = true
  })

  it('shows v3 for the standard runtime', () => {
    const navigation = renderNavigation()

    expect(navigation.text()).toContain('MOVIEPILOT')
    expect(navigation.get('.runtime-version').text()).toBe('v3')
  })

  it('shows v3t for the free-threaded runtime', () => {
    mocks.freeThreaded = true
    mocks.gilEnabled = false

    const navigation = renderNavigation()

    expect(navigation.get('.runtime-version--free-threaded').text()).toContain('v3t')
    expect(navigation.get('.runtime-version--free-threaded').classes()).not.toContain('runtime-version--degraded')
    expect(navigation.text()).toContain('app.freeThreadedExperimentalHint')
  })

  it('marks v3t when the runtime has enabled the GIL', () => {
    mocks.freeThreaded = true

    const navigation = renderNavigation()

    expect(navigation.get('.runtime-version--degraded').text()).toContain('v3t')
    expect(navigation.text()).toContain('app.freeThreadedGilFallbackWarning')
  })
})
