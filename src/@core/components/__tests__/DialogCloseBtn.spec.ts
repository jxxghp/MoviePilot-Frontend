import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import i18n from '@/plugins/i18n'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
  i18n.global.locale.value = 'zh-CN'
})

describe('DialogCloseBtn', () => {
  it('keeps its visual and event contracts while exposing a localized name', async () => {
    const user = userEvent.setup()
    const { container, emitted, rerender } = await renderWithProviders(DialogCloseBtn)
    const button = screen.getByRole('button', { name: '关闭' })

    expect(button).toHaveClass('absolute', 'right-3', 'top-3', 'z-10')
    const icon = button.querySelector('svg.v-icon')
    expect(container.querySelectorAll('svg.v-icon')).toHaveLength(1)
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon).toHaveAttribute('role', 'img')
    expect(icon).toHaveAttribute('height', '1em')
    expect(icon).toHaveAttribute('width', '1em')

    i18n.global.locale.value = 'en-US'
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBe(button))

    await user.click(button)
    expect(emitted()['update:modelValue']).toEqual([[false]])
    expect(emitted().click).toEqual([[]])

    await rerender({ innerClass: 'dialog-close-custom' })
    expect(button).toHaveClass('dialog-close-custom')
    expect(button).not.toHaveClass('absolute', 'right-3', 'top-3', 'z-10')
  })
})
