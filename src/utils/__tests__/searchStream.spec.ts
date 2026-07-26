import { SearchReplaceBatchCollector, isSearchReplaceBatchEvent } from '@/utils/searchStream'
import { describe, expect, it } from 'vitest'

/** 构造一个与后端最终结果分批协议一致的测试事件。 */
function createBatch(batchIndex: number, items: number[]) {
  return {
    batch_count: 3,
    batch_index: batchIndex,
    items,
    replace_batch: true,
    total_items: 5,
    type: batchIndex === 0 ? 'replace' : 'append',
  }
}

describe('SearchReplaceBatchCollector', () => {
  it('returns one atomic snapshot after every ordered batch arrives', () => {
    const collector = new SearchReplaceBatchCollector<number>()

    expect(collector.append(createBatch(0, [1, 2]))).toBeNull()
    expect(collector.append(createBatch(1, [3, 4]))).toBeNull()
    expect(collector.append(createBatch(2, [5]))).toEqual([1, 2, 3, 4, 5])
  })

  it('rejects a missing batch and accepts a fresh sequence afterwards', () => {
    const collector = new SearchReplaceBatchCollector<number>()

    expect(collector.append(createBatch(0, [1, 2]))).toBeNull()
    expect(() => collector.append(createBatch(2, [5]))).toThrow('搜索结果批次顺序不连续')

    expect(collector.append(createBatch(0, [1, 2]))).toBeNull()
    expect(collector.append(createBatch(1, [3, 4]))).toBeNull()
    expect(collector.append(createBatch(2, [5]))).toEqual([1, 2, 3, 4, 5])
  })

  it('rejects malformed batch metadata', () => {
    const malformedEvent = { ...createBatch(0, [1, 2]), batch_count: 0 }

    expect(isSearchReplaceBatchEvent(malformedEvent)).toBe(false)
    expect(() => new SearchReplaceBatchCollector<number>().append(malformedEvent)).toThrow('搜索结果批次格式无效')
  })
})
