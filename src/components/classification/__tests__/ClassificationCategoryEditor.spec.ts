import type { ClassificationCategory, ClassificationMediaType } from '@/api/mediaClassificationTypes'
import ClassificationCategoryEditor from '@/components/classification/ClassificationCategoryEditor.vue'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it, vi } from 'vitest'

/** 创建分类树编辑器测试使用的稳定分类。 */
function createCategory(
  id: string,
  mediaType: ClassificationMediaType,
  name: string,
  path: string[],
): ClassificationCategory {
  return { id, media_type: mediaType, name, path, enabled: true, labels: [] }
}

const categories: ClassificationCategory[] = [
  createCategory('movie.scifi', '电影', '科幻电影', ['电影', '科幻']),
  createCategory('tv.documentary', '电视剧', '纪录剧集', ['电视剧', '纪录']),
  createCategory('music.lossless', '音乐', '无损音乐', ['音乐', '专辑', '无损']),
]

/** 渲染编辑器并记录双向绑定事件。 */
async function renderEditor(
  overrides: {
    categories?: ClassificationCategory[]
    fallbacks?: Partial<Record<ClassificationMediaType, string>>
    maxDepth?: number
    referencedCategoryIds?: string[]
    directoryReferences?: Array<{ categoryId: string; directoryNames: string[] }>
  } = {},
) {
  const events = {
    updateCategories: vi.fn(),
    updateFallbacks: vi.fn(),
  }
  const result = await renderWithProviders(ClassificationCategoryEditor, {
    props: {
      categories: overrides.categories ?? categories,
      fallbacks: overrides.fallbacks ?? {},
      maxDepth: overrides.maxDepth,
      referencedCategoryIds: overrides.referencedCategoryIds,
      directoryReferences: overrides.directoryReferences,
      'onUpdate:categories': events.updateCategories,
      'onUpdate:fallbacks': events.updateFallbacks,
    },
  })
  return { ...result, events }
}

