import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import GlassOpticalLayer from '@/components/theme/GlassOpticalLayer.vue'

const rendererCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>)
const interactionSource = vi.hoisted(() => ({ subscribe: vi.fn() }))
const setRendererState = vi.hoisted(() =>
  vi.fn((state: { value: string }, value: string) => {
    state.value = value
  }),
)

vi.mock('@/composables/useGlassOpticalRenderer', () => ({
  setGlassRendererState: setRendererState,
  useGlassOpticalInteractionSource: vi.fn(() => interactionSource),
  useGlassOpticalRenderer: vi.fn((options: Record<string, unknown>) => {
    rendererCalls.push(options)

    return {
      renderedFrames: ref(0),
      state: ref('ready'),
    }
  }),
}))

describe('GlassOpticalLayer', () => {
  it('uses exactly two visible presentation contexts with one interaction source', () => {
    rendererCalls.length = 0
    setRendererState.mockClear()
    const wrapper = shallowMount(GlassOpticalLayer, {
      props: {
        appearance: 'clear',
        deformationStrength: 50,
        flowStrength: 50,
        previousWallpaperUrl: '',
        quality: 'balanced',
        reflectionStrength: 50,
        routeKey: '/dashboard',
        tintColor: '#8D51F9',
        transitionDuration: 1500,
        transitionStartedAt: 0,
        transmissionStrength: 84,
        translationStrength: 50,
        transparencyStrength: 50,
        wallpaperUrl: '/wallpaper.jpg',
      },
    })

    const canvases = wrapper.findAll('canvas')
    expect(canvases).toHaveLength(2)
    expect(canvases.map(canvas => canvas.attributes('data-presentation-space'))).toEqual(['fixed', 'scroll'])
    expect(rendererCalls.map(options => options.surfaceSpace)).toEqual(['fixed', 'scroll'])
    expect(rendererCalls.every(options => options.interactionSource === interactionSource)).toBe(true)
    expect(rendererCalls.every(options => options.syncDocumentState === false)).toBe(true)

    wrapper.unmount()
    expect(setRendererState).toHaveBeenLastCalledWith(expect.any(Object), 'fallback')
  })
})
