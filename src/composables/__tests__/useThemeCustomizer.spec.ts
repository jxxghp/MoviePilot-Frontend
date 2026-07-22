import {
  applyThemeCustomizerRootSettings,
  cancelGlassPreview,
  commitGlassPreview,
  persistPartialThemeCustomizerSettings,
  previewGlassSettings,
  readThemeCustomizerSettings,
  THEME_CUSTOMIZER_STORAGE_KEY,
} from '@/composables/useThemeCustomizer'
import { beforeEach, describe, expect, it } from 'vitest'

describe('useThemeCustomizer glass settings', () => {
  beforeEach(() => {
    cancelGlassPreview()
    localStorage.clear()
    persistPartialThemeCustomizerSettings({ glassAppearance: 'clear', glassQuality: 'css' })
    localStorage.clear()
  })

  it('uses clear appearance and CSS quality by default', () => {
    const settings = readThemeCustomizerSettings()

    expect(settings.glassAppearance).toBe('clear')
    expect(settings.glassQuality).toBe('css')
  })

  it.each(['balanced', 'high'] as const)('preserves the %s quality contract', quality => {
    localStorage.setItem(THEME_CUSTOMIZER_STORAGE_KEY, JSON.stringify({ glassQuality: quality }))

    expect(readThemeCustomizerSettings().glassQuality).toBe(quality)
  })

  it.each(['clear', 'tinted', 'frosted'] as const)('preserves the %s material contract', glassAppearance => {
    localStorage.setItem(THEME_CUSTOMIZER_STORAGE_KEY, JSON.stringify({ glassAppearance }))

    expect(readThemeCustomizerSettings().glassAppearance).toBe(glassAppearance)
  })

  it('falls back when stored glass settings are invalid', () => {
    localStorage.setItem(
      THEME_CUSTOMIZER_STORAGE_KEY,
      JSON.stringify({ glassAppearance: 'opaque', glassQuality: 'ultra' }),
    )

    const settings = readThemeCustomizerSettings()

    expect(settings.glassAppearance).toBe('clear')
    expect(settings.glassQuality).toBe('css')
  })

  it('syncs glass settings to the document roots', () => {
    const settings = readThemeCustomizerSettings()

    applyThemeCustomizerRootSettings({
      ...settings,
      glassAppearance: 'tinted',
      glassQuality: 'high',
    })

    expect(document.documentElement.dataset.glassAppearance).toBe('tinted')
    expect(document.documentElement.dataset.glassQuality).toBe('high')
    expect(document.body.dataset.glassAppearance).toBe('tinted')
    expect(document.body.dataset.glassQuality).toBe('high')
  })

  it('previews glass settings without persisting them', () => {
    const storedBeforePreview = localStorage.getItem(THEME_CUSTOMIZER_STORAGE_KEY)

    previewGlassSettings({ glassAppearance: 'tinted' })

    expect(document.documentElement.dataset.glassAppearance).toBe('tinted')
    expect(readThemeCustomizerSettings().glassAppearance).toBe('clear')
    expect(localStorage.getItem(THEME_CUSTOMIZER_STORAGE_KEY)).toBe(storedBeforePreview)
  })

  it('commits the latest glass preview as one persisted state', () => {
    previewGlassSettings({ glassAppearance: 'tinted' })
    previewGlassSettings({ glassAppearance: 'clear' })
    previewGlassSettings({ glassAppearance: 'tinted', glassQuality: 'css' })

    commitGlassPreview()

    expect(readThemeCustomizerSettings()).toMatchObject({ glassAppearance: 'tinted', glassQuality: 'css' })
    expect(document.documentElement.dataset.glassAppearance).toBe('tinted')
  })

  it('previews and commits frosted material without changing quality', () => {
    previewGlassSettings({ glassAppearance: 'frosted' })

    expect(document.documentElement.dataset.glassAppearance).toBe('frosted')
    expect(readThemeCustomizerSettings()).toMatchObject({ glassAppearance: 'clear', glassQuality: 'css' })

    commitGlassPreview()

    expect(readThemeCustomizerSettings()).toMatchObject({ glassAppearance: 'frosted', glassQuality: 'css' })
  })

  it('restores persisted glass settings when a preview is cancelled', () => {
    persistPartialThemeCustomizerSettings({ glassAppearance: 'tinted' })
    previewGlassSettings({ glassAppearance: 'clear' })

    cancelGlassPreview()

    expect(document.documentElement.dataset.glassAppearance).toBe('tinted')
    expect(readThemeCustomizerSettings().glassAppearance).toBe('tinted')
  })
})
