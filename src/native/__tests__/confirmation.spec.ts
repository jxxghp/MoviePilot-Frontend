import { useConfirm } from '@/composables/useConfirm'
import { NativeConfirmationAdapter } from '../confirmation'
import { NativeSheetAdapter } from '../sheet'
import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/vue'

afterEach(() => {
  document.documentElement.removeAttribute('data-native-confirmations')
})

describe('系统确认框与原 Vue Promise', () => {
  it.each([false, true])('保留完整正文，通过当前按钮结算 %s 且不能重放', async confirmed => {
    const result = useConfirm()({
      type: 'error',
      title: '删除演示内容？',
      content: '第一行\n第二行',
      confirmText: '删除',
      cancelText: '保留',
    })
    await screen.findByText('删除演示内容？')
    const adapter = new NativeConfirmationAdapter(document)
    expect(adapter.read()).toBeUndefined()
    adapter.setActive(true)
    const descriptor = adapter.read()!
    expect(descriptor).toMatchObject({
      title: '删除演示内容？',
      message: '第一行\n第二行',
      confirmText: '删除',
      cancelText: '保留',
      destructive: true,
    })
    expect(new NativeSheetAdapter(document).read('仪表盘')).toBeUndefined()
    expect(adapter.respond({ id: 'old', confirmed })).toBe(false)
    expect(adapter.respond({ id: descriptor.id, confirmed })).toBe(true)
    await expect(result).resolves.toBe(confirmed)
    expect(adapter.respond({ id: descriptor.id, confirmed })).toBe(false)
    adapter.setActive(false)
  })

  it('嵌套确认只允许最上层响应，普通 Web 或释放后仍可使用原按钮', async () => {
    const parent = useConfirm()({ title: '父确认', confirmText: '继续父操作' })
    await screen.findByText('父确认')
    const adapter = new NativeConfirmationAdapter(document)
    adapter.setActive(true)
    const first = adapter.read()!
    const child = useConfirm()({ title: '子确认', confirmText: '继续子操作' })
    await screen.findByText('子确认')
    const second = adapter.read()!
    expect(second.id).not.toBe(first.id)
    expect(adapter.respond({ id: first.id, confirmed: true })).toBe(false)
    const accept = document.querySelectorAll<HTMLButtonElement>('[data-native-confirm-accept]')[1]
    accept.disabled = true
    expect(adapter.respond({ id: second.id, confirmed: true })).toBe(false)
    expect(adapter.respond({ id: second.id, confirmed: false })).toBe(true)
    await expect(child).resolves.toBe(false)
    await waitFor(() => expect(adapter.read()?.id).toBe(first.id))
    adapter.setActive(false)
    expect(adapter.respond({ id: first.id, confirmed: true })).toBe(false)
    await fireEvent.click(screen.getByRole('button', { name: '继续父操作' }))
    await expect(parent).resolves.toBe(true)
  })
})
