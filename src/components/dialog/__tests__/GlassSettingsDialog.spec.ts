import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GlassSettingsDialog from '@/components/dialog/GlassSettingsDialog.vue'

const slotStub = { template: '<div><slot /></div>' }

const mocks = vi.hoisted(() => ({
  cancelGlassPreview: vi.fn(),
  commitGlassPreview: vi.fn(),
  previewGlassSettings: vi.fn(),
}))

vi.mock('@/composables/useThemeCustomizer', () => ({
  cancelGlassPreview: mocks.cancelGlassPreview,
  commitGlassPreview: mocks.commitGlassPreview,
  previewGlassSettings: mocks.previewGlassSettings,
  useThemeCustomizer: () => ({
    settings: {
      value: {
        glassAppearance: 'clear',
        glassQuality: 'css',
      },
    },
  }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('vuetify', () => ({
  useDisplay: () => ({ mdAndUp: { value: true } }),
}))

describe('GlassSettingsDialog', () => {
  beforeEach(() => {
    mocks.cancelGlassPreview.mockClear()
    mocks.commitGlassPreview.mockClear()
    mocks.previewGlassSettings.mockClear()
  })

  it('cancels an active preview when the parent closes the dialog', async () => {
    const wrapper = shallowMount(GlassSettingsDialog, {
      global: {
        stubs: { VDialogCloseBtn: true },
      },
      props: { modelValue: true },
    })

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
        },
      },
      props: { modelValue: true },
    })
    const resetButton = wrapper.find('[data-icon="mdi-refresh"]')

    await resetButton.trigger('click')

    expect(mocks.previewGlassSettings).toHaveBeenCalledWith({
      glassAppearance: 'clear',
      glassQuality: 'css',
    })
    expect(mocks.commitGlassPreview).not.toHaveBeenCalled()
  })
})
