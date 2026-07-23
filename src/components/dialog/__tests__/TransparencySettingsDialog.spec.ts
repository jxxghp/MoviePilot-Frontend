import { shallowMount } from '@vue/test-utils'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TransparencySettingsDialog from '@/components/dialog/TransparencySettingsDialog.vue'

const slotStub = { template: '<div><slot /></div>' }

const mocks = vi.hoisted(() => ({
  cancelTransparencySettings: vi.fn(),
  saveTransparencySettings: vi.fn(),
}))

vi.mock('@/composables/useTransparencySettings', () => ({
  useTransparencySettings: () => ({
    adjustTransparency: vi.fn(),
    backgroundBlur: ref(16),
    backgroundPosterOpacity: ref(0),
    cancelTransparencySettings: mocks.cancelTransparencySettings,
    currentPresetLevel: ref('medium'),
    onBackgroundBlurChange: vi.fn(),
    onBackgroundPosterOpacityChange: vi.fn(),
    onBlurChange: vi.fn(),
    onGlassQualityChange: vi.fn(),
    onOpacityChange: vi.fn(),
    resetTransparencySettings: vi.fn(),
    saveTransparencySettings: mocks.saveTransparencySettings,
    transparencyBlur: ref(10),
    transparencyGlassQuality: ref('lightweight'),
    transparencyOpacity: ref(0.3),
  }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('vuetify', () => ({
  useDisplay: () => ({ mdAndUp: { value: true } }),
}))

describe('TransparencySettingsDialog', () => {
  beforeEach(() => {
    mocks.cancelTransparencySettings.mockClear()
    mocks.saveTransparencySettings.mockClear()
  })

  it('cancels an active preview when the parent closes the dialog', async () => {
    const wrapper = shallowMount(TransparencySettingsDialog, {
      global: {
        stubs: { VDialogCloseBtn: true, VSlider: true },
      },
      props: { modelValue: true },
    })

    await wrapper.setProps({ modelValue: false })

    expect(mocks.cancelTransparencySettings).toHaveBeenCalledOnce()
  })

  it('persists the preview only from the save action', async () => {
    const wrapper = shallowMount(TransparencySettingsDialog, {
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
          VSlider: true,
        },
      },
      props: { modelValue: true },
    })
    const saveButton = wrapper.find('[data-icon="mdi-content-save"]')

    expect(mocks.saveTransparencySettings).not.toHaveBeenCalled()

    await saveButton.trigger('click')

    expect(mocks.saveTransparencySettings).toHaveBeenCalledOnce()
  })
})
