import { applyDocumentThemeChrome } from '@/utils/themePalette'
import { describe, expect, it, vi } from 'vitest'

describe('theme palette', () => {
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
})
