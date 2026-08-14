import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import CategoryEditDialog from '@/components/dialog/CategoryEditDialog.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    post: mocks.apiPost,
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: vi.fn(), warning: mocks.toastWarning }),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

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
    mocks.apiPost.mockReset().mockResolvedValue(null)
    mocks.toastError.mockReset()
    mocks.toastWarning.mockReset()
  })

  it('renders the required category draft without loading a second remote copy', async () => {
    await renderWithProviders(CategoryEditDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: {
        modelValue: true,
        initialConfig: {
          movie: {
            '电影直返分类': { genre_ids: '28', original_language: 'zh', production_countries: 'CN' },
          },
          tv: {},
        },
      },
    })

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
    expect(emitted()['draft-change']).toBeUndefined()
    await user.clear(name)
    await user.type(name, '动画电影')

    await waitFor(() => {
      const draftEvents = emitted()['draft-change'] as unknown[][] | undefined
      expect(draftEvents?.at(-1)?.[0]).toEqual({
        movie: { 动画电影: { genre_ids: '28' } },
        tv: {},
      })
    })
  })

  it('preserves the existing null encoding for an empty genre list', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderWithProviders(CategoryEditDialog, {
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
      const saveEvents = emitted().save as unknown[][] | undefined
      expect(saveEvents?.at(-1)?.[0]).toEqual({ movie: { 全部电影: { genre_ids: null } }, tv: {} })
    })
  })

  it('loads a null fallback rule as an editable empty rule', async () => {
    const user = userEvent.setup()
    await renderWithProviders(CategoryEditDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: {
        modelValue: true,
        initialConfig: { movie: {}, tv: { 兜底: null } },
      },
    })

    await user.click(screen.getByRole('tab', { name: /电视剧/ }))
    expect(await screen.findByDisplayValue('兜底')).toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('keeps edits made during a pending save instead of closing with the stale payload', async () => {
    const pendingSave = deferred<null>()
    mocks.apiPost.mockReturnValueOnce(pendingSave.promise)
    const user = userEvent.setup()
    const { emitted } = await renderWithProviders(CategoryEditDialog, {
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
      props: {
        modelValue: true,
        initialConfig: { movie: { 动作片: { genre_ids: '28' } }, tv: {} },
      },
    })

    await user.click(screen.getByRole('button', { name: '保存' }))
    const name = screen.getByDisplayValue('动作片')
    await user.clear(name)
    await user.type(name, '动画电影')
    pendingSave.resolve(null)

    await waitFor(() => expect(mocks.toastWarning).toHaveBeenCalledTimes(1))
    expect(emitted().save).toBeUndefined()
    const draftEvents = emitted()['draft-change'] as unknown[][] | undefined
    expect(draftEvents?.at(-1)?.[0]).toEqual({
      movie: { 动画电影: { genre_ids: '28' } },
      tv: {},
    })
  })
})
