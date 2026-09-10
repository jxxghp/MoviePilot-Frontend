import { syncGlassPanelShadow, withInstantGlassShadow } from '@/utils/glassPanelShadow'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface RectValues {
  left: number
  top: number
  width: number
  height: number
}

interface FixtureOptions {
  bounds?: RectValues
  origin?: Pick<RectValues, 'left' | 'top'>
}

type ComputedStyleOverrides = Record<string, string>

const DEFAULT_BOUNDS: RectValues = {
  left: 123.75,
  top: 245.5,
  width: 160.5,
  height: 80.25,
}
const SHADOW_RADIUS = 'var(--app-theme-surface-radius, 20px)'
const SHADOW_TRANSITION_PROPERTIES =
  'box-shadow, border-top-left-radius, border-top-right-radius, border-bottom-right-radius, border-bottom-left-radius'

let boundsByElement: WeakMap<HTMLElement, RectValues>
let offsetParentByElement: WeakMap<HTMLElement, Element | null>
let shadowOrigin: Pick<RectValues, 'left' | 'top'>
let shadowScale: number
let shadowOffsetParent: Element | null
let offsetParentDescriptor: PropertyDescriptor | undefined
let layerComputedRadius: string | undefined
let nativeGetComputedStyle: (element: Element, pseudoElement?: string | null) => CSSStyleDeclaration
let computedStyleOverrides: WeakMap<HTMLElement, ComputedStyleOverrides>

function createRect({ left, top, width, height }: RectValues): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

function pixels(value: string) {
  const parsed = Number.parseFloat(value)

  return Number.isFinite(parsed) ? parsed : 0
}

function createFixture(options: FixtureOptions = {}) {
  const parent = document.createElement('div')
  const element = document.createElement('article')
  const bounds = options.bounds ?? DEFAULT_BOUNDS

  parent.style.position = 'relative'
  element.style.position = 'relative'
  element.style.transform = 'none'
  parent.append(element)
  document.body.append(parent)

  boundsByElement.set(element, bounds)
  offsetParentByElement.set(element, parent)
  shadowOrigin = options.origin ?? { left: 100.25, top: 200.5 }
  shadowOffsetParent = parent

  return { element, parent }
}

function createExistingLayer(element: HTMLElement) {
  const layer = document.createElement('div')

  layer.className = 'glass-panel-shadow'
  element.after(layer)

  return layer
}

