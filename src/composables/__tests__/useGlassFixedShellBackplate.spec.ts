import { describe, expect, it } from 'vitest'
import {
  isChromeFixedShellBackplateBrowser,
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

  it('enables the direct wallpaper backplate only for affected authenticated Chrome rendering', () => {
    expect(shouldUseGlassFixedShellBackplate(eligible)).toBe(true)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, needsStableFixedBackdrop: false })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, appearance: 'clear' })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, appearance: 'tinted' })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, quality: 'balanced' })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, quality: 'high' })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, themeName: 'transparent' })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, isAuthenticated: false })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, hasWallpaper: false })).toBe(false)
  })
})

describe('isChromeFixedShellBackplateBrowser', () => {
  it('uses Chrome browser identity without applying the workaround to other Chromium brands', () => {
    expect(
      isChromeFixedShellBackplateBrowser({
        userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
        userAgentData: {
          brands: [{ brand: 'Chromium' }, { brand: 'Google Chrome' }],
        },
      }),
    ).toBe(true)
    expect(
      isChromeFixedShellBackplateBrowser({
        userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
        userAgentData: {
          brands: [{ brand: 'Chromium' }, { brand: 'Microsoft Edge' }],
        },
      }),
    ).toBe(false)
  })

  it('falls back to the traditional user agent while leaving Safari and iOS Chrome unchanged', () => {
    expect(
      isChromeFixedShellBackplateBrowser({
        userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
      }),
    ).toBe(true)
    expect(
      isChromeFixedShellBackplateBrowser({
        userAgent: 'Mozilla/5.0 Version/26.4 Safari/605.1.15',
      }),
    ).toBe(false)
    expect(
      isChromeFixedShellBackplateBrowser({
        userAgent: 'Mozilla/5.0 CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',
      }),
    ).toBe(false)
  })
})
