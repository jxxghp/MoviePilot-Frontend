import type { ClassificationCategory } from '@/api/mediaClassification'
import type { FileItem, StorageConf, TransferDirectoryConf } from '@/api/types'
import { manageStorage } from '@/api/manage'
import DirectoryCard from '@/components/cards/DirectoryCard.vue'
import PathField from '@/components/field/PathField.vue'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { apiJson } from '@tests/support/msw/response'
import { server } from '@tests/support/msw/server'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/api/manage', () => ({
  manageStorage: vi.fn(),
}))

vi.mock('@/api/storage', () => ({
  listStorageCatalogOptions: async () => [
    { type: 'local', remote: false },
    { type: 'smb', remote: true },
    { type: 'alist', remote: true },
    { type: 'custom1', remote: true },
  ],
}))

const API_BASE_URL = 'http://localhost/api/v1/'

const categories: ClassificationCategory[] = [
  { id: 'movie.base', media_type: '电影', name: '电影', path: ['电影'], enabled: true, labels: [] },
  { id: 'movie.animation', media_type: '电影', name: '动画', path: ['电影', '动画'], enabled: true, labels: [] },
  { id: 'movie.disabled', media_type: '电影', name: '停用', path: ['电影', '停用'], enabled: false, labels: [] },
  { id: 'tv.animation', media_type: '电视剧', name: '动画', path: ['电视剧', '动画'], enabled: true, labels: [] },
  { id: 'music.live', media_type: '音乐', name: '现场', path: ['音乐', '现场'], enabled: true, labels: [] },
]

const storages: StorageConf[] = [
  { name: '本地', type: 'local', config: {} },
  { name: 'SMB', type: 'smb', config: {} },
  { name: 'Alist', type: 'alist', config: {} },
  { name: '自定义远端', type: 'custom1', config: {} },
]

/** 创建可观察组件原地更新结果的目录配置。 */
function createDirectory(overrides: Partial<TransferDirectoryConf> = {}): TransferDirectoryConf {
  return {
    name: '测试目录',
    priority: 0,
    storage: 'local',
    monitor_type: '',
    media_type: '电影',
    media_category: '',
    media_category_id: null,
    transfer_type: '',
    ...overrides,
  }
}

/** 渲染并展开目录卡片，返回被组件直接维护的目录对象。 */
async function renderExpandedDirectory(
  overrides: Partial<TransferDirectoryConf> = {},
  availableCategories: ClassificationCategory[] = categories,
  availableStorages: StorageConf[] = [storages[0]],
) {
  const directory = createDirectory(overrides)
  await renderWithProviders(DirectoryCard, {
    props: {
      directory,
      categories: availableCategories,
      storages: availableStorages,
    },
    global: { components: { VPathField: PathField } },
  })
  await userEvent.setup().click(screen.getByTestId('directory-card-toggle'))
  return directory
}

describe('DirectoryCard download storage', () => {
  it.each(['downloader', 'monitor', 'manual', ''])('lists every configured storage in %s mode', async monitorType => {
    const user = userEvent.setup()
    await renderExpandedDirectory({ monitor_type: monitorType }, categories, storages)

    await user.click(screen.getByRole('textbox', { name: '资源存储' }))

    for (const storage of storages) {
      expect(await screen.findByRole('option', { name: storage.name })).toBeInTheDocument()
    }
    await user.click(screen.getByRole('option', { name: 'SMB' }))
    expect(screen.getByRole('textbox', { name: '资源存储' })).toHaveValue('SMB')
  })

  it('preserves the remote storage and path when switching to downloader monitoring', async () => {
    const user = userEvent.setup()
    const directory = await renderExpandedDirectory(
      { storage: 'custom1', download_path: '/remote/downloads/', monitor_type: 'monitor' },
      categories,
      storages,
    )

    await user.click(screen.getByLabelText('自动整理'))
    await user.click(await screen.findByRole('option', { name: '下载器监控' }))

    await waitFor(() => expect(directory.monitor_type).toBe('downloader'))
    expect(directory.storage).toBe('custom1')
    expect(directory.download_path).toBe('/remote/downloads/')
    expect(screen.getByRole('textbox', { name: '资源存储' }).closest('.v-autocomplete')).toHaveTextContent('自定义远端')
    expect(screen.getByRole('textbox', { name: '资源目录' })).toHaveValue('/remote/downloads/')
  })

  it('browses and selects paths using the newly selected remote storage', async () => {
    const user = userEvent.setup()
    const requests: FileItem[] = []
    server.use(
      http.post(new URL('storage/list', API_BASE_URL).href, async ({ request }) => {
        const item = (await request.json()) as FileItem
        requests.push(item)
        return apiJson(
          item.path === '/'
            ? [
                { storage: item.storage, type: 'dir', name: '远端下载', path: '/downloads/', children: [] },
                { storage: item.storage, type: 'file', name: 'video.mkv', path: '/video.mkv' },
              ]
            : [],
        )
      }),
    )
    const directory = await renderExpandedDirectory(
      { monitor_type: 'downloader', download_path: '/', library_storage: 'local' },
      categories,
      storages,
    )

    await user.click(screen.getByRole('textbox', { name: '资源存储' }))
    await user.click(await screen.findByRole('option', { name: 'SMB' }))
    await waitFor(() => expect(directory.storage).toBe('smb'))
    expect(manageStorage).toHaveBeenCalledWith('smb', 'support_transtype')

    await user.click(screen.getByRole('textbox', { name: '资源目录' }))
    await user.click(await screen.findByText('远端下载'))

    await waitFor(() => expect(directory.download_path).toBe('/downloads/'))
    expect(requests).toEqual(expect.arrayContaining([expect.objectContaining({ storage: 'smb', path: '/' })]))
    expect(requests.every(item => item.storage === 'smb')).toBe(true)
    expect(screen.queryByText('video.mkv')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '资源目录' })).toHaveValue('/downloads/')
  })
})

