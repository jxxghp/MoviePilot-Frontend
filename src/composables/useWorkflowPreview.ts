import { computed, ref, type Ref } from 'vue'
import { useResizeObserver } from '@vueuse/core'

const DEFAULT_VISIBLE_ACTION_COUNT = 3
const STEP_WIDTH = 26
const ARROW_WIDTH = 13
const MORE_WIDTH = 32
const ITEM_GAP = 4

/** 根据流程条宽度与节点数量，计算可以完整放入的前置节点数量。 */
export function getWorkflowPreviewActionCount(containerWidth: number, totalActionCount: number): number {
  const total = Math.max(0, Math.trunc(totalActionCount))
  if (total === 0) return 0
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return Math.min(total, DEFAULT_VISIBLE_ACTION_COUNT)
  }

  for (let visibleCount = total; visibleCount >= 0; visibleCount -= 1) {
    const hasOverflow = visibleCount < total
    const arrowCount = Math.max(visibleCount - 1, 0)
    const itemCount = visibleCount + arrowCount + Number(hasOverflow)
    const requiredWidth =
      visibleCount * STEP_WIDTH +
      arrowCount * ARROW_WIDTH +
      Number(hasOverflow) * MORE_WIDTH +
      Math.max(itemCount - 1, 0) * ITEM_GAP

    if (requiredWidth <= containerWidth) return visibleCount
  }

  return 0
}

/** 监听流程条可用宽度，并在卡片尺寸变化时更新可见节点数量。 */
export function useWorkflowPreviewActionCount(
  containerRef: Ref<HTMLElement | null>,
  getTotalActionCount: () => number,
) {
  const containerWidth = ref(0)

  useResizeObserver(containerRef, entries => {
    containerWidth.value = entries[0]?.contentRect.width ?? containerRef.value?.clientWidth ?? 0
  })

  const visibleActionCount = computed(() => getWorkflowPreviewActionCount(containerWidth.value, getTotalActionCount()))

  return { visibleActionCount }
}