describe('syncGlassPanelShadow', () => {
  beforeEach(() => {
    boundsByElement = new WeakMap()
    offsetParentByElement = new WeakMap()
    shadowOrigin = { left: 0, top: 0 }
    shadowScale = 1
    shadowOffsetParent = null
    layerComputedRadius = undefined
    computedStyleOverrides = new WeakMap()
    offsetParentDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')
    nativeGetComputedStyle = window.getComputedStyle.bind(window)

    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
      const computed = nativeGetComputedStyle(element, pseudoElement)
      const isLayer = element.classList.contains('glass-panel-shadow')
      const overrides = element instanceof HTMLElement ? computedStyleOverrides.get(element) : undefined
      if (!isLayer && !overrides) return computed

      const card = element.previousElementSibling
      const radius =
        layerComputedRadius ??
        (card instanceof HTMLElement ? nativeGetComputedStyle(card).borderRadius : computed.borderRadius)

      return new Proxy(computed, {
        get(target, property) {
          if (overrides && typeof property === 'string' && property in overrides) return overrides[property]
          if (property === 'borderRadius') return radius

          return Reflect.get(target, property, target)
        },
      })
    })

    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get(this: HTMLElement) {
        if (offsetParentByElement.has(this)) return offsetParentByElement.get(this) ?? null
        if (this.classList.contains('glass-panel-shadow')) return shadowOffsetParent

        return null
      },
    })

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('glass-panel-shadow')) {
        const width = pixels(this.style.width) * shadowScale
        const height = pixels(this.style.height) * shadowScale

        return createRect({
          left: shadowOrigin.left + pixels(this.style.left),
          top: shadowOrigin.top + pixels(this.style.top),
          width,
          height,
        })
      }

      return createRect(boundsByElement.get(this) ?? { left: 0, top: 0, width: 0, height: 0 })
    })
  })

  afterEach(() => {
    document.body.replaceChildren()
    if (offsetParentDescriptor) Object.defineProperty(HTMLElement.prototype, 'offsetParent', offsetParentDescriptor)
    else Reflect.deleteProperty(HTMLElement.prototype, 'offsetParent')
  })

  it('uses fractional border-box geometry relative to a non-zero positioning origin', () => {
    const { element, parent } = createFixture()
    const layer = syncGlassPanelShadow(element, null)

    expect(layer).not.toBeNull()
    expect(layer?.style.width).toBe('160.5px')
    expect(layer?.style.height).toBe('80.25px')
    expect(layer?.style.left).toBe('23.5px')
    expect(layer?.style.top).toBe('45px')
    expect(layer?.getBoundingClientRect()).toMatchObject({
      left: DEFAULT_BOUNDS.left,
      top: DEFAULT_BOUNDS.top,
      width: DEFAULT_BOUNDS.width,
      height: DEFAULT_BOUNDS.height,
    })
    expect(parent.firstElementChild).toBe(element)
    expect(element.matches(':first-child')).toBe(true)
    expect(element.nextElementSibling).toBe(layer)
  })

  it('reuses the same layer without duplicating the next sibling', () => {
    const { element, parent } = createFixture()
    const firstLayer = syncGlassPanelShadow(element, null)

    boundsByElement.set(element, { left: 130.25, top: 250.75, width: 172.5, height: 84.5 })
    const reusedLayer = syncGlassPanelShadow(element, firstLayer)

    expect(reusedLayer).toBe(firstLayer)
    expect(parent.children).toHaveLength(2)
    expect(parent.querySelectorAll('.glass-panel-shadow')).toHaveLength(1)
    expect(reusedLayer?.style.width).toBe('172.5px')
    expect(reusedLayer?.style.height).toBe('84.5px')
    expect(reusedLayer?.style.left).toBe('30px')
    expect(reusedLayer?.style.top).toBe('50.25px')
  })

  it('copies radius and selects the cyclic box-shadow transition lists without copying surface content', () => {
    const { element } = createFixture()

    element.style.borderRadius = '8px 12px 16px 20px'
    element.style.transitionProperty = 'opacity, border-radius, transform, box-shadow'
    element.style.transitionDuration = '100ms, 200ms'
    element.style.transitionTimingFunction = 'ease, cubic-bezier(0.2, 0.8, 0.4, 1)'
    element.style.transitionDelay = '0ms, 10ms, 20ms'
    element.style.background = 'rgb(1, 2, 3)'
    element.style.setProperty('backdrop-filter', 'blur(12px)')

    const layer = syncGlassPanelShadow(element, null)

    expect(layer).not.toBeNull()
    expect(layer?.style.borderRadius).toBe(SHADOW_RADIUS)
    expect(layer?.style.transitionProperty).toBe(SHADOW_TRANSITION_PROPERTIES)
    expect(layer?.style.transitionDuration).toBe('200ms, 200ms, 200ms, 200ms, 200ms')
    expect(layer?.style.transitionTimingFunction).toBe(
      'cubic-bezier(0.2, 0.8, 0.4, 1), cubic-bezier(0.2, 0.8, 0.4, 1), cubic-bezier(0.2, 0.8, 0.4, 1), cubic-bezier(0.2, 0.8, 0.4, 1), cubic-bezier(0.2, 0.8, 0.4, 1)',
    )
    expect(layer?.style.transitionDelay).toBe('0ms, 10ms, 10ms, 10ms, 10ms')
    expect(window.getComputedStyle(layer!).borderRadius).toBe(window.getComputedStyle(element).borderRadius)
    expect(layer?.style.cssText).not.toMatch(/background|backdrop/i)
    expect(layer?.style.getPropertyValue('background')).toBe('')
    expect(layer?.style.getPropertyValue('backdrop-filter')).toBe('')
    expect(layer?.style.getPropertyValue('-webkit-backdrop-filter')).toBe('')
  })

  it('uses the later box-shadow transition when all is listed before it', () => {
    const { element } = createFixture()

    element.style.transitionProperty = 'all, box-shadow'
    element.style.transitionDuration = '100ms, 240ms'
    element.style.transitionTimingFunction = 'ease, cubic-bezier(0.2, 0.8, 0.4, 1)'
    element.style.transitionDelay = '0ms, 16ms'

    const layer = syncGlassPanelShadow(element, null)

    expect(layer?.style.transitionProperty).toBe(SHADOW_TRANSITION_PROPERTIES)
    expect(layer?.style.transitionDuration).toBe('240ms, 100ms, 100ms, 100ms, 100ms')
    expect(layer?.style.transitionTimingFunction).toBe('cubic-bezier(0.2, 0.8, 0.4, 1), ease, ease, ease, ease')
    expect(layer?.style.transitionDelay).toBe('16ms, 0ms, 0ms, 0ms, 0ms')
  })

  it('does not write styles or emit attribute mutations during a stable sync', () => {
    const { element } = createFixture()
    const layer = syncGlassPanelShadow(element, null)
    const styleBefore = layer?.style.cssText
    const mutations: MutationRecord[] = []
    const observer = new MutationObserver(records => mutations.push(...records))

    expect(layer).not.toBeNull()
    observer.observe(layer!, { attributes: true, attributeFilter: ['style'] })
    expect(syncGlassPanelShadow(element, layer)).toBe(layer)

    expect(layer?.style.cssText).toBe(styleBefore)
    expect(observer.takeRecords()).toHaveLength(0)
    expect(mutations).toHaveLength(0)
    observer.disconnect()
  })

  it('rejects an initial custom inline shadow without creating a layer or changing the card shadow', () => {
    const { element, parent } = createFixture()

    element.style.setProperty('box-shadow', '0 4px 12px rgb(0 0 0 / 24%)')
    const businessShadow = element.style.getPropertyValue('box-shadow')

    expect(syncGlassPanelShadow(element, null)).toBeNull()
    expect(element.style.getPropertyValue('box-shadow')).toBe(businessShadow)
    expect(parent.querySelector('.glass-panel-shadow')).toBeNull()
  })

  it('removes an existing layer after an external inline shadow override and preserves that shadow', () => {
    const { element, parent } = createFixture()
    const layer = syncGlassPanelShadow(element, null)

    expect(layer).not.toBeNull()
    element.style.setProperty('box-shadow', '0 6px 18px rgb(0 0 0 / 32%)')
    const businessShadow = element.style.getPropertyValue('box-shadow')

    expect(syncGlassPanelShadow(element, layer)).toBeNull()
    expect(layer?.isConnected).toBe(false)
    expect(element.style.getPropertyValue('box-shadow')).toBe(businessShadow)
    expect(parent.querySelector('.glass-panel-shadow')).toBeNull()
  })

  it.each(['initial creation', 'geometry update'])('removes a layer when target radius differs during %s', phase => {
    const { element, parent } = createFixture()

    element.style.borderRadius = '20px'
    const initialLayer = syncGlassPanelShadow(element, null)

    if (phase === 'initial creation') {
      initialLayer?.remove()
      layerComputedRadius = '24px'
      expect(syncGlassPanelShadow(element, null)).toBeNull()
    } else {
      expect(initialLayer).not.toBeNull()
      boundsByElement.set(element, { left: 130.25, top: 250.75, width: 172.5, height: 84.5 })
      layerComputedRadius = '24px'
      expect(syncGlassPanelShadow(element, initialLayer)).toBeNull()
    }

    expect(element.style.borderRadius).toBe('20px')
    expect(parent.querySelector('.glass-panel-shadow')).toBeNull()
  })

  it.each([
    [
      'different offsetParent',
      () => {
        shadowOffsetParent = document.createElement('div')
      },
    ],
    [
      'alignment beyond tolerance',
      () => {
        shadowScale = 1.01
      },
    ],
    [
      'offline element',
      (element: HTMLElement) => {
        element.remove()
      },
    ],
    [
      'fixed element',
      (element: HTMLElement) => {
        element.style.position = 'fixed'
      },
    ],
    [
      'transformed element',
      (element: HTMLElement) => {
        element.style.transform = 'translateX(1px)'
      },
    ],
  ])('removes the existing layer and returns null for %s', (_reason, invalidate) => {
    const { element, parent } = createFixture()
    const existing = createExistingLayer(element)

    invalidate(element)

    expect(syncGlassPanelShadow(element, existing)).toBeNull()
    expect(existing.isConnected).toBe(false)
    expect(parent.querySelector('.glass-panel-shadow')).toBeNull()
  })

  describe('withInstantGlassShadow', () => {
    it('temporarily appends an instant shadow transition, preserves other text, and restores the inline priority', () => {
      const { element } = createFixture()

      element.style.setProperty('transition', 'opacity 220ms ease-in 40ms, transform 120ms linear 0s', 'important')
      const previous = element.style.getPropertyValue('transition')
      let temporary = ''
      let applied = false

      withInstantGlassShadow(element, () => {
        applied = true
        temporary = element.style.getPropertyValue('transition')
        element.style.setProperty('box-shadow', 'var(--glass-v3-surface-edge)')
      })

      expect(applied).toBe(true)
      expect(temporary).toContain('opacity 220ms')
      expect(temporary).toContain('transform 120ms')
      expect(temporary).toContain('box-shadow 0s')
      expect(element.style.getPropertyValue('transition')).toBe(previous)
      expect(element.style.getPropertyPriority('transition')).toBe('important')
    })

    it('restores the original transition and priority when apply throws', () => {
      const { element } = createFixture()
      const error = new Error('apply failed')

      element.style.setProperty('transition', 'opacity 180ms ease 20ms', 'important')
      const previous = element.style.getPropertyValue('transition')

      expect(() =>
        withInstantGlassShadow(element, () => {
          throw error
        }),
      ).toThrow(error)
      expect(element.style.getPropertyValue('transition')).toBe(previous)
      expect(element.style.getPropertyPriority('transition')).toBe('important')
    })

    it('removes the temporary transition when the original inline value is absent', () => {
      const { element } = createFixture()

      computedStyleOverrides.set(element, {
        transition: 'opacity 220ms ease-in 40ms, transform 120ms linear 0s',
        transitionProperty: 'opacity, transform',
        transitionDuration: '220ms, 120ms',
      })

      let temporary = ''
      withInstantGlassShadow(element, () => {
        temporary = element.style.getPropertyValue('transition')
      })

      expect(temporary).toContain('opacity 220ms')
      expect(temporary).toContain('transform 120ms')
      expect(temporary).toContain('box-shadow 0s')
      expect(element.style.getPropertyValue('transition')).toBe('')
      expect(element.style.getPropertyPriority('transition')).toBe('')
    })

    it.each([
      ['none', 'none'],
      ['zero duration', 'opacity 0s'],
    ])('applies directly for %s without appending a shadow transition', (_name, transition) => {
      const { element } = createFixture()

      element.style.setProperty('transition', transition, 'important')
      computedStyleOverrides.set(element, {
        transitionProperty: transition === 'none' ? 'none' : 'opacity',
        transitionDuration: '0s',
      })
      const before = element.style.getPropertyValue('transition')
      let observed = ''

      withInstantGlassShadow(element, () => {
        observed = element.style.getPropertyValue('transition')
      })

      expect(observed).toBe(before)
      expect(element.style.getPropertyValue('transition')).toBe(before)
      expect(element.style.getPropertyPriority('transition')).toBe('important')
    })
  })
})
