import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GlassNavbarRefractionDefs from '../GlassNavbarRefractionDefs.vue'
import { createGlassNavbarDisplacementMap } from '@/utils/glassNavbarRefraction'
import { ref } from 'vue'

vi.mock('@/utils/glassNavbarRefraction', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/glassNavbarRefraction')>()),
  createGlassNavbarDisplacementMap: vi.fn(() => 'data:image/png;base64,test'),
  NEUTRAL_GLASS_NAVBAR_DISPLACEMENT_MAP: 'neutral',
}))
const effectiveSettings = ref({ glassDeformationStrength: 48, glassTranslationStrength: 48 })
vi.mock('@/composables/useThemeCustomizer', () => ({ useEffectiveGlassSettings: () => effectiveSettings }))

describe('GlassNavbarRefractionDefs', () => {
  let shell: HTMLDivElement
  let navbar: HTMLElement
  let resize: ResizeObserverCallback | undefined
  let wrapper: ReturnType<typeof mount> | undefined
  let width: number
  let radius: number
  let transparencyReduced: boolean
  let transparencyChange: ((event: MediaQueryListEvent) => void) | undefined
  let decodePending: Array<{ resolve: () => void; reject: (reason?: unknown) => void }>
  const disconnect = vi.fn()
  const observe = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    effectiveSettings.value = { glassDeformationStrength: 48, glassTranslationStrength: 48 }
    width = 1423
    radius = 16
    transparencyReduced = false
    transparencyChange = undefined
    decodePending = []
    shell = document.createElement('div')
    shell.className = 'layout-wrapper layout-navbar-floating-eligible layout-navbar-away-from-top'
    shell.dataset.glassNavbarRefraction = 'chromium'
    shell.innerHTML = '<header class="layout-navbar"></header>'
    document.body.append(shell)
    navbar = shell.querySelector('.layout-navbar') as HTMLElement
    Object.assign(document.documentElement.dataset, { theme: 'glass', glassAppearance: 'clear', glassQuality: 'high' })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      x: 16,
      y: 16,
      left: 16,
      top: 16,
      width,
      height: 64,
      right: width + 16,
      bottom: 80,
      toJSON: () => ({}),
    }))
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () =>
        ({
          borderStartStartRadius: `${radius}px`,
          getPropertyValue: () => '1rem',
        }) as unknown as CSSStyleDeclaration,
    )
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback
        }
        observe = observe
        disconnect = disconnect
      },
    )
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return transparencyReduced
      },
      addEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
        transparencyChange = listener
      }),
      removeEventListener: vi.fn(),
    }))
    vi.stubGlobal(
      'Image',
      class {
        src = ''
        decode = vi.fn(
          () =>
            new Promise<void>((resolve, reject) => {
              decodePending.push({ resolve, reject })
            }),
        )
      },
    )
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    shell.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  async function settle() {
    await vi.advanceTimersByTimeAsync(65)
    completePendingDecode()
    await flushPromises()
  }

  function expectReadyForWidth(expectedWidth: number) {
    expect(shell.dataset.glassNavbarRefractionReady).toBe('true')
    expect(wrapper?.get('feImage').attributes('width')).toBe(String(expectedWidth))
  }

  function completePendingDecode() {
    for (const pending of decodePending.splice(0)) pending.resolve()
  }

  function dispatchTransition(type: 'transitionrun' | 'transitionend' | 'transitioncancel', propertyName: string) {
    const event = new Event(type, { bubbles: true }) as TransitionEvent
    Object.defineProperty(event, 'propertyName', { value: propertyName })
    navbar.dispatchEvent(event)
  }

  it('uses computed pixel radius and activates only a decoded map with matching dimensions', async () => {
    wrapper = mount(GlassNavbarRefractionDefs)
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1423, height: 64, radius: 16 }),
    )
    expectReadyForWidth(1423)
  })

  it('disables old sampling during resize and caches unchanged geometry', async () => {
    wrapper = mount(GlassNavbarRefractionDefs)
    await settle()
    resize?.([], {} as ResizeObserver)
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(1)
    width = 1200
    resize?.([], {} as ResizeObserver)
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 1200, height: 64, radius: 16 }),
    )
    expectReadyForWidth(1200)
  })

  it('does not generate a map in CSS quality', async () => {
    document.documentElement.dataset.glassQuality = 'css'
    wrapper = mount(GlassNavbarRefractionDefs)
    await settle()
    expect(createGlassNavbarDisplacementMap).not.toHaveBeenCalled()
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')
  })

  it('rebuilds on effective preview parameters and restores the cancelled draft', async () => {
    wrapper = mount(GlassNavbarRefractionDefs)
    await settle()
    effectiveSettings.value = { glassDeformationStrength: 0, glassTranslationStrength: 100 }
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ optics: { horizontalRatio: 0, verticalRatio: 0, translationPx: 17 } }),
    )
    effectiveSettings.value = { glassDeformationStrength: 48, glassTranslationStrength: 48 }
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ optics: expect.objectContaining({ translationPx: 8.16 }) }),
    )
  })

  it('does not activate a pending map after switching to CSS quality', async () => {
    wrapper = mount(GlassNavbarRefractionDefs)
    await vi.advanceTimersByTimeAsync(65)
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(1)
    document.documentElement.dataset.glassQuality = 'css'
    await flushPromises()
    completePendingDecode()
    await flushPromises()
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')
  })

  it('does not generate or activate a map while reduced transparency is enabled', async () => {
    transparencyReduced = true
    wrapper = mount(GlassNavbarRefractionDefs)
    await settle()
    expect(createGlassNavbarDisplacementMap).not.toHaveBeenCalled()
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')

    transparencyReduced = false
    transparencyChange?.({ matches: false } as MediaQueryListEvent)
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(1)
    expectReadyForWidth(1423)
  })

  it('regenerates after a geometry transition ends or is cancelled', async () => {
    wrapper = mount(GlassNavbarRefractionDefs)
    await settle()

    width = 1200
    dispatchTransition('transitionrun', 'width')
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')
    dispatchTransition('transitionend', 'width')
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 1200, height: 64, radius: 16 }),
    )
    expectReadyForWidth(1200)

    radius = 20
    dispatchTransition('transitionrun', 'border-radius')
    dispatchTransition('transitioncancel', 'border-radius')
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 1200, height: 64, radius: 20 }),
    )
    expectReadyForWidth(1200)
  })

  it('waits for every geometry transition before restoring the map', async () => {
    wrapper = mount(GlassNavbarRefractionDefs)
    await settle()

    dispatchTransition('transitionrun', 'width')
    dispatchTransition('transitionrun', 'border-radius')
    dispatchTransition('transitionend', 'width')
    await vi.advanceTimersByTimeAsync(65)
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')

    dispatchTransition('transitioncancel', 'border-radius')
    await settle()
    expectReadyForWidth(1423)
  })

  it('only regenerates for radius or observed theme size changes', async () => {
    wrapper = mount(GlassNavbarRefractionDefs)
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(1)

    shell.style.setProperty('--shell-floating-navbar-scale-x', '0.9')
    await flushPromises()
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(1)

    radius = 20
    shell.style.setProperty('--shell-floating-navbar-radius', '20px')
    await flushPromises()
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 1423, height: 64, radius: 20 }),
    )
  })

  it('does not retry a failed geometry in a feedback loop', async () => {
    wrapper = mount(GlassNavbarRefractionDefs)
    await vi.advanceTimersByTimeAsync(65)
    const [pending] = decodePending.splice(0)
    pending.reject(new Error('decode failed'))
    await flushPromises()
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(1)

    resize?.([], {} as ResizeObserver)
    await settle()
    resize?.([], {} as ResizeObserver)
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(1)
  })

  it('uses the window resize fallback and removes it on unmount', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    wrapper = mount(GlassNavbarRefractionDefs)
    await settle()
    expect(observe).not.toHaveBeenCalled()

    width = 1200
    window.dispatchEvent(new Event('resize'))
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 1200, height: 64, radius: 16 }),
    )

    wrapper.unmount()
    wrapper = undefined
    width = 1100
    window.dispatchEvent(new Event('resize'))
    await settle()
    expect(shell.hasAttribute('data-glass-navbar-refraction-ready')).toBe(false)
  })

  it('drops pending work on unmount', async () => {
    wrapper = mount(GlassNavbarRefractionDefs)
    await vi.advanceTimersByTimeAsync(65)
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    wrapper = undefined
    completePendingDecode()
    await flushPromises()
    expect(shell.hasAttribute('data-glass-navbar-refraction-ready')).toBe(false)
    expect(disconnect).toHaveBeenCalled()
  })
})
