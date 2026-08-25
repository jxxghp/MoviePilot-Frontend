import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vuetify', () => ({
  useDisplay: () => ({ mdAndDown: { value: true } }),
}))

describe('usePWA standalone display mode', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  it('reports standalone synchronously while service worker discovery is pending', async () => {
    const pendingRegistrations = new Promise<ServiceWorkerRegistration[]>(() => undefined)

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: vi.fn(() => pendingRegistrations),
      },
    })
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    const { usePWA } = await import('@/composables/usePWA')
    const wrapper = mount(
      defineComponent({
        setup: () => usePWA(),
        template: '<div />',
      }),
    )

    expect(wrapper.vm.pwaStatus).toBeNull()
    expect(wrapper.vm.isStandaloneMode).toBe(true)

    wrapper.unmount()
  })
})
