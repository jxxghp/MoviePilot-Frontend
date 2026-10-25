import ShortcutLogDialog from '@/components/dialog/ShortcutLogDialog.vue'
import { NativeSheetAdapter } from '@/native/sheet'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { afterEach, describe, expect, it, vi } from 'vitest'

// 标题与动作测试不加载日志内容；仅使用组件 stub 仍会启动异步模块，可能在环境销毁后访问浏览器状态。
vi.mock('@/views/system/LoggingView.vue', () => ({
  default: { name: 'LoggingView', template: '<div />' },
}))

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-native-sheet')
})

describe('ShortcutLogDialog', () => {
  it('keeps the title separate from actions and invokes the original URLs from the native menu', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const view = await renderWithProviders(ShortcutLogDialog, {
      global: { stubs: { LoggingView: true, VDialogCloseBtn: true } },
    })
    const adapter = new NativeSheetAdapter(document)
    await waitFor(() => expect(adapter.read('仪表盘')?.title).toBe('实时日志'))
    const sheet = adapter.read('仪表盘')!
    expect(sheet.actions).toEqual([
      expect.objectContaining({ title: '下载', icon: 'mdi-download', enabled: true }),
      expect.objectContaining({ title: '在新窗口中打开', icon: 'mdi-open-in-new', enabled: true }),
    ])
    adapter.execute('presentation.attach', { id: sheet.id })
    for (const action of sheet.actions) {
      expect(adapter.execute('presentation.action', { id: sheet.id, actionId: action.id })).toBe(true)
    }
    expect(open.mock.calls).toEqual([
      [expect.stringMatching(/system\/logging\/download\/moviepilot$/), '_blank', 'noopener'],
      [expect.stringMatching(/system\/logging\?length=-1$/), '_blank', 'noopener'],
    ])
    adapter.reset()
    view.unmount()
  })

  it('retains both ordinary web actions without requiring a native host', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const user = userEvent.setup()
    await renderWithProviders(ShortcutLogDialog, {
      global: { stubs: { LoggingView: true, VDialogCloseBtn: true } },
    })
    await user.click(await screen.findByRole('button', { name: '下载' }))
    await user.click(screen.getByRole('button', { name: '在新窗口中打开' }))
    expect(open).toHaveBeenCalledTimes(2)
    expect(document.querySelector('[data-native-sheet-current]')).toBeNull()
  })
})
