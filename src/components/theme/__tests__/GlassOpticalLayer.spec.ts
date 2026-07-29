import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import GlassOpticalLayer from '@/components/theme/GlassOpticalLayer.vue'

const rendererCalls = vi.hoisted(() => [] as Array<Record<string, unknown>>)
const rendererResults = vi.hoisted(
  () =>
    [] as Array<{
      activatePreparedWallpaper: ReturnType<typeof vi.fn>
      activeWallpaperPreparationKey: { value: string }
      activeWallpaperRevision: { value: number }
      activeWallpaperUrl: { value: string }
      canActivatePreparedWallpaper: ReturnType<typeof vi.fn>
      failedWallpaperPreparationKey: { value: string }
      failedWallpaperRevision: { value: number }
      failedWallpaperUrl: { value: string }
      preparedWallpaperPreparationKey: { value: string }
      preparedWallpaperRevision: { value: number }
      preparedWallpaperUrl: { value: string }
      renderedFrames: { value: number }
      rollbackPreparedWallpaperActivation: ReturnType<typeof vi.fn>
      state: { value: string }
    }>,
)
const interactionSource = vi.hoisted(() => ({ subscribe: vi.fn() }))
const wallpaperSourceCache = vi.hoisted(() => ({ get: vi.fn() }))
const setRendererState = vi.hoisted(() =>
  vi.fn((state: { value: string }, value: string) => {
    state.value = value
  }),
)

