import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GlassSettingsDialog from '@/components/dialog/GlassSettingsDialog.vue'

const slotStub = { template: '<div><slot /></div>' }
const dialogStub = {
  props: ['fullscreen'],
  template: '<div class="dialog-stub" :data-fullscreen="String(fullscreen)"><slot /></div>',
}
const toggleStub = {
  emits: ['update:modelValue'],
  name: 'VBtnToggle',
  props: ['modelValue'],
  template: '<div :data-model-value="modelValue"><slot /></div>',
}
const sliderStub = {
  emits: ['update:modelValue'],
  name: 'VSlider',
  props: ['disabled', 'modelValue'],
  template:
    '<input class="slider-stub" type="range" :data-disabled="String(disabled)" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
}

const mocks = vi.hoisted(() => ({
  cancelGlassPreview: vi.fn(),
  commitGlassPreview: vi.fn(),
  previewGlassSettings: vi.fn(),
  usesMobilePresentation: null as { value: boolean } | null,
  display: {
    smAndDown: { value: false },
  },
  settings: {
    value: {
      glassAppearance: 'clear',
      glassDeformationStrength: 50,
      glassDynamicsMode: 'fluid',
      glassFlowStrength: 50,
      glassPreset: 'natural',
      glassPresetOverrides: {},
      glassQuality: 'css',
      glassReflectionStrength: 50,
      glassTransmissionStrength: 50,
      glassTranslationStrength: 50,
      glassTransparencyStrength: 50,
    },
  },
}))

