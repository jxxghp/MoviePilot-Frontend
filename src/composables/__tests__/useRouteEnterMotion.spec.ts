import { useRouteEnterMotion } from '@/composables/useRouteEnterMotion'
import { effectScope, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface AnimationStub {
  animation: Animation
  cancel: ReturnType<typeof vi.fn>
  finish: () => void
  pause: ReturnType<typeof vi.fn>
  play: ReturnType<typeof vi.fn>
}

let callbacks: Map<number, FrameRequestCallback>
let frameId: number
let scope: EffectScope

function createAnimationStub(): AnimationStub {
  let finish!: () => void
  const finished = new Promise<void>(resolve => {
    finish = resolve
  })
  const cancel = vi.fn()
  const pause = vi.fn()
  const play = vi.fn()
  const animation = {
    cancel,
    currentTime: null,
    finished,
    pause,
    play,
  } as unknown as Animation

  return { animation, cancel, finish, pause, play }
}

function createMotion() {
  let motion!: ReturnType<typeof useRouteEnterMotion>
  scope.run(() => {
    motion = useRouteEnterMotion()
  })

  return motion
}

function runNextFrame(timestamp = 16) {
  const [id, callback] = callbacks.entries().next().value!
  callbacks.delete(id)
  callback(timestamp)
}

beforeEach(() => {
  callbacks = new Map()
  frameId = 0
  scope = effectScope()
  delete document.documentElement.dataset.launchLoading
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
  scope.stop()
  document.getElementById('loading-bg')?.remove()
  delete document.documentElement.dataset.launchLoading
})

describe('route enter motion', () => {
  it('commits a paused starting frame before playing the default route animation', () => {
    const root = document.createElement('div')
    const stub = createAnimationStub()
    root.animate = vi.fn(() => stub.animation)
    const motion = createMotion()

    expect(motion.start(root)).toBe(true)
    expect(stub.pause).toHaveBeenCalledOnce()
    expect(stub.animation.currentTime).toBe(0)
    expect(stub.play).not.toHaveBeenCalled()
    expect(motion.phase.value).toBe('armed')

    runNextFrame(160)
    expect(stub.play).toHaveBeenCalledOnce()
    expect(motion.phase.value).toBe('running')
  })

  it('cancels the previous animation and pending frame on rapid navigation', () => {
    const root = document.createElement('div')
    const first = createAnimationStub()
    const second = createAnimationStub()
    root.animate = vi.fn().mockReturnValueOnce(first.animation).mockReturnValueOnce(second.animation)
    const motion = createMotion()

    motion.start(root)
    motion.start(root)

    expect(first.cancel).toHaveBeenCalledOnce()
    expect(callbacks.size).toBe(1)
    runNextFrame()
    expect(first.play).not.toHaveBeenCalled()
    expect(second.play).toHaveBeenCalledOnce()
  })

  it('cleans up the finished animation without a fixed timer', async () => {
    const root = document.createElement('div')
    const stub = createAnimationStub()
    root.animate = vi.fn(() => stub.animation)
    const motion = createMotion()

    motion.start(root)
    runNextFrame()
    stub.finish()
    await stub.animation.finished
    await Promise.resolve()

    expect(stub.cancel).toHaveBeenCalledOnce()
    expect(motion.phase.value).toBe('idle')
  })

  it('skips route animation while the launch screen owns presentation', () => {
    document.documentElement.dataset.launchLoading = 'true'
    const launchScreen = document.createElement('div')
    launchScreen.id = 'loading-bg'
    document.body.append(launchScreen)
    const root = document.createElement('div')
    root.animate = vi.fn()
    const motion = createMotion()

    expect(motion.start(root)).toBe(false)
    expect(root.animate).not.toHaveBeenCalled()
    expect(callbacks.size).toBe(0)
  })

  it('skips route animation when reduced motion is requested', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      ...window.matchMedia(''),
      matches: true,
    })
    const root = document.createElement('div')
    root.animate = vi.fn()
    const motion = createMotion()

    expect(motion.start(root)).toBe(false)
    expect(root.animate).not.toHaveBeenCalled()
  })
})
