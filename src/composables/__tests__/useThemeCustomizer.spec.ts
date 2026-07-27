import {
  applyThemeCustomizerRootSettings,
  cancelGlassPreview,
  commitGlassPreview,
  persistPartialThemeCustomizerSettings,
  previewGlassSettings,
  readThemeCustomizerSettings,
  THEME_CUSTOMIZER_STORAGE_KEY,
  useEffectiveGlassSettings,
} from '@/composables/useThemeCustomizer'
import { beforeEach, describe, expect, it } from 'vitest'

describe('useThemeCustomizer glass settings', () => {
  beforeEach(() => {
    cancelGlassPreview()
    localStorage.clear()
    persistPartialThemeCustomizerSettings({ glassAppearance: 'clear', glassQuality: 'css' })
    localStorage.clear()
  })

  it('uses the checkpoint appearance, quality, and strength values by default', () => {
    const settings = readThemeCustomizerSettings()

    expect(settings.glassAppearance).toBe('clear')
    expect(settings.glassDeformationStrength).toBe(50)
    expect(settings.glassFlowStrength).toBe(50)
    expect(settings.glassPreset).toBe('natural')
    expect(settings.glassQuality).toBe('balanced')
    expect(settings.glassReflectionStrength).toBe(35)
    expect(settings.glassTransmissionStrength).toBe(70)
    expect(settings.glassTranslationStrength).toBe(50)
    expect(settings.glassTransparencyStrength).toBe(70)
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
      JSON.stringify({ glassAppearance: 'opaque', glassPreset: 'elastic', glassQuality: 'ultra' }),
    )

    const settings = readThemeCustomizerSettings()

    expect(settings.glassAppearance).toBe('clear')
    expect(settings.glassPreset).toBe('natural')
    expect(settings.glassQuality).toBe('balanced')
  })

  it('rounds and clamps persisted optical strength values', () => {
    localStorage.setItem(
      THEME_CUSTOMIZER_STORAGE_KEY,
      JSON.stringify({
        glassDeformationStrength: -12,
        glassFlowStrength: 42.6,
        glassReflectionStrength: 140.6,
        glassTransmissionStrength: 78.4,
        glassTranslationStrength: 101,
        glassTransparencyStrength: 83.7,
      }),
    )

    expect(readThemeCustomizerSettings()).toMatchObject({
      glassDeformationStrength: 0,
      glassFlowStrength: 43,
      glassReflectionStrength: 100,
      glassTransmissionStrength: 78,
      glassTranslationStrength: 100,
      glassTransparencyStrength: 84,
    })
  })

  it('migrates the legacy motion value into translation, deformation, and flow', () => {
    localStorage.setItem(THEME_CUSTOMIZER_STORAGE_KEY, JSON.stringify({ glassMotionStrength: 67 }))

    expect(readThemeCustomizerSettings()).toMatchObject({
      glassDeformationStrength: 67,
      glassFlowStrength: 67,
      glassTranslationStrength: 67,
    })
  })

  it('keeps neutral transmission for stored settings created before the field existed', () => {
    localStorage.setItem(THEME_CUSTOMIZER_STORAGE_KEY, JSON.stringify({ glassAppearance: 'clear' }))

    expect(readThemeCustomizerSettings().glassTransmissionStrength).toBe(50)
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
    expect(document.documentElement.style.getPropertyValue('--glass-reflection')).toBe('0.35')
    expect(document.body.style.getPropertyValue('--glass-reflection')).toBe('0.35')
    expect(Number(document.documentElement.style.getPropertyValue('--glass-transmission'))).toBe(1)
    expect(document.body.style.getPropertyValue('--glass-transmission-brightness')).not.toBe('')
    expect(Number(document.documentElement.style.getPropertyValue('--glass-transparency'))).toBeCloseTo(0.96, 2)
    expect(Number(document.body.style.getPropertyValue('--glass-transparency'))).toBeCloseTo(0.96, 2)
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
    previewGlassSettings({
      glassAppearance: 'tinted',
      glassDeformationStrength: 74,
      glassFlowStrength: 63,
      glassPreset: 'glide',
      glassQuality: 'css',
      glassReflectionStrength: 81,
      glassTransmissionStrength: 76,
      glassTranslationStrength: 69,
      glassTransparencyStrength: 80,
    })

    commitGlassPreview()

    expect(readThemeCustomizerSettings()).toMatchObject({
      glassAppearance: 'tinted',
      glassDeformationStrength: 74,
      glassFlowStrength: 63,
      glassPreset: 'glide',
      glassQuality: 'css',
      glassReflectionStrength: 81,
      glassTransmissionStrength: 76,
      glassTranslationStrength: 69,
      glassTransparencyStrength: 80,
    })
    expect(document.documentElement.dataset.glassAppearance).toBe('tinted')
  })

  it('previews and commits frosted material without changing quality', () => {
    previewGlassSettings({ glassAppearance: 'frosted' })

    expect(document.documentElement.dataset.glassAppearance).toBe('frosted')
    expect(readThemeCustomizerSettings()).toMatchObject({ glassAppearance: 'clear', glassQuality: 'balanced' })

    commitGlassPreview()

    expect(readThemeCustomizerSettings()).toMatchObject({ glassAppearance: 'frosted', glassQuality: 'css' })
  })

  it('restores persisted glass settings when a preview is cancelled', () => {
    const effective = useEffectiveGlassSettings()
    persistPartialThemeCustomizerSettings({
      glassAppearance: 'tinted',
      glassDeformationStrength: 42,
      glassFlowStrength: 44,
      glassReflectionStrength: 66,
      glassTransmissionStrength: 64,
      glassTranslationStrength: 46,
      glassTransparencyStrength: 72,
    })
    previewGlassSettings({
      glassAppearance: 'clear',
      glassDeformationStrength: 90,
      glassFlowStrength: 88,
      glassReflectionStrength: 12,
      glassTransmissionStrength: 92,
      glassTranslationStrength: 86,
      glassTransparencyStrength: 94,
    })
    expect(effective.value).toMatchObject({
      glassAppearance: 'clear',
      glassDeformationStrength: 90,
      glassFlowStrength: 88,
      glassReflectionStrength: 12,
      glassTransmissionStrength: 92,
      glassTranslationStrength: 86,
      glassTransparencyStrength: 94,
    })

    cancelGlassPreview()

    expect(document.documentElement.dataset.glassAppearance).toBe('tinted')
    expect(effective.value).toMatchObject({
      glassAppearance: 'tinted',
      glassDeformationStrength: 42,
      glassFlowStrength: 44,
      glassReflectionStrength: 66,
      glassTransmissionStrength: 64,
      glassTranslationStrength: 46,
      glassTransparencyStrength: 72,
    })
  })
})
