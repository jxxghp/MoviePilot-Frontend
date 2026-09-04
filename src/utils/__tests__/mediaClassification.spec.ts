import type { ClassificationPolicy } from '@/api/mediaClassificationTypes'
import { formatClassificationCategoryOptionTitle, normalizeClassificationPolicy } from '@/utils/mediaClassification'
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

  it('does not send the removed source default field and repairs empty legacy conditions', () => {
    const policy = {
      schema_version: 2,
      revision: 1,
      mode: 'first_match',
      enrichment_mode: 'primary_only',
      categories: [],
      rules: [
        {
          id: 'movie-rule',
          name: '电影规则',
          kind: 'category',
          enabled: true,
          priority: 0,
          media_types: ['电影'],
          sources: [],
          when: { all: null },
          target: { category_id: null, labels: [] },
        },
      ],
      fallbacks: {},
      field_aliases: {},
      source_fallbacks: { themoviedb: { 电影: 'movie' } },
    } as unknown as ClassificationPolicy & { source_fallbacks: unknown }

    const normalized = normalizeClassificationPolicy(policy)

    expect(normalized).not.toHaveProperty('source_fallbacks')
    expect(normalized.rules[0].when).toEqual({ field: 'media.type', operator: 'equals', value: '电影' })
  })
})
