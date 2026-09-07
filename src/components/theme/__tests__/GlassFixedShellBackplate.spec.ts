import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GlassFixedShellBackplate from '@/components/theme/GlassFixedShellBackplate.vue'
import type { GlassFixedShellBackplateLayer } from '@/composables/useGlassFixedShellBackplate'

const initialLayers: readonly GlassFixedShellBackplateLayer[] = [
  {
    key: 'front',
    role: 'active',
    crossOrigin: 'anonymous',
    src: '/wallpaper-current.jpg',
    style: {
      '--glass-wallpaper-brightness': '0.82',
    },
    url: '/wallpaper-current.jpg',
  },
  {
    key: 'back',
    role: 'standby',
    crossOrigin: 'anonymous',
    src: '/wallpaper-next.jpg',
    style: {
      '--glass-wallpaper-brightness': '0.76',
    },
    url: '/wallpaper-next.jpg',
  },
]

interface TestRect {
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
  toJSON: () => Record<string, never>
}

interface BackplateMountOptions {
  [key: string]: unknown
  attachTo?: Element
  props: {
    isOverlayNav: boolean
    isOverlayNavActive: boolean
    layers: readonly GlassFixedShellBackplateLayer[]
    transitionDurationMs: number
  }
}

const mountedWrappers: Array<ReturnType<typeof mount>> = []
let resizeCallback: ResizeObserverCallback | undefined
let resizeDisconnect: ReturnType<typeof vi.fn> | undefined
let backplateRect: TestRect
let sidebarRect: TestRect
let navbarRect: TestRect

function createRect(left: number, top: number, width: number, height: number): TestRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    toJSON: () => ({}),
    width,
  }
}

function mountBackplate(options: BackplateMountOptions) {
  const wrapper = mount(GlassFixedShellBackplate, options)
  mountedWrappers.push(wrapper)
  return wrapper
}

function mountConnectedShell(horizontal = false) {
  const shell = document.createElement('div')
  shell.className = `layout-wrapper${horizontal ? ' layout-horizontal-nav-active' : ''}`
  shell.dataset.shellMode = 'desktop'
  shell.dataset.shellNavbarAttachment = horizontal ? 'theme-qualified' : 'connected'

  const sidebar = document.createElement('aside')
  sidebar.className = 'layout-vertical-nav'
  const navbar = document.createElement('header')
  navbar.className = 'layout-navbar'
  shell.append(sidebar, navbar)
  document.body.append(shell)

  return {
    navbar,
    shell,
    sidebar,
    wrapper: mountBackplate({
      attachTo: shell,
      props: {
        isOverlayNav: false,
        isOverlayNavActive: false,
        layers: initialLayers,
        transitionDurationMs: 1500,
      },
    }),
  }
}

async function settleGeometry() {
  await nextTick()
  await flushPromises()
  await nextTick()
  await Promise.resolve()
}

