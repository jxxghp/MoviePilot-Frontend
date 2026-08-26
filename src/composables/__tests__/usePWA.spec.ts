import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ mdAndDown: false }))

vi.mock('vuetify', () => ({
  useDisplay: () => ({
    mdAndDown: {
      get value() {
        return mocks.mdAndDown
      },
    },
  }),
}))

function mockDisplayEnvironment(environment: 'browser' | 'standalone' | 'window-controls-overlay') {
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: query === `(display-mode: ${environment})`,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

function mockMutableDisplayEnvironment(initialEnvironment: 'browser' | 'standalone' | 'window-controls-overlay') {
  let environment = initialEnvironment
  const listeners = new Map<string, Set<() => void>>()

  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    get matches() {
      return query === `(display-mode: ${environment})`
    },
    media: query,
    onchange: null,
    addEventListener: vi.fn((_event: string, listener: () => void) => {
      const queryListeners = listeners.get(query) ?? new Set<() => void>()

      queryListeners.add(listener)
      listeners.set(query, queryListeners)
    }),
    removeEventListener: vi.fn((_event: string, listener: () => void) => listeners.get(query)?.delete(listener)),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))

  return async (nextEnvironment: typeof environment) => {
    environment = nextEnvironment
    listeners.forEach(queryListeners => queryListeners.forEach(listener => listener()))
    await Promise.resolve()
  }
}

function mockPlatform(platform: 'desktop' | 'mobile') {
  Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: undefined })
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value:
      platform === 'mobile'
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148'
        : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  })
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: platform === 'mobile' ? 5 : 0 })
}

async function mountPWA() {
  const { usePWA } = await import('@/composables/usePWA')

  return mount(
    defineComponent({
      setup: () => usePWA(),
      template: '<div />',
    }),
  )
}

const shellResolutionCases = (['browser', 'standalone', 'window-controls-overlay'] as const).flatMap(environment =>
  (['desktop', 'mobile'] as const).flatMap(platform =>
    ([false, true] as const).flatMap(compact =>
      (['auto', 'desktop', 'app'] as const).map(mode => ({
        compact,
        environment,
        expectedApp: mode === 'app' || (mode === 'auto' && platform === 'mobile' && compact),
        mode,
        platform,
      })),
    ),
  ),
)

describe('usePWA shell resolution', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    localStorage.clear()
    mocks.mdAndDown = false
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false })
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('')
    mockPlatform('desktop')
  })

  it.each(shellResolutionCases)(
    'resolves $environment / $platform / compact=$compact / $mode without display-environment inference',
    async ({ compact, environment, expectedApp, mode, platform }) => {
      const pendingRegistrations = new Promise<ServiceWorkerRegistration[]>(() => undefined)
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: { getRegistrations: vi.fn(() => pendingRegistrations) },
      })
      mocks.mdAndDown = compact
      mockDisplayEnvironment(environment)
      mockPlatform(platform)
      localStorage.setItem('ui-mode', mode)

      const wrapper = await mountPWA()

      expect(wrapper.vm.displayEnvironment).toBe(environment)
      expect(wrapper.vm.appMode).toBe(expectedApp)
      wrapper.unmount()
    },
  )

  it('reports standalone synchronously while service worker discovery is pending', async () => {
    const pendingRegistrations = new Promise<ServiceWorkerRegistration[]>(() => undefined)

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: vi.fn(() => pendingRegistrations),
      },
    })
    mockDisplayEnvironment('standalone')
    const wrapper = await mountPWA()

    expect(wrapper.vm.pwaStatus).toBeNull()
    expect(wrapper.vm.displayEnvironment).toBe('standalone')
    expect(wrapper.vm.isStandaloneMode).toBe(true)
    expect(wrapper.vm.appMode).toBe(false)

    wrapper.unmount()
  })

  it('keeps standard standalone auto mode in the side-navigation family at a wide viewport', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: vi.fn().mockResolvedValue([]) },
    })
    mockDisplayEnvironment('standalone')

    const wrapper = await mountPWA()

    expect(wrapper.vm.appMode).toBe(false)
    expect(wrapper.vm.isWindowControlsOverlayMode).toBe(false)
    wrapper.unmount()
  })

  it('uses App navigation automatically only for a compact mobile platform', async () => {
    const pendingRegistrations = new Promise<ServiceWorkerRegistration[]>(() => undefined)
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: vi.fn(() => pendingRegistrations) },
    })
    mocks.mdAndDown = true
    mockDisplayEnvironment('standalone')
    mockPlatform('mobile')

    const mobileWrapper = await mountPWA()
    expect(mobileWrapper.vm.appMode).toBe(true)
    mobileWrapper.unmount()

    vi.resetModules()
    mockPlatform('desktop')
    const desktopWrapper = await mountPWA()
    expect(desktopWrapper.vm.appMode).toBe(false)
    desktopWrapper.unmount()
  })

  it('keeps WCO auto mode in the side-navigation family while allowing explicit App mode', async () => {
    const pendingRegistrations = new Promise<ServiceWorkerRegistration[]>(() => undefined)
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: vi.fn(() => pendingRegistrations) },
    })
    mockDisplayEnvironment('window-controls-overlay')

    const autoWrapper = await mountPWA()
    expect(autoWrapper.vm.displayEnvironment).toBe('window-controls-overlay')
    expect(autoWrapper.vm.isWindowControlsOverlayMode).toBe(true)
    expect(autoWrapper.vm.appMode).toBe(false)
    autoWrapper.unmount()

    vi.resetModules()
    localStorage.setItem('ui-mode', 'app')
    const appWrapper = await mountPWA()
    expect(appWrapper.vm.appMode).toBe(true)
    appWrapper.unmount()
  })

  it('updates the mounted Shell when its installed display environment changes', async () => {
    const pendingRegistrations = new Promise<ServiceWorkerRegistration[]>(() => undefined)
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: vi.fn(() => pendingRegistrations) },
    })
    const setDisplayEnvironment = mockMutableDisplayEnvironment('standalone')
    const wrapper = await mountPWA()

    expect(wrapper.vm.displayEnvironment).toBe('standalone')
    expect(wrapper.vm.isStandaloneMode).toBe(true)

    await setDisplayEnvironment('window-controls-overlay')
    expect(wrapper.vm.displayEnvironment).toBe('window-controls-overlay')
    expect(wrapper.vm.isStandaloneMode).toBe(false)
    expect(wrapper.vm.isWindowControlsOverlayMode).toBe(true)

    await setDisplayEnvironment('browser')
    expect(wrapper.vm.displayEnvironment).toBe('browser')
    expect(wrapper.vm.isWindowControlsOverlayMode).toBe(false)
    wrapper.unmount()
  })

  it('honors forced side navigation and normalizes invalid stored UI modes', async () => {
    const pendingRegistrations = new Promise<ServiceWorkerRegistration[]>(() => undefined)
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: vi.fn(() => pendingRegistrations) },
    })
    mockDisplayEnvironment('standalone')
    localStorage.setItem('ui-mode', 'desktop')

    const sideWrapper = await mountPWA()
    expect(sideWrapper.vm.uiMode).toBe('desktop')
    expect(sideWrapper.vm.appMode).toBe(false)
    sideWrapper.unmount()

    vi.resetModules()
    localStorage.setItem('ui-mode', 'invalid')
    const fallbackWrapper = await mountPWA()
    expect(fallbackWrapper.vm.uiMode).toBe('auto')
    expect(fallbackWrapper.vm.appMode).toBe(false)
    fallbackWrapper.unmount()
  })
})
