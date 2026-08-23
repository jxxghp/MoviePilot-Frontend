import { useVueFlow } from '@vue-flow/core'
import { onUnmounted, ref, watch } from 'vue'
import { cloneDeep } from 'lodash-es'

/**
 * @returns {string} - A unique id.
 */
function getId() {
  // 生成以act_开头的唯一id
  return 'act_' + Math.random().toString(36).substr(2, 9)
}

/**
 * In a real world scenario you'd want to avoid creating refs in a global scope like this as they might not be cleaned up properly.
 * @type {{draggedData: Ref<any>, isDragOver: Ref<boolean>, isDragging: Ref<boolean>}}
 */
const state = {
  /**
   * The type of the node being dragged.
   */
  draggedData: ref<any | null>(null),
  isDragOver: ref(false),
  isDragging: ref(false),
}

export default function useDragAndDrop() {
  const { draggedData, isDragOver, isDragging } = state

  const { addNodes, screenToFlowCoordinate, onNodesInitialized, updateNode } = useVueFlow()
  let ownsDragListeners = false

  watch(isDragging, dragging => {
    document.body.style.userSelect = dragging ? 'none' : ''
  })

  function onDragStart(event: any, data: any) {
    if (event.dataTransfer) {
      event.dataTransfer.setData('application/vueflow', data)
      event.dataTransfer.effectAllowed = 'move'
    }

    draggedData.value = data
    isDragging.value = true

    document.addEventListener('drop', onDragEnd)
    document.addEventListener('dragend', onDragEnd)
    ownsDragListeners = true
  }

  /**
   * Handles the drag over event.
   *
   * @param {DragEvent} event
   */
  function onDragOver(event: any) {
    event.preventDefault()

    if (draggedData.value) {
      isDragOver.value = true

      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move'
      }
    }
  }

  function onDragLeave() {
    isDragOver.value = false
  }

  function onDragEnd() {
    isDragging.value = false
    isDragOver.value = false
    draggedData.value = null
    document.removeEventListener('drop', onDragEnd)
    document.removeEventListener('dragend', onDragEnd)
    ownsDragListeners = false
  }

  /**
   * Handles the drop event.
   *
   * @param {DragEvent} event
   */
  function onDrop(event: any) {
    if (!draggedData.value) return

    const position = screenToFlowCoordinate({
      x: event.clientX,
      y: event.clientY,
    })

    const nodeId = getId()

    const newNode = {
      id: nodeId,
      type: draggedData.value?.type,
      name: draggedData.value?.name,
      description: draggedData.value?.description,
      position,
      data: draggedData.value?.data ? cloneDeep(draggedData.value.data) : {},
    }

    /**
     * Align node position after drop, so it's centered to the mouse
     *
     * We can hook into events even in a callback, and we can remove the event listener after it's been called.
     */
    const { off } = onNodesInitialized(() => {
      updateNode(nodeId, node => ({
        position: { x: node.position.x - node.dimensions.width / 2, y: node.position.y - node.dimensions.height / 2 },
      }))

      off()
    })

    addNodes(newNode)
  }

  onUnmounted(() => {
    if (!ownsDragListeners) return
    onDragEnd()
    document.body.style.userSelect = ''
  })

  return {
    draggedData,
    isDragOver,
    isDragging,
    onDragStart,
    onDragLeave,
    onDragOver,
    onDrop,
  }
}
