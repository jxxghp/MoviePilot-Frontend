import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, KeepAlive, ref } from 'vue'
import GlassPanelRefractionDefs from '../GlassPanelRefractionDefs.vue'
import { createGlassNavbarDisplacementMap, createGlassPanelBackdropMap } from '@/utils/glassNavbarRefraction'
import { syncGlassPanelShadow, withInstantGlassShadow } from '@/utils/glassPanelShadow'

vi.mock('@/utils/glassNavbarRefraction', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/glassNavbarRefraction')>()),
  createGlassNavbarDisplacementMap: vi.fn(() => 'data:image/png;base64,panel'),
  createGlassPanelBackdropMap: vi.fn(() => 'data:image/png;base64,backplate'),
}))

vi.mock('@/utils/glassPanelShadow', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/glassPanelShadow')>()),
  syncGlassPanelShadow: vi.fn(),
  withInstantGlassShadow: vi.fn(),
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
const shadowSync = vi.mocked(syncGlassPanelShadow)
const instantShadow = vi.mocked(withInstantGlassShadow)

describe('GlassPanelRefractionDefs', () => {
  let shell: HTMLDivElement
  let card: HTMLElement
  let wrapper: ReturnType<typeof mount> | undefined
  let resize: ResizeObserverCallback | undefined
  let intersect: IntersectionObserverCallback | undefined
  let panelWidth: number
  let panelRadius: number
  let panelTransform: string
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
    shadowSync.mockReset()
    shadowSync.mockReturnValue(null)
    instantShadow.mockReset()
    // 组件只验证交接回调边界，CSS transition 的暂存和恢复由 utility 测试验证。
    instantShadow.mockImplementation((_element, apply) => apply())
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
          ? panelRadius
          : 16
      return {
        borderTopLeftRadius: `${radius}px`,
        transform:
          element instanceof HTMLElement
            ? element.style.transform || (element.classList.contains('v-card') ? panelTransform : 'none')
            : 'none',
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
    panelRadius = 12
    panelTransform = 'none'
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

  function installPassingShadowGeometry() {
    // 用真实 sibling 模拟准入结果，不将 jsdom 的矩形替身当作实际浏览器几何证据。
    shadowSync.mockImplementation((element, existing) => {
      const layer = existing ?? document.createElement('div')
      layer.className = 'glass-panel-shadow'
      layer.setAttribute('aria-hidden', 'true')
      if (element.nextElementSibling !== layer) element.after(layer)
      return layer
    })
  }

  function rejectShadowGeometry(_element: HTMLElement, existing: HTMLElement | null) {
    existing?.remove()
    return null
  }

  function expectShadowLayer() {
    const layer = shell.querySelector('.glass-panel-shadow') as HTMLElement | null
    expect(layer).not.toBeNull()
    expect(card.nextElementSibling).toBe(layer)
    return layer!
  }

  function dispatchSurfaceTransition(type: 'transitionend' | 'transitioncancel', propertyName: string, element = card) {
    const event = new Event(type, { bubbles: true })
    Object.defineProperty(event, 'propertyName', { value: propertyName })
    element.dispatchEvent(event)
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

  it.each(['direct', 'first-child'] as const)(
    'publishes the shadow only after a %s dashboard card decodes and never for non-card surfaces',
    async placement => {
      resetFixture(false)
      if (placement === 'first-child') {
        const container = document.createElement('div')
        card.before(container)
        container.append(card)
      }
      installPassingShadowGeometry()
      mountPanel()
      await vi.advanceTimersByTimeAsync(65)

      expect(shadowSync).not.toHaveBeenCalled()
      expect(shell.querySelector('.glass-panel-shadow')).toBeNull()

      completePendingDecode()
      await flushPromises()

      expect(shadowSync).toHaveBeenCalledTimes(1)
      expect(shadowSync).toHaveBeenCalledWith(card, null)
      expectShadowLayer()
      expect(card.style.getPropertyValue('box-shadow')).toBe('var(--glass-v3-surface-edge)')
      expect(shadowSync.mock.calls.every(([element]) => element === card)).toBe(true)
    },
  )

  it.each(['site', 'plugin', 'general'] as const)(
    'keeps %s cards filtered without shadow takeover or SVG resync for identity transforms and hover classes',
    async page => {
      shell.querySelector('.dashboard-grid')!.className = 'layout-page-content'
      shell.querySelector('.dashboard-grid-content-measure')!.className = `${page}-grid`
      card.classList.add(`${page}-card`, 'v-card--hover')
      const identityTransform = 'matrix(1, 0, 0, 1, 0, 0)'
      card.style.transform = identityTransform
      installPassingShadowGeometry()
      mountPanel()
      await settle()

      const filter = card.style.getPropertyValue('backdrop-filter')
      const marker = card.dataset.glassPanelRefraction
      const definition = wrapper!.find('filter').element
      expect(filter).toContain('url(')
      expect(marker).toBeTruthy()
      expect(card.style.getPropertyValue('-webkit-backdrop-filter')).toBe(filter)
      expect(shadowSync).not.toHaveBeenCalled()
      expect(instantShadow).not.toHaveBeenCalled()
      expect(shell.querySelector('.glass-panel-shadow')).toBeNull()
      expect(card.style.getPropertyValue('box-shadow')).toBe('')

      const requestFrame = vi.spyOn(window, 'requestAnimationFrame')
      vi.mocked(createGlassNavbarDisplacementMap).mockClear()
      for (const mutate of [
        () => card.classList.remove('v-card--hover'),
        () => (card.style.transform = 'none'),
        () => card.classList.add('v-card--hover'),
        () => (card.style.transform = identityTransform),
        () => dispatchSurfaceTransition('transitionend', 'transform'),
        () => dispatchSurfaceTransition('transitioncancel', 'transform'),
        () => dispatchSurfaceTransition('transitionend', 'border-radius'),
        () => dispatchSurfaceTransition('transitioncancel', 'border-top-left-radius'),
      ]) {
        mutate()
        await settle()

        expect(requestFrame).not.toHaveBeenCalled()
        expect(createGlassNavbarDisplacementMap).not.toHaveBeenCalled()
        expect(decodePending).toHaveLength(0)
        expect(wrapper!.find('filter').element).toBe(definition)
        expect(card.dataset.glassPanelRefraction).toBe(marker)
        expect(card.style.getPropertyValue('backdrop-filter')).toBe(filter)
        expect(shadowSync).not.toHaveBeenCalled()
        expect(instantShadow).not.toHaveBeenCalled()
        expect(shell.querySelector('.glass-panel-shadow')).toBeNull()
        expect(card.style.getPropertyValue('box-shadow')).toBe('')
      }
    },
  )

  it.each(['second-child', 'deeper'] as const)(
    'keeps %s dashboard descendants filtered but outside the shadow material targets',
    async placement => {
      const measure = card.parentElement!
      const container = document.createElement('div')
      card.replaceWith(container)
      container.append(card)
      if (placement === 'second-child') measure.prepend(document.createElement('div'))
      else {
        const inner = document.createElement('div')
        card.replaceWith(inner)
        inner.append(card)
      }
      installPassingShadowGeometry()
      mountPanel()
      await settle()

      expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
      expect(shadowSync).not.toHaveBeenCalled()
      expect(instantShadow).not.toHaveBeenCalled()
      expect(shell.querySelector('.glass-panel-shadow')).toBeNull()
      expect(card.style.getPropertyValue('box-shadow')).toBe('')
    },
  )

  it.each(['blur', 'hidden', 'css'] as const)(
    'removes the shadow layer and restores the owned shadow when enhancement exits through %s',
    async state => {
      const originalShadow = '0 0 0 1px rgb(12 34 56)'
      card.style.setProperty('box-shadow', originalShadow, 'important')
      installPassingShadowGeometry()
      mountPanel()
      await settle()
      const layer = expectShadowLayer()

      if (state === 'blur') {
        focused = false
        window.dispatchEvent(new Event('blur'))
        await flushPromises()
      } else if (state === 'hidden') {
        visibility = 'hidden'
        document.dispatchEvent(new Event('visibilitychange'))
        await flushPromises()
      } else {
        effectiveSettings.value.glassQuality = 'css'
        document.documentElement.dataset.glassQuality = 'css'
        await settle()
      }

      expect(layer.isConnected).toBe(false)
      expect(shell.querySelector('.glass-panel-shadow')).toBeNull()
      expect(card.style.getPropertyValue('box-shadow')).toBe(originalShadow)
      expect(card.style.getPropertyPriority('box-shadow')).toBe('important')
      expectNoPanelFilter(card)
    },
  )

  it('recreates one shadow layer on focus re-entry without duplicating the sibling', async () => {
    installPassingShadowGeometry()
    mountPanel()
    await settle()
    const firstLayer = expectShadowLayer()
    const callsBeforeBlur = shadowSync.mock.calls.length

    focused = false
    window.dispatchEvent(new Event('blur'))
    expect(firstLayer.isConnected).toBe(false)

    focused = true
    window.dispatchEvent(new Event('focus'))
    await settle()

    const layers = shell.querySelectorAll('.glass-panel-shadow')
    expect(layers).toHaveLength(1)
    expect(card.nextElementSibling).toBe(layers[0])
    expect(shadowSync.mock.calls.length).toBeGreaterThan(callsBeforeBlur)
    expect(shadowSync.mock.calls.slice(callsBeforeBlur).every(([element]) => element === card)).toBe(true)
  })

  it('restores the previous shadow when shadow geometry admission fails during a rebind', async () => {
    const originalShadow = '0 0 0 2px rgb(9 8 7)'
    card.style.setProperty('box-shadow', originalShadow, 'important')
    installPassingShadowGeometry()
    mountPanel()
    await settle()
    const layer = expectShadowLayer()
    expect(card.style.getPropertyValue('box-shadow')).toBe('var(--glass-v3-surface-edge)')

    shadowSync.mockImplementation(rejectShadowGeometry)
    panelWidth = 620
    window.dispatchEvent(new Event('resize'))
    await settle()

    expect(layer.isConnected).toBe(false)
    expect(card.style.getPropertyValue('box-shadow')).toBe(originalShadow)
    expect(card.style.getPropertyPriority('box-shadow')).toBe('important')
    expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
  })

  it('removes the shadow layer and restores the owned shadow on unmount', async () => {
    const originalShadow = '0 0 0 1px rgb(45 67 89)'
    card.style.setProperty('box-shadow', originalShadow, 'important')
    installPassingShadowGeometry()
    mountPanel()
    await settle()
    const layer = expectShadowLayer()

    wrapper?.unmount()
    wrapper = undefined

    expect(layer.isConnected).toBe(false)
    expect(card.style.getPropertyValue('box-shadow')).toBe(originalShadow)
    expect(card.style.getPropertyPriority('box-shadow')).toBe('important')
    expectNoPanelFilter(card)
  })

  it('removes the shadow layer and restores the owned shadow when a KeepAlive route leaves', async () => {
    shell.querySelector('.dashboard-grid')!.remove()
    const route = ref('dashboard')
    const Dashboard = defineComponent({
      render: () =>
        h('div', { class: 'dashboard-grid' }, [
          h('div', { class: 'dashboard-grid-content-measure' }, [
            h('div', { class: 'v-card', 'data-card': 'eligible' }),
          ]),
        ]),
    })
    const Search = defineComponent({ render: () => h('div', { class: 'v-card', 'data-card': 'second' }) })
    installPassingShadowGeometry()
    wrapper = mount(
      defineComponent({
        render: () => [
          h(GlassPanelRefractionDefs),
          h('main', { class: 'layout-page-content' }, [
            h(KeepAlive, null, () => (route.value === 'dashboard' ? h(Dashboard) : h(Search))),
          ]),
        ],
      }),
      { attachTo: shell },
    )
    await flushPromises()
    card = shell.querySelector('[data-card="eligible"]') as HTMLElement
    const originalShadow = '0 0 0 1px rgb(23 45 67)'
    card.style.setProperty('box-shadow', originalShadow, 'important')
    await settle()
    const layer = expectShadowLayer()

    route.value = 'search'
    await settle()

    expect(card.isConnected).toBe(false)
    expect(layer.isConnected).toBe(false)
    expect(card.style.getPropertyValue('box-shadow')).toBe(originalShadow)
    expect(card.style.getPropertyPriority('box-shadow')).toBe('important')
    expectNoPanelFilter(card)
    expect(shell.querySelector('.glass-panel-shadow')).toBeNull()
    const searchCard = shell.querySelector('[data-card="second"]') as HTMLElement
    expect(searchCard.style.getPropertyValue('backdrop-filter')).toContain('url(')
  })

  it('does not overwrite a later external shadow when releasing the layer', async () => {
    const originalShadow = '0 0 0 1px rgb(1 2 3)'
    const externalShadow = '0 0 0 3px rgb(4 5 6)'
    card.style.setProperty('box-shadow', originalShadow, 'important')
    installPassingShadowGeometry()
    mountPanel()
    await settle()
    const layer = expectShadowLayer()

    card.style.setProperty('box-shadow', externalShadow, 'important')
    wrapper?.unmount()
    wrapper = undefined

    expect(layer.isConnected).toBe(false)
    expect(card.style.getPropertyValue('box-shadow')).toBe(externalShadow)
    expect(card.style.getPropertyPriority('box-shadow')).toBe('important')
  })

  it.each(['observer', 'window'] as const)(
    'retains the aligned shadow node throughout a geometry update from %s',
    async source => {
      installPassingShadowGeometry()
      mountPanel()
      await settle()
      const layer = expectShadowLayer()
      const remove = vi.spyOn(layer, 'remove')
      shadowSync.mockClear()
      instantShadow.mockClear()

      panelWidth = 620
      if (source === 'observer') resize?.([], {} as ResizeObserver)
      else window.dispatchEvent(new Event('resize'))
      await vi.advanceTimersByTimeAsync(16)
      await flushPromises()

      expect(decodePending).toHaveLength(1)
      expectNoPanelFilter(card)
      expectShadowLayer()
      expect(card.nextElementSibling).toBe(layer)
      expect(card.style.getPropertyValue('box-shadow')).toBe('var(--glass-v3-surface-edge)')
      expect(remove).not.toHaveBeenCalled()
      expect(instantShadow).not.toHaveBeenCalled()

      await settle()

      expect(card.nextElementSibling).toBe(layer)
      expect(shell.querySelectorAll('.glass-panel-shadow')).toHaveLength(1)
      expect(remove).not.toHaveBeenCalled()
      expect(shadowSync).toHaveBeenCalledWith(card, layer)
      expect(shadowSync.mock.calls.every(([element, existing]) => element === card && existing === layer)).toBe(true)
      expect(instantShadow).not.toHaveBeenCalled()
      expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
      expect(wrapper?.find('feImage').attributes('width')).toBe('620')
    },
  )

  it.each([
    ['transitionend', 'border-radius'],
    ['transitionend', 'border-top-left-radius'],
    ['transitioncancel', 'border-radius'],
    ['transitioncancel', 'border-top-left-radius'],
  ] as const)('rechecks radius geometry on %s for %s without recreating the shadow', async (event, property) => {
    installPassingShadowGeometry()
    mountPanel()
    await settle()
    const layer = expectShadowLayer()
    const remove = vi.spyOn(layer, 'remove')
    const mapCalls = vi.mocked(createGlassNavbarDisplacementMap).mock.calls.length

    // 圆角变化不改变 border box，只有过渡事件能通知组件核对新轮廓。
    panelRadius = 24
    dispatchSurfaceTransition(event, property)
    await vi.advanceTimersByTimeAsync(16)
    await flushPromises()

    expect(decodePending).toHaveLength(1)
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(mapCalls + 1)
    expect(createGlassNavbarDisplacementMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 480, height: 240, radius: 24 }),
    )
    expectNoPanelFilter(card)
    expect(card.nextElementSibling).toBe(layer)
    expect(remove).not.toHaveBeenCalled()

    await settle()

    expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
    expect(card.nextElementSibling).toBe(layer)
    expect(remove).not.toHaveBeenCalled()
  })

  it.each(['transitionend', 'transitioncancel'] as const)(
    'rechecks transform admission on %s and restores a single layer when eligible again',
    async event => {
      installPassingShadowGeometry()
      mountPanel()
      await settle()
      const layer = expectShadowLayer()
      shadowSync.mockClear()

      panelTransform = 'matrix(1, 0, 0, 1, 10, 0)'
      shadowSync.mockImplementation(rejectShadowGeometry)
      card.classList.add('is-transforming')
      await flushPromises()
      const mapCalls = vi.mocked(createGlassNavbarDisplacementMap).mock.calls.length
      dispatchSurfaceTransition(event, 'transform')
      await settle()

      expect(shadowSync).not.toHaveBeenCalled()
      expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(mapCalls)
      expect(layer.isConnected).toBe(false)
      expect(shell.querySelector('.glass-panel-shadow')).toBeNull()
      expect(card.style.getPropertyValue('box-shadow')).toBe('')
      expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')

      panelTransform = 'none'
      installPassingShadowGeometry()
      dispatchSurfaceTransition(event, 'transform')
      await settle()

      expectShadowLayer()
      expect(card.nextElementSibling).not.toBe(layer)
      expect(shell.querySelectorAll('.glass-panel-shadow')).toHaveLength(1)
      expect(card.style.getPropertyValue('box-shadow')).toBe('var(--glass-v3-surface-edge)')
    },
  )

  it.each(['transitionend', 'transitioncancel'] as const)(
    'ignores unrelated properties and nested surfaces on %s',
    async event => {
      installPassingShadowGeometry()
      mountPanel()
      await settle()
      const layer = expectShadowLayer()
      const nested = shell.querySelector('[data-card="media"]') as HTMLElement
      shadowSync.mockClear()
      vi.mocked(createGlassNavbarDisplacementMap).mockClear()

      dispatchSurfaceTransition(event, 'box-shadow')
      dispatchSurfaceTransition(event, 'opacity')
      dispatchSurfaceTransition(event, 'transform', nested)
      dispatchSurfaceTransition(event, 'border-radius', layer)
      await settle()

      expect(shadowSync).not.toHaveBeenCalled()
      expect(createGlassNavbarDisplacementMap).not.toHaveBeenCalled()
      expect(card.nextElementSibling).toBe(layer)
    },
  )

  it('drops the layer immediately for a mounted external shadow override without rescheduling enhancement', async () => {
    installPassingShadowGeometry()
    mountPanel()
    await settle()
    const layer = expectShadowLayer()
    const filter = card.style.getPropertyValue('backdrop-filter')
    const externalShadow = '0 0 0 3px rgb(4 5 6)'
    shadowSync.mockClear()
    instantShadow.mockClear()

    card.style.setProperty('box-shadow', externalShadow)
    await flushPromises()

    expect(card.isConnected).toBe(true)
    expect(wrapper?.exists()).toBe(true)
    expect(layer.isConnected).toBe(false)
    expect(shell.querySelector('.glass-panel-shadow')).toBeNull()
    expect(card.style.getPropertyValue('box-shadow')).toBe(externalShadow)
    expect(card.style.getPropertyPriority('box-shadow')).toBe('')
    expect(card.style.getPropertyValue('backdrop-filter')).toBe(filter)

    await settle()

    expect(shadowSync).not.toHaveBeenCalled()
    expect(instantShadow).not.toHaveBeenCalled()
    expect(shell.querySelector('.glass-panel-shadow')).toBeNull()
    expect(card.style.getPropertyValue('box-shadow')).toBe(externalShadow)
    expect(card.style.getPropertyPriority('box-shadow')).toBe('')
  })

  it.each(['class', 'inline transform'] as const)(
    'drops the shadow for %s changes without scheduling enhancement until the transform is none',
    async source => {
      installPassingShadowGeometry()
      mountPanel()
      await settle()
      const layer = expectShadowLayer()
      const filter = card.style.getPropertyValue('backdrop-filter')
      shadowSync.mockClear()
      shadowSync.mockImplementation(rejectShadowGeometry)
      const requestFrame = vi.spyOn(window, 'requestAnimationFrame')
      vi.mocked(createGlassNavbarDisplacementMap).mockClear()

      if (source === 'class') {
        panelTransform = 'matrix(1, 0, 0, 1, 10, 0)'
        card.classList.add('is-transforming')
      } else card.style.transform = 'translateX(10px)'
      await flushPromises()

      expect(layer.isConnected).toBe(false)
      expect(shell.querySelector('.glass-panel-shadow')).toBeNull()
      expect(card.style.getPropertyValue('box-shadow')).toBe('')
      expect(card.style.getPropertyValue('backdrop-filter')).toBe(filter)
      expect(shadowSync).not.toHaveBeenCalled()

      await settle()

      expect(shadowSync).not.toHaveBeenCalled()
      expect(requestFrame).not.toHaveBeenCalled()
      expect(createGlassNavbarDisplacementMap).not.toHaveBeenCalled()
      expect(shell.querySelector('.glass-panel-shadow')).toBeNull()
      expect(card.style.getPropertyValue('backdrop-filter')).toBe(filter)

      if (source === 'class') card.classList.add('v-card--hover')
      else card.style.transform = 'translateX(20px)'
      await settle()

      expect(requestFrame).not.toHaveBeenCalled()
      expect(shadowSync).not.toHaveBeenCalled()

      installPassingShadowGeometry()
      if (source === 'class') {
        panelTransform = 'none'
        card.classList.remove('is-transforming')
      } else card.style.removeProperty('transform')
      await settle()

      expect(requestFrame).toHaveBeenCalled()
      expect(shadowSync).toHaveBeenCalledWith(card, null)
      expectShadowLayer()
      expect(shell.querySelectorAll('.glass-panel-shadow')).toHaveLength(1)
      expect(card.nextElementSibling).not.toBe(layer)
    },
  )

  it('ignores non-transform inline writes and non-card classes without a material feedback loop', async () => {
    installPassingShadowGeometry()
    mountPanel()
    await settle()
    const layer = expectShadowLayer()
    const nested = shell.querySelector('[data-card="media"]') as HTMLElement
    shadowSync.mockClear()
    instantShadow.mockClear()
    vi.mocked(createGlassNavbarDisplacementMap).mockClear()

    card.style.opacity = '0.8'
    card.style.transition = 'box-shadow 0s'
    nested.classList.add('is-transforming')
    nested.style.transform = 'translateX(10px)'
    layer.classList.add('shadow-state')
    await settle()

    expect(shadowSync).not.toHaveBeenCalled()
    expect(instantShadow).not.toHaveBeenCalled()
    expect(createGlassNavbarDisplacementMap).not.toHaveBeenCalled()
    expect(card.nextElementSibling).toBe(layer)
  })

  it.each(['', '0 0 0 1px rgb(1 2 3)'])(
    'hands shadow ownership to and from the layer through the atomic callback with original shadow "%s"',
    async original => {
      card.style.setProperty('box-shadow', original, original ? 'important' : '')
      const handoffs: Array<{ before: string; after: string; priority: string }> = []
      instantShadow.mockImplementation((element, apply) => {
        expect(element).toBe(card)
        const before = element.style.getPropertyValue('box-shadow')
        apply()
        handoffs.push({
          before,
          after: element.style.getPropertyValue('box-shadow'),
          priority: element.style.getPropertyPriority('box-shadow'),
        })
      })
      installPassingShadowGeometry()
      mountPanel()
      await vi.advanceTimersByTimeAsync(16)

      expect(instantShadow).not.toHaveBeenCalled()

      await settle()

      expect(handoffs).toEqual([{ before: original, after: 'var(--glass-v3-surface-edge)', priority: 'important' }])
      const layer = expectShadowLayer()
      window.dispatchEvent(new Event('resize'))
      await settle()
      expect(handoffs).toHaveLength(1)

      focused = false
      window.dispatchEvent(new Event('blur'))

      expect(handoffs).toEqual([
        { before: original, after: 'var(--glass-v3-surface-edge)', priority: 'important' },
        { before: 'var(--glass-v3-surface-edge)', after: original, priority: original ? 'important' : '' },
      ])
      expect(card.style.getPropertyValue('box-shadow')).toBe(original)
      expect(layer.isConnected).toBe(false)
    },
  )

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

  function addPrewarmCard() {
    const second = document.createElement('div')
    second.className = 'v-card'
    second.dataset.card = 'second'
    card.parentElement!.append(second)
    const bounds = second.getBoundingClientRect()
    vi.spyOn(second, 'getBoundingClientRect').mockImplementation(() => ({
      ...bounds,
      y: window.innerHeight + 32,
      top: window.innerHeight + 32,
      bottom: window.innerHeight + 32 + bounds.height,
    }))
    return second
  }

  it('does not delay visible surfaces while a prewarm surface is still decoding', async () => {
    const second = addPrewarmCard()
    mountPanel()
    await vi.advanceTimersByTimeAsync(16)
    expect(decodePending).toHaveLength(2)

    decodePending.shift()!.resolve()
    await flushPromises()
    expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
    expectNoPanelFilter(second)
    expect(wrapper?.findAll('filter')).toHaveLength(1)

    completePendingDecode()
    await flushPromises()
    expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
    expect(second.style.getPropertyValue('backdrop-filter')).toContain('url(')
    expect(wrapper?.findAll('filter')).toHaveLength(2)
  })

  it.each(['blur', 'hidden', 'css', 'detach'] as const)(
    'does not complete a pending prewarm batch after partial presentation and %s',
    async exit => {
      const second = addPrewarmCard()
      mountPanel()
      await vi.advanceTimersByTimeAsync(16)
      decodePending.shift()!.resolve()
      await flushPromises()
      expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
      expectNoPanelFilter(second)

      if (exit === 'blur') {
        focused = false
        window.dispatchEvent(new Event('blur'))
      } else if (exit === 'hidden') {
        visibility = 'hidden'
        document.dispatchEvent(new Event('visibilitychange'))
      } else if (exit === 'css') effectiveSettings.value.glassQuality = 'css'
      else {
        card.remove()
        second.remove()
      }
      await flushPromises()
      completePendingDecode()
      await flushPromises()
      await vi.advanceTimersByTimeAsync(16)
      expectNoPanelFilter(card)
      expectNoPanelFilter(second)
      expect(wrapper?.findAll('filter').some(filter => filter.attributes('width') === '600')).toBe(false)
    },
  )

  it('keeps a partially presented batch from replacing a newer geometry', async () => {
    const second = addPrewarmCard()
    mountPanel()
    await vi.advanceTimersByTimeAsync(16)
    decodePending.shift()!.resolve()
    await flushPromises()
    expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')

    panelWidth = 640
    resize?.([], {} as ResizeObserver)
    await vi.advanceTimersByTimeAsync(16)
    expect(decodePending).toHaveLength(2)
    decodePending.shift()!.resolve()
    await flushPromises()
    expectNoPanelFilter(card)
    completePendingDecode()
    await flushPromises()
    const id = card.dataset.glassPanelRefraction
    expect(id).toBeTruthy()
    expect(wrapper?.find(`filter[id="${id}"]`).attributes('width')).toBe('640')
    expect(second.style.getPropertyValue('backdrop-filter')).toContain('url(')
  })

  it('keeps visible surfaces in one presentation batch when their decodes finish apart', async () => {
    const second = document.createElement('div')
    second.className = 'v-card'
    second.dataset.card = 'second'
    card.parentElement!.append(second)
    mountPanel()
    await vi.advanceTimersByTimeAsync(16)
    expect(decodePending).toHaveLength(2)

    decodePending.shift()!.resolve()
    await flushPromises()
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

  it('restores a warm KeepAlive surface before the next animation frame', async () => {
    shell.querySelector('.dashboard-grid')!.remove()
    const route = ref('dashboard')
    const Dashboard = defineComponent({ render: () => h('div', { class: 'v-card', 'data-card': 'eligible' }) })
    const Search = defineComponent({ render: () => h('div', { class: 'v-card', 'data-card': 'second' }) })
    wrapper = mount(
      defineComponent({
        render: () => [
          h(GlassPanelRefractionDefs),
          h('main', { class: 'layout-page-content' }, [
            h(KeepAlive, null, () => (route.value === 'dashboard' ? h(Dashboard) : h(Search))),
          ]),
        ],
      }),
      { attachTo: shell },
    )
    await settle()
    card = shell.querySelector('[data-card="eligible"]') as HTMLElement
    const originalFilter = card.style.getPropertyValue('backdrop-filter')
    const originalId = card.dataset.glassPanelRefraction
    expect(originalId).toBeTruthy()

    route.value = 'search'
    await settle()
    expect(card.isConnected).toBe(false)
    expectNoPanelFilter(card)
    expect(shell.querySelector(`[id="${originalId}"]`)).toBeNull()
    const decodeCount = vi.mocked(createGlassNavbarDisplacementMap).mock.calls.length

    route.value = 'dashboard'
    await flushPromises()

    expect(shell.querySelector('[data-card="eligible"]')).toBe(card)
    expect(card.style.getPropertyValue('backdrop-filter')).toBe(originalFilter)
    expect(card.dataset.glassPanelRefraction).toBe(originalId)
    expect(shell.querySelector(`[id="${originalId}"]`)).not.toBeNull()
    expect(createGlassNavbarDisplacementMap).toHaveBeenCalledTimes(decodeCount)
    expect(decodePending).toHaveLength(0)
  })

  it('restores cached surfaces without waiting for a new sibling map to decode', async () => {
    mountPanel()
    await settle()
    const parent = card.parentElement!
    card.remove()
    await settle()

    const second = document.createElement('div')
    second.className = 'v-card'
    second.dataset.card = 'second'
    parent.append(card, second)
    await vi.advanceTimersByTimeAsync(16)
    await flushPromises()

    expect(decodePending).toHaveLength(1)
    expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
    expectNoPanelFilter(second)
    completePendingDecode()
    await flushPromises()
    expect(second.style.getPropertyValue('backdrop-filter')).toContain('url(')
  })

  it('does not restore a cached map with a different geometry', async () => {
    mountPanel()
    await settle()
    const parent = card.parentElement!
    card.remove()
    await settle()
    panelWidth = 640
    parent.append(card)
    await flushPromises()
    expectNoPanelFilter(card)
    await vi.advanceTimersByTimeAsync(16)
    expect(decodePending).toHaveLength(1)
    await settle()
    expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
    expect(wrapper?.find('feImage').attributes('width')).toBe('640')
  })

  it.each(['blur', 'hidden'] as const)('keeps warm re-entry suspended during %s', async state => {
    mountPanel()
    await settle()
    const parent = card.parentElement!
    card.remove()
    await settle()
    if (state === 'blur') focused = false
    else visibility = 'hidden'
    parent.append(card)
    await flushPromises()
    await vi.advanceTimersByTimeAsync(16)
    expectNoPanelFilter(card)
    expect(wrapper?.findAll('filter')).toHaveLength(0)

    focused = true
    visibility = 'visible'
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
    expect(decodePending).toHaveLength(0)
  })

  it('cancels a queued warm restoration when CSS quality is selected', async () => {
    mountPanel()
    await settle()
    const parent = card.parentElement!
    card.remove()
    await settle()
    parent.append(card)
    window.dispatchEvent(new Event('resize'))
    effectiveSettings.value.glassQuality = 'css'
    await flushPromises()
    expectNoPanelFilter(card)
    expect(card.hasAttribute('data-glass-panel-owner')).toBe(false)
    expect(wrapper?.findAll('filter')).toHaveLength(0)
  })

  it('does not revive an evicted map through a retained node identity', async () => {
    mountPanel()
    await settle()
    const parent = card.parentElement!
    const originalId = card.dataset.glassPanelRefraction
    card.remove()
    await settle()
    const other = document.createElement('div')
    other.className = 'v-card'
    for (let index = 0; index < 24; index++) {
      panelWidth = 600 + index
      parent.append(other)
      await settle()
      other.remove()
      await settle()
    }
    panelWidth = 480
    parent.append(card)
    await flushPromises()
    expectNoPanelFilter(card)
    await vi.advanceTimersByTimeAsync(16)
    expect(decodePending).toHaveLength(1)
    await settle()
    expect(card.dataset.glassPanelRefraction).toBe(originalId)
    expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
  })

  it('does not attach a late decoded map to a detached route before the next frame', async () => {
    mountPanel()
    await vi.advanceTimersByTimeAsync(16)
    expect(decodePending).toHaveLength(1)
    card.remove()
    await flushPromises()
    completePendingDecode()
    await flushPromises()
    expectNoPanelFilter(card)
    expect(card.hasAttribute('data-glass-panel-owner')).toBe(false)
    expect(wrapper?.findAll('filter')).toHaveLength(0)
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

  it.each(['clear', 'tinted', 'frosted'] as const)(
    'leaves horizontal navigation resize ownership outside card preparation for %s',
    async appearance => {
      effectiveSettings.value.glassAppearance = appearance
      mountPanel()
      await settle()

      expect(observe).toHaveBeenCalledWith(card)
      expect(observe).not.toHaveBeenCalledWith(shell.querySelector('.layout-navbar'))
      expect(observe).not.toHaveBeenCalledWith(shell.querySelector('.layout-vertical-nav'))
      expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')
    },
  )

  it('releases navigation geometry observers when the sidebar layout becomes horizontal', async () => {
    resetFixture(false)
    effectiveSettings.value.glassAppearance = 'frosted'
    mountPanel()
    await settle()
    const navbar = shell.querySelector('.layout-navbar')
    const sidebar = shell.querySelector('.layout-vertical-nav')
    expect(observe).toHaveBeenCalledWith(navbar)
    expect(observe).toHaveBeenCalledWith(sidebar)

    observe.mockClear()
    shell.classList.add('layout-horizontal-nav-active')
    await flushPromises()
    await settle()
    expect(unobserve).toHaveBeenCalledWith(navbar)
    expect(unobserve).toHaveBeenCalledWith(sidebar)
    expect(observe).not.toHaveBeenCalledWith(navbar)
    expect(observe).not.toHaveBeenCalledWith(sidebar)
    expect(card.style.getPropertyValue('backdrop-filter')).toContain('url(')

    shell.classList.remove('layout-horizontal-nav-active')
    await flushPromises()
    await settle()
    expect(observe).toHaveBeenCalledWith(navbar)
    expect(observe).toHaveBeenCalledWith(sidebar)
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

  it('does not rewrite ready card and navigation material for same-geometry syncs', async () => {
    resetFixture(false)
    effectiveSettings.value.glassAppearance = 'frosted'
    document.documentElement.dataset.glassAppearance = 'frosted'
    const second = document.createElement('div')
    second.className = 'v-card'
    second.dataset.card = 'second'
    card.parentElement!.append(second)
    installPassingShadowGeometry()
    mountPanel()
    await settle()

    const navbar = shell.querySelector('.layout-navbar') as HTMLElement
    const backplate = shell.querySelector('.glass-fixed-shell-backplate__layer') as HTMLElement
    const cardFilter = card.style.getPropertyValue('backdrop-filter')
    const secondFilter = second.style.getPropertyValue('backdrop-filter')
    const cardShadow = card.style.getPropertyValue('box-shadow')
    const secondShadow = second.style.getPropertyValue('box-shadow')
    const navbarFilter = navbar.style.getPropertyValue('--glass-panel-filter')
    const backplateFilter = backplate.style.getPropertyValue('filter')
    const surfaces = [card, second, navbar, backplate]
    const markers = surfaces.map(element => element.dataset.glassPanelRefraction)
    expect(cardFilter).toContain('url(')
    expect(secondFilter).toContain('url(')
    expect(navbarFilter).toContain('url(')
    expect(backplateFilter).toContain('url(')
    expect(markers.every(Boolean)).toBe(true)

    const cardSetter = vi.spyOn(card.style, 'setProperty')
    const secondSetter = vi.spyOn(second.style, 'setProperty')
    const navbarSetter = vi.spyOn(navbar.style, 'setProperty')
    const backplateSetter = vi.spyOn(backplate.style, 'setProperty')
    const markerRecords: MutationRecord[] = []
    const markerObserver = new MutationObserver(records => markerRecords.push(...records))
    for (const element of surfaces)
      markerObserver.observe(element, { attributes: true, attributeFilter: ['data-glass-panel-refraction'] })

    for (let index = 0; index < 5; index += 1) {
      if (index % 2 === 0) resize?.([], {} as ResizeObserver)
      else shell.setAttribute('data-shell-mode', 'desktop')
      await flushPromises()
      await settle()
    }
    markerObserver.disconnect()

    expect(cardSetter.mock.calls.filter(([property]) => property === 'backdrop-filter')).toHaveLength(0)
    expect(cardSetter.mock.calls.filter(([property]) => property === '-webkit-backdrop-filter')).toHaveLength(0)
    expect(cardSetter.mock.calls.filter(([property]) => property === 'box-shadow')).toHaveLength(0)
    expect(secondSetter.mock.calls.filter(([property]) => property === 'backdrop-filter')).toHaveLength(0)
    expect(secondSetter.mock.calls.filter(([property]) => property === '-webkit-backdrop-filter')).toHaveLength(0)
    expect(secondSetter.mock.calls.filter(([property]) => property === 'box-shadow')).toHaveLength(0)
    expect(navbarSetter.mock.calls.filter(([property]) => property === '--glass-panel-filter')).toHaveLength(0)
    expect(backplateSetter.mock.calls.filter(([property]) => property === 'filter')).toHaveLength(0)
    expect(markerRecords).toHaveLength(0)
    expect(card.style.getPropertyValue('backdrop-filter')).toBe(cardFilter)
    expect(card.style.getPropertyValue('-webkit-backdrop-filter')).toBe(cardFilter)
    expect(card.style.getPropertyValue('box-shadow')).toBe(cardShadow)
    expect(second.style.getPropertyValue('backdrop-filter')).toBe(secondFilter)
    expect(second.style.getPropertyValue('-webkit-backdrop-filter')).toBe(secondFilter)
    expect(second.style.getPropertyValue('box-shadow')).toBe(secondShadow)
    expect(navbar.style.getPropertyValue('--glass-panel-filter')).toBe(navbarFilter)
    expect(backplate.style.getPropertyValue('filter')).toBe(backplateFilter)
    expect(surfaces.map(element => element.dataset.glassPanelRefraction)).toEqual(markers)
  })

  it('prepares a new card without replacing the existing card filter reference', async () => {
    mountPanel()
    await settle()
    const originalFilter = card.style.getPropertyValue('backdrop-filter')
    const originalMarker = card.dataset.glassPanelRefraction
    const originalId = originalMarker!
    const parent = card.parentElement!
    const second = document.createElement('div')
    second.className = 'v-card'
    second.dataset.card = 'second'
    parent.append(second)

    await settle()

    expect(shell.querySelector('[data-card="eligible"]')).toBe(card)
    expect(card.style.getPropertyValue('backdrop-filter')).toBe(originalFilter)
    expect(card.dataset.glassPanelRefraction).toBe(originalMarker)
    expect(second.style.getPropertyValue('backdrop-filter')).toContain('url(')
    expect(second.dataset.glassPanelRefraction).toBeTruthy()
    expect(wrapper?.findAll('filter').map(filter => filter.attributes('id'))).toContain(originalId)
  })

  it('reclaims material after an external value override or priority removal', async () => {
    mountPanel()
    await settle()

    const cardFilter = card.style.getPropertyValue('backdrop-filter')
    const marker = card.dataset.glassPanelRefraction
    card.style.setProperty('backdrop-filter', 'blur(2px)', 'important')
    card.style.setProperty('-webkit-backdrop-filter', cardFilter)

    resize?.([], {} as ResizeObserver)
    await settle()

    expect(card.style.getPropertyValue('backdrop-filter')).toBe(cardFilter)
    expect(card.style.getPropertyPriority('backdrop-filter')).toBe('important')
    expect(card.style.getPropertyValue('-webkit-backdrop-filter')).toBe(cardFilter)
    expect(card.style.getPropertyPriority('-webkit-backdrop-filter')).toBe('important')
    expect(card.dataset.glassPanelRefraction).toBe(marker)
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
