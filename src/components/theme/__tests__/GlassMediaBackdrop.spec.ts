import { mount } from '@vue/test-utils'
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GlassMediaBackdrop from '@/components/theme/GlassMediaBackdrop.vue'

const state = vi.hoisted(() => ({ chromium: true }))
const themeName = ref('glass')
const reducedTransparency = ref(false)
vi.mock('@/composables/useGlassFixedShellBackplate', () => ({
  isChromiumFixedShellBackplateBrowser: () => state.chromium,
}))
vi.mock('vuetify', () => ({ useTheme: () => ({ global: { name: themeName } }) }))
vi.mock('@vueuse/core', () => ({ useMediaQuery: () => reducedTransparency }))

let frames: Map<number, FrameRequestCallback>
let nextId = 1
let resizeCallbacks: ResizeObserverCallback[]
const wrappers: ReturnType<typeof mount>[] = []

async function settle() {
  await nextTick()
  for (let i = 0; i < 10; i++) {
    const pending = [...frames.entries()]
    frames.clear()
    for (const [, callback] of pending) callback(16 * i)
    await nextTick()
    await Promise.resolve()
    if (!frames.size) break
  }
}

function renderBackdrop(
  slot = '<div class="progressive-card-grid"><div class="media-card" data-y="8000" style="border-top-left-radius:16px;border-top-right-radius:16px;border-bottom-right-radius:16px;border-bottom-left-radius:16px"></div></div>',
) {
  const wrapper = mount(GlassMediaBackdrop, { slots: { default: slot }, attachTo: document.body })
  wrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  state.chromium = true
  themeName.value = 'glass'
  reducedTransparency.value = false
  frames = new Map()
  resizeCallbacks = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextId++
    frames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('CSS', { supports: () => true })
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      isIdentity: boolean
      constructor(value: string) {
        this.isIdentity = value === 'matrix(1, 0, 0, 1, 0, 0)'
      }
    },
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push(callback)
      }
      observe() {}
      disconnect() {}
    },
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const card = this.classList.contains('media-card')
    return new DOMRect(
      card ? Number(this.dataset.x ?? 10) : 0,
      card ? Number(this.dataset.y ?? 0) : 0,
      card ? 120 : 1000,
      card ? 180 : 20000,
    )
  })
})

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('shared media backdrop ownership', () => {
  it('bounds sampling to mounted pending cards, not the complete virtual track', async () => {
    const wrapper = renderBackdrop()
    await settle()
    const layer = wrapper.get('.glass-media-backdrop__sampling').element as HTMLElement
    expect(layer.style.top).toBe('8000px')
    expect(layer.style.height).toBe('180px')
    expect(layer.style.clipPath).toContain('M26 0H114A16 16')
    expect(wrapper.get('.media-card').attributes('data-glass-shared-backdrop')).toBe('true')
    expect(frames.size).toBe(0)
  })

  it('hands off only after real reveal, and restores sampling on same-node reuse', async () => {
    const wrapper = renderBackdrop()
    await settle()
    const card = wrapper.get('.media-card').element as HTMLElement
    card.classList.add('media-card--image-loaded')
    await settle()
    expect(card.dataset.glassSharedBackdrop).toBe('true')
    card.dataset.glassOpticalMode = 'excluded'
    await settle()
    expect(card.dataset.glassSharedBackdrop).toBeUndefined()
    expect(wrapper.find('.glass-media-backdrop__sampling').exists()).toBe(false)
    delete card.dataset.glassOpticalMode
    await settle()
    expect(card.dataset.glassSharedBackdrop).toBe('true')
  })

  it('removes a hovering or transitioning card from both the ownership and union', async () => {
    const wrapper = renderBackdrop()
    await settle()
    const card = wrapper.get('.media-card').element as HTMLElement
    card.classList.add('app-hover-lift-card--hovering')
    await settle()
    expect(card.dataset.glassSharedBackdrop).toBeUndefined()
    expect(wrapper.find('.glass-media-backdrop__sampling').exists()).toBe(false)
    card.classList.remove('app-hover-lift-card--hovering')
    card.style.transform = 'matrix(1, 0, 0, 1, 0, -2)'
    await settle()
    expect(card.dataset.glassSharedBackdrop).toBeUndefined()
    card.style.transform = 'matrix(1, 0, 0, 1, 0, 0)'
    card.dispatchEvent(new Event('transitionend', { bubbles: true }))
    await settle()
    expect(card.dataset.glassSharedBackdrop).toBe('true')
  })

  it('updates virtual replacements and releases detached nodes', async () => {
    const wrapper = renderBackdrop()
    await settle()
    const card = wrapper.get('.media-card').element as HTMLElement
    const next = card.cloneNode(true) as HTMLElement
    delete next.dataset.glassSharedBackdrop
    next.dataset.y = '16000'
    card.replaceWith(next)
    await settle()
    expect(card.dataset.glassSharedBackdrop).toBeUndefined()
    expect(next.dataset.glassSharedBackdrop).toBe('true')
    expect((wrapper.get('.glass-media-backdrop__sampling').element as HTMLElement).style.top).toBe('16000px')
  })

  it('tracks four corner radii after theme and resize changes without a scroll loop', async () => {
    const corners = ref({
      borderTopLeftRadius: '16px',
      borderTopRightRadius: '16px',
      borderBottomRightRadius: '16px',
      borderBottomLeftRadius: '16px',
    })
    const wrapper = mount(GlassMediaBackdrop, {
      slots: { default: () => h('div', { class: 'media-card', style: corners.value }) },
      attachTo: document.body,
    })
    wrappers.push(wrapper)
    await settle()
    corners.value = {
      borderTopLeftRadius: '8px',
      borderTopRightRadius: '12px',
      borderBottomRightRadius: '20px',
      borderBottomLeftRadius: '4px',
    }
    document.documentElement.dataset.themeRadius = 'large'
    resizeCallbacks.forEach(callback => callback([], {} as ResizeObserver))
    await settle()
    const clip = (wrapper.get('.glass-media-backdrop__sampling').element as HTMLElement).style.clipPath
    expect(clip).toContain('A12 12')
    expect(clip).toContain('A20 20')
    expect(clip).toContain('A4 4')
    expect(clip).toContain('A8 8')
    window.dispatchEvent(new Event('scroll'))
    expect(frames.size).toBe(0)
  })

  it('restores native ownership for non-glass and reduced-transparency modes', async () => {
    const wrapper = renderBackdrop()
    await settle()
    reducedTransparency.value = true
    await settle()
    expect(wrapper.find('[data-glass-shared-backdrop]').exists()).toBe(false)
    expect(wrapper.find('.glass-media-backdrop__sampling').exists()).toBe(false)
    reducedTransparency.value = false
    await settle()
    expect(wrapper.find('[data-glass-shared-backdrop]').exists()).toBe(true)
    themeName.value = 'light'
    await settle()
    expect(wrapper.find('[data-glass-shared-backdrop]').exists()).toBe(false)
  })

  it('leaves unverified engines and overlays on their existing native path', async () => {
    state.chromium = false
    const fallback = renderBackdrop()
    await settle()
    expect(fallback.find('[data-glass-shared-backdrop]').exists()).toBe(false)
    state.chromium = true
    const overlay = mount(
      {
        components: { GlassMediaBackdrop },
        template:
          '<div class="v-overlay__content"><GlassMediaBackdrop><div class="media-card" /></GlassMediaBackdrop></div>',
      },
      { attachTo: document.body },
    )
    wrappers.push(overlay)
    await settle()
    expect(overlay.find('[data-glass-shared-backdrop]').exists()).toBe(false)
  })

  it('keeps content usable when feature detection is unavailable', async () => {
    vi.stubGlobal('CSS', {})
    const wrapper = renderBackdrop()
    await settle()
    expect(wrapper.find('.media-card').exists()).toBe(true)
    expect(wrapper.find('[data-glass-shared-backdrop]').exists()).toBe(false)
    expect(frames.size).toBe(0)
  })

  it('releases samplers and pending work on KeepAlive deactivation and unmount', async () => {
    const shown = ref(true)
    const host = defineComponent({
      setup: () => () =>
        h(KeepAlive, null, {
          default: () =>
            shown.value ? h(GlassMediaBackdrop, null, { default: () => h('div', { class: 'media-card' }) }) : null,
        }),
    })
    const wrapper = mount(host, { attachTo: document.body })
    wrappers.push(wrapper)
    await settle()
    const card = wrapper.get('.media-card').element as HTMLElement
    expect(card.dataset.glassSharedBackdrop).toBe('true')
    shown.value = false
    await settle()
    expect(card.dataset.glassSharedBackdrop).toBeUndefined()
    expect(frames.size).toBe(0)
    shown.value = true
    await settle()
    expect(card.dataset.glassSharedBackdrop).toBe('true')
    wrapper.unmount()
    expect(card.dataset.glassSharedBackdrop).toBeUndefined()
    expect(frames.size).toBe(0)
  })
})
