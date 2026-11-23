import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@tests/support/render'
import FilePickerDialog from '../FilePickerDialog.vue'
const mocks = vi.hoisted(() => ({ post: vi.fn(), storages: vi.fn() }))
vi.mock('@/api', () => ({ default: { post: mocks.post } }))
vi.mock('@/api/storage', () => ({ listStorageOptions: mocks.storages }))
const root = { storage: 'u115', path: '/', fileid: 'root', type: 'dir', name: '/' }
const file = {
  storage: 'u115',
  path: '/movie.mkv',
  fileid: 'movie',
  type: 'file',
  name: 'movie.mkv',
  pickcode: 'cloud-pick',
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.storages.mockResolvedValue([{ type: 'u115', name: '115' }])
  mocks.post.mockResolvedValue([file])
})

describe('SDK 文件选择器', () => {
  it('选择云盘文件时保留原生 ID，确认后返回实际选择', async () => {
    const rendered = await renderWithProviders(FilePickerDialog, { props: { initial: root, kind: 'file' } })
    await fireEvent.click(await screen.findByText('movie.mkv'))
    await fireEvent.click(await screen.findByRole('button', { name: /确认.*1/ }))
    expect(rendered.emitted().select).toEqual([[[file]]])
    expect(mocks.post).toHaveBeenCalledWith('storage/list', root, { params: { page: 1, count: 100 } })
    rendered.unmount()
  })
  it('目录加载失败时清空旧列表，可重试且不能误选上层旧文件', async () => {
    const folder = { ...root, name: 'folder', path: '/folder', fileid: 'folder' }
    mocks.post
      .mockResolvedValueOnce([folder, file])
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce([])
    const rendered = await renderWithProviders(FilePickerDialog, { props: { initial: root } })
    await fireEvent.click(await screen.findByText('folder'))
    await screen.findByRole('alert')
    expect(screen.queryByText('movie.mkv')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(3))
    expect(mocks.post.mock.lastCall?.[1]).toMatchObject({ path: '/folder', fileid: 'folder' })
    rendered.unmount()
  })
  it('目录模式不允许选择文件，并可选择当前目录', async () => {
    const rendered = await renderWithProviders(FilePickerDialog, { props: { initial: root, kind: 'directory' } })
    await fireEvent.click(await screen.findByText('movie.mkv'))
    expect(screen.getByRole('button', { name: /确认.*0/ })).toBeDisabled()
    await fireEvent.click(screen.getByRole('button', { name: '选择: /' }))
    await fireEvent.click(screen.getByRole('button', { name: /确认.*1/ }))
    expect(rendered.emitted().select).toEqual([[[root]]])
    rendered.unmount()
  })
})
