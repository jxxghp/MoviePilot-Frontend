import {
  getPagePresentationMotionProgress,
  PAGE_PRESENTATION_FROSTED_START_TRANSLATE_Y,
  PAGE_PRESENTATION_MOTION_DURATION_MS,
  PAGE_PRESENTATION_MOTION_START_OPACITY,
  PAGE_PRESENTATION_MOTION_START_TRANSLATE_Y,
  usePagePresentationMotion,
} from '@/composables/usePagePresentationMotion'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const motion = usePagePresentationMotion()
let callbacks: Map<number, FrameRequestCallback>
let frameId: number

beforeEach(() => {
  motion.cancel()
  callbacks = new Map()
  frameId = 0
  document.documentElement.dataset.theme = 'glass'
  document.documentElement.dataset.glassAppearance = 'clear'
  document.documentElement.dataset.glassQuality = 'high'
  delete document.documentElement.dataset.launchLoading
  vi.spyOn(performance, 'now').mockReturnValue(1000)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frameId += 1
    callbacks.set(frameId, callback)

    return frameId
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
    callbacks.delete(id)
  })
})

afterEach(() => {
  motion.cancel()
  document.getElementById('loading-bg')?.remove()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.glassAppearance
  delete document.documentElement.dataset.glassQuality
  delete document.documentElement.dataset.launchLoading
  delete document.documentElement.dataset.pagePresentationMotion
  document.documentElement.style.removeProperty('--mp-page-motion-opacity')
  document.documentElement.style.removeProperty('--mp-page-motion-translate-y')
})

