import { createDecorativeWebGLContext } from '@/utils/webgl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.stubGlobal('WebGL2RenderingContext', Object)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('decorative WebGL context admission', () => {
  it('does not probe a browser without WebGL2', () => {
    vi.stubGlobal('WebGL2RenderingContext', undefined)
    const canvas = document.createElement('canvas')
    const getContext = vi.spyOn(canvas, 'getContext')

    expect(createDecorativeWebGLContext(canvas, { alpha: true })).toBeNull()
    expect(getContext).not.toHaveBeenCalled()
  })

  it('always rejects major performance caveats while preserving the caller attributes', () => {
    const context = { isContextLost: () => false } as WebGL2RenderingContext
    const canvas = document.createElement('canvas')
    const getContext = vi.spyOn(canvas, 'getContext').mockReturnValue(context)

    expect(
      createDecorativeWebGLContext(canvas, { alpha: true, antialias: false, failIfMajorPerformanceCaveat: false }),
    ).toBe(context)
    expect(getContext).toHaveBeenCalledExactlyOnceWith('webgl2', {
      alpha: true,
      antialias: false,
      failIfMajorPerformanceCaveat: true,
    })
  })

  it('does not retry with default attributes after the browser refuses the context', () => {
    const canvas = document.createElement('canvas')
    const getContext = vi.spyOn(canvas, 'getContext').mockReturnValue(null)

    expect(createDecorativeWebGLContext(canvas, { alpha: true })).toBeNull()
    expect(getContext).toHaveBeenCalledTimes(1)
  })

  it('keeps an already lost context out of the renderer', () => {
    const context = { isContextLost: () => true } as WebGL2RenderingContext
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockReturnValue(context)

    expect(createDecorativeWebGLContext(canvas, { alpha: true })).toBeNull()
  })

  it('leaves thrown context failures to the caller fallback without probing again', () => {
    const canvas = document.createElement('canvas')
    const getContext = vi.spyOn(canvas, 'getContext').mockImplementation(() => {
      throw new Error('WebGL is blocked')
    })

    expect(() => createDecorativeWebGLContext(canvas, { alpha: true })).toThrow('WebGL is blocked')
    expect(getContext).toHaveBeenCalledTimes(1)
  })
})
