import type { Ref } from 'vue'

type InfiniteScrollStatus = 'ok' | 'empty' | 'loading' | 'error'

/**
 * 无限滚动 composable
 * 用于管理分页显示和无限滚动加载
 * @param sourceData - 源数据（响应式引用）
 * @param pageSize - 每页显示数量，默认20
 */
export function useInfiniteScroll<T>(
  sourceData: Ref<T[]>,
  pageSize: number = 20
) {
  // 显示用的数据列表
  const displayDataList = ref<T[]>([])
  
  // 剩余数据列表（用于无限滚动）
  const remainingDataList = ref<T[]>([]) as Ref<T[]>

  // 初始化数据
  function initData() {
    if (sourceData.value?.length) {
      // 显示前 pageSize 个
      displayDataList.value = sourceData.value.slice(0, pageSize) as T[]
      // 保存剩余数据
      remainingDataList.value = sourceData.value.slice(pageSize) as T[]
    } else {
      displayDataList.value = []
      remainingDataList.value = []
    }
  }

  // 加载更多
  function loadMore({ done }: { done: (status: InfiniteScrollStatus) => void }) {
    // 从 remainingDataList 中获取最前面的 pageSize 个元素
    const itemsToMove = remainingDataList.value.splice(0, pageSize) as T[]
    ;(displayDataList.value as T[]).push(...itemsToMove)
    done('ok')
  }

  // 重置数据
  function reset() {
    displayDataList.value = []
    remainingDataList.value = []
  }

  // 监听源数据变化，重新初始化
  watch(sourceData, () => {
    initData()
  }, { deep: true, immediate: true })

  return {
    displayDataList,
    remainingDataList,
    initData,
    loadMore,
    reset,
  }
}
