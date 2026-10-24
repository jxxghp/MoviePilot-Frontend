import {
  applyDocumentThemeChrome,
  applyGlassThemePalette,
  getGlassThemePalette,
  getThemeColorScheme,
  glassAppearancePreference,
  normalizeThemePreference,
  readThemePreference,
} from '@/utils/themePalette'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import vuetify from '@/plugins/vuetify'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('glass appearance preference', () => {
  it.each([
    [null, 'auto'],
    ['glass', 'auto'],
    ['unknown', 'auto'],
    ['default', 'light'],
    ['light', 'light'],
    ['dark', 'dark'],
    ['purple', 'dark'],
    ['transparent', 'dark'],
    ['auto', 'auto'],
  ])('migrates %s without retaining another theme implementation', (stored, expected) => {
    if (stored !== null) localStorage.setItem('theme', stored)
    expect(normalizeThemePreference(stored)).toBe(expected)
    expect(readThemePreference()).toBe(expected)
  })

  it.each(['light', 'dark'] as const)('respects explicit choices and auto with a %s system', system => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      query => ({ matches: system === 'dark', media: query }) as MediaQueryList,
    )
    const glass = vuetify.theme.themes.value.glass
    glass.colors.primary = '#00BCD4'
    glass.colors['on-primary'] = '#000000'
    for (const preference of ['light', 'dark', 'auto'] as const) {
      localStorage.setItem('theme', preference)
      applyGlassThemePalette(vuetify.theme)
      const chrome = applyDocumentThemeChrome(preference, { persistLoaderColors: true })
      const expected = preference === 'auto' ? system : preference
      expect(getThemeColorScheme()).toBe(expected)
      expect(glass.dark).toBe(expected === 'dark')
      expect(glass.colors.background).toBe(expected === 'dark' ? '#000000' : '#F2F2F7')
      expect(glass.colors.surface).toBe(expected === 'dark' ? '#1C1C1E' : '#FFFFFF')
      expect(glass.colors.primary).toBe('#00BCD4')
      expect(glass.colors['on-primary']).toBe('#000000')
      expect(chrome.background).toBe(glass.colors.background)
      expect(document.documentElement.style.colorScheme).toBe(expected)
      expect(document.documentElement.dataset.glassColorScheme).toBe(expected)
      expect(document.documentElement.dataset.theme).toBe('glass')
      expect(document.documentElement.dataset.themePreference).toBe(preference)
      expect(glassAppearancePreference.value).toBe(preference)
      expect(localStorage.getItem('materio-initial-resolved-theme')).toBe(expected)
      expect(getGlassThemePalette(expected).colors.primary).toBe('#8D51F9')
    }
  })

  it('notifies the favicon renderer with the selected primary', () => {
    const listener = vi.fn()
    window.addEventListener('moviepilot-theme-primary-color-change', listener)
    try {
      const chrome = applyDocumentThemeChrome('dark', { primary: '#00BCD4' })
      expect(chrome.primary).toBe('#00BCD4')
      expect(document.documentElement.style.getPropertyValue('--initial-loader-color')).toBe('#00BCD4')
      expect(listener).toHaveBeenCalledOnce()
      expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ color: '#00BCD4' })
    } finally {
      window.removeEventListener('moviepilot-theme-primary-color-change', listener)
    }
  })
})
