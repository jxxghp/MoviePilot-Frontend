import { useConfirm } from '@/composables/useConfirm'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

describe('useConfirm', () => {
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
