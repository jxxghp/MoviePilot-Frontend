import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
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

describe('GlassFixedShellBackplate', () => {
  it('renders the App-owned slots once for the shared desktop shell', () => {
    const wrapper = mount(GlassFixedShellBackplate, {
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
    const wrapper = mount(GlassFixedShellBackplate, {
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
    const wrapper = mount(GlassFixedShellBackplate, {
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
})