describe('ClassificationCategoryEditor', () => {
  it('按电影、电视剧和音乐分段展示稳定 ID 与多级路径', async () => {
    const user = userEvent.setup()
    await renderEditor()

    expect(screen.getByText('科幻电影')).toBeInTheDocument()
    expect(screen.getByText('movie.scifi')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '科幻电影分类路径' })).toHaveTextContent('电影科幻')
    expect(screen.queryByText('纪录剧集')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '电视剧' }))
    expect(screen.getByText('纪录剧集')).toBeInTheDocument()
    expect(screen.getByText('tv.documentary')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '音乐' }))
    expect(screen.getByText('无损音乐')).toBeInTheDocument()
    expect(screen.getByText('music.lossless')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '无损音乐分类路径' })).toHaveTextContent('音乐专辑无损')
  })

  it('新建时录入稳定 ID，并编辑既有分类的名称、路径、媒体类型和启停状态', async () => {
    const user = userEvent.setup()
    const { events } = await renderEditor()

    await user.click(screen.getByRole('button', { name: '音乐' }))
    await user.click(screen.getByRole('button', { name: '新增音乐分类' }))
    await user.type(screen.getByRole('textbox', { name: /分类名称/ }), '现场专辑')
    await user.type(screen.getByRole('textbox', { name: /稳定 ID/ }), 'music.live')
    await user.type(screen.getByRole('textbox', { name: /分类路径/ }), '音乐/专辑/现场')
    await user.click(screen.getByRole('button', { name: '保存分类' }))

    expect(events.updateCategories).toHaveBeenCalledOnce()
    expect(events.updateCategories.mock.calls[0][0]).toEqual([
      ...categories,
      {
        id: 'music.live',
        media_type: '音乐',
        name: '现场专辑',
        path: ['音乐', '专辑', '现场'],
        enabled: true,
        labels: [],
      },
    ])
    expect(events.updateCategories.mock.calls[0][0]).not.toBe(categories)
    expect(events.updateCategories.mock.calls[0][0][0].path).not.toBe(categories[0].path)

    await user.click(screen.getByRole('button', { name: '电影' }))
    await user.click(screen.getByRole('button', { name: '编辑分类“科幻电影”' }))
    const nameInput = screen.getByRole('textbox', { name: /分类名称/ })
    const idInput = screen.getByRole('textbox', { name: /稳定 ID/ })
    const pathInput = screen.getByRole('textbox', { name: /分类路径/ })
    expect(idInput).toHaveValue('movie.scifi')
    expect(idInput).toHaveAttribute('readonly')
    await user.clear(nameInput)
    await user.type(nameInput, '科幻剧集')
    await user.clear(pathInput)
    await user.type(pathInput, '电视剧/科幻')
    await user.click(screen.getByRole('combobox', { name: '媒体类型' }))
    await user.click(await screen.findByRole('option', { name: '电视剧' }))
    await user.click(screen.getByRole('checkbox', { name: '启用分类' }))
    await user.click(screen.getByRole('button', { name: '保存分类' }))

    expect(events.updateCategories).toHaveBeenCalledTimes(2)
    expect(events.updateCategories.mock.calls[1][0][0]).toEqual({
      id: 'movie.scifi',
      media_type: '电视剧',
      name: '科幻剧集',
      path: ['电视剧', '科幻'],
      enabled: false,
      labels: [],
    })
  })

  it('阻止删除规则或 fallback 引用的分类并给出可访问原因', async () => {
    const user = userEvent.setup()
    const { events } = await renderEditor({
      fallbacks: { 电影: 'movie.scifi' },
      referencedCategoryIds: ['movie.scifi'],
    })

    const row = screen.getByText('科幻电影').closest('[data-category-id="movie.scifi"]')
    expect(row).not.toBeNull()
    const deleteButton = within(row as HTMLElement).getByRole('button', { name: /不能删除“科幻电影”/ })
    const protection = within(row as HTMLElement).getByRole('note')
    expect(deleteButton).toBeDisabled()
    expect(deleteButton).toHaveAttribute('aria-describedby', protection.id)
    expect(protection).toHaveTextContent('已被分类规则或来源兜底引用')
    expect(protection).toHaveTextContent('已设为电影全局兜底分类')

    await user.click(deleteButton)
    expect(events.updateCategories).not.toHaveBeenCalled()
  })

  it('目录引用保护媒体类型和启停状态，但允许修改名称与路径', async () => {
    const user = userEvent.setup()
    const { events } = await renderEditor({
      directoryReferences: [{ categoryId: 'movie.scifi', directoryNames: ['电影主目录', '归档目录'] }],
    })

    const row = screen.getByText('科幻电影').closest('[data-category-id="movie.scifi"]')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByRole('note')).toHaveTextContent('已被目录配置引用：电影主目录、归档目录')
    expect(within(row as HTMLElement).getByRole('button', { name: /不能删除“科幻电影”/ })).toBeDisabled()

    await user.click(within(row as HTMLElement).getByRole('button', { name: '编辑分类“科幻电影”' }))
    const mediaType = screen.getByRole('combobox', { name: '媒体类型' })
    const enabled = screen.getByRole('checkbox', { name: '启用分类' })
    expect(mediaType).toHaveClass('v-field--disabled')
    expect(enabled).toBeDisabled()
    expect(screen.getByText('此分类正在被引用')).toBeInTheDocument()

    const nameInput = screen.getByRole('textbox', { name: /分类名称/ })
    const pathInput = screen.getByRole('textbox', { name: /分类路径/ })
    await user.clear(nameInput)
    await user.type(nameInput, '科幻电影新版')
    await user.clear(pathInput)
    await user.type(pathInput, '电影/科幻/新版')
    await user.click(screen.getByRole('button', { name: '保存分类' }))

    expect(events.updateCategories).toHaveBeenCalledOnce()
    expect(events.updateCategories.mock.calls[0][0][0]).toMatchObject({
      id: 'movie.scifi',
      media_type: '电影',
      name: '科幻电影新版',
      path: ['电影', '科幻', '新版'],
      enabled: true,
    })
  })

  it('fallback 选择器提交稳定分类 ID 而不是名称或路径', async () => {
    const user = userEvent.setup()
    const { events } = await renderEditor()

    await user.click(screen.getByRole('combobox', { name: '音乐回退分类' }))
    await user.click(await screen.findByRole('option', { name: '无损音乐 · 音乐 / 专辑 / 无损' }))

    await waitFor(() => expect(events.updateFallbacks).toHaveBeenCalledWith({ 音乐: 'music.lossless' }))
  })

  it('路径超过最大深度时保留草稿并拒绝发出分类更新', async () => {
    const user = userEvent.setup()
    const { events } = await renderEditor({ maxDepth: 2 })

    await user.click(screen.getByRole('button', { name: '新增电影分类' }))
    await user.type(screen.getByRole('textbox', { name: /分类名称/ }), '过深分类')
    await user.type(screen.getByRole('textbox', { name: /稳定 ID/ }), 'movie.deep')
    await user.type(screen.getByRole('textbox', { name: /分类路径/ }), '电影/地区/华语')
    await user.click(screen.getByRole('button', { name: '保存分类' }))

    const businessError = screen.getByTestId('classification-category-error')
    expect(businessError).toHaveTextContent('分类路径最多支持 2 级')
    expect(businessError).toHaveAttribute('role', 'alert')
    expect(businessError.id).not.toBe('')
    expect(screen.getByRole('region', { name: '新增分类' })).toHaveAttribute('aria-describedby', businessError.id)
    expect(screen.getByRole('textbox', { name: /稳定 ID/ })).toHaveValue('movie.deep')
    expect(events.updateCategories).not.toHaveBeenCalled()
  })
})
