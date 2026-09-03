import { formatClassificationCategoryOptionTitle } from '@/utils/mediaClassification'
import { describe, expect, it } from 'vitest'

describe('formatClassificationCategoryOptionTitle', () => {
  it('omits a path that is identical to the category name', () => {
    expect(formatClassificationCategoryOptionTitle({ id: 'movie.base', name: '电影', path: ['电影'] })).toBe('电影')
  })

  it('keeps hierarchical paths that add information to the category name', () => {
    expect(
      formatClassificationCategoryOptionTitle({
        id: 'movie.animation',
        name: '动画',
        path: ['电影', '动画'],
      }),
    ).toBe('动画 · 电影')
  })

  it('removes a repeated category name from the end of a hierarchical path', () => {
    expect(
      formatClassificationCategoryOptionTitle({
        id: 'movie.china',
        name: '华语电影',
        path: ['电影', '华语电影'],
      }),
    ).toBe('华语电影 · 电影')
  })

  it('can preserve a caller-specific path separator and stable ID', () => {
    expect(
      formatClassificationCategoryOptionTitle(
        { id: 'movie.animation', name: '动画', path: ['电影', '动画'] },
        { includeId: true, pathSeparator: '/' },
      ),
    ).toBe('动画 · 电影 · movie.animation')
  })

  it('uses the configured label only when the category has no path', () => {
    expect(
      formatClassificationCategoryOptionTitle(
        { id: 'movie.unset', name: '未分类', path: [] },
        { emptyPathLabel: '未设置路径' },
      ),
    ).toBe('未分类 · 未设置路径')
  })
})
