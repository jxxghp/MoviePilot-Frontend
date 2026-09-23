import { usePagePresentationMotion } from '@/composables/usePagePresentationMotion'
import { describe, expect, it, vi } from 'vitest'

describe('page presentation state', () => {
  it('commits each route immediately without scheduling an entrance frame', () => {
    const presentation = usePagePresentationMotion()
    const initialEpoch = presentation.reader.epoch.value
    const initialRevision = presentation.reader.revision.value
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame')

    presentation.start('/history')

    expect(presentation.routeKey.value).toBe('/history')
    expect(presentation.reader.epoch.value).toBe(initialEpoch + 1)
    expect(presentation.reader.revision.value).toBe(initialRevision + 1)
    expect(presentation.reader.active.value).toBe(false)
    expect(presentation.reader.opacity.value).toBe(1)
    expect(presentation.reader.acknowledgeGeometryReady(presentation.reader.epoch.value)).toBe(false)
    expect(document.documentElement.dataset.pagePresentationMotion).toBeUndefined()
    expect(requestFrame).not.toHaveBeenCalled()

    requestFrame.mockRestore()
  })
})
