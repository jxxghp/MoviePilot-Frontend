import {
  assignPluginToFolder,
  createPluginFolder,
  deletePluginFolder,
  listPluginFolders,
  removePluginFromFolder,
  replacePluginFolderMembers,
  updatePluginFolder,
} from '@/api/pluginFolders'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/api', () => ({ default: mocks }))

describe('pluginFolders api', () => {
  beforeEach(() => vi.clearAllMocks())

  it('normalizes current and legacy folder responses', async () => {
    mocks.get.mockResolvedValue({
      Broken: 'invalid',
      Legacy: ['Plugin-A', 1],
      Tools: { color: '#00ff00', plugins: ['Plugin-B', null], showIcon: false },
    })

    await expect(listPluginFolders()).resolves.toEqual({
      Legacy: ['Plugin-A'],
      Tools: { color: '#00ff00', plugins: ['Plugin-B'], showIcon: false },
    })
    expect(mocks.get).toHaveBeenCalledWith('plugin/folders', { feedback: 'silent' })
  })

  it('uses encoded incremental folder routes', async () => {
    await createPluginFolder('Media Tools')
    await updatePluginFolder('Media Tools', { color: '#ff0000', new_name: 'Daily Tools' })
    await deletePluginFolder('Daily Tools')

    expect(mocks.post).toHaveBeenCalledWith('plugin/folders/Media%20Tools', undefined, { feedback: 'silent' })
    expect(mocks.patch).toHaveBeenCalledWith(
      'plugin/folders/Media%20Tools',
      { color: '#ff0000', new_name: 'Daily Tools' },
      { feedback: 'silent' },
    )
    expect(mocks.delete).toHaveBeenCalledWith('plugin/folders/Daily%20Tools', { feedback: 'silent' })
  })

  it('uses conditional member replacement and single-plugin assignment routes', async () => {
    await replacePluginFolderMembers('Media Tools', ['Plugin-B'], ['Plugin-A'])
    await assignPluginToFolder('Media Tools', 'Plugin/B')
    await removePluginFromFolder('Media Tools', 'Plugin/B')

    expect(mocks.put).toHaveBeenNthCalledWith(
      1,
      'plugin/folders/Media%20Tools/plugins',
      { expected_plugins: ['Plugin-A'], plugins: ['Plugin-B'] },
      { feedback: 'silent' },
    )
    expect(mocks.put).toHaveBeenNthCalledWith(2, 'plugin/folders/Media%20Tools/plugins/Plugin%2FB', undefined, {
      feedback: 'silent',
    })
    expect(mocks.delete).toHaveBeenCalledWith('plugin/folders/Media%20Tools/plugins/Plugin%2FB', {
      feedback: 'silent',
    })
  })
})