vi.mock('@/composables/useGlassOpticalRenderer', () => ({
  createGlassWallpaperSourceCache: vi.fn(() => wallpaperSourceCache),
  getGlassWallpaperPreparationKey: vi.fn(
    (appearance: string, quality: string, routeKey: string, url: string) =>
      `${appearance}:${quality}:${routeKey}:${url}`,
  ),
  setGlassRendererState: setRendererState,
  useGlassOpticalInteractionSource: vi.fn(() => interactionSource),
  useGlassOpticalRenderer: vi.fn((options: Record<string, unknown>) => {
    rendererCalls.push(options)
    let rollbackState = {
      preparationKey: '',
      revision: 0,
      url: '',
    }

    const result = {
      activeWallpaperPreparationKey: ref(''),
      activeWallpaperRevision: ref(0),
      activeWallpaperUrl: ref(''),
      failedWallpaperPreparationKey: ref(''),
      failedWallpaperRevision: ref(0),
      failedWallpaperUrl: ref(''),
      preparedWallpaperPreparationKey: ref(''),
      preparedWallpaperRevision: ref(0),
      preparedWallpaperUrl: ref(''),
      renderedFrames: ref(0),
      state: ref('ready'),
      canActivatePreparedWallpaper: vi.fn((url: string, revision: number, preparationKey: string) => {
        return (
          result.state.value === 'ready' &&
          result.preparedWallpaperUrl.value === url &&
          result.preparedWallpaperRevision.value === revision &&
          result.preparedWallpaperPreparationKey.value === preparationKey
        )
      }),
      activatePreparedWallpaper: vi.fn((url: string, revision: number, preparationKey: string) => {
        if (!result.canActivatePreparedWallpaper(url, revision, preparationKey)) return false

        rollbackState = {
          preparationKey: result.activeWallpaperPreparationKey.value,
          revision: result.activeWallpaperRevision.value,
          url: result.activeWallpaperUrl.value,
        }
        result.preparedWallpaperUrl.value = ''
        result.preparedWallpaperRevision.value = 0
        result.preparedWallpaperPreparationKey.value = ''
        result.activeWallpaperUrl.value = url
        result.activeWallpaperRevision.value = revision
        result.activeWallpaperPreparationKey.value = preparationKey

        return true
      }),
      rollbackPreparedWallpaperActivation: vi.fn((url: string, revision: number) => {
        if (result.activeWallpaperUrl.value !== url || result.activeWallpaperRevision.value !== revision) return false

        result.activeWallpaperUrl.value = rollbackState.url
        result.activeWallpaperRevision.value = rollbackState.revision
        result.activeWallpaperPreparationKey.value = rollbackState.preparationKey

        return true
      }),
    }
    rendererResults.push(result)

    return result
  }),
}))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GlassOpticalLayer', () => {
  it('uses exactly two visible presentation contexts with one interaction source', () => {
    rendererCalls.length = 0
    rendererResults.length = 0
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
    expect(rendererCalls.every(options => options.wallpaperSourceCache === wallpaperSourceCache)).toBe(true)
    expect(rendererCalls.every(options => options.syncDocumentState === false)).toBe(true)
    expect(rendererCalls[0].pageMotion).toBeUndefined()
    expect(rendererCalls[1].pageMotion).toEqual(
      expect.objectContaining({
        opacity: expect.any(Object),
        revision: expect.any(Object),
      }),
    )

    wrapper.unmount()
    expect(setRendererState).toHaveBeenLastCalledWith(expect.any(Object), 'fallback')
  })

  it('activates matching resource bundles in one shared animation frame', async () => {
    rendererCalls.length = 0
    rendererResults.length = 0
    let activationCallback: FrameRequestCallback | null = null
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      activationCallback = callback

      return 31
    })
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const wrapper = shallowMount(GlassOpticalLayer, {
      props: {
        appearance: 'frosted',
        activateWallpaperRevision: 0,
        deformationStrength: 50,
        flowStrength: 50,
        pendingWallpaperRevision: 7,
        pendingWallpaperUrl: '/wallpaper-next.jpg',
        previousWallpaperUrl: '',
        quality: 'balanced',
        reflectionStrength: 50,
        routeKey: '/dashboard',
        tintColor: '#8D51F9',
        transitionDuration: 1500,
        transitionStartedAt: 0,
        transmissionStrength: 50,
        translationStrength: 50,
        transparencyStrength: 50,
        wallpaperUrl: '/wallpaper-current.jpg',
      },
    })
    const [fixedRenderer, scrollRenderer] = rendererResults
    const preparationKey = 'frosted:balanced:/dashboard:/wallpaper-next.jpg'

    fixedRenderer.preparedWallpaperUrl.value = '/wallpaper-next.jpg'
    fixedRenderer.preparedWallpaperRevision.value = 7
    fixedRenderer.preparedWallpaperPreparationKey.value = preparationKey
    await nextTick()
    expect(wrapper.emitted('wallpaperPrepared')).toBeUndefined()

    scrollRenderer.preparedWallpaperUrl.value = '/wallpaper-next.jpg'
    scrollRenderer.preparedWallpaperRevision.value = 7
    scrollRenderer.preparedWallpaperPreparationKey.value = 'stale-key'
    await nextTick()
    expect(wrapper.emitted('wallpaperPrepared')).toBeUndefined()

    scrollRenderer.preparedWallpaperPreparationKey.value = preparationKey
    await nextTick()
    expect(wrapper.emitted('wallpaperPrepared')).toEqual([['/wallpaper-next.jpg', 7]])

    await wrapper.setProps({ activateWallpaperRevision: 7 })
    await nextTick()
    expect(wrapper.emitted('wallpaperActivated')).toBeUndefined()
    expect(requestFrame).toHaveBeenCalledOnce()

    ;(activationCallback as FrameRequestCallback | null)?.(420)
    await nextTick()
    expect(fixedRenderer.activatePreparedWallpaper).toHaveBeenCalledWith('/wallpaper-next.jpg', 7, preparationKey, 420)
    expect(scrollRenderer.activatePreparedWallpaper).toHaveBeenCalledWith('/wallpaper-next.jpg', 7, preparationKey, 420)
    expect(wrapper.emitted('wallpaperActivated')).toEqual([['/wallpaper-next.jpg', 7, 420]])
    expect(fixedRenderer.activeWallpaperRevision.value).toBe(7)
    expect(scrollRenderer.activeWallpaperRevision.value).toBe(7)
    wrapper.unmount()
  })

  it('reports one matching preparation failure so the parent can cancel the pending revision', async () => {
    rendererCalls.length = 0
    rendererResults.length = 0
    const wrapper = shallowMount(GlassOpticalLayer, {
      props: {
        appearance: 'frosted',
        deformationStrength: 50,
        flowStrength: 50,
        pendingWallpaperRevision: 10,
        pendingWallpaperUrl: '/wallpaper-next.jpg',
        previousWallpaperUrl: '',
        quality: 'balanced',
        reflectionStrength: 50,
        routeKey: '/dashboard',
        tintColor: '#8D51F9',
        transitionDuration: 1500,
        transitionStartedAt: 0,
        transmissionStrength: 50,
        translationStrength: 50,
        transparencyStrength: 50,
        wallpaperUrl: '/wallpaper-current.jpg',
      },
    })
    const [fixedRenderer, scrollRenderer] = rendererResults
    const preparationKey = 'frosted:balanced:/dashboard:/wallpaper-next.jpg'

    fixedRenderer.failedWallpaperUrl.value = '/wallpaper-next.jpg'
    fixedRenderer.failedWallpaperRevision.value = 9
    fixedRenderer.failedWallpaperPreparationKey.value = preparationKey
    await nextTick()
    expect(wrapper.emitted('wallpaperPreparationFailed')).toBeUndefined()

    scrollRenderer.failedWallpaperUrl.value = '/wallpaper-next.jpg'
    scrollRenderer.failedWallpaperRevision.value = 10
    scrollRenderer.failedWallpaperPreparationKey.value = preparationKey
    await nextTick()
    expect(wrapper.emitted('wallpaperPreparationFailed')).toEqual([['/wallpaper-next.jpg', 10]])

    fixedRenderer.failedWallpaperUrl.value = '/wallpaper-next.jpg'
    fixedRenderer.failedWallpaperRevision.value = 10
    fixedRenderer.failedWallpaperPreparationKey.value = preparationKey
    await nextTick()
    expect(wrapper.emitted('wallpaperPreparationFailed')).toEqual([['/wallpaper-next.jpg', 10]])
    wrapper.unmount()
  })

  it('does not partially commit while either context is unavailable', async () => {
    rendererCalls.length = 0
    rendererResults.length = 0
    let activationCallback: FrameRequestCallback | null = null
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      activationCallback = callback

      return 32
    })
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const wrapper = shallowMount(GlassOpticalLayer, {
      props: {
        appearance: 'frosted',
        activateWallpaperRevision: 8,
        deformationStrength: 50,
        flowStrength: 50,
        pendingWallpaperRevision: 8,
        pendingWallpaperUrl: '/wallpaper-next.jpg',
        previousWallpaperUrl: '',
        quality: 'high',
        reflectionStrength: 50,
        routeKey: '/dashboard',
        tintColor: '#8D51F9',
        transitionDuration: 1500,
        transitionStartedAt: 0,
        transmissionStrength: 50,
        translationStrength: 50,
        transparencyStrength: 50,
        wallpaperUrl: '/wallpaper-current.jpg',
      },
    })
    const [fixedRenderer, scrollRenderer] = rendererResults
    const preparationKey = 'frosted:high:/dashboard:/wallpaper-next.jpg'
    for (const renderer of rendererResults) {
      renderer.preparedWallpaperUrl.value = '/wallpaper-next.jpg'
      renderer.preparedWallpaperRevision.value = 8
      renderer.preparedWallpaperPreparationKey.value = preparationKey
    }
    scrollRenderer.state.value = 'fallback'
    await nextTick()

    expect(requestFrame).not.toHaveBeenCalled()
    expect(fixedRenderer.activatePreparedWallpaper).not.toHaveBeenCalled()
    expect(scrollRenderer.activatePreparedWallpaper).not.toHaveBeenCalled()
    expect(wrapper.emitted('wallpaperActivated')).toBeUndefined()

    scrollRenderer.state.value = 'ready'
    await nextTick()
    expect(requestFrame).toHaveBeenCalledOnce()
    ;(activationCallback as FrameRequestCallback | null)?.(640)
    await nextTick()

    expect(fixedRenderer.activatePreparedWallpaper).toHaveBeenCalledOnce()
    expect(scrollRenderer.activatePreparedWallpaper).toHaveBeenCalledOnce()
    expect(wrapper.emitted('wallpaperActivated')).toEqual([['/wallpaper-next.jpg', 8, 640]])
    wrapper.unmount()
  })

  it.each([
    [
      'returns false',
      (renderer: (typeof rendererResults)[number]) => renderer.activatePreparedWallpaper.mockReturnValueOnce(false),
    ],
    [
      'throws',
      (renderer: (typeof rendererResults)[number]) =>
        renderer.activatePreparedWallpaper.mockImplementationOnce(() => {
          throw new Error('context commit failed')
        }),
    ],
  ])('rolls both contexts back when the second activation %s', async (_, failScrollActivation) => {
    rendererCalls.length = 0
    rendererResults.length = 0
    let activationCallback: FrameRequestCallback | null = null
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      activationCallback = callback

      return 33
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const wrapper = shallowMount(GlassOpticalLayer, {
      props: {
        appearance: 'frosted',
        activateWallpaperRevision: 9,
        deformationStrength: 50,
        flowStrength: 50,
        pendingWallpaperRevision: 9,
        pendingWallpaperUrl: '/wallpaper-next.jpg',
        previousWallpaperUrl: '',
        quality: 'balanced',
        reflectionStrength: 50,
        routeKey: '/dashboard',
        tintColor: '#8D51F9',
        transitionDuration: 1500,
        transitionStartedAt: 0,
        transmissionStrength: 50,
        translationStrength: 50,
        transparencyStrength: 50,
        wallpaperUrl: '/wallpaper-current.jpg',
      },
    })
    const [fixedRenderer, scrollRenderer] = rendererResults
    const preparationKey = 'frosted:balanced:/dashboard:/wallpaper-next.jpg'
    for (const renderer of rendererResults) {
      renderer.activeWallpaperUrl.value = '/wallpaper-current.jpg'
      renderer.preparedWallpaperUrl.value = '/wallpaper-next.jpg'
      renderer.preparedWallpaperRevision.value = 9
      renderer.preparedWallpaperPreparationKey.value = preparationKey
    }
    failScrollActivation(scrollRenderer)
    await nextTick()

    ;(activationCallback as FrameRequestCallback | null)?.(720)
    await nextTick()

    expect(fixedRenderer.rollbackPreparedWallpaperActivation).toHaveBeenCalledWith('/wallpaper-next.jpg', 9)
    expect(scrollRenderer.rollbackPreparedWallpaperActivation).toHaveBeenCalledWith('/wallpaper-next.jpg', 9)
    expect(fixedRenderer.activeWallpaperUrl.value).toBe('/wallpaper-current.jpg')
    expect(scrollRenderer.activeWallpaperUrl.value).toBe('/wallpaper-current.jpg')
    expect(wrapper.emitted('wallpaperActivated')).toBeUndefined()
    expect(wrapper.emitted('wallpaperActivationFailed')).toEqual([['/wallpaper-next.jpg', 9]])
    wrapper.unmount()
  })
})
