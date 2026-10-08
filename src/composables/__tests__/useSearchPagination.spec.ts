import type { SearchSourcePage } from '@/api/types'
import { useSearchPagination } from '@/composables/useSearchPagination'
import { describe, expect, it } from 'vitest'

/** 构造单页事实，测试来源推进和失败展示之间的独立性。 */
function page(values: Partial<SearchSourcePage> = {}): SearchSourcePage {
  return { source: 'a', site_name: 'A', page: 0, can_continue: true, error: null, ...values }
}

describe('useSearchPagination', () => {
  it('advances each source locally and requests only sources that can continue', () => {
    const pagination = useSearchPagination()
    pagination.applyPages([page(), page({ source: 'b', can_continue: false })])
    expect(pagination.requests.value.map(source => source.source)).toEqual(['a'])
    pagination.applyPages([page({ page: 1 })])
    expect(pagination.requests.value[0].nextPage).toBe(2)
    pagination.applyPages([page({ page: 2, can_continue: false })])
    expect(pagination.state.value.can_continue).toBe(false)
  })

  it('keeps the same page for retry when a continuation request itself fails', () => {
    const pagination = useSearchPagination()
    pagination.applyPages([page({ page: 1 })])
    pagination.failSource(pagination.requests.value[0], 'timeout')
    expect(pagination.requests.value[0]).toMatchObject({
      nextPage: 2,
      can_continue: true,
      error: 'timeout',
    })
  })

  it('retries a failed first page while independently advancing successful sources', () => {
    const pagination = useSearchPagination()
    pagination.applyPages([page({ error: 'timeout' }), page({ source: 'b' })])
    expect(pagination.requests.value.map(source => [source.source, source.nextPage])).toEqual([
      ['a', 0],
      ['b', 1],
    ])
    pagination.applyPages([page({ can_continue: false })])
    expect(pagination.requests.value.map(source => source.source)).toEqual(['b'])
  })

  it('ignores late failures after a retried page succeeds', () => {
    const pagination = useSearchPagination()
    pagination.applyPages([page()])
    const request = pagination.requests.value[0]
    pagination.applyPages([page({ page: 1, error: 'timeout' })])
    expect(pagination.requests.value[0]).toMatchObject({ nextPage: 1, error: 'timeout' })
    pagination.applyPages([page({ page: 1 })])
    pagination.failSource(request, 'late timeout')
    expect(pagination.requests.value[0]).toMatchObject({ nextPage: 2, error: null })
  })

  it('deduplicates the same site error without merging keyword retry progress', () => {
    const pagination = useSearchPagination()
    const error = '站点请求或页面解析失败（返回登录或权限提示页）'
    pagination.applyPages(
      ['title', 'english-title', 'alias'].map(source => page({ source, site_name: '1PTBA', error })),
    )
    expect(pagination.errorMessages.value).toEqual([`1PTBA: ${error}`])
    expect(pagination.requests.value.map(source => [source.source, source.nextPage])).toEqual([
      ['title', 0],
      ['english-title', 0],
      ['alias', 0],
    ])

    pagination.applyPages([page({ source: 'title', site_name: '1PTBA', can_continue: false })])
    expect(pagination.errorMessages.value).toEqual([`1PTBA: ${error}`])
    pagination.applyPages(
      ['english-title', 'alias'].map(source => page({ source, site_name: '1PTBA', can_continue: false })),
    )
    expect(pagination.errorMessages.value).toEqual([])
  })

  it('keeps different site errors and failure reasons in their original order', () => {
    const pagination = useSearchPagination()
    pagination.applyPages([
      page({ source: 'a', error: 'timeout' }),
      page({ source: 'a-alias', error: 'timeout' }),
      page({ source: 'b', site_name: 'B', error: 'timeout' }),
      page({ source: 'a-second', error: 'login required' }),
      page({ source: 'plugin', site_name: null, error: 'plugin failed' }),
      page({ source: 'plugin-alias', site_name: null, error: 'plugin failed' }),
      page({ source: 'success' }),
    ])
    expect(pagination.errorMessages.value).toEqual(['A: timeout', 'B: timeout', 'A: login required', 'plugin failed'])
    pagination.failSource(pagination.requests.value[0], 'connection lost')
    expect(pagination.errorMessages.value).toEqual([
      'A: connection lost',
      'A: timeout',
      'B: timeout',
      'A: login required',
      'plugin failed',
    ])
  })

  it('reset clears all sources', () => {
    const pagination = useSearchPagination()
    pagination.applyPages([page({ error: 'timeout' })])
    pagination.reset()
    expect(pagination.state.value).toEqual({ sources: [], can_continue: false })
    expect(pagination.errorMessages.value).toEqual([])
  })
})
