import { findNearestScrollTarget, invalidateScrollTargetCache } from '@/utils/scrollTarget'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('findNearestScrollTarget', () => {
  beforeEach(() => {
    invalidateScrollTargetCache()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the nearest scrollable ancestor', () => {
    const scrollable = document.createElement('div')
    const wrapper = document.createElement('div')
    const grid = document.createElement('div')
    scrollable.style.overflowY = 'auto'
    scrollable.append(wrapper)
    wrapper.append(grid)
    document.body.append(scrollable)

    expect(findNearestScrollTarget(grid)).toBe(scrollable)
  })

  it('reuses ancestor results across sibling grids', () => {
    const getComputedStyle = vi.spyOn(window, 'getComputedStyle')
    const wrapper = document.createElement('div')
    const firstGrid = document.createElement('div')
    const secondGrid = document.createElement('div')
    wrapper.append(firstGrid, secondGrid)
    document.body.append(wrapper)

    expect(findNearestScrollTarget(firstGrid)).toBe(window)
    const callsAfterFirstGrid = getComputedStyle.mock.calls.length
    expect(findNearestScrollTarget(secondGrid)).toBe(window)

    expect(getComputedStyle).toHaveBeenCalledTimes(callsAfterFirstGrid)
  })

  it('recomputes targets after cache invalidation', () => {
    const wrapper = document.createElement('div')
    const grid = document.createElement('div')
    wrapper.append(grid)
    document.body.append(wrapper)

    expect(findNearestScrollTarget(grid)).toBe(window)

    wrapper.style.overflowY = 'auto'
    invalidateScrollTargetCache()

    expect(findNearestScrollTarget(grid)).toBe(wrapper)
  })
})
