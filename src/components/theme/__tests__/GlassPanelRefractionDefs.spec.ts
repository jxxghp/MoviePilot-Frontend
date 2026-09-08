import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import GlassPanelRefractionDefs from '../GlassPanelRefractionDefs.vue'
import { createGlassNavbarDisplacementMap, createGlassPanelBackdropMap } from '@/utils/glassNavbarRefraction'

vi.mock('@/utils/glassNavbarRefraction', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/glassNavbarRefraction')>()),
  createGlassNavbarDisplacementMap: vi.fn(() => 'data:image/png;base64,panel'),
  createGlassPanelBackdropMap: vi.fn(() => 'data:image/png;base64,backplate'),
}))

const effectiveSettings = ref({
  glassAppearance: 'clear' as 'clear' | 'frosted' | 'tinted',
  glassDeformationStrength: 48,
  glassQuality: 'high' as 'balanced' | 'high' | 'css',
  glassTransparencyStrength: 48,
  glassTranslationStrength: 48,
})
vi.mock('@/composables/useThemeCustomizer', () => ({ useEffectiveGlassSettings: () => effectiveSettings }))

const CHROME_USER_AGENT = 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36'
const FIREFOX_USER_AGENT = 'Mozilla/5.0 Firefox/142.0'
const unsupportedStyleProperties = new Set(['backdrop-filter', '-webkit-backdrop-filter'])
const nativeSetProperty = CSSStyleDeclaration.prototype.setProperty
const nativeGetPropertyValue = CSSStyleDeclaration.prototype.getPropertyValue
const nativeGetPropertyPriority = CSSStyleDeclaration.prototype.getPropertyPriority
const nativeRemoveProperty = CSSStyleDeclaration.prototype.removeProperty
const unsupportedStyleValues = new WeakMap<CSSStyleDeclaration, Map<string, { priority: string; value: string }>>()