vi.mock('@/composables/useThemeCustomizer', () => ({
  cancelGlassPreview: mocks.cancelGlassPreview,
  commitGlassPreview: mocks.commitGlassPreview,
  previewGlassSettings: mocks.previewGlassSettings,
  useThemeCustomizer: () => ({
    settings: mocks.settings,
  }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('vuetify', () => ({
  useDisplay: () => mocks.display,
}))

vi.mock('@/composables/useGlassPresentationCapabilities', async () => {
  const { ref } = await vi.importActual<typeof import('vue')>('vue')
  mocks.usesMobilePresentation = ref(false)

  return {
    useGlassMobilePresentation: () => mocks.usesMobilePresentation,
  }
})

describe('GlassSettingsDialog', () => {
  beforeEach(() => {
    mocks.cancelGlassPreview.mockClear()
    mocks.commitGlassPreview.mockClear()
    mocks.previewGlassSettings.mockClear()
    mocks.usesMobilePresentation!.value = false
    mocks.display.smAndDown.value = false
    mocks.settings.value.glassAppearance = 'clear'
    mocks.settings.value.glassDeformationStrength = 50
    mocks.settings.value.glassDynamicsMode = 'fluid'
    mocks.settings.value.glassFlowStrength = 50
    mocks.settings.value.glassPreset = 'natural'
    mocks.settings.value.glassPresetOverrides = {}
    mocks.settings.value.glassQuality = 'css'
    mocks.settings.value.glassReflectionStrength = 50
    mocks.settings.value.glassTransmissionStrength = 50
    mocks.settings.value.glassTranslationStrength = 50
    mocks.settings.value.glassTransparencyStrength = 50
  })

  it('cancels an active preview when the parent closes the dialog', async () => {
    mocks.display.smAndDown.value = true
    const wrapper = shallowMount(GlassSettingsDialog, {
      global: {
        stubs: {
          VCard: slotStub,
          VCardActions: slotStub,
          VCardText: slotStub,
          VDialog: dialogStub,
          VDialogCloseBtn: true,
          VSlider: sliderStub,
        },
      },
      props: { modelValue: true },
    })
    const sliders = wrapper.findAll('.slider-stub')

    expect(sliders).toHaveLength(3)
    expect(sliders[0].attributes('data-disabled')).toBe('undefined')
    expect(sliders[1].attributes('data-disabled')).toBe('undefined')
    expect(wrapper.find('.dialog-stub').attributes('data-fullscreen')).toBe('true')
    expect(wrapper.find('.glass-settings-dialog__actions').classes()).toContain('justify-center')
    await wrapper.setProps({ modelValue: false })

    expect(mocks.cancelGlassPreview).toHaveBeenCalledOnce()
  })

  it('resets parameters to the current material, quality, and preset without committing', async () => {
    mocks.settings.value.glassAppearance = 'frosted'
    mocks.settings.value.glassPreset = 'liquid'
    mocks.settings.value.glassQuality = 'high'
    mocks.settings.value.glassDeformationStrength = 65
    mocks.settings.value.glassFlowStrength = 61
    mocks.settings.value.glassReflectionStrength = 58
    mocks.settings.value.glassTransmissionStrength = 57
    mocks.settings.value.glassTranslationStrength = 57
    mocks.settings.value.glassTransparencyStrength = 55
    mocks.settings.value.glassPresetOverrides = {
      'clear:balanced:glide': {
        deformation: 24,
        flow: 35,
        reflection: 46,
        transmission: 57,
        translation: 68,
        transparency: 79,
      },
      'frosted:high:liquid': {
        deformation: 65,
        flow: 61,
        reflection: 58,
        transmission: 57,
        translation: 57,
        transparency: 55,
      },
    }
    const wrapper = shallowMount(GlassSettingsDialog, {
      global: {
        stubs: {
          VCard: slotStub,
          VCardActions: slotStub,
          VCardText: slotStub,
          VBtn: {
            emits: ['click'],
            props: ['prependIcon', 'slim', 'variant'],
            template:
              '<button :data-icon="prependIcon" :data-slim="String(slim)" :data-variant="variant" @click="$emit(\'click\')"><slot /></button>',
          },
          VDialog: dialogStub,
          VDialogCloseBtn: true,
          VDivider: true,
          VSlider: sliderStub,
        },
      },
      props: { modelValue: true },
    })
    const resetButton = wrapper.find('[data-icon="mdi-refresh"]')
    const saveButton = wrapper.find('[data-icon="mdi-content-save"]')

    expect(resetButton.attributes('data-slim')).toBe('false')
    expect(saveButton.attributes('data-slim')).toBe('false')
    expect(saveButton.attributes('data-variant')).toBe('elevated')
    await resetButton.trigger('click')

    expect(mocks.previewGlassSettings).toHaveBeenCalledWith({
      glassAppearance: 'frosted',
      glassDeformationStrength: 79,
      glassDynamicsMode: 'fluid',
      glassFlowStrength: 77,
      glassPreset: 'liquid',
      glassPresetOverrides: {
        'clear:balanced:glide': {
          deformation: 24,
          flow: 35,
          reflection: 46,
          transmission: 57,
          translation: 68,
          transparency: 79,
        },
      },
      glassQuality: 'high',
      glassReflectionStrength: 37,
      glassTransmissionStrength: 56,
      glassTranslationStrength: 52,
      glassTransparencyStrength: 44,
    })
    expect(mocks.commitGlassPreview).not.toHaveBeenCalled()
  })

  it('keeps static reflection adjustable in standard quality', async () => {
    const wrapper = shallowMount(GlassSettingsDialog, {
      global: {
        stubs: {
          VCard: slotStub,
          VCardActions: slotStub,
          VCardText: slotStub,
          VDialog: dialogStub,
          VDialogCloseBtn: true,
          VSlider: sliderStub,
        },
      },
      props: { modelValue: true },
    })
    const sliders = wrapper.findAll('.slider-stub')

    expect(sliders).toHaveLength(3)
    expect(sliders[2].attributes('data-disabled')).toBe('undefined')
    await sliders[2].setValue('86')

    expect(mocks.previewGlassSettings).toHaveBeenCalledWith({
      glassAppearance: 'clear',
      glassDeformationStrength: 50,
      glassDynamicsMode: 'fluid',
      glassFlowStrength: 50,
      glassPreset: 'natural',
      glassPresetOverrides: {
        'clear:css:natural': {
          deformation: 50,
          flow: 50,
          reflection: 86,
          transmission: 50,
          translation: 50,
          transparency: 50,
        },
      },
      glassQuality: 'css',
      glassReflectionStrength: 86,
      glassTransmissionStrength: 50,
      glassTranslationStrength: 50,
      glassTransparencyStrength: 50,
    })
  })

  it('hides preset choices in standard quality', () => {
    const wrapper = shallowMount(GlassSettingsDialog, {
      global: {
        stubs: {
          VCard: slotStub,
          VCardActions: slotStub,
          VCardText: slotStub,
          VDialog: dialogStub,
          VDialogCloseBtn: true,
          VSlider: sliderStub,
        },
      },
      props: { modelValue: true },
    })

    expect(wrapper.find('.glass-settings-dialog__preset').exists()).toBe(false)
    expect(wrapper.find('.glass-settings-dialog__preset-state').exists()).toBe(false)
    expect(wrapper.find('.glass-settings-dialog__dynamics-mode').exists()).toBe(false)
  })

  it('keeps the selected preset highlighted and records its combination override', async () => {
    mocks.settings.value.glassQuality = 'balanced'
    mocks.settings.value.glassPreset = 'glide'
    mocks.settings.value.glassTransparencyStrength = 61
    const wrapper = shallowMount(GlassSettingsDialog, {
      global: {
        stubs: {
          VCard: slotStub,
          VCardActions: slotStub,
          VCardText: slotStub,
          VBtn: slotStub,
          VBtnToggle: toggleStub,
          VDialog: dialogStub,
          VDialogCloseBtn: true,
          VSlider: sliderStub,
        },
      },
      props: { modelValue: true },
    })

    const preset = wrapper.find('.glass-settings-dialog__preset')
    const sliders = wrapper.findAll('.slider-stub')

    expect(preset.attributes('data-model-value')).toBe('glide')
    expect(wrapper.findAll('.glass-settings-dialog__preset-option')).toHaveLength(3)
    expect(wrapper.find('.glass-settings-dialog__preset-state').exists()).toBe(false)

    await sliders[0].setValue('77')

    expect(preset.attributes('data-model-value')).toBe('glide')
    expect(mocks.previewGlassSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        glassPreset: 'glide',
        glassPresetOverrides: {
          'clear:balanced:glide': {
            deformation: 50,
            flow: 50,
            reflection: 50,
            transmission: 50,
            translation: 50,
            transparency: 77,
          },
        },
      }),
    )
  })

  it('normalizes and previews all six independent slider values', async () => {
    mocks.settings.value.glassQuality = 'balanced'
    const wrapper = shallowMount(GlassSettingsDialog, {
      global: {
        stubs: {
          VCard: slotStub,
          VCardActions: slotStub,
          VCardText: slotStub,
          VDialog: dialogStub,
          VDialogCloseBtn: true,
          VSlider: sliderStub,
        },
      },
      props: { modelValue: true },
    })
    const sliders = wrapper.findAll('.slider-stub')

    expect(sliders).toHaveLength(6)
    expect(sliders.every(slider => slider.attributes('data-disabled') !== 'true')).toBe(true)

    await sliders[0].setValue('91.4')
    await sliders[1].setValue('77.5')
    await sliders[2].setValue('73.6')
    await sliders[3].setValue('84.2')
    await sliders[4].setValue('68.7')
    await sliders[5].setValue('62.2')

    expect(mocks.previewGlassSettings).toHaveBeenCalledTimes(6)
    expect(mocks.previewGlassSettings).toHaveBeenLastCalledWith({
      glassAppearance: 'clear',
      glassDeformationStrength: 69,
      glassDynamicsMode: 'fluid',
      glassFlowStrength: 62,
      glassPreset: 'natural',
      glassPresetOverrides: {
        'clear:balanced:natural': {
          deformation: 69,
          flow: 62,
          reflection: 74,
          transmission: 78,
          translation: 84,
          transparency: 91,
        },
      },
      glassQuality: 'balanced',
      glassReflectionStrength: 74,
      glassTransmissionStrength: 78,
      glassTranslationStrength: 84,
      glassTransparencyStrength: 91,
    })
    expect(mocks.commitGlassPreview).not.toHaveBeenCalled()
  })

  it('keeps motion tuning available in high quality', () => {
    mocks.settings.value.glassQuality = 'high'
    const wrapper = shallowMount(GlassSettingsDialog, {
      global: {
        stubs: {
          VCard: slotStub,
          VCardActions: slotStub,
          VCardText: slotStub,
          VBtnToggle: toggleStub,
          VDialog: dialogStub,
          VDialogCloseBtn: true,
          VSlider: sliderStub,
        },
      },
      props: { modelValue: true },
    })
    const sliders = wrapper.findAll('.slider-stub')

    expect(sliders).toHaveLength(6)
    expect(wrapper.find('.glass-settings-dialog__dynamics-mode').attributes('data-model-value')).toBe('fluid')
    expect(sliders.map(slider => slider.attributes('aria-label'))).toEqual([
      'theme.glassTransparencyStrength',
      'theme.glassTransmissionStrength',
      'theme.glassReflectionStrength',
      'theme.glassTranslationStrength',
      'theme.glassDeformationStrength',
      'theme.glassFlowStrength',
    ])
  })

  it('restores motion tuning when a mobile presentation returns to desktop', async () => {
    mocks.usesMobilePresentation!.value = true
    mocks.settings.value.glassDynamicsMode = 'ripple'
    mocks.settings.value.glassQuality = 'high'
    const wrapper = shallowMount(GlassSettingsDialog, {
      global: {
        stubs: {
          VCard: slotStub,
          VCardActions: slotStub,
          VCardText: slotStub,
          VBtnToggle: toggleStub,
          VDialog: dialogStub,
          VDialogCloseBtn: true,
          VSlider: sliderStub,
        },
      },
      props: { modelValue: true },
    })

    expect(wrapper.findAll('.slider-stub').map(slider => slider.attributes('aria-label'))).toEqual([
      'theme.glassTransparencyStrength',
      'theme.glassTransmissionStrength',
      'theme.glassReflectionStrength',
    ])
    expect(wrapper.find('.glass-settings-dialog__live-controls').exists()).toBe(false)
    expect(wrapper.find('.glass-settings-dialog__dynamics-mode').exists()).toBe(false)
    expect(wrapper.text()).toContain('theme.glassMaterialStrengthHint')
    expect(wrapper.text()).not.toContain('theme.glassOpticalStrengthHint')
    expect(wrapper.text()).toContain('theme.glassQualityMobileHint')

    mocks.usesMobilePresentation!.value = false
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.slider-stub')).toHaveLength(6)
    expect(wrapper.find('.glass-settings-dialog__live-controls').exists()).toBe(true)
    expect(wrapper.find('.glass-settings-dialog__dynamics-mode').attributes('data-model-value')).toBe('ripple')
    expect(wrapper.text()).toContain('theme.glassAppearanceHint')
    expect(wrapper.text()).toContain('theme.glassPresetHint')
    expect(wrapper.text()).toContain('theme.glassMaterialStrengthHint')
    expect(wrapper.text()).toContain('theme.glassOpticalStrengthHint')
  })

  it('keeps optical parameters while switching modes and hides motion tuning only when off', async () => {
    mocks.settings.value.glassDynamicsMode = 'ripple'
    mocks.settings.value.glassQuality = 'balanced'
    mocks.settings.value.glassDeformationStrength = 62
    mocks.settings.value.glassFlowStrength = 58
    mocks.settings.value.glassReflectionStrength = 44
    mocks.settings.value.glassTransmissionStrength = 67
    mocks.settings.value.glassTranslationStrength = 76
    mocks.settings.value.glassTransparencyStrength = 53
    const wrapper = shallowMount(GlassSettingsDialog, {
      global: {
        stubs: {
          VCard: slotStub,
          VCardActions: slotStub,
          VCardText: slotStub,
          VBtn: slotStub,
          VBtnToggle: toggleStub,
          VDialog: dialogStub,
          VDialogCloseBtn: true,
          VSlider: sliderStub,
        },
      },
      props: { modelValue: true },
    })
    const modeControl = wrapper
      .findAllComponents({ name: 'VBtnToggle' })
      .find(component => component.classes().includes('glass-settings-dialog__dynamics-mode'))
    if (!modeControl) throw new Error('dynamics mode control was not rendered')

    expect(modeControl.attributes('data-model-value')).toBe('ripple')
    expect(wrapper.findAll('.slider-stub')).toHaveLength(6)

    modeControl.vm.$emit('update:modelValue', 'off')
    await wrapper.vm.$nextTick()

    expect(mocks.previewGlassSettings).toHaveBeenLastCalledWith({
      glassAppearance: 'clear',
      glassDeformationStrength: 62,
      glassDynamicsMode: 'off',
      glassFlowStrength: 58,
      glassPreset: 'natural',
      glassPresetOverrides: {},
      glassQuality: 'balanced',
      glassReflectionStrength: 44,
      glassTransmissionStrength: 67,
      glassTranslationStrength: 76,
      glassTransparencyStrength: 53,
    })
    expect(wrapper.findAll('.slider-stub')).toHaveLength(3)
    expect(wrapper.find('.glass-settings-dialog__live-controls').exists()).toBe(false)
    expect(wrapper.find('.glass-settings-dialog__dynamics-mode').exists()).toBe(true)
  })
})
