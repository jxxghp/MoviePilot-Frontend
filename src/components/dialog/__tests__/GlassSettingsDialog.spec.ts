import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GlassSettingsDialog from '@/components/dialog/GlassSettingsDialog.vue'

const slotStub = { template: '<div><slot /></div>' }
const toggleStub = {
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
  settings: {
    value: {
      glassAppearance: 'clear',
      glassDeformationStrength: 50,
      glassFlowStrength: 50,
      glassPreset: 'natural',
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

describe('GlassSettingsDialog', () => {
  beforeEach(() => {
    mocks.cancelGlassPreview.mockClear()
    mocks.commitGlassPreview.mockClear()
    mocks.previewGlassSettings.mockClear()
    mocks.settings.value.glassAppearance = 'clear'
    mocks.settings.value.glassDeformationStrength = 50
    mocks.settings.value.glassFlowStrength = 50
    mocks.settings.value.glassPreset = 'natural'
    mocks.settings.value.glassQuality = 'css'
    mocks.settings.value.glassReflectionStrength = 50
    mocks.settings.value.glassTransmissionStrength = 50
    mocks.settings.value.glassTranslationStrength = 50
    mocks.settings.value.glassTransparencyStrength = 50
  })

  it('cancels an active preview when the parent closes the dialog', async () => {
    const wrapper = shallowMount(GlassSettingsDialog, {
      global: {
        stubs: {
          VCard: slotStub,
          VCardText: slotStub,
          VDialog: slotStub,
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
    const wrapper = shallowMount(GlassSettingsDialog, {
      global: {
        stubs: {
          VCard: slotStub,
          VCardText: slotStub,
          VBtn: {
            emits: ['click'],
            props: ['prependIcon'],
            template: '<button :data-icon="prependIcon" @click="$emit(\'click\')"><slot /></button>',
          },
          VDialog: slotStub,
          VDialogCloseBtn: true,
          VDivider: true,
          VSlider: sliderStub,
        },
      },
      props: { modelValue: true },
    })
    const resetButton = wrapper.find('[data-icon="mdi-refresh"]')

    await resetButton.trigger('click')

    expect(mocks.previewGlassSettings).toHaveBeenCalledWith({
      glassDeformationStrength: 82,
      glassFlowStrength: 80,
      glassPreset: 'liquid',
      glassReflectionStrength: 31,
      glassTransmissionStrength: 58,
      glassTranslationStrength: 54,
      glassTransparencyStrength: 46,
    })
    expect(mocks.commitGlassPreview).not.toHaveBeenCalled()
  })

  it('keeps static reflection adjustable in standard quality', async () => {
    const wrapper = shallowMount(GlassSettingsDialog, {
      global: {
        stubs: {
          VCard: slotStub,
          VCardText: slotStub,
          VDialog: slotStub,
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

    expect(mocks.previewGlassSettings).toHaveBeenCalledWith({ glassReflectionStrength: 86 })
  })

  it('hides preset choices in standard quality', () => {
    const wrapper = shallowMount(GlassSettingsDialog, {
      global: {
        stubs: {
          VCard: slotStub,
          VCardText: slotStub,
          VDialog: slotStub,
          VDialogCloseBtn: true,
          VSlider: sliderStub,
        },
      },
      props: { modelValue: true },
    })

    expect(wrapper.find('.glass-settings-dialog__preset').exists()).toBe(false)
    expect(wrapper.find('.glass-settings-dialog__preset-state').exists()).toBe(false)
  })

  it('keeps the selected preset highlighted after slider adjustments', async () => {
    mocks.settings.value.glassQuality = 'balanced'
    mocks.settings.value.glassPreset = 'glide'
    mocks.settings.value.glassTransparencyStrength = 61
    const wrapper = shallowMount(GlassSettingsDialog, {
      global: {
        stubs: {
          VCard: slotStub,
          VCardText: slotStub,
          VBtn: slotStub,
          VBtnToggle: toggleStub,
          VDialog: slotStub,
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
  })

  it('normalizes and previews all six independent slider values', async () => {
    mocks.settings.value.glassQuality = 'balanced'
    const wrapper = shallowMount(GlassSettingsDialog, {
      global: {
        stubs: {
          VCard: slotStub,
          VCardText: slotStub,
          VDialog: slotStub,
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

    expect(mocks.previewGlassSettings).toHaveBeenNthCalledWith(1, { glassTransparencyStrength: 91 })
    expect(mocks.previewGlassSettings).toHaveBeenNthCalledWith(2, { glassTransmissionStrength: 78 })
    expect(mocks.previewGlassSettings).toHaveBeenNthCalledWith(3, { glassReflectionStrength: 74 })
    expect(mocks.previewGlassSettings).toHaveBeenNthCalledWith(4, { glassTranslationStrength: 84 })
    expect(mocks.previewGlassSettings).toHaveBeenNthCalledWith(5, { glassDeformationStrength: 69 })
    expect(mocks.previewGlassSettings).toHaveBeenNthCalledWith(6, { glassFlowStrength: 62 })
    expect(mocks.commitGlassPreview).not.toHaveBeenCalled()
  })

  it('keeps motion tuning available in high quality', () => {
    mocks.settings.value.glassQuality = 'high'
    const wrapper = shallowMount(GlassSettingsDialog, {
      global: {
        stubs: {
          VCard: slotStub,
          VCardText: slotStub,
          VDialog: slotStub,
          VDialogCloseBtn: true,
          VSlider: sliderStub,
        },
      },
      props: { modelValue: true },
    })
    const sliders = wrapper.findAll('.slider-stub')

    expect(sliders).toHaveLength(6)
    expect(sliders.map(slider => slider.attributes('aria-label'))).toEqual([
      'theme.glassTransparencyStrength',
      'theme.glassTransmissionStrength',
      'theme.glassReflectionStrength',
      'theme.glassTranslationStrength',
      'theme.glassDeformationStrength',
      'theme.glassFlowStrength',
    ])
  })
})
