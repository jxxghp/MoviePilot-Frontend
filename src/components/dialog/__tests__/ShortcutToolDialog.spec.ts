import ShortcutToolDialog from '@/components/dialog/ShortcutToolDialog.vue'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, markRaw } from 'vue'
import { describe, expect, it } from 'vitest'

const ToolView = defineComponent({
  emits: ['close'],
  template: '<button type="button" @click="$emit(\'close\')">关闭工具</button>',
})

describe('ShortcutToolDialog', () => {
  it('closes the outer dialog when the active tool requests it', async () => {
    const user = userEvent.setup()
    const result = await renderWithProviders(ShortcutToolDialog, {
      props: {
        modelValue: true,
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
})
