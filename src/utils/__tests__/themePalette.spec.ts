import {
  applyDocumentThemeChrome,
  getThemeColorScheme,
  resolveThemeName,
  themeRootPalettes,
} from '@/utils/themePalette'
import { describe, expect, it, vi } from 'vitest'

describe('theme palette', () => {
  // 玻璃主题在首屏与运行阶段都应保持深色外壳和夜航底色。
  it('resolves glass as a dark theme with its dedicated launch palette', () => {
    expect(resolveThemeName('glass')).toBe('glass')
    expect(getThemeColorScheme('glass')).toBe('dark')
    expect(themeRootPalettes.glass).toEqual({
      background: '#0B1322',
      primary: '#8D51F9',
    })
  })

  it('notifies the favicon renderer with the applied primary color', () => {
    const handleFaviconChange = vi.fn()

    window.addEventListener('moviepilot-theme-primary-color-change', handleFaviconChange)

    try {
      const result = applyDocumentThemeChrome('dark', {
        background: '#0E1116',
        primary: '#00BCD4',
      })
      const event = handleFaviconChange.mock.calls[0]?.[0] as CustomEvent<{ color: string }>

      expect(result.primary).toBe('#00BCD4')
      expect(document.documentElement.style.getPropertyValue('--initial-loader-color')).toBe('#00BCD4')
      expect(handleFaviconChange).toHaveBeenCalledOnce()
      expect(event.detail).toEqual({ color: '#00BCD4' })
    } finally {
      window.removeEventListener('moviepilot-theme-primary-color-change', handleFaviconChange)
    }
  })

  it('persists the resolved auto theme for the next PWA resume', () => {
    applyDocumentThemeChrome('auto', {
      background: '#0E1116',
      persistLoaderColors: true,
      primary: '#6E66ED',
      resolvedTheme: 'dark',
    })

    expect(localStorage.getItem('materio-initial-loader-bg')).toBe('#0E1116')
    expect(localStorage.getItem('materio-initial-resolved-theme')).toBe('dark')
  })

  it('updates the resolved theme cache when the actual theme is confirmed', () => {
    localStorage.setItem('materio-initial-resolved-theme', 'dark')

    applyDocumentThemeChrome('light', {
      background: '#F4F5FA',
      persistLoaderColors: true,
      primary: '#8D51F9',
      resolvedTheme: 'light',
    })

    expect(localStorage.getItem('materio-initial-resolved-theme')).toBe('light')
  })
})
