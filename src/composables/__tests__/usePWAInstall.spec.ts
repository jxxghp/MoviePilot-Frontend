import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const displayModes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'] as const

interface MutableMediaQueryList extends MediaQueryList {
  matches: boolean
  notify: () => void
}

function installMatchMediaMock(activeMode?: (typeof displayModes)[number]) {
  const lists = new Map<string, MutableMediaQueryList>()

  for (const mode of displayModes) {
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    const query = `(display-mode: ${mode})`
    const list = {
      matches: mode === activeMode,
      media: query,
      onchange: null,
      addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener)
      }),
      removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener)
      }),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      notify() {
        const event = { matches: list.matches, media: query } as MediaQueryListEvent
        listeners.forEach(listener => listener(event))
      },
    } as MutableMediaQueryList

    lists.set(query, list)
  }

  vi.spyOn(window, 'matchMedia').mockImplementation(query => {
    const list = lists.get(query)
    if (!list) throw new Error(`Unexpected media query: ${query}`)

    return list
  })

  return lists
}

async function mountInstallComposable() {
  const { usePWAInstall } = await import('@/composables/usePWAInstall')

  return mount(
    defineComponent({
      setup: () => usePWAInstall(),
      template: '<div />',
    }),
  )
}

describe('usePWAInstall display modes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false })
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('')
  })

  it.each(displayModes)('detects %s as installed on mount', async mode => {
    installMatchMediaMock(mode)

    const wrapper = await mountInstallComposable()

    expect(wrapper.vm.isInstalled).toBe(true)
    wrapper.unmount()
  })

  it('recomputes all display modes on change and removes every listener', async () => {
    const lists = installMatchMediaMock()
    const wrapper = await mountInstallComposable()
    const wco = lists.get('(display-mode: window-controls-overlay)')!
    const standalone = lists.get('(display-mode: standalone)')!

    expect(wrapper.vm.isInstalled).toBe(false)

    wco.matches = true
    wco.notify()
    expect(wrapper.vm.isInstalled).toBe(true)

    standalone.matches = true
    wco.matches = false
    wco.notify()
    expect(wrapper.vm.isInstalled).toBe(true)

    standalone.matches = false
    standalone.notify()
    expect(wrapper.vm.isInstalled).toBe(false)

    wrapper.unmount()
    displayModes.forEach(mode => {
      expect(lists.get(`(display-mode: ${mode})`)!.removeEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function),
      )
    })
  })
})
