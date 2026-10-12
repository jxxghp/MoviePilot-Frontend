import { useConfirm } from '@/composables/useConfirm'
import i18n from '@/plugins/i18n'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

describe('useConfirm', () => {
  it('keeps the close action beside a long wrapping title and settles it as cancellation', async () => {
    const title = '确认重启应用安装站点资源？这是需要自动换行的长标题'
    const result = useConfirm()({ title, content: '重启前将应用已下载的资源。' })

    const heading = await screen.findByText(title)
    const close = screen.getByRole('button', { name: i18n.global.t('common.close') })
    expect(heading.parentElement).toContainElement(close)
    expect(close).toHaveClass('app-confirm-dialog-close')
    expect(close).not.toHaveClass('absolute')

    await fireEvent.click(close)
    await expect(result).resolves.toBe(false)
    await waitFor(() => expect(screen.queryByText(title)).not.toBeInTheDocument())
  })

  it('settles an implicit dialog close as cancellation and allows the next confirmation', async () => {
    const createConfirm = useConfirm()
    const firstResult = createConfirm({ content: '第一次确认' })

    await screen.findByText('第一次确认')
    await fireEvent.keyDown(document, { key: 'Escape' })

    await expect(firstResult).resolves.toBe(false)
    await waitFor(() => expect(screen.queryByText('第一次确认')).not.toBeInTheDocument())

    const secondResult = createConfirm({ content: '第二次确认', confirmText: '继续' })
    await screen.findByText('第二次确认')
    await fireEvent.click(screen.getByRole('button', { name: '继续' }))

    await expect(secondResult).resolves.toBe(true)
  })
})
