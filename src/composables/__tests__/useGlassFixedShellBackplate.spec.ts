import { describe, expect, it } from 'vitest'
import {
  isChromiumFixedShellBackplateBrowser,
  shouldUseGlassFixedShellBackplate,
} from '@/composables/useGlassFixedShellBackplate'

describe('shouldUseGlassFixedShellBackplate', () => {
  const eligible = {
    appearance: 'frosted' as const,
    hasWallpaper: true,
    isAuthenticated: true,
    needsStableFixedBackdrop: true,
    quality: 'css' as const,
    themeName: 'glass',
  }

  it('enables the direct wallpaper backplate for every frosted Chromium quality', () => {
    expect(shouldUseGlassFixedShellBackplate(eligible)).toBe(true)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, quality: 'balanced' })).toBe(true)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, quality: 'high' })).toBe(true)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, needsStableFixedBackdrop: false })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, appearance: 'clear' })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, appearance: 'tinted' })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, themeName: 'transparent' })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, isAuthenticated: false })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, hasWallpaper: false })).toBe(false)
  })
})

describe('isChromiumFixedShellBackplateBrowser', () => {
  it('uses the Chromium engine brand for Chrome and Edge', () => {
    expect(
      isChromiumFixedShellBackplateBrowser({
        userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
        userAgentData: {
          brands: [{ brand: 'Chromium' }, { brand: 'Google Chrome' }],
        },
      }),
    ).toBe(true)
    expect(
      isChromiumFixedShellBackplateBrowser({
        userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
        userAgentData: {
          brands: [{ brand: 'Chromium' }, { brand: 'Microsoft Edge' }],
        },
      }),
    ).toBe(true)
    expect(
      isChromiumFixedShellBackplateBrowser({
        userAgent: 'Mozilla/5.0 Version/26.4 Safari/605.1.15',
        userAgentData: {
          brands: [{ brand: 'Safari' }],
        },
      }),
    ).toBe(false)
  })

  it.each([
    ['Chrome', 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36'],
    ['Edge', 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'],
    ['Opera', 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 OPR/121.0.0.0'],
    ['Vivaldi', 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 Vivaldi/7.6.0.0'],
    ['Yandex Browser', 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 YaBrowser/25.8.0.0'],
    ['Samsung Internet', 'Mozilla/5.0 Chrome/140.0.0.0 Mobile Safari/537.36 SamsungBrowser/28.0'],
    ['Android WebView', 'Mozilla/5.0; wv) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36'],
    ['Chromium', 'Mozilla/5.0 Chromium/140.0.0.0 Safari/537.36'],
  ])('falls back to Chromium UA tokens for %s', (_browser, userAgent) => {
    expect(isChromiumFixedShellBackplateBrowser({ userAgent })).toBe(true)
  })

  it('leaves Safari and iOS Chrome on the native backdrop path', () => {
    expect(
      isChromiumFixedShellBackplateBrowser({
        userAgent: 'Mozilla/5.0 Version/26.4 Safari/605.1.15',
      }),
    ).toBe(false)
    expect(
      isChromiumFixedShellBackplateBrowser({
        userAgent: 'Mozilla/5.0 CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',
      }),
    ).toBe(false)
  })
})
