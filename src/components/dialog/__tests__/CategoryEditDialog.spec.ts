import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import CategoryEditDialog from '@/components/dialog/CategoryEditDialog.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
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
    mocks.apiPost.mockReset().mockResolvedValue(null)
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

  it('uses an initial draft without refetching and emits normalized unsaved changes', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderWithProviders(CategoryEditDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: {
        modelValue: true,
        initialConfig: {
          movie: { 动作片: { genre_ids: '28' } },
          tv: {},
        },
      },
    })

    const name = await screen.findByDisplayValue('动作片')
    await user.clear(name)
    await user.type(name, '动画电影')

    await waitFor(() => {
      const draftEvents = emitted()['draft-change'] as unknown[][] | undefined
      expect(draftEvents?.at(-1)?.[0]).toEqual({
        movie: { 动画电影: { genre_ids: '28' } },
        tv: {},
      })
    })
    expect(mocks.apiGet).not.toHaveBeenCalled()
  })

  it('preserves the existing null encoding for an empty genre list', async () => {
    const user = userEvent.setup()
    await renderWithProviders(CategoryEditDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: {
        modelValue: true,
        initialConfig: {
          movie: { 全部电影: {} },
          tv: {},
        },
      },
    })

    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'media/category/config',
        { movie: { 全部电影: { genre_ids: null } }, tv: {} },
        { feedback: 'silent' },
      )
    })
  })
})
