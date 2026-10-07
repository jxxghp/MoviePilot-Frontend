import type { SearchSourcePage } from '@/api/types'
import { useSearchPagination } from '@/composables/useSearchPagination'
import { describe, expect, it } from 'vitest'

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

  it('reset clears all sources', () => {
    const pagination = useSearchPagination()
    pagination.applyPages([page()])
    pagination.reset()
    expect(pagination.state.value).toEqual({ sources: [], can_continue: false })
  })
})
