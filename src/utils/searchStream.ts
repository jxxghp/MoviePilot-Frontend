/** 后端最终搜索结果分批事件的传输字段。 */
export interface SearchReplaceBatchEvent<T> extends Record<string, unknown> {
  batch_count: number
  batch_index: number
  items: T[]
  replace_batch: true
  total_items: number
}

/** 判断搜索流事件是否为结构完整的最终结果批次。 */
export function isSearchReplaceBatchEvent<T>(event: Record<string, unknown>): event is SearchReplaceBatchEvent<T> {
  return (
    event.replace_batch === true &&
    Number.isInteger(event.batch_index) &&
    Number(event.batch_index) >= 0 &&
    Number.isInteger(event.batch_count) &&
    Number(event.batch_count) > 0 &&
    Number(event.batch_index) < Number(event.batch_count) &&
    Number.isInteger(event.total_items) &&
    Number(event.total_items) >= 0 &&
    Array.isArray(event.items)
  )
}

/**
 * 按 SSE 顺序收集最终搜索结果批次，仅在全部批次完整到达后返回可提交快照。
 */
export class SearchReplaceBatchCollector<T> {
  private batchCount = 0
  private expectedTotalItems = 0
  private items: T[] = []
  private nextBatchIndex = 0

  /** 清除未完成批次，供新搜索、断流回退和组件卸载时复用。 */
  reset(): void {
    this.batchCount = 0
    this.expectedTotalItems = 0
    this.items = []
    this.nextBatchIndex = 0
  }

  /**
   * 接收一个最终结果批次；未收齐时返回 null，完整且数量一致时返回结果快照。
   */
  append(event: Record<string, unknown>): T[] | null {
    if (!isSearchReplaceBatchEvent<T>(event)) {
      this.reset()
      throw new Error('搜索结果批次格式无效')
    }

    if (event.batch_index === 0) {
      this.reset()
      this.batchCount = event.batch_count
      this.expectedTotalItems = event.total_items
    }

    if (
      event.batch_index !== this.nextBatchIndex ||
      event.batch_count !== this.batchCount ||
      event.total_items !== this.expectedTotalItems
    ) {
      this.reset()
      throw new Error('搜索结果批次顺序不连续')
    }

    this.items.push(...event.items)
    this.nextBatchIndex += 1
    if (this.nextBatchIndex < this.batchCount) return null

    if (this.items.length !== this.expectedTotalItems) {
      this.reset()
      throw new Error('搜索结果批次数量不完整')
    }

    const completedItems = this.items
    this.reset()
    return completedItems
  }
}
