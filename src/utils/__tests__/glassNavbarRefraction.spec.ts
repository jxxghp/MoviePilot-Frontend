import { describe, expect, it } from 'vitest'
import { supportsGlassNavbarLiveRefraction } from '@/utils/glassNavbarRefraction'

describe('supportsGlassNavbarLiveRefraction', () => {
  it('enables the verified Chromium engine path for Chrome and Edge', () => {
    expect(
      supportsGlassNavbarLiveRefraction({
        userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
        userAgentData: {
          brands: [{ brand: 'Chromium' }, { brand: 'Google Chrome' }],
        },
      }),
    ).toBe(true)
    expect(
      supportsGlassNavbarLiveRefraction({
        userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
        userAgentData: {
          brands: [{ brand: 'Chromium' }, { brand: 'Microsoft Edge' }],
        },
      }),
    ).toBe(true)
  })

  it.each([
    ['Safari', 'Mozilla/5.0 Version/26.4 Safari/605.1.15'],
    ['iOS Chrome', 'Mozilla/5.0 CriOS/140.0.0.0 Mobile/15E148 Safari/604.1'],
    ['Firefox', 'Mozilla/5.0 Firefox/142.0'],
  ])('keeps %s on the stable Goal 1 material', (_browser, userAgent) => {
    expect(supportsGlassNavbarLiveRefraction({ userAgent })).toBe(false)
  })
})