describe('page presentation motion', () => {
  it('delegates standard clear glass to the ordinary compositor animation', () => {
    document.documentElement.dataset.glassQuality = 'css'

    expect(motion.start('/dashboard', document.createElement('div'))).toBe(false)
    expect(motion.active.value).toBe(false)
    expect(callbacks.size).toBe(0)
  })

  it('starts standard frosted motion without waiting for a renderer geometry acknowledgement', () => {
    document.documentElement.dataset.glassAppearance = 'frosted'
    document.documentElement.dataset.glassQuality = 'css'

    expect(motion.start('/dashboard', document.createElement('div'))).toBe(true)
    expect(motion.active.value).toBe(true)
    expect(motion.opacity.value).toBe(1)
    expect(motion.translateY.value).toBe(PAGE_PRESENTATION_FROSTED_START_TRANSLATE_Y)
    expect(callbacks.size).toBe(1)
  })

  it('does not add a second reveal gate behind the initial launch screen', () => {
    document.documentElement.dataset.launchLoading = 'true'
    const launchScreen = document.createElement('div')
    launchScreen.id = 'loading-bg'
    document.body.append(launchScreen)
    const initialRevision = motion.revision.value

    expect(motion.start('/dashboard')).toBe(true)
    expect(motion.active.value).toBe(false)
    expect(motion.opacity.value).toBe(1)
    expect(motion.revision.value).toBe(initialRevision + 1)
    expect(callbacks.size).toBe(0)
    expect(document.documentElement.dataset.pagePresentationMotion).toBeUndefined()
  })

  it('does not suppress normal route motion when only a stale launch attribute remains', () => {
    document.documentElement.dataset.launchLoading = 'true'

    expect(motion.start('/dashboard')).toBe(true)
    expect(motion.active.value).toBe(true)
    expect(motion.opacity.value).toBe(PAGE_PRESENTATION_MOTION_START_OPACITY)
    expect(callbacks.size).toBe(1)
    expect(document.documentElement.dataset.pagePresentationMotion).toBe('active')
  })

  it('holds a glass route until its shared layout geometry remains stable', () => {
    const routeRoot = document.createElement('div')
    let routeHeight = 2096
    Object.defineProperties(routeRoot, {
      offsetHeight: { configurable: true, get: () => routeHeight },
      offsetWidth: { configurable: true, get: () => 1200 },
      scrollHeight: { configurable: true, get: () => routeHeight },
      scrollWidth: { configurable: true, get: () => 1200 },
    })
    document.body.append(routeRoot)

    expect(motion.start('/dashboard', routeRoot)).toBe(true)
    expect(motion.active.value).toBe(true)
    expect(motion.opacity.value).toBe(0)
    expect(document.documentElement.dataset.pagePresentationMotion).toBe('active')

    ;[1016, 1080].forEach(timestamp => [...callbacks.values()].at(-1)!(timestamp))
    expect(motion.opacity.value).toBe(0)

    routeHeight = 1520
    ;[1110, 1200].forEach(timestamp => [...callbacks.values()].at(-1)!(timestamp))
    expect(motion.opacity.value).toBe(0)

    ;[1231].forEach(timestamp => [...callbacks.values()].at(-1)!(timestamp))
    expect(motion.opacity.value).toBe(PAGE_PRESENTATION_MOTION_START_OPACITY)
    expect(motion.translateY.value).toBe(PAGE_PRESENTATION_MOTION_START_TRANSLATE_Y)

    routeRoot.remove()
  })

  it('reveals clear glass when the renderer confirms current surface geometry', () => {
    const routeRoot = document.createElement('div')
    Object.defineProperties(routeRoot, {
      offsetHeight: { configurable: true, get: () => 2096 },
      offsetWidth: { configurable: true, get: () => 1200 },
      scrollHeight: { configurable: true, get: () => 2096 },
      scrollWidth: { configurable: true, get: () => 1200 },
    })
    document.body.append(routeRoot)

    expect(motion.start('/dashboard', routeRoot)).toBe(true)
    const motionEpoch = motion.epoch.value
    expect(motion.opacity.value).toBe(0)
    expect(motion.reader.acknowledgeGeometryReady(motionEpoch - 1, 1040)).toBe(false)
    expect(motion.opacity.value).toBe(0)

    expect(motion.reader.acknowledgeGeometryReady(motionEpoch, 1040)).toBe(true)
    expect(motion.opacity.value).toBe(PAGE_PRESENTATION_MOTION_START_OPACITY)
    expect(motion.translateY.value).toBe(PAGE_PRESENTATION_MOTION_START_TRANSLATE_Y)
    expect(callbacks.size).toBe(1)

    routeRoot.remove()
  })

  it('ignores a late geometry acknowledgement after reveal has started', () => {
    const routeRoot = document.createElement('div')
    Object.defineProperties(routeRoot, {
      offsetHeight: { configurable: true, get: () => 2096 },
      offsetWidth: { configurable: true, get: () => 1200 },
      scrollHeight: { configurable: true, get: () => 2096 },
      scrollWidth: { configurable: true, get: () => 1200 },
    })
    document.body.append(routeRoot)

    expect(motion.start('/dashboard', routeRoot)).toBe(true)
    const motionEpoch = motion.epoch.value
    expect(motion.reader.acknowledgeGeometryReady(motionEpoch, 1040)).toBe(true)

    const revealFrame = [...callbacks.values()].at(-1)!
    revealFrame(1120)
    const currentFrame = [...callbacks.values()].at(-1)!
    const currentOpacity = motion.opacity.value
    const currentProgress = motion.progress.value
    const currentRevision = motion.revision.value
    const currentTranslateY = motion.translateY.value

    expect(motion.reader.acknowledgeGeometryReady(motionEpoch, 1160)).toBe(false)
    expect(motion.opacity.value).toBe(currentOpacity)
    expect(motion.progress.value).toBe(currentProgress)
    expect(motion.revision.value).toBe(currentRevision)
    expect(motion.translateY.value).toBe(currentTranslateY)
    expect([...callbacks.values()].at(-1)).toBe(currentFrame)

    routeRoot.remove()
  })

  it('keeps frosted material fully composed when the renderer releases its geometry hold', () => {
    document.documentElement.dataset.glassAppearance = 'frosted'
    const routeRoot = document.createElement('div')
    Object.defineProperties(routeRoot, {
      offsetHeight: { configurable: true, get: () => 1520 },
      offsetWidth: { configurable: true, get: () => 1200 },
      scrollHeight: { configurable: true, get: () => 1520 },
      scrollWidth: { configurable: true, get: () => 1200 },
    })
    document.body.append(routeRoot)

    expect(motion.start('/dashboard', routeRoot)).toBe(true)
    expect(motion.active.value).toBe(true)
    expect(motion.opacity.value).toBe(1)
    expect(motion.translateY.value).toBe(PAGE_PRESENTATION_FROSTED_START_TRANSLATE_Y)
    expect(document.documentElement.style.getPropertyValue('--mp-page-motion-opacity')).toBe('1')
    expect(document.documentElement.style.getPropertyValue('--mp-page-motion-translate-y')).toBe('8px')
    expect(motion.reader.acknowledgeGeometryReady(motion.epoch.value, 1040)).toBe(true)

    ;[1016, 1140, 1260, 1440].forEach(timestamp => [...callbacks.values()].at(-1)!(timestamp))
    expect(motion.active.value).toBe(false)
    expect(motion.opacity.value).toBe(1)
    expect(motion.translateY.value).toBe(0)
    expect(document.documentElement.dataset.pagePresentationMotion).toBeUndefined()

    routeRoot.remove()
  })

  it('uses one eased timeline for the initial, intermediate, and settled states', () => {
    const initialRevision = motion.revision.value

    expect(motion.start('/dashboard')).toBe(true)
    expect(motion.active.value).toBe(true)
    expect(motion.opacity.value).toBe(PAGE_PRESENTATION_MOTION_START_OPACITY)
    expect(motion.translateY.value).toBe(PAGE_PRESENTATION_MOTION_START_TRANSLATE_Y)
    expect(motion.revision.value).toBe(initialRevision + 1)
    expect(document.documentElement.dataset.pagePresentationMotion).toBe('active')

    const [firstFrame] = callbacks.values()
    firstFrame(1000 + PAGE_PRESENTATION_MOTION_DURATION_MS / 2)
    expect(motion.progress.value).toBeGreaterThan(0)
    expect(motion.progress.value).toBeLessThan(1)
    expect(motion.opacity.value).toBeGreaterThan(PAGE_PRESENTATION_MOTION_START_OPACITY)
    expect(motion.opacity.value).toBeLessThan(1)
    expect(motion.translateY.value).toBeGreaterThan(0)
    expect(motion.translateY.value).toBeLessThan(PAGE_PRESENTATION_MOTION_START_TRANSLATE_Y)

    const finalFrame = [...callbacks.values()].at(-1)!
    finalFrame(1000 + PAGE_PRESENTATION_MOTION_DURATION_MS)
    expect(motion.active.value).toBe(false)
    expect(motion.progress.value).toBe(1)
    expect(motion.opacity.value).toBe(1)
    expect(motion.translateY.value).toBe(0)
    expect(document.documentElement.dataset.pagePresentationMotion).toBeUndefined()
  })

  it('invalidates stale route frames without cancelling the current epoch', () => {
    motion.start('/first')
    const [staleFrame] = callbacks.values()

    motion.start('/second')
    const currentRevision = motion.revision.value
    const currentFrame = [...callbacks.values()].at(-1)!
    staleFrame(1016)

    expect(motion.routeKey.value).toBe('/second')
    expect(motion.revision.value).toBe(currentRevision)
    expect([...callbacks.values()]).toContain(currentFrame)

    currentFrame(1000 + PAGE_PRESENTATION_MOTION_DURATION_MS)
    expect(motion.opacity.value).toBe(1)
  })

  it('publishes a final renderer revision when an active motion is cancelled', () => {
    motion.start('/dashboard')
    const [frame] = callbacks.values()
    frame(1040)
    const activeRevision = motion.revision.value

    motion.cancel()

    expect(motion.active.value).toBe(false)
    expect(motion.opacity.value).toBe(1)
    expect(motion.translateY.value).toBe(0)
    expect(motion.revision.value).toBe(activeRevision + 1)
    expect(document.documentElement.dataset.pagePresentationMotion).toBeUndefined()
  })

  it('settles immediately when reduced motion is requested', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      ...window.matchMedia(''),
      matches: true,
    })
    const initialRevision = motion.revision.value

    expect(motion.start('/dashboard')).toBe(true)
    expect(motion.active.value).toBe(false)
    expect(motion.opacity.value).toBe(1)
    expect(motion.revision.value).toBe(initialRevision + 1)
    expect(callbacks.size).toBe(0)
  })

  it('leaves non-glass themes on the existing CSS animation path', () => {
    document.documentElement.dataset.theme = 'dark'

    expect(motion.start('/dashboard')).toBe(false)
    expect(motion.active.value).toBe(false)
    expect(callbacks.size).toBe(0)
  })

  it('keeps the shared cubic-bezier progress bounded and monotonic', () => {
    const quarter = getPagePresentationMotionProgress(PAGE_PRESENTATION_MOTION_DURATION_MS * 0.25)
    const half = getPagePresentationMotionProgress(PAGE_PRESENTATION_MOTION_DURATION_MS * 0.5)
    const threeQuarters = getPagePresentationMotionProgress(PAGE_PRESENTATION_MOTION_DURATION_MS * 0.75)

    expect(getPagePresentationMotionProgress(0)).toBe(0)
    expect(quarter).toBeGreaterThan(0)
    expect(half).toBeGreaterThan(quarter)
    expect(threeQuarters).toBeGreaterThan(half)
    expect(getPagePresentationMotionProgress(PAGE_PRESENTATION_MOTION_DURATION_MS)).toBe(1)
  })
})
