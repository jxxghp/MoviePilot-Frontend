import type { SearchSourcePage } from '@/api/types'
import { computed, ref } from 'vue'

/** nextPage 仅由前端维护；失败时保留原页号供用户重试。 */
export interface SearchSourceProgress extends SearchSourcePage {
  nextPage: number
}

/** 后端缓存页摘要并判断是否允许继续请求，前端按来源推进页号。 */
export function useSearchPagination() {
  const sources = ref<SearchSourceProgress[]>([])

  /** 整页结果提交时应用来源状态，分块未收齐和单独的 done 事件不推进页号。 */
  function applyPages(pages: SearchSourcePage[]) {
    const progress = new Map(sources.value.map(source => [source.source, source]))
    for (const page of pages) {
      progress.set(page.source, {
        ...page,
        nextPage: page.error ? page.page : page.page + 1,
      })
    }
    sources.value = [...progress.values()]
  }

  /** 续页请求本身失败（连接中断等）时保留原页号，下次继续加载重试。 */
  function failSource(source: SearchSourceProgress, error: string) {
    sources.value = sources.value.map(current =>
      current.source === source.source && current.nextPage === source.nextPage
        ? { ...current, error, can_continue: true }
        : current,
    )
  }

  /** 新搜索清空来源状态和失败提示。 */
  function reset() {
    sources.value = []
  }

  const state = computed(() => ({
    sources: sources.value,
    can_continue: sources.value.some(source => source.can_continue),
  }))
  const requests = computed(() => sources.value.filter(source => source.can_continue))
  // 同站点不同名称查询可能返回同一失败；只去重提示，保留每个来源的独立重试状态。
  const errorMessages = computed(() => [
    ...new Set(
      sources.value.flatMap(source =>
        source.error ? [source.site_name ? `${source.site_name}: ${source.error}` : source.error] : [],
      ),
    ),
  ])
  return { state, requests, errorMessages, applyPages, failSource, reset }
}
