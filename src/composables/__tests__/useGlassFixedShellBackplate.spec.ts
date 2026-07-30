import { describe, expect, it } from 'vitest'
import { shouldUseGlassFixedShellBackplate } from '@/composables/useGlassFixedShellBackplate'

describe('shouldUseGlassFixedShellBackplate', () => {
  const eligible = {
    appearance: 'frosted' as const,
    hasWallpaper: true,
    isAuthenticated: true,
    quality: 'css' as const,
    themeName: 'glass',
  }

  it('enables the direct wallpaper backplate only for authenticated frosted CSS rendering', () => {
    expect(shouldUseGlassFixedShellBackplate(eligible)).toBe(true)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, appearance: 'clear' })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, appearance: 'tinted' })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, quality: 'balanced' })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, quality: 'high' })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, themeName: 'transparent' })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, isAuthenticated: false })).toBe(false)
    expect(shouldUseGlassFixedShellBackplate({ ...eligible, hasWallpaper: false })).toBe(false)
  })
})
