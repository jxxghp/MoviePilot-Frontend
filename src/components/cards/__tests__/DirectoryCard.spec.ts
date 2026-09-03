import type { ClassificationCategory } from '@/api/mediaClassification'
import type { TransferDirectoryConf } from '@/api/types'
import DirectoryCard from '@/components/cards/DirectoryCard.vue'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/api/manage', () => ({
  manageStorage: vi.fn(),
}))

const categories: ClassificationCategory[] = [
  { id: 'movie.animation', media_type: '电影', name: '动画', path: ['电影', '动画'], enabled: true, labels: [] },
  { id: 'movie.disabled', media_type: '电影', name: '停用', path: ['电影', '停用'], enabled: false, labels: [] },
  { id: 'tv.animation', media_type: '电视剧', name: '动画', path: ['电视剧', '动画'], enabled: true, labels: [] },
  { id: 'music.live', media_type: '音乐', name: '现场', path: ['音乐', '现场'], enabled: true, labels: [] },
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
) {
  const directory = createDirectory(overrides)
  await renderWithProviders(DirectoryCard, {
    props: {
      directory,
      categories: availableCategories,
      storages: [{ name: '本地', type: 'local', config: {} }],
    },
  })
  await userEvent.setup().click(screen.getByTestId('directory-card-toggle'))
  return directory
}

describe('DirectoryCard classification reference', () => {
  it('only lists enabled categories for the selected media type', async () => {
    const user = userEvent.setup()
    await renderExpandedDirectory()

    const categorySelect = within(screen.getByTestId('directory-category-select')).getByRole('combobox')
    await user.click(categorySelect)

    expect(await screen.findByRole('option', { name: '动画 · 电影/动画 · movie.animation' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /movie.disabled/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /tv.animation/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /music.live/ })).not.toBeInTheDocument()
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
