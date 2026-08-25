import ShortcutToolDialog from '@/components/dialog/ShortcutToolDialog.vue'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const ToolView = defineComponent({
  emits: ['close'],
  template: '<button type="button" @click="$emit(\'close\')">关闭工具</button>',
})

const FragmentToolView = defineComponent({
  setup(_, { attrs }) {
    return () => [
      h('span', { 'data-testid': 'close-listener-state' }, attrs.onClose ? '已绑定' : '未绑定'),
      h('span', '普通工具内容'),
    ]
  },
})

describe('ShortcutToolDialog', () => {
  it('closes the outer dialog when the active tool requests it', async () => {
    const user = userEvent.setup()
    const result = await renderWithProviders(ShortcutToolDialog, {
      props: {
        modelValue: true,
        supportsClose: true,
        title: '测试工具',
        view: markRaw(ToolView),
      },
      global: {
        stubs: {
          VDialogCloseBtn: true,
        },
      },
    })

    await user.click(screen.getByRole('button', { name: '关闭工具' }))

    expect(result.emitted()['update:modelValue']).toEqual([[false]])
    expect(result.emitted().close).toEqual([[]])
  })

  it('does not pass a close listener to an ordinary fragment view', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await renderWithProviders(ShortcutToolDialog, {
      props: {
        modelValue: true,
        title: '普通工具',
        view: markRaw(FragmentToolView),
      },
      global: {
        stubs: {
          VDialogCloseBtn: true,
        },
      },
    })

    expect(screen.getByTestId('close-listener-state')).toHaveTextContent('未绑定')
    expect(warn.mock.calls.some(([message]) => String(message).includes('Extraneous non-emits event listeners'))).toBe(
      false,
    )
  })
})
