import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GlassNavbarRefractionDefs from '../GlassNavbarRefractionDefs.vue'
import { createGlassNavbarDisplacementMap, getGlassSidebarOpticalResponse } from '@/utils/glassNavbarRefraction'
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
  let sidebarWidth: number
  let radius: number
  let sidebar: HTMLElement | undefined
  let focused: boolean
  let visibility: DocumentVisibilityState
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
    sidebarWidth = 260
    radius = 16
    transparencyReduced = false
    transparencyChange = undefined
    decodePending = []
    sidebar = undefined
    focused = true
    visibility = 'visible'
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused)
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
    shell = document.createElement('div')
    shell.className =
      'layout-wrapper layout-horizontal-nav-active layout-navbar-floating-eligible layout-navbar-away-from-top'
    shell.dataset.glassNavbarRefraction = 'chromium'
    shell.innerHTML = '<header class="layout-navbar"></header>'
    document.body.append(shell)
    navbar = shell.querySelector('.layout-navbar') as HTMLElement
    Object.assign(document.documentElement.dataset, { theme: 'glass', glassAppearance: 'clear', glassQuality: 'high' })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const isSidebar = this.classList.contains('layout-vertical-nav')
      const elementWidth = isSidebar ? sidebarWidth : width
      const elementHeight = isSidebar ? 800 : 64

      return {
        x: 16,
        y: 16,
        left: 16,
        top: 16,
        width: elementWidth,
        height: elementHeight,
        right: elementWidth + 16,
        bottom: elementHeight + 16,
        toJSON: () => ({}),
      }
    })
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      element =>
        ({
          borderStartStartRadius: element.classList.contains('layout-vertical-nav') ? '0px' : `${radius}px`,
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
    delete document.documentElement.dataset.themeRadius
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

  function expectReadyForSidebar(expectedWidth: number) {
    expect(shell.dataset.glassSidebarRefractionReady).toBe('true')
    expect(wrapper?.findAll('feImage')[2].attributes('width')).toBe(String(expectedWidth))
    expect(wrapper?.findAll('feImage')[2].attributes('height')).toBe('800')
  }

  function completePendingDecode() {
    for (const pending of decodePending.splice(0)) pending.resolve()
  }

  function dispatchTransition(type: 'transitionrun' | 'transitionend' | 'transitioncancel', propertyName: string) {
    const event = new Event(type, { bubbles: true }) as TransitionEvent
    Object.defineProperty(event, 'propertyName', { value: propertyName })
    navbar.dispatchEvent(event)
  }

  function mountWithSidebar(overlay = false) {
    sidebar = document.createElement('aside')
    sidebar.className = `layout-vertical-nav${overlay ? ' overlay-nav' : ''}`
    shell.prepend(sidebar)
    wrapper = mount(GlassNavbarRefractionDefs)
  }

  it('enables a readable rectangular lens on the fixed desktop navbar', async () => {
    shell.className = 'layout-wrapper'
    shell.dataset.shellMode = 'desktop'
    radius = 0
    mountWithSidebar()
    await settle()
    expectReadyForWidth(1423)
    expectReadyForSidebar(260)
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1423, height: 64, radius: 0 }),
    )
    shell.classList.add('layout-overlay-nav')
    shell.dataset.shellMode = 'drawer'
    sidebar?.classList.add('overlay-nav')
    await flushPromises()
    await settle()
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')
  })

  it('uses computed pixel radius and activates only a decoded map with matching dimensions', async () => {
    wrapper = mount(GlassNavbarRefractionDefs)
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1423, height: 64, radius: 16 }),
    )
    expectReadyForWidth(1423)
  })

  it('skips fallback maps only after the panel material has actually taken over', async () => {
    shell.className = 'layout-wrapper'
    shell.dataset.shellMode = 'desktop'
    navbar.dataset.glassPanelRefraction = 'panel-navbar'
    mountWithSidebar()
    sidebar!.dataset.glassPanelRefraction = 'panel-sidebar'
    await settle()

    expect(createGlassNavbarDisplacementMap).not.toHaveBeenCalled()
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')
    expect(shell.dataset.glassSidebarRefractionReady).toBe('false')

    // 所有权先于解码发布；只有就绪标记能够抑制备用透镜。
    navbar.dataset.glassPanelOwner = 'panel-navbar'
    sidebar!.dataset.glassPanelOwner = 'panel-sidebar'
    delete navbar.dataset.glassPanelRefraction
    delete sidebar!.dataset.glassPanelRefraction
    await flushPromises()
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(2)
    expectReadyForWidth(1423)
    expectReadyForSidebar(260)
  })

  it('reuses decoded fallback maps when panel refraction is suspended', async () => {
    shell.className = 'layout-wrapper'
    shell.dataset.shellMode = 'desktop'
    mountWithSidebar()
    await settle()

    navbar.dataset.glassPanelRefraction = 'panel-navbar'
    sidebar!.dataset.glassPanelRefraction = 'panel-sidebar'
    await flushPromises()
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')
    expect(shell.dataset.glassSidebarRefractionReady).toBe('false')

    delete navbar.dataset.glassPanelRefraction
    delete sidebar!.dataset.glassPanelRefraction
    await flushPromises()
    expectReadyForWidth(1423)
    expectReadyForSidebar(260)
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(2)
  })

  it('does not activate a pending fallback after panel takeover', async () => {
    wrapper = mount(GlassNavbarRefractionDefs)
    await vi.advanceTimersByTimeAsync(65)
    expect(decodePending).toHaveLength(1)

    navbar.dataset.glassPanelRefraction = 'panel-navbar'
    await flushPromises()
    completePendingDecode()
    await flushPromises()
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')
    expect(wrapper.get('feImage').attributes('href')).toBe('neutral')
  })

  it.each(['blur', 'hidden'] as const)(
    'does not prepare fallback maps when panel suspension follows %s',
    async mode => {
      navbar.dataset.glassPanelRefraction = 'panel-navbar'
      wrapper = mount(GlassNavbarRefractionDefs)
      await settle()
      expect(createGlassNavbarDisplacementMap).not.toHaveBeenCalled()

      if (mode === 'blur') {
        focused = false
        window.dispatchEvent(new Event('blur'))
      } else {
        visibility = 'hidden'
        document.dispatchEvent(new Event('visibilitychange'))
      }
      delete navbar.dataset.glassPanelRefraction
      await flushPromises()
      await settle()
      expect(createGlassNavbarDisplacementMap).not.toHaveBeenCalled()
      expect(shell.dataset.glassNavbarRefractionReady).toBe('false')

      focused = true
      visibility = 'visible'
      if (mode === 'blur') window.dispatchEvent(new Event('focus'))
      else document.dispatchEvent(new Event('visibilitychange'))
      await settle()
      expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(1)
      expectReadyForWidth(1423)
    },
  )

  it('does not activate a pending decode while the document is hidden', async () => {
    wrapper = mount(GlassNavbarRefractionDefs)
    await vi.advanceTimersByTimeAsync(65)
    expect(decodePending).toHaveLength(1)
    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    completePendingDecode()
    await flushPromises()
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')
    expect(wrapper.get('feImage').attributes('href')).toBe('neutral')
  })

  it('restores a decoded floating map immediately on focus without regenerating it', async () => {
    wrapper = mount(GlassNavbarRefractionDefs)
    await settle()
    focused = false
    window.dispatchEvent(new Event('blur'))
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')

    focused = true
    window.dispatchEvent(new Event('focus'))
    expectReadyForWidth(1423)
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(1)
  })

  it('keeps independent geometry caches when switching between horizontal and vertical navigation', async () => {
    mountWithSidebar()
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(1)
    expectReadyForWidth(1423)
    expect(shell.dataset.glassSidebarRefractionReady).toBe('false')
    shell.className = 'layout-wrapper'
    await flushPromises()
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(2)
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1423, height: 64, radius: 16 }),
    )
    expect(createGlassNavbarDisplacementMap).toHaveBeenLastCalledWith(
      expect.objectContaining({
        width: 260,
        height: 800,
        radius: 0,
        surface: 'sidebar',
        optics: getGlassSidebarOpticalResponse({ deformation: 48, translation: 48 }),
      }),
    )
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')
    expectReadyForSidebar(260)

    shell.className =
      'layout-wrapper layout-horizontal-nav-active layout-navbar-floating-eligible layout-navbar-away-from-top'
    await flushPromises()
    await settle()
    expectReadyForWidth(1423)
    expect(shell.dataset.glassSidebarRefractionReady).toBe('false')
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(2)
  })

  it('rebuilds only the sidebar map when its collapsed width changes', async () => {
    shell.className = 'layout-wrapper'
    mountWithSidebar()
    await settle()
    const initialCallCount = vi.mocked(createGlassNavbarDisplacementMap).mock.calls.length

    sidebarWidth = 80
    resize?.([], {} as ResizeObserver)
    await settle()

    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(initialCallCount + 1)
    expect(createGlassNavbarDisplacementMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 80, height: 800, radius: 0 }),
    )
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')
    expectReadyForSidebar(80)
  })

  it('does not generate a live map for a mobile Drawer surface', async () => {
    shell.className = 'layout-wrapper layout-overlay-nav'
    mountWithSidebar(true)
    await settle()

    expect(createGlassNavbarDisplacementMap).not.toHaveBeenCalled()
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')
    expect(shell.dataset.glassSidebarRefractionReady).toBe('false')
  })

  it('activates the existing sidebar when a Drawer viewport returns to desktop', async () => {
    shell.className = 'layout-wrapper layout-overlay-nav'
    mountWithSidebar(true)
    await settle()
    shell.classList.remove('layout-overlay-nav')
    sidebar?.classList.remove('overlay-nav')
    await flushPromises()
    await settle()
    expectReadyForSidebar(260)
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(1)
  })

  it('does not strand a sidebar update when an unrelated fixed navbar transition ends', async () => {
    shell.className = 'layout-wrapper'
    mountWithSidebar()
    await settle()
    dispatchTransition('transitionrun', 'height')
    effectiveSettings.value = { glassDeformationStrength: 99, glassTranslationStrength: 99 }
    dispatchTransition('transitionend', 'height')
    completePendingDecode()
    await flushPromises()
    expectReadyForSidebar(260)
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(2)
  })

  it('keeps unchanged geometry ready but disables old sampling when the size changes', async () => {
    wrapper = mount(GlassNavbarRefractionDefs)
    await settle()
    resize?.([], {} as ResizeObserver)
    expect(shell.dataset.glassNavbarRefractionReady).toBe('true')
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(1)
    width = 1200
    resize?.([], {} as ResizeObserver)
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 1200, height: 64, radius: 16 }),
    )
    expectReadyForWidth(1200)
  })

  it('restores a cached map immediately when the final geometry transition ends', async () => {
    wrapper = mount(GlassNavbarRefractionDefs)
    await settle()
    dispatchTransition('transitionrun', 'inset-inline-start')
    dispatchTransition('transitionrun', 'border-radius')
    dispatchTransition('transitionend', 'inset-inline-start')
    await flushPromises()
    expect(shell.dataset.glassNavbarRefractionReady).toBe('false')
    dispatchTransition('transitionend', 'border-radius')
    await flushPromises()
    expectReadyForWidth(1423)
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(1)
  })

  it('does not cancel a pending decode on a duplicate resize notification', async () => {
    wrapper = mount(GlassNavbarRefractionDefs)
    await vi.advanceTimersByTimeAsync(65)
    resize?.([], {} as ResizeObserver)
    completePendingDecode()
    await flushPromises()
    expectReadyForWidth(1423)
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(1)
  })

  it('rejects a late draft decode when cancellation already restored the cached map', async () => {
    vi.mocked(createGlassNavbarDisplacementMap)
      .mockReturnValueOnce('data:image/png;base64,saved')
      .mockReturnValueOnce('data:image/png;base64,draft')
    wrapper = mount(GlassNavbarRefractionDefs)
    await settle()
    effectiveSettings.value = { glassDeformationStrength: 99, glassTranslationStrength: 99 }
    await vi.advanceTimersByTimeAsync(65)
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(2)
    effectiveSettings.value = { glassDeformationStrength: 48, glassTranslationStrength: 48 }
    expectReadyForWidth(1423)
    completePendingDecode()
    await flushPromises()
    expect(wrapper.get('feImage').attributes('href')).toBe('data:image/png;base64,saved')
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
      expect.objectContaining({ optics: expect.objectContaining({ translationPx: expect.closeTo(1.880064) }) }),
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

  it('regenerates the optical outline when the theme radius attribute changes', async () => {
    wrapper = mount(GlassNavbarRefractionDefs)
    await settle()

    radius = 24
    document.documentElement.dataset.themeRadius = 'extra'
    await flushPromises()
    await settle()

    expect(createGlassNavbarDisplacementMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 1423, height: 64, radius: 24 }),
    )
    expect(shell.dataset.glassNavbarRefractionReady).toBe('true')
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