describe('GlassPanelRefractionDefs', () => {
  let shell: HTMLDivElement
  let card: HTMLElement
  let wrapper: ReturnType<typeof mount> | undefined
  let resize: ResizeObserverCallback | undefined
  let intersect: IntersectionObserverCallback | undefined
  let panelWidth: number
  let visibility: DocumentVisibilityState
  let focused: boolean
  let browser: 'chrome' | 'firefox'
  let reducedTransparency: boolean
  let decodePending: Array<{ resolve: () => void; reject: (reason?: unknown) => void }>
  const disconnect = vi.fn()
  const observe = vi.fn()
  const unobserve = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    panelWidth = 480
    visibility = 'visible'
    focused = true
    browser = 'chrome'
    reducedTransparency = false
    decodePending = []
    effectiveSettings.value = {
      glassAppearance: 'clear',
      glassDeformationStrength: 48,
      glassQuality: 'high',
      glassTransparencyStrength: 48,
      glassTranslationStrength: 48,
    }

    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused)
    vi.spyOn(navigator, 'userAgent', 'get').mockImplementation(() =>
      browser === 'chrome' ? CHROME_USER_AGENT : FIREFOX_USER_AGENT,
    )
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      let left = 24
      let top = 120
      let width = panelWidth
      let height = 240

      if (this.classList.contains('layout-navbar')) {
        left = 0
        top = 0
        width = 1200
        height = 64
      } else if (this.classList.contains('layout-vertical-nav')) {
        left = 0
        top = 64
        width = 260
        height = 800
      } else if (
        this.classList.contains('glass-fixed-shell-backplate') ||
        this.classList.contains('glass-fixed-shell-backplate__layer')
      ) {
        left = 0
        top = 0
        width = 1200
        height = 900
      }
      if (this.dataset.card === 'second') width += 120

      return {
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({}),
      }
    })
    vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
      const radius = element.classList.contains('layout-vertical-nav')
        ? 0
        : element.classList.contains('v-card')
          ? 12
          : 16
      return {
        borderTopLeftRadius: `${radius}px`,
        getPropertyValue: (property: string) => (property === 'border-top-left-radius' ? `${radius}px` : ''),
      } as unknown as CSSStyleDeclaration
    })
    vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty').mockImplementation(function (
      this: CSSStyleDeclaration,
      property,
      value,
      priority = '',
    ) {
      if (unsupportedStyleProperties.has(property)) {
        let values = unsupportedStyleValues.get(this)
        if (!value) {
          values?.delete(property)
          return
        }
        if (!values) {
          values = new Map()
          unsupportedStyleValues.set(this, values)
        }
        values.set(property, { priority, value })
        return
      }
      nativeSetProperty.call(this, property, value, priority)
    })
    vi.spyOn(CSSStyleDeclaration.prototype, 'getPropertyValue').mockImplementation(function (
      this: CSSStyleDeclaration,
      property,
    ) {
      if (unsupportedStyleProperties.has(property)) return unsupportedStyleValues.get(this)?.get(property)?.value ?? ''
      return nativeGetPropertyValue.call(this, property)
    })
    vi.spyOn(CSSStyleDeclaration.prototype, 'getPropertyPriority').mockImplementation(function (
      this: CSSStyleDeclaration,
      property,
    ) {
      if (unsupportedStyleProperties.has(property))
        return unsupportedStyleValues.get(this)?.get(property)?.priority ?? ''
      return nativeGetPropertyPriority.call(this, property)
    })
    vi.spyOn(CSSStyleDeclaration.prototype, 'removeProperty').mockImplementation(function (
      this: CSSStyleDeclaration,
      property,
    ) {
      if (unsupportedStyleProperties.has(property)) {
        const previous = unsupportedStyleValues.get(this)?.get(property)?.value ?? ''
        unsupportedStyleValues.get(this)?.delete(property)
        return previous
      }
      return nativeRemoveProperty.call(this, property)
    })
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersect = callback
        }
        observe = vi.fn()
        unobserve = vi.fn()
        disconnect = vi.fn()
      },
    )
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback
        }
        observe = observe
        unobserve = unobserve
        disconnect = disconnect
      },
    )
    vi.stubGlobal('matchMedia', () => ({
      matches: reducedTransparency,
      addEventListener: vi.fn(),
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

    resetFixture()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    shell?.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function resetFixture(horizontal = true) {
    wrapper?.unmount()
    wrapper = undefined
    shell?.remove()

    panelWidth = 480
    visibility = 'visible'
    focused = true
    browser = 'chrome'
    reducedTransparency = false
    effectiveSettings.value = {
      glassAppearance: 'clear',
      glassDeformationStrength: 48,
      glassQuality: 'high',
      glassTransparencyStrength: 48,
      glassTranslationStrength: 48,
    }

    document.documentElement.dataset.theme = 'glass'
    document.documentElement.dataset.glassAppearance = effectiveSettings.value.glassAppearance
    document.documentElement.dataset.glassQuality = effectiveSettings.value.glassQuality

    shell = document.createElement('div')
    shell.className = `layout-wrapper${horizontal ? ' layout-horizontal-nav-active' : ''}`
    shell.dataset.shellMode = 'desktop'
    shell.innerHTML = `
      <header class="layout-navbar"></header>
      <aside class="layout-vertical-nav"></aside>
      <div class="glass-fixed-shell-backplate glass-fixed-shell-backplate--main">
        <div class="glass-fixed-shell-backplate__layer" data-backplate-slot="current"></div>
      </div>
      <div class="dashboard-grid">
        <div class="dashboard-grid-content-measure">
          <div class="v-card" data-card="eligible">
            <div class="v-card media-card" data-card="media"></div>
          </div>
          <div class="v-overlay"><div class="v-card" data-card="overlay"></div></div>
        </div>
      </div>
    `
    document.body.append(shell)
    card = shell.querySelector('[data-card="eligible"]') as HTMLElement
  }

  function mountPanel() {
    wrapper = mount(GlassPanelRefractionDefs, { attachTo: shell })
    return wrapper
  }

  function completePendingDecode() {
    for (const pending of decodePending.splice(0)) pending.resolve()
  }

  async function settle() {
    await vi.advanceTimersByTimeAsync(65)
    for (let attempt = 0; attempt < 8 && decodePending.length > 0; attempt += 1) {
      completePendingDecode()
      await flushPromises()
    }
    await flushPromises()
  }

  function intersectCard(isIntersecting: boolean) {
    const bounds = card.getBoundingClientRect()
    intersect?.(
      [
        {
          target: card,
          isIntersecting,
          boundingClientRect: bounds,
          intersectionRatio: isIntersecting ? 1 : 0,
          intersectionRect: bounds,
          rootBounds: bounds,
          time: 0,
        },
      ],
      {} as IntersectionObserver,
    )
  }

  function expectNoPanelFilter(element: HTMLElement) {
    expect(element.style.getPropertyValue('backdrop-filter')).not.toContain('url(')
    expect(element.style.getPropertyValue('-webkit-backdrop-filter')).not.toContain('url(')
    expect(element.style.getPropertyValue('--glass-panel-filter')).not.toContain('url(')
    expect(element.style.getPropertyValue('filter')).not.toContain('url(')
  }

  it('requires glass desktop Chromium balanced/high visible focus gates', async () => {
    for (const quality of ['balanced', 'high'] as const) {
      resetFixture()
      effectiveSettings.value.glassQuality = quality
      document.documentElement.dataset.glassQuality = quality
      vi.clearAllMocks()
      mountPanel()
      await settle()

      expect(createGlassNavbarDisplacementMap).toHaveBeenCalled()
      expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
    }

    const cases = [
      { name: 'glass theme', apply: () => (document.documentElement.dataset.theme = 'dark') },
      { name: 'desktop shell', apply: () => (shell.dataset.shellMode = 'mobile') },
      { name: 'Chromium browser', apply: () => (browser = 'firefox') },
      {
        name: 'non-CSS quality',
        apply: () => {
          effectiveSettings.value.glassQuality = 'css'
          document.documentElement.dataset.glassQuality = 'css'
        },
      },
      { name: 'visible document', apply: () => (visibility = 'hidden') },
      { name: 'focused document', apply: () => (focused = false) },
      { name: 'reduced transparency', apply: () => (reducedTransparency = true) },
    ]

    for (const { name, apply } of cases) {
      resetFixture()
      vi.clearAllMocks()
      apply()
      mountPanel()
      await settle()

      expect(createGlassNavbarDisplacementMap, name).not.toHaveBeenCalled()
      expect(createGlassPanelBackdropMap, name).not.toHaveBeenCalled()
      expectNoPanelFilter(card)
    }
  })

  it('waits for decode, enhances only top-level content cards, and leaves horizontal navigation untouched', async () => {
    mountPanel()
    await vi.advanceTimersByTimeAsync(65)

    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(1)
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledWith(
      expect.objectContaining({ height: 240, surface: 'panel', width: 480 }),
    )
    expectNoPanelFilter(card)

    expect(card.dataset.glassPanelOwner).toMatch(/^glass-panel-/)

    completePendingDecode()
    await flushPromises()

    expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
    expect(card.style.getPropertyPriority('backdrop-filter')).toBe('important')
    expect(card.style.getPropertyValue('-webkit-backdrop-filter')).toContain('url(')
    expectNoPanelFilter(shell.querySelector('[data-card="media"]') as HTMLElement)
    expectNoPanelFilter(shell.querySelector('[data-card="overlay"]') as HTMLElement)
    expectNoPanelFilter(shell.querySelector('.layout-navbar') as HTMLElement)
    expectNoPanelFilter(shell.querySelector('.layout-vertical-nav') as HTMLElement)
    expect(createGlassPanelBackdropMap).not.toHaveBeenCalled()
  })

  it('starts the scheduled frame even when more layout events arrive before it', async () => {
    mountPanel()
    await vi.advanceTimersByTimeAsync(8)
    window.dispatchEvent(new Event('resize'))
    await vi.advanceTimersByTimeAsync(8)
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(1)
    completePendingDecode()
    await flushPromises()
    expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
  })

  it('starts different visible map decodes together instead of serializing them', async () => {
    const second = document.createElement('div')
    second.className = 'v-card'
    second.dataset.card = 'second'
    card.parentElement!.append(second)
    mountPanel()
    await vi.advanceTimersByTimeAsync(16)
    expect(decodePending).toHaveLength(2)
    expectNoPanelFilter(card)
    expectNoPanelFilter(second)
    completePendingDecode()
    await flushPromises()
    expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
    expect(second.style.getPropertyValue('backdrop-filter')).toContain('url(')
  })

  it('enhances site and plugin routes without requiring a dashboard', async () => {
    shell.querySelector('.dashboard-grid')!.className = 'layout-page-content'
    shell.querySelector('.dashboard-grid-content-measure')!.className = 'plugin-grid'
    card.classList.add('plugin-card')
    mountPanel()
    await settle()
    expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
    expectNoPanelFilter(shell.querySelector('[data-card="media"]') as HTMLElement)
    expectNoPanelFilter(shell.querySelector('[data-card="overlay"]') as HTMLElement)
  })

  it('releases far-away filters and reuses decoded geometry when a card returns', async () => {
    mountPanel()
    await settle()
    const calls = vi.mocked(createGlassNavbarDisplacementMap).mock.calls.length
    intersectCard(false)
    await settle()
    expectNoPanelFilter(card)
    expect(wrapper?.findAll('filter')).toHaveLength(0)
    // 保留背景所有权，屏外表面不能反过来启动第二套静态 WebGL 材质。
    expect(card.hasAttribute('data-glass-panel-owner')).toBe(true)
    intersectCard(true)
    await settle()
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(calls)
    expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
  })

  it.each(['clear', 'tinted'] as const)(
    'keeps %s free of background diffusion in both enhanced tiers',
    async appearance => {
      for (const quality of ['balanced', 'high'] as const) {
        resetFixture()
        effectiveSettings.value.glassAppearance = appearance
        effectiveSettings.value.glassQuality = quality
        mountPanel()
        await settle()
        expect(wrapper?.findAll('feGaussianBlur')).toHaveLength(0)
        expect(wrapper?.findAll('feDisplacementMap')).toHaveLength(1)
        expect(card.style.getPropertyValue('backdrop-filter')).not.toContain('blur(')
      }
    },
  )

  it('restores existing inline declarations and priorities when quality or theme exits', async () => {
    for (const exit of ['quality', 'theme'] as const) {
      resetFixture()
      card.style.setProperty('backdrop-filter', 'blur(2px)', 'important')
      card.style.setProperty('-webkit-backdrop-filter', 'saturate(80%)')
      card.dataset.glassPanelRefraction = 'legacy'
      mountPanel()
      await settle()

      expect(card.style.getPropertyPriority('backdrop-filter')).toBe('important')
      expect(card.dataset.glassPanelRefraction).not.toBe('legacy')

      if (exit === 'quality') {
        effectiveSettings.value.glassQuality = 'css'
        document.documentElement.dataset.glassQuality = 'css'
      } else {
        document.documentElement.dataset.theme = 'dark'
      }
      await flushPromises()
      await vi.advanceTimersByTimeAsync(65)
      await flushPromises()

      expect(card.style.getPropertyValue('backdrop-filter')).toBe('blur(2px)')
      expect(card.style.getPropertyPriority('backdrop-filter')).toBe('important')
      expect(card.style.getPropertyValue('-webkit-backdrop-filter')).toBe('saturate(80%)')
      expect(card.style.getPropertyPriority('-webkit-backdrop-filter')).toBe('')
      expect(card.dataset.glassPanelRefraction).toBe('legacy')
      expect(card.style.getPropertyValue('backdrop-filter')).not.toContain('url(')
    }
  })

  it('does not bind a late decode after the quality gate is disabled', async () => {
    mountPanel()
    await vi.advanceTimersByTimeAsync(65)
    expect(decodePending).toHaveLength(1)

    effectiveSettings.value.glassQuality = 'css'
    document.documentElement.dataset.glassQuality = 'css'
    await flushPromises()
    completePendingDecode()
    await flushPromises()

    expectNoPanelFilter(card)
    expect(wrapper?.findAll('filter')).toHaveLength(0)
  })

  it('drops pending work and leaves no filter after unmount', async () => {
    mountPanel()
    await vi.advanceTimersByTimeAsync(65)
    expect(decodePending).toHaveLength(1)

    wrapper?.unmount()
    wrapper = undefined
    completePendingDecode()
    await flushPromises()

    expectNoPanelFilter(card)
    expect(card.hasAttribute('data-glass-panel-refraction')).toBe(false)
    expect(card.hasAttribute('data-glass-panel-owner')).toBe(false)
    expect(shell.querySelectorAll('filter')).toHaveLength(0)
    expect(disconnect).toHaveBeenCalled()
  })

  it('does not let an obsolete decode failure remove the latest material', async () => {
    mountPanel()
    await vi.advanceTimersByTimeAsync(65)
    const obsolete = decodePending.shift()!
    effectiveSettings.value.glassDeformationStrength = 80
    await settle()
    const applied = card.style.getPropertyValue('backdrop-filter')
    expect(applied).toContain('url(')
    obsolete.reject(new Error('obsolete image'))
    await flushPromises()
    expect(card.style.getPropertyValue('backdrop-filter')).toBe(applied)
    expect(wrapper?.findAll('filter')).toHaveLength(1)
  })

  it('rebuilds the card map when observed geometry changes', async () => {
    mountPanel()
    await settle()
    const initialCallCount = vi.mocked(createGlassNavbarDisplacementMap).mock.calls.length

    panelWidth = 620
    resize?.([], {} as ResizeObserver)
    expectNoPanelFilter(card)
    await settle()

    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(initialCallCount + 1)
    expect(createGlassNavbarDisplacementMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ height: 240, surface: 'panel', width: 620 }),
    )
    expect(wrapper?.find('feImage').attributes('width')).toBe('620')
    expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
  })

  it.each(['balanced', 'high'] as const)(
    'keeps %s frosted navbar live while the sidebar samples its backplate',
    async quality => {
      resetFixture(false)
      effectiveSettings.value.glassAppearance = 'frosted'
      effectiveSettings.value.glassQuality = quality
      document.documentElement.dataset.glassAppearance = 'frosted'
      document.documentElement.dataset.glassQuality = quality
      mountPanel()
      await settle()

      const layer = shell.querySelector('.glass-fixed-shell-backplate__layer') as HTMLElement
      const navbar = shell.querySelector('.layout-navbar') as HTMLElement
      const sidebar = shell.querySelector('.layout-vertical-nav') as HTMLElement

      expect(createGlassPanelBackdropMap).toHaveBeenCalledTimes(1)
      expect(createGlassPanelBackdropMap).toHaveBeenCalledWith(
        expect.objectContaining({
          height: 900,
          panels: [expect.objectContaining({ height: 800, width: 260 })],
          width: 1200,
        }),
      )
      expect(layer.style.getPropertyValue('filter')).toContain('url(')
      expect(navbar.style.getPropertyValue('--glass-panel-filter')).toContain('url(')
      expect(navbar.style.getPropertyValue('filter')).toBe('')
      expect(navbar.style.getPropertyValue('backdrop-filter')).toBe('')
      expect(navbar.hasAttribute('data-glass-panel-refraction')).toBe(true)
      expect(sidebar.style.getPropertyValue('--glass-panel-filter')).toBe('')
      expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(2)
      expect(createGlassNavbarDisplacementMap).toHaveBeenCalledWith(
        expect.objectContaining({ height: 64, width: 1200, surface: 'panel' }),
      )
      expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
      expect(wrapper?.findAll('feGaussianBlur')).toHaveLength(quality === 'high' ? 3 : 0)
      expect(navbar.style.getPropertyValue('--glass-panel-filter').includes(' blur(')).toBe(quality === 'balanced')
    },
  )

  it('does not regenerate the sidebar backplate map when only navbar geometry changes', async () => {
    resetFixture(false)
    effectiveSettings.value.glassAppearance = 'frosted'
    mountPanel()
    await settle()
    const navbar = shell.querySelector('.layout-navbar') as HTMLElement
    const bounds = navbar.getBoundingClientRect()
    vi.spyOn(navbar, 'getBoundingClientRect').mockReturnValue({ ...bounds, width: 1100, right: 1100 })

    resize?.([], {} as ResizeObserver)
    await settle()

    expect(createGlassPanelBackdropMap).toHaveBeenCalledTimes(1)
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(3)
    expect(createGlassNavbarDisplacementMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ height: 64, width: 1100, surface: 'panel' }),
    )
  })

  it('preserves sidebar enhancement if the live frosted navbar map fails to decode', async () => {
    resetFixture(false)
    effectiveSettings.value.glassAppearance = 'frosted'
    mountPanel()
    await vi.advanceTimersByTimeAsync(65)
    expect(decodePending).toHaveLength(3)
    decodePending.splice(1, 1)[0].reject(new Error('navbar image unavailable'))
    completePendingDecode()
    await flushPromises()

    const layer = shell.querySelector('.glass-fixed-shell-backplate__layer') as HTMLElement
    const navbar = shell.querySelector('.layout-navbar') as HTMLElement
    expect(layer.style.getPropertyValue('filter')).toContain('url(')
    expect(navbar.style.getPropertyValue('--glass-panel-filter')).toBe('')
    expect(navbar.hasAttribute('data-glass-panel-refraction')).toBe(false)
  })

  it('releases both frosted sampling owners when selecting CSS quality', async () => {
    resetFixture(false)
    effectiveSettings.value.glassAppearance = 'frosted'
    mountPanel()
    await settle()
    effectiveSettings.value.glassQuality = 'css'
    await settle()

    const layer = shell.querySelector('.glass-fixed-shell-backplate__layer') as HTMLElement
    const navbar = shell.querySelector('.layout-navbar') as HTMLElement
    expect(layer.style.getPropertyValue('filter')).toBe('')
    expect(navbar.style.getPropertyValue('--glass-panel-filter')).toBe('')
    expect(shell.querySelectorAll('[data-glass-panel-refraction]')).toHaveLength(0)
  })
})
