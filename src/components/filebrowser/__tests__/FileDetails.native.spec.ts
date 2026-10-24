import FileDetails from '../FileDetails.vue'
import { renderWithProviders } from '@tests/support/render'
import { NativeSheetAdapter } from '@/native/sheet'
import type { FileItem } from '@/api/types'
import { describe, expect, it } from 'vitest'

describe('文件详情原生标题交接', () => {
  it.each(['file', 'dir'] as const)('读取真实 %s 详情标题并执行原组件关闭事件', async type => {
    const { container, emitted } = await renderWithProviders(FileDetails, {
      props: { item: { type, name: '演示文件', path: '/demo' } as FileItem },
    })
    container.classList.add('v-overlay--active', 'v-dialog')
    const adapter = new NativeSheetAdapter(document)
    const sheet = adapter.read('文件管理')!
    expect(sheet.title).toBe(type === 'file' ? '文件详情' : '文件夹详情')
    expect(sheet.canDismiss).toBe(true)
    expect(sheet.actions).toHaveLength(0)
    adapter.execute('presentation.attach', { id: sheet.id })
    expect(container.querySelector('[data-native-sheet-header]')).toHaveClass('file-details__header')
    expect(adapter.execute('presentation.dismiss', { id: sheet.id })).toBe(true)
    expect(emitted().close).toHaveLength(1)
    adapter.reset()
  })
})
