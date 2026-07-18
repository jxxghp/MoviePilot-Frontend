import DiscoverTabOrderDialog from '@/components/dialog/DiscoverTabOrderDialog.vue'
import type { DiscoverSource } from '@/api/types'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, type PropType } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('vuedraggable', async () => {
  const { defineComponent, h } = await import('vue')

  return {
    default: defineComponent({
      name: 'DraggableStub',
      props: {
        modelValue: { type: Array as PropType<DiscoverSource[]>, required: true },
      },
      emits: ['update:modelValue'],
      setup(props, { emit, slots }) {
        return () =>
          h('div', [
            h(
              'button',
              {
                onClick: () => emit('update:modelValue', [...props.modelValue].reverse()),
                type: 'button',
              },
              '反转顺序',
            ),
            ...props.modelValue.map(element => slots.item?.({ element })),
          ])
      },
    }),
  }
})

const DialogCloseButtonStub = defineComponent({
  name: 'VDialogCloseBtn',
  props: {
    modelValue: { type: Boolean, default: true },
  },
  emits: ['update:modelValue'],
  setup(_props, { emit }) {
    return () => h('button', { onClick: () => emit('update:modelValue', false), type: 'button' }, '关闭')
  },
})

function createSource(name: string, prefix: string): DiscoverSource {
  return {
    api_path: `discover/${prefix}`,
    filter_params: { type: prefix },
    filter_ui: [],
    mediaid_prefix: prefix,
    name,
  }
}

async function renderDialog(tabs: DiscoverSource[]) {
  const close = vi.fn()
  const save = vi.fn()
  const updateModelValue = vi.fn()
  const result = await renderWithProviders(DiscoverTabOrderDialog, {
    props: {
      modelValue: true,
      onClose: close,
      onSave: save,
      'onUpdate:modelValue': updateModelValue,
      tabs,
    },
    global: {
      components: {
        VDialogCloseBtn: DialogCloseButtonStub,
      },
    },
  })

  return { ...result, close, save, updateModelValue }
}

describe('DiscoverTabOrderDialog', () => {
  it('reorders a shallow local copy without mutating the parent tabs', async () => {
    const tabs = [createSource('来源甲', 'source-a'), createSource('来源乙', 'source-b')]
    const originalOrder = [...tabs]
    const user = userEvent.setup()
    const { save } = await renderDialog(tabs)

    await user.click(screen.getByRole('button', { name: '反转顺序' }))
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(tabs).toEqual(originalOrder)
    expect(save).toHaveBeenCalledOnce()
    const savedTabs = save.mock.calls[0][0] as DiscoverSource[]
    expect(savedTabs.map(item => item.mediaid_prefix)).toEqual(['source-b', 'source-a'])
    expect(savedTabs[0]).not.toBe(tabs[1])
    expect(savedTabs[0].filter_params).toStrictEqual(tabs[1].filter_params)
  })

  it('resets the local order when the tabs prop changes', async () => {
    const user = userEvent.setup()
    const { rerender, save } = await renderDialog([
      createSource('来源甲', 'source-a'),
      createSource('来源乙', 'source-b'),
    ])
    await user.click(screen.getByRole('button', { name: '反转顺序' }))

    await rerender({
      modelValue: true,
      tabs: [createSource('来源丙', 'source-c'), createSource('来源丁', 'source-d')],
    })
    await user.click(screen.getByRole('button', { name: '保存' }))

    const savedTabs = save.mock.calls[0][0] as DiscoverSource[]
    expect(savedTabs.map(item => item.mediaid_prefix)).toEqual(['source-c', 'source-d'])
  })

  it('emits both model closure and close from the close control', async () => {
    const user = userEvent.setup()
    const { close, updateModelValue } = await renderDialog([createSource('来源甲', 'source-a')])

    await user.click(screen.getByRole('button', { name: '关闭' }))

    expect(updateModelValue).toHaveBeenCalledOnce()
    expect(updateModelValue).toHaveBeenCalledWith(false)
    expect(close).toHaveBeenCalledOnce()
  })

  it('emits only the current local order when saving', async () => {
    const user = userEvent.setup()
    const { close, save, updateModelValue } = await renderDialog([createSource('来源甲', 'source-a')])

    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(save).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
    expect(updateModelValue).not.toHaveBeenCalled()
  })
})
