import FileDetails from '../FileDetails.vue'
import { renderWithProviders } from '@tests/support/render'
import { NativeSheetAdapter } from '@/native/sheet'
import type { FileItem } from '@/api/types'
import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent } from '@testing-library/vue'
import { NativeLayoutAdapter } from '@/native/layout'

const nativeLayout = new NativeLayoutAdapter(document, window)

afterEach(() => {
  nativeLayout.setActive(false)
  delete window.MoviePilotNative
})

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

  it('只为 App 中的本地媒体文件显示播放入口并回传当前文件', async () => {
    window.MoviePilotNative = {
      transportVersion: 1,
      playbackVersion: 1,
      postMessage: () => undefined,
    }
    nativeLayout.setActive(true)
    const item = { storage: 'local', type: 'file', name: '单集.mkv', path: '/media/单集.mkv' } as FileItem
    const { container, emitted } = await renderWithProviders(FileDetails, { props: { item } })
    const playButton = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('播放'))

    expect(playButton).toBeDefined()
    await fireEvent.click(playButton!)
    expect(emitted().action).toEqual([['play', item]])

    const { container: remoteContainer } = await renderWithProviders(FileDetails, {
      props: { item: { ...item, storage: 'alist', name: '网盘.strm', path: '/media/网盘.strm' } },
    })
    expect([...remoteContainer.querySelectorAll('button')].some(button => button.textContent?.includes('播放'))).toBe(
      false,
    )
  })
})
