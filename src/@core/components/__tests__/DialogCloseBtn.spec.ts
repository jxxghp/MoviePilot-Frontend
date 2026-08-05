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
    const icon = container.querySelector('svg.v-icon')
    expect(icon).not.toBeNull()
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    await waitFor(() =>
      expect(icon?.querySelector('path')).toHaveAttribute(
        'd',
        'M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z',
      ),
    )

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
