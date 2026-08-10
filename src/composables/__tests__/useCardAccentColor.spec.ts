import { getCardAccentRgbFromImage, useCardAccentColor } from '@/composables/useCardAccentColor'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDominantColor: vi.fn(),
}))

vi.mock('@/@core/utils/image', () => ({
  getDominantColor: mocks.getDominantColor,
}))

describe('useCardAccentColor compatibility', () => {
  beforeEach(() => {
    mocks.getDominantColor.mockReset()
  })

  it.each([
    ['#FFB400', '255, 180, 0'],
    ['#56CA00', '86, 202, 0'],
  ])('preserves the caller fallback %s', async (fallback, expectedRgb) => {
    mocks.getDominantColor.mockResolvedValue(fallback)

    await expect(getCardAccentRgbFromImage(null, fallback)).resolves.toBe(expectedRgb)
    expect(mocks.getDominantColor).toHaveBeenCalledWith(null, { fallback })
  })

  it('keeps the composable fallback scoped to its caller', async () => {
    mocks.getDominantColor.mockResolvedValue('#8D51F9')
    const accent = useCardAccentColor('#8D51F9')
    accent.imageRef.value = { $el: document.createElement('div') }

    await accent.updateAccentColor()

    expect(accent.accentRgb.value).toBe('141, 81, 249')
    expect(mocks.getDominantColor).toHaveBeenCalledWith(null, { fallback: '#8D51F9' })
  })
})
