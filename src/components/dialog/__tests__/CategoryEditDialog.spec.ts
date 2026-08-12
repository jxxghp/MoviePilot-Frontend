import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import CategoryEditDialog from '@/components/dialog/CategoryEditDialog.vue'
import { screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
    post: vi.fn(),
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: vi.fn() }),
}))

vi.mock('vuedraggable', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: { modelValue: { type: Array, default: () => [] } },
      setup(props, { slots }) {
        return () =>
          h(
            'div',
            props.modelValue.map((element, index) => slots.item?.({ element, index })),
          )
      },
    }),
  }
})

describe('CategoryEditDialog data client contract', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.toastError.mockReset()
  })

  it('parses the unwrapped category configuration returned by the default API client', async () => {
    mocks.apiGet.mockResolvedValue({
      movie: {
        '电影直返分类': { genre_ids: '28', original_language: 'zh', production_countries: 'CN' },
      },
      tv: {},
    })

    await renderWithProviders(CategoryEditDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: { modelValue: true },
    })

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('media/category/config', { feedback: 'silent' }))
    expect(await screen.findByDisplayValue('电影直返分类')).toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})
