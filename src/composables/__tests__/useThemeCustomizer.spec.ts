import {
  applyThemeCustomizerRootSettings,
  cancelGlassPreview,
  commitGlassPreview,
  getDefaultGlassCustomizerSettings,
  isDefaultThemeCustomizerSettings,
  persistPartialThemeCustomizerSettings,
  previewGlassSettings,
  readThemeCustomizerSettings,
  THEME_CUSTOMIZER_STORAGE_KEY,
  useThemeCustomizer,
  useEffectiveGlassSettings,
} from '@/composables/useThemeCustomizer'
import vuetify from '@/plugins/vuetify'
import { normalizeThemeMaterialAccent } from '@/utils/glassColor'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'

describe('useThemeCustomizer glass settings', () => {
  function mountThemeCustomizer() {
    let customizer: ReturnType<typeof useThemeCustomizer> | undefined
    const wrapper = mount(
      defineComponent({
        setup() {
          customizer = useThemeCustomizer()

          return () => h('div')
        },
      }),
      { global: { plugins: [vuetify] } },
    )

    if (!customizer) throw new Error('theme customizer setup failed')

    return { customizer, wrapper }
  }

  beforeEach(() => {
    cancelGlassPreview()
    localStorage.clear()
    persistPartialThemeCustomizerSettings({ glassAppearance: 'clear', glassQuality: 'css' })
    localStorage.clear()
  })

  it('uses the checkpoint appearance, quality, and strength values by default', () => {
    const settings = readThemeCustomizerSettings()

    expect(settings.theme).toBe('glass')
    expect(settings.glassAppearance).toBe('clear')
    expect(settings.glassDeformationStrength).toBe(48)
    expect(settings.glassDynamicsMode).toBe('ripple')
    expect(settings.glassFlowStrength).toBe(48)
    expect(settings.glassPreset).toBe('natural')
    expect(settings.glassPresetOverrides).toEqual({})
    expect(settings.glassQuality).toBe('balanced')
    expect(settings.glassReflectionStrength).toBe(42)
    expect(settings.glassTransmissionStrength).toBe(65)
    expect(settings.glassTranslationStrength).toBe(48)
    expect(settings.glassTransparencyStrength).toBe(50)
  })

  it('recognizes matrix-derived reset settings as the default state', async () => {
    const { customizer, wrapper } = mountThemeCustomizer()

    expect(isDefaultThemeCustomizerSettings(customizer.settings.value)).toBe(true)
    expect(customizer.isCustomized.value).toBe(false)

    await customizer.setGlassDeformationStrength(73)
    expect(customizer.isCustomized.value).toBe(true)

    await customizer.resetSettings()
    expect(customizer.settings.value).toMatchObject(getDefaultGlassCustomizerSettings('balanced'))
    expect(customizer.settings.value.theme).toBe('glass')
    expect(isDefaultThemeCustomizerSettings(customizer.settings.value)).toBe(true)
    expect(customizer.isCustomized.value).toBe(false)

    await customizer.setGlassDynamicsMode('off')
    expect(isDefaultThemeCustomizerSettings(customizer.settings.value)).toBe(false)
    expect(customizer.isCustomized.value).toBe(true)

    await customizer.resetSettings()
    expect(customizer.settings.value.glassDynamicsMode).toBe('ripple')
    expect(customizer.isCustomized.value).toBe(false)

    wrapper.unmount()
  })

  it('derives app-mode glass reset values from the standard-quality matrix', () => {
    expect(getDefaultGlassCustomizerSettings('css')).toEqual({
      glassAppearance: 'clear',
      glassDeformationStrength: 48,
      glassDynamicsMode: 'ripple',
      glassFlowStrength: 48,
      glassPreset: 'natural',
      glassPresetOverrides: {},
      glassQuality: 'css',
      glassReflectionStrength: 42,
      glassTransmissionStrength: 67,
      glassTranslationStrength: 48,
      glassTransparencyStrength: 52,
    })
  })

  it.each(['balanced', 'high'] as const)('preserves the %s quality contract', quality => {
    localStorage.setItem(THEME_CUSTOMIZER_STORAGE_KEY, JSON.stringify({ glassQuality: quality }))

    expect(readThemeCustomizerSettings().glassQuality).toBe(quality)
  })

  it.each(['clear', 'tinted', 'frosted'] as const)('preserves the %s material contract', glassAppearance => {
    localStorage.setItem(THEME_CUSTOMIZER_STORAGE_KEY, JSON.stringify({ glassAppearance }))

    expect(readThemeCustomizerSettings().glassAppearance).toBe(glassAppearance)
  })

  it.each(['fluid', 'ripple', 'off'] as const)('preserves the %s dynamics mode contract', glassDynamicsMode => {
    localStorage.setItem(THEME_CUSTOMIZER_STORAGE_KEY, JSON.stringify({ glassDynamicsMode }))

    expect(readThemeCustomizerSettings().glassDynamicsMode).toBe(glassDynamicsMode)
  })

  it('falls back when stored glass settings are invalid', () => {
    localStorage.setItem(
      THEME_CUSTOMIZER_STORAGE_KEY,
      JSON.stringify({
        glassAppearance: 'opaque',
        glassDynamicsMode: 'elastic',
        glassPreset: 'elastic',
        glassQuality: 'ultra',
      }),
    )

    const settings = readThemeCustomizerSettings()

    expect(settings.glassAppearance).toBe('clear')
    expect(settings.glassDynamicsMode).toBe('ripple')
    expect(settings.glassPreset).toBe('natural')
    expect(settings.glassPresetOverrides).toHaveProperty('clear:balanced:natural')
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
    expect(readThemeCustomizerSettings()).toMatchObject({
      glassPreset: 'natural',
      glassPresetOverrides: {
        'clear:balanced:natural': {
          deformation: 48,
          flow: 48,
          reflection: 42,
          transmission: 50,
          translation: 48,
          transparency: 50,
        },
      },
    })
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
    expect(document.documentElement.style.getPropertyValue('--glass-reflection')).toBe('0.42')
    expect(document.body.style.getPropertyValue('--glass-reflection')).toBe('0.42')
    expect(Number(document.documentElement.style.getPropertyValue('--glass-transmission'))).toBeCloseTo(65 / 70)
    expect(document.body.style.getPropertyValue('--glass-transmission-brightness')).not.toBe('')
    expect(Number(document.documentElement.style.getPropertyValue('--glass-background-visibility'))).toBeCloseTo(0.48)
    expect(Number(document.body.style.getPropertyValue('--glass-background-visibility'))).toBeCloseTo(0.48)
    expect(Number(document.documentElement.style.getPropertyValue('--glass-surface-density'))).toBeCloseTo(0.72)
    expect(Number(document.body.style.getPropertyValue('--glass-tint-density'))).toBeCloseTo(0.65)
    expect(document.documentElement.style.getPropertyValue('--glass-overlay-clarity-blur')).toBe('6.7px')
    expect(document.body.style.getPropertyValue('--glass-overlay-clarity-blur')).toBe('6.7px')
    expect(document.documentElement.style.getPropertyValue('--glass-material-accent-rgb')).toBe(
      normalizeThemeMaterialAccent(settings.primaryColor)?.rgb,
    )
    expect(document.body.style.getPropertyValue('--glass-material-accent-rgb')).toBe(
      normalizeThemeMaterialAccent(settings.primaryColor)?.rgb,
    )
  })

  it('keeps the user primary color while publishing its material tone', async () => {
    const { customizer, wrapper } = mountThemeCustomizer()

    await customizer.setPrimaryColor('#00BCD4')

    expect(customizer.settings.value.primaryColor).toBe('#00BCD4')
    expect(vuetify.theme.current.value.colors.primary).toBe('#00BCD4')
    expect(document.documentElement.style.getPropertyValue('--glass-material-accent-rgb')).toBe(
      normalizeThemeMaterialAccent('#00BCD4')?.rgb,
    )
    expect(document.body.style.getPropertyValue('--glass-material-accent-rgb')).toBe(
      normalizeThemeMaterialAccent('#00BCD4')?.rgb,
    )
    wrapper.unmount()
  })

  it('keeps overlay clarity synchronized across preview, cancel, and commit', () => {
    persistPartialThemeCustomizerSettings({ glassTransparencyStrength: 50 })
    expect(document.documentElement.style.getPropertyValue('--glass-overlay-clarity-blur')).toBe('6.7px')

    previewGlassSettings({ glassTransparencyStrength: 100 })
    expect(document.documentElement.style.getPropertyValue('--glass-overlay-clarity-blur')).toBe('5px')
    expect(document.body.style.getPropertyValue('--glass-overlay-clarity-blur')).toBe('5px')

    cancelGlassPreview()
    expect(document.documentElement.style.getPropertyValue('--glass-overlay-clarity-blur')).toBe('6.7px')
    expect(document.body.style.getPropertyValue('--glass-overlay-clarity-blur')).toBe('6.7px')

    previewGlassSettings({ glassTransparencyStrength: 20 })
    commitGlassPreview()
    expect(readThemeCustomizerSettings().glassTransparencyStrength).toBe(20)
    expect(document.documentElement.style.getPropertyValue('--glass-overlay-clarity-blur')).toBe('7.8px')
    expect(document.body.style.getPropertyValue('--glass-overlay-clarity-blur')).toBe('7.8px')
  })

  it('previews glass settings without persisting them', () => {
    const storedBeforePreview = localStorage.getItem(THEME_CUSTOMIZER_STORAGE_KEY)

    previewGlassSettings({ glassAppearance: 'tinted', glassDynamicsMode: 'ripple' })

    expect(document.documentElement.dataset.glassAppearance).toBe('tinted')
    expect(readThemeCustomizerSettings().glassAppearance).toBe('clear')
    expect(readThemeCustomizerSettings().glassDynamicsMode).toBe('ripple')
    expect(useEffectiveGlassSettings().value.glassDynamicsMode).toBe('ripple')
    expect(localStorage.getItem(THEME_CUSTOMIZER_STORAGE_KEY)).toBe(storedBeforePreview)
  })

  it('commits the latest glass preview as one persisted state', () => {
    previewGlassSettings({ glassAppearance: 'tinted' })
    previewGlassSettings({ glassAppearance: 'clear' })
    previewGlassSettings({
      glassAppearance: 'tinted',
      glassDeformationStrength: 74,
      glassDynamicsMode: 'ripple',
      glassFlowStrength: 63,
      glassPreset: 'natural',
      glassPresetOverrides: {
        'tinted:css:natural': {
          deformation: 74,
          flow: 63,
          reflection: 81,
          transmission: 76,
          translation: 69,
          transparency: 80,
        },
      },
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
      glassDynamicsMode: 'ripple',
      glassFlowStrength: 63,
      glassPreset: 'natural',
      glassPresetOverrides: {
        'tinted:css:natural': {
          deformation: 74,
          flow: 63,
          reflection: 81,
          transmission: 76,
          translation: 69,
          transparency: 80,
        },
      },
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
      glassPresetOverrides: {
        'tinted:balanced:natural': {
          deformation: 42,
          flow: 44,
          reflection: 66,
          transmission: 64,
          translation: 46,
          transparency: 72,
        },
      },
      glassReflectionStrength: 66,
      glassTransmissionStrength: 64,
      glassTranslationStrength: 46,
      glassTransparencyStrength: 72,
    })
    previewGlassSettings({
      glassAppearance: 'clear',
      glassDeformationStrength: 90,
      glassDynamicsMode: 'off',
      glassFlowStrength: 88,
      glassPresetOverrides: {
        'clear:balanced:natural': {
          deformation: 90,
          flow: 88,
          reflection: 12,
          transmission: 92,
          translation: 86,
          transparency: 94,
        },
      },
      glassReflectionStrength: 12,
      glassTransmissionStrength: 92,
      glassTranslationStrength: 86,
      glassTransparencyStrength: 94,
    })
    expect(effective.value).toMatchObject({
      glassAppearance: 'clear',
      glassDeformationStrength: 90,
      glassDynamicsMode: 'off',
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
      glassDynamicsMode: 'ripple',
      glassFlowStrength: 44,
      glassPresetOverrides: {
        'tinted:balanced:natural': {
          deformation: 42,
          flow: 44,
          reflection: 66,
          transmission: 64,
          translation: 46,
          transparency: 72,
        },
      },
      glassReflectionStrength: 66,
      glassTransmissionStrength: 64,
      glassTranslationStrength: 46,
      glassTransparencyStrength: 72,
    })
  })

  it('switches dynamics mode without changing preset ownership or optical parameters', async () => {
    persistPartialThemeCustomizerSettings({
      glassAppearance: 'tinted',
      glassDeformationStrength: 73,
      glassFlowStrength: 61,
      glassPreset: 'glide',
      glassPresetOverrides: {
        'tinted:high:glide': {
          deformation: 73,
          flow: 61,
          reflection: 47,
          transmission: 68,
          translation: 82,
          transparency: 59,
        },
      },
      glassQuality: 'high',
      glassReflectionStrength: 47,
      glassTransmissionStrength: 68,
      glassTranslationStrength: 82,
      glassTransparencyStrength: 59,
    })
    const { customizer, wrapper } = mountThemeCustomizer()
    const before = readThemeCustomizerSettings()

    await customizer.setGlassDynamicsMode('off')
    expect(readThemeCustomizerSettings()).toEqual({ ...before, glassDynamicsMode: 'off' })

    await customizer.setGlassDynamicsMode('ripple')
    expect(readThemeCustomizerSettings()).toEqual({ ...before, glassDynamicsMode: 'ripple' })

    wrapper.unmount()
  })

  it('applies the same preset for a new material and quality while preset-managed', async () => {
    persistPartialThemeCustomizerSettings({
      glassAppearance: 'clear',
      glassPreset: 'natural',
      glassPresetOverrides: {},
      glassQuality: 'balanced',
    })
    const { customizer, wrapper } = mountThemeCustomizer()
    const { setGlassAppearance, setGlassPreset, setGlassQuality } = customizer

    await setGlassPreset('glide')
    await setGlassAppearance('frosted')
    await setGlassQuality('high')

    expect(readThemeCustomizerSettings()).toMatchObject({
      glassAppearance: 'frosted',
      glassDeformationStrength: 38,
      glassFlowStrength: 44,
      glassPreset: 'glide',
      glassQuality: 'high',
      glassReflectionStrength: 30,
      glassTransmissionStrength: 65,
      glassTranslationStrength: 67,
      glassTransparencyStrength: 53,
    })
    wrapper.unmount()
  })

  it('restores each combination override after material and quality changes', async () => {
    persistPartialThemeCustomizerSettings({
      glassAppearance: 'clear',
      glassPreset: 'natural',
      glassPresetOverrides: {},
      glassQuality: 'balanced',
    })
    const { customizer, wrapper } = mountThemeCustomizer()
    const { setGlassAppearance, setGlassDeformationStrength, setGlassQuality, setGlassTransparencyStrength } =
      customizer

    await setGlassDeformationStrength(73)
    await setGlassTransparencyStrength(27)
    await setGlassAppearance('tinted')
    await setGlassQuality('high')

    expect(readThemeCustomizerSettings()).toMatchObject({
      glassAppearance: 'tinted',
      glassDeformationStrength: 50,
      glassPreset: 'natural',
      glassPresetOverrides: {
        'clear:balanced:natural': {
          deformation: 73,
          flow: 48,
          reflection: 42,
          transmission: 65,
          translation: 48,
          transparency: 27,
        },
      },
      glassQuality: 'high',
      glassTransparencyStrength: 32,
    })
    await setGlassQuality('balanced')
    await setGlassAppearance('clear')
    expect(readThemeCustomizerSettings()).toMatchObject({
      glassDeformationStrength: 73,
      glassTransparencyStrength: 27,
    })
    wrapper.unmount()
  })

  it('maps preset-managed standard quality to natural without overwriting custom values', async () => {
    persistPartialThemeCustomizerSettings({
      glassAppearance: 'clear',
      glassPreset: 'natural',
      glassPresetOverrides: {},
      glassQuality: 'balanced',
    })
    const { customizer, wrapper } = mountThemeCustomizer()
    const { setGlassPreset, setGlassQuality, setGlassTransparencyStrength } = customizer

    await setGlassPreset('liquid')
    await setGlassQuality('css')
    expect(readThemeCustomizerSettings()).toMatchObject({
      glassPreset: 'natural',
      glassQuality: 'css',
      glassTransparencyStrength: 52,
    })

    await setGlassTransparencyStrength(19)
    await setGlassQuality('balanced')
    expect(readThemeCustomizerSettings()).toMatchObject({
      glassPreset: 'natural',
      glassQuality: 'balanced',
      glassTransparencyStrength: 50,
    })
    await setGlassQuality('css')
    expect(readThemeCustomizerSettings().glassTransparencyStrength).toBe(19)
    wrapper.unmount()
  })

  it('keeps overrides independent for two presets of the same material and quality', async () => {
    persistPartialThemeCustomizerSettings({
      glassAppearance: 'tinted',
      glassPreset: 'natural',
      glassPresetOverrides: {},
      glassQuality: 'balanced',
    })
    const { customizer, wrapper } = mountThemeCustomizer()
    const { setGlassPreset, setGlassTransparencyStrength } = customizer

    await setGlassPreset('glide')
    await setGlassTransparencyStrength(61)
    await setGlassPreset('liquid')
    await setGlassTransparencyStrength(37)
    await setGlassPreset('glide')
    expect(readThemeCustomizerSettings()).toMatchObject({
      glassPreset: 'glide',
      glassPresetOverrides: {
        'tinted:balanced:glide': expect.objectContaining({ transparency: 61 }),
        'tinted:balanced:liquid': expect.objectContaining({ transparency: 37 }),
      },
      glassTransparencyStrength: 61,
    })
    wrapper.unmount()
  })
})
