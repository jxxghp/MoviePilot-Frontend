import { NativeSheetAdapter } from '@/native/sheet'
import ProgressDialog from '../ProgressDialog.vue'
import MediaInfoDialog from '../MediaInfoDialog.vue'
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import { renderWithProviders } from '@tests/support/render'
import { screen, waitFor } from '@testing-library/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllGlobals())

describe('处理状态与识别结果的原生交接', () => {
  it('进度更新投影给支持的宿主，旧宿主保留原 HTML，不允许中断实际任务', async () => {
    vi.stubGlobal('MoviePilotNative', { transportVersion: 1, sheetsVersion: 1, progressSheetsVersion: 1 })
    const { rerender } = await renderWithProviders(ProgressDialog, {
      props: { modelValue: true, text: '正在识别演示文件', value: 35 },
    })
    const adapter = new NativeSheetAdapter(document)
    await waitFor(() => expect(adapter.read('文件管理')?.progress?.value).toBe(35))
    const sheet = adapter.read('文件管理')!
    expect(sheet.title).toBe('处理中')
    expect(sheet.canDismiss).toBe(false)
    expect(sheet.progress).toEqual({ message: '正在识别演示文件', value: 35 })
    expect(adapter.execute('presentation.dismiss', { id: sheet.id })).toBe(false)
    await rerender({ text: '正在读取结果', value: undefined })
    expect(adapter.read('文件管理')?.progress).toEqual({ message: '正在读取结果' })
    vi.stubGlobal('MoviePilotNative', { transportVersion: 1, sheetsVersion: 1 })
    expect(adapter.read('文件管理')?.progress).toBeUndefined()
    expect(document.querySelector('[data-native-sheet-progress]')).toBeNull()
    adapter.reset()
  })

  it('识别结果内容不被当作标题隐藏，关闭仍调用原组件事件', async () => {
    const { emitted } = await renderWithProviders(MediaInfoDialog, {
      props: { modelValue: true, context: { meta_info: { name: '演示电影' }, media_info: { title: '演示电影' } } },
      global: { components: { VDialogCloseBtn: DialogCloseBtn } },
    })
    await screen.findByText('演示电影')
    const adapter = new NativeSheetAdapter(document)
    const sheet = adapter.read('文件管理')!
    expect(sheet.title).toBe('识别结果')
    expect(sheet.canDismiss).toBe(true)
    adapter.execute('presentation.attach', { id: sheet.id })
    expect(document.querySelector('[data-native-sheet-header]')).toBeNull()
    expect(adapter.execute('presentation.dismiss', { id: sheet.id })).toBe(true)
    expect(emitted().close).toHaveLength(1)
    adapter.reset()
  })
})