describe('DirectoryCard classification reference', () => {
  it('only lists enabled categories for the selected media type', async () => {
    const user = userEvent.setup()
    await renderExpandedDirectory()

    const categorySelect = within(screen.getByTestId('directory-category-select')).getByRole('combobox')
    await user.click(categorySelect)

    expect(await screen.findByRole('option', { name: '电影' })).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: '动画 · 路径：电影/动画' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /停用/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /电视动画|tv.animation/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /现场|music.live/ })).not.toBeInTheDocument()
  })

  it('clears both the stable id and path snapshot when the media type changes', async () => {
    const user = userEvent.setup()
    const directory = await renderExpandedDirectory({
      media_category_id: 'movie.animation',
      media_category: '电影/动画',
    })

    await user.click(screen.getByRole('textbox', { name: '媒体类型' }))
    await user.click(await screen.findByRole('option', { name: '音乐' }))

    await waitFor(() => {
      expect(directory.media_type).toBe('音乐')
      expect(directory.media_category_id).toBeNull()
      expect(directory.media_category).toBe('')
    })
  })

  it('binds a legacy path only when the same-media-type full path has one exact match', async () => {
    const directory = await renderExpandedDirectory({ media_category: '电影/动画' })

    await waitFor(() => expect(directory.media_category_id).toBe('movie.animation'))
    expect((screen.getByTestId('directory-category-path').querySelector('input') as HTMLInputElement).value).toBe(
      '电影/动画',
    )
  })

  it('preserves a legacy fixed-category library layout when binding its stable id', async () => {
    const directory = await renderExpandedDirectory({
      media_type: '电视剧',
      media_category: '电视剧/动画',
      monitor_type: 'monitor',
      library_category_folder: true,
    })

    await waitFor(() => expect(directory.media_category_id).toBe('tv.animation'))
    const libraryCategorySwitch = screen.getByRole('checkbox', { name: '按类别分类' })
    expect(directory.library_category_folder).toBe(true)
    expect(libraryCategorySwitch).toBeChecked()

    await userEvent.setup().click(libraryCategorySwitch)
    expect(directory.library_category_folder).toBe(false)

    await userEvent.setup().click(libraryCategorySwitch)
    expect(directory.library_category_folder).toBe(true)
  })

  it('resets category folder choices when the user selects a new fixed category', async () => {
    const user = userEvent.setup()
    const directory = await renderExpandedDirectory({
      monitor_type: 'monitor',
      download_category_folder: true,
      library_category_folder: true,
    })

    await user.click(within(screen.getByTestId('directory-category-select')).getByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: '动画 · 路径：电影/动画' }))

    await waitFor(() => {
      expect(directory.media_category_id).toBe('movie.animation')
      expect(directory.download_category_folder).toBe(false)
      expect(directory.library_category_folder).toBe(false)
    })
    expect(screen.getAllByRole('checkbox', { name: '按类别分类' }).at(-1)).not.toBeChecked()
  })

  it('keeps ambiguous or non-exact legacy paths readable and exposes diagnostics', async () => {
    const duplicatePathCategories = [
      ...categories,
      {
        id: 'movie.animation-copy',
        media_type: '电影' as const,
        name: '动画副本',
        path: ['电影', '动画'],
        enabled: true,
        labels: [],
      },
    ]
    const ambiguous = await renderExpandedDirectory({ media_category: '电影/动画' }, duplicatePathCategories)

    expect(ambiguous.media_category_id).toBeNull()
    expect(screen.getByTestId('directory-category-diagnostic')).toHaveTextContent('匹配到多个分类')

    const { unmount } = await renderWithProviders(DirectoryCard, {
      props: {
        directory: createDirectory({ media_category: '动画' }),
        categories,
        storages: [{ name: '本地', type: 'local', config: {} }],
      },
    })
    await userEvent.setup().click(screen.getAllByTestId('directory-card-toggle').at(-1)!)
    expect(screen.getAllByTestId('directory-category-diagnostic').at(-1)).toHaveTextContent('无法匹配当前策略')
    unmount()
  })

  it.each([
    ['missing id', { media_category_id: 'movie.missing' }, '不存在'],
    ['disabled id', { media_category_id: 'movie.disabled' }, '已停用'],
    ['media type mismatch', { media_category_id: 'tv.animation' }, '不一致'],
  ])('diagnoses an invalid stable reference: %s', async (_name, overrides, message) => {
    await renderExpandedDirectory(overrides)

    expect(screen.getByTestId('directory-category-diagnostic')).toHaveTextContent(message)
  })
})