describe('GlassFixedShellBackplate', () => {
  beforeEach(() => {
    resizeCallback = undefined
    resizeDisconnect = vi.fn()
    backplateRect = createRect(5, 3, 1185, 790)
    sidebarRect = createRect(13, 11, 252, 774)
    navbarRect = createRect(273, 11, 909, 72)

    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback
        }

        observe() {}

        unobserve() {}

        disconnect() {
          resizeDisconnect?.()
        }
      },
    )
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('glass-fixed-shell-backplate--main')) return backplateRect as DOMRect
      if (this.classList.contains('layout-vertical-nav')) return sidebarRect as DOMRect
      if (this.classList.contains('layout-navbar')) return navbarRect as DOMRect
      return createRect(0, 0, 0, 0) as DOMRect
    })
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      element =>
        ({
          borderBottomLeftRadius: element instanceof HTMLElement ? '16px' : '0px',
          borderBottomRightRadius: element instanceof HTMLElement ? '16px' : '0px',
          borderEndEndRadius: element instanceof HTMLElement ? '16px' : '0px',
          borderEndStartRadius: element instanceof HTMLElement ? '16px' : '0px',
          borderRadius: element instanceof HTMLElement ? '16px' : '0px',
          borderStartEndRadius: element instanceof HTMLElement ? '16px' : '0px',
          borderStartStartRadius: element instanceof HTMLElement ? '16px' : '0px',
          borderTopLeftRadius: element instanceof HTMLElement ? '16px' : '0px',
          borderTopRightRadius: element instanceof HTMLElement ? '16px' : '0px',
          getPropertyValue: (property: string) => (property.includes('radius') ? '16px' : ''),
        }) as unknown as CSSStyleDeclaration,
    )
    document.documentElement.dataset.theme = 'glass'
  })

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
    document.querySelectorAll('.layout-wrapper').forEach(element => element.remove())
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-theme-radius')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders the App-owned slots once for the shared desktop shell', () => {
    const wrapper = mountBackplate({
      props: {
        isOverlayNav: false,
        isOverlayNavActive: false,
        layers: initialLayers,
        transitionDurationMs: 1500,
      },
    })

    expect(wrapper.findAll('[data-backplate-surface="main"] [data-backplate-slot]')).toHaveLength(2)
    expect(wrapper.find('[data-backplate-slot="front"]').classes()).toContain('is-active')
    expect(wrapper.find('[data-backplate-slot="back"]').classes()).toContain('is-standby')
    expect(wrapper.find('[data-backplate-slot="front"] img').attributes()).toMatchObject({
      crossorigin: 'anonymous',
      src: '/wallpaper-current.jpg',
    })
    expect(wrapper.find('[data-backplate-surface="main"]').attributes('style')).toContain(
      '--glass-fixed-shell-transition-duration: 1500ms',
    )
    expect(wrapper.find('[data-backplate-surface="overlay-nav"]').exists()).toBe(false)
  })

  it('preserves slot nodes while their active and previous roles swap', async () => {
    const wrapper = mountBackplate({
      props: {
        isOverlayNav: false,
        isOverlayNavActive: false,
        layers: initialLayers,
        transitionDurationMs: 1500,
      },
    })
    const frontSlot = wrapper.find('[data-backplate-surface="main"] [data-backplate-slot="front"]').element
    const backSlot = wrapper.find('[data-backplate-surface="main"] [data-backplate-slot="back"]').element

    await wrapper.setProps({
      layers: [
        { ...initialLayers[0], role: 'previous' },
        { ...initialLayers[1], role: 'active' },
      ],
    })

    expect(wrapper.find('[data-backplate-surface="main"] [data-backplate-slot="front"]').element).toBe(frontSlot)
    expect(wrapper.find('[data-backplate-surface="main"] [data-backplate-slot="back"]').element).toBe(backSlot)
    expect(wrapper.find('[data-backplate-slot="front"]').classes()).toContain('is-previous')
    expect(wrapper.find('[data-backplate-slot="back"]').classes()).toContain('is-active')
  })

  it('adds a separately clipped surface only for mobile overlay navigation', () => {
    const wrapper = mountBackplate({
      props: {
        isOverlayNav: true,
        isOverlayNavActive: true,
        layers: initialLayers,
        transitionDurationMs: 1500,
      },
    })

    const overlay = wrapper.find('[data-backplate-surface="overlay-nav"]')
    expect(overlay.exists()).toBe(true)
    expect(overlay.classes()).toContain('is-visible')
    expect(overlay.findAll('[data-backplate-slot]')).toHaveLength(2)
  })

  it('maps both connected surfaces to backplate-relative objectBoundingBox geometry', async () => {
    const { wrapper } = mountConnectedShell()
    await settleGeometry()

    const main = wrapper.get('[data-backplate-surface="main"]')
    const mainElement = main.element as HTMLElement
    const clipPath = wrapper.get('clipPath')
    const rects = clipPath.findAll('rect')

    expect(clipPath.attributes('clipPathUnits')).toBe('objectBoundingBox')
    expect(rects).toHaveLength(2)
    expect(mainElement.style.clipPath).toMatch(/^url\(#glass-fixed-shell-clip-/u)
    expect(Number(rects[0].attributes('x'))).toBeCloseTo(8 / 1185, 8)
    expect(Number(rects[0].attributes('y'))).toBeCloseTo(8 / 790, 8)
    expect(Number(rects[0].attributes('width'))).toBeCloseTo(252 / 1185, 8)
    expect(Number(rects[0].attributes('height'))).toBeCloseTo(774 / 790, 8)
    expect(Number(rects[0].attributes('rx'))).toBeCloseTo(16 / 1185, 8)
    expect(Number(rects[0].attributes('ry'))).toBeCloseTo(16 / 790, 8)
    expect(Number(rects[1].attributes('x'))).toBeCloseTo(268 / 1185, 8)
    expect(Number(rects[1].attributes('y'))).toBeCloseTo(8 / 790, 8)
    expect(Number(rects[1].attributes('width'))).toBeCloseTo(909 / 1185, 8)
    expect(Number(rects[1].attributes('height'))).toBeCloseTo(72 / 790, 8)
    expect(Number(rects[1].attributes('rx'))).toBeCloseTo(16 / 1185, 8)
    expect(Number(rects[1].attributes('ry'))).toBeCloseTo(16 / 790, 8)
    expect(wrapper.findAll('[data-backplate-surface="main"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-backplate-slot]')).toHaveLength(2)
  })

  it('does not activate the connected clip for horizontal navigation', async () => {
    const { wrapper } = mountConnectedShell(true)
    await settleGeometry()

    expect((wrapper.get('[data-backplate-surface="main"]').element as HTMLElement).style.clipPath).toBe('')
    expect(wrapper.findAll('clipPath rect')).toHaveLength(0)
  })

  it('updates the shared clip when theme radius changes without resizing navigation', async () => {
    const { wrapper, sidebar } = mountConnectedShell()
    await settleGeometry()
    const style = window.getComputedStyle(sidebar)
    vi.mocked(window.getComputedStyle).mockReturnValue({ ...style, borderTopLeftRadius: '24px' })

    document.documentElement.dataset.themeRadius = 'extra'
    await settleGeometry()

    for (const rect of wrapper.findAll('clipPath rect')) {
      expect(Number(rect.attributes('rx'))).toBeCloseTo(24 / backplateRect.width, 8)
      expect(Number(rect.attributes('ry'))).toBeCloseTo(24 / backplateRect.height, 8)
    }
  })

  it('refreshes dimensions and disconnects the resize observer on unmount', async () => {
    const { wrapper } = mountConnectedShell()
    await settleGeometry()

    backplateRect = createRect(5, 3, 1180, 790)
    sidebarRect = createRect(13, 11, 60, 774)
    navbarRect = createRect(273, 11, 904, 96)
    resizeCallback?.([], {} as ResizeObserver)
    await settleGeometry()

    const rects = wrapper.findAll('clipPath rect')
    expect(Number(rects[0].attributes('width'))).toBeCloseTo(60 / 1180, 8)
    expect(Number(rects[1].attributes('x'))).toBeCloseTo(268 / 1180, 8)
    expect(Number(rects[1].attributes('height'))).toBeCloseTo(96 / 790, 8)

    wrapper.unmount()
    expect(resizeDisconnect).toHaveBeenCalledOnce()
  })

  it('uses window resize when ResizeObserver is unavailable', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const { wrapper } = mountConnectedShell()
    await settleGeometry()

    sidebarRect = createRect(13, 11, 60, 774)
    window.dispatchEvent(new Event('resize'))
    await settleGeometry()

    expect(Number(wrapper.find('clipPath rect').attributes('width'))).toBeCloseTo(60 / 1185, 8)
  })
})
