import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GlassSettingsDialog from '@/components/dialog/GlassSettingsDialog.vue'

const slotStub = { template: '<div><slot /></div>' }
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
  mdAndUp: { value: true },
  settings: {
    value: {
      glassAppearance: 'clear',
      glassDeformationStrength: 50,
      glassFlowStrength: 50,
      glassQuality: 'css',
      glassReflectionStrength: 50,
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
  useDisplay: () => ({ mdAndUp: mocks.mdAndUp }),
}))

describe('GlassSettingsDialog', () => {
  beforeEach(() => {
    mocks.cancelGlassPreview.mockClear()
    mocks.commitGlassPreview.mockClear()
    mocks.previewGlassSettings.mockClear()
    mocks.mdAndUp.value = true
    mocks.settings.value.glassAppearance = 'clear'
    mocks.settings.value.glassDeformationStrength = 50
    mocks.settings.value.glassFlowStrength = 50
    mocks.settings.value.glassQuality = 'css'
    mocks.settings.value.glassReflectionStrength = 50
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

    expect(sliders).toHaveLength(2)
    expect(sliders[0].attributes('data-disabled')).toBe('undefined')
    expect(sliders[1].attributes('data-disabled')).toBe('undefined')
    await wrapper.setProps({ modelValue: false })

    expect(mocks.cancelGlassPreview).toHaveBeenCalledOnce()
  })

  it('resets the draft to the default glass settings without committing', async () => {
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
      glassAppearance: 'clear',
      glassDeformationStrength: 50,
      glassFlowStrength: 50,
      glassQuality: 'balanced',
      glassReflectionStrength: 50,
      glassTranslationStrength: 50,
      glassTransparencyStrength: 50,
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

    expect(sliders).toHaveLength(2)
    expect(sliders[1].attributes('data-disabled')).toBe('undefined')
    await sliders[1].setValue('86')

    expect(mocks.previewGlassSettings).toHaveBeenCalledWith({ glassReflectionStrength: 86 })
  })

  it('normalizes and previews all five independent slider values', async () => {
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

    expect(sliders).toHaveLength(5)
    expect(sliders.every(slider => slider.attributes('data-disabled') !== 'true')).toBe(true)

    await sliders[0].setValue('91.4')
    await sliders[1].setValue('73.6')
    await sliders[2].setValue('84.2')
    await sliders[3].setValue('68.7')
    await sliders[4].setValue('62.2')

    expect(mocks.previewGlassSettings).toHaveBeenNthCalledWith(1, { glassTransparencyStrength: 91 })
    expect(mocks.previewGlassSettings).toHaveBeenNthCalledWith(2, { glassReflectionStrength: 74 })
    expect(mocks.previewGlassSettings).toHaveBeenNthCalledWith(3, { glassTranslationStrength: 84 })
    expect(mocks.previewGlassSettings).toHaveBeenNthCalledWith(4, { glassDeformationStrength: 69 })
    expect(mocks.previewGlassSettings).toHaveBeenNthCalledWith(5, { glassFlowStrength: 62 })
    expect(mocks.commitGlassPreview).not.toHaveBeenCalled()
  })

  it('hides motion tuning on mobile while preserving transparency and reflection', () => {
    mocks.mdAndUp.value = false
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

    expect(sliders).toHaveLength(2)
    expect(sliders.map(slider => slider.attributes('aria-label'))).toEqual([
      'theme.glassTransparencyStrength',
      'theme.glassReflectionStrength',
    ])
  })
})
