import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GlassSettingsDialog from '@/components/dialog/GlassSettingsDialog.vue'

const mocks = vi.hoisted(() => ({
  cancelGlassPreview: vi.fn(),
}))

vi.mock('@/composables/useThemeCustomizer', () => ({
  cancelGlassPreview: mocks.cancelGlassPreview,
  commitGlassPreview: vi.fn(),
  previewGlassSettings: vi.fn(),
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
  useDisplay: () => ({ xs: { value: false } }),
}))

describe('GlassSettingsDialog', () => {
  beforeEach(() => {
    mocks.cancelGlassPreview.mockClear()
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
})
