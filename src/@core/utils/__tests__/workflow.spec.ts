import useDragAndDrop from '@core/utils/workflow'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addNodes: vi.fn(),
  screenToFlowCoordinate: vi.fn(),
  onNodesInitialized: vi.fn(),
  updateNode: vi.fn(),
  off: vi.fn(),
  onNodesInitializedCallback: undefined as (() => void) | undefined,
}))

vi.mock('@vue-flow/core', () => ({
  useVueFlow: () => ({
    addNodes: mocks.addNodes,
    screenToFlowCoordinate: mocks.screenToFlowCoordinate,
    onNodesInitialized: mocks.onNodesInitialized,
    updateNode: mocks.updateNode,
  }),
}))

type DragAndDrop = ReturnType<typeof useDragAndDrop>

let current: DragAndDrop | undefined
let wrapper: ReturnType<typeof mount> | undefined

const Harness = defineComponent({
  name: 'WorkflowDragAndDropHarness',
  setup() {
    current = useDragAndDrop()
    return () => h('div')
  },
})

function mountHarness() {
  wrapper = mount(Harness)
  return current!
}

function createDataTransfer() {
  return {
    effectAllowed: '',
    dropEffect: '',
    setData: vi.fn(),
  }
}

describe('useDragAndDrop', () => {
  beforeEach(() => {
    mocks.addNodes.mockReset()
    mocks.screenToFlowCoordinate.mockReset().mockImplementation(({ x, y }: { x: number; y: number }) => ({ x, y }))
    mocks.onNodesInitialized.mockReset().mockImplementation((callback: () => void) => {
      mocks.onNodesInitializedCallback = callback
      return { off: mocks.off }
    })
    mocks.updateNode.mockReset()
    mocks.off.mockReset()
    mocks.onNodesInitializedCallback = undefined
    document.body.style.userSelect = ''
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    current = undefined
    document.body.style.userSelect = ''
  })

  it('does not enter drag-over or create a node before a drag starts', async () => {
    const dnd = mountHarness()
    const preventDefault = vi.fn()

    dnd.onDragOver({ preventDefault, dataTransfer: createDataTransfer() })
    dnd.onDrop({ clientX: 10, clientY: 20 })
    await nextTick()

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(dnd.isDragOver.value).toBe(false)
    expect(mocks.addNodes).not.toHaveBeenCalled()
  })

  it('tracks drag state, prevents selection, and clears everything on document drop', async () => {
    const dnd = mountHarness()
    const dataTransfer = createDataTransfer()
    const data = { type: 'ScanFileAction', name: '扫描目录' }
    const addEventListener = vi.spyOn(document, 'addEventListener')
    const removeEventListener = vi.spyOn(document, 'removeEventListener')

    dnd.onDragStart({ dataTransfer }, data)
    await nextTick()
    expect(dataTransfer.setData).toHaveBeenCalledWith('application/vueflow', data)
    expect(dataTransfer.effectAllowed).toBe('move')
    expect(dnd.draggedData.value).toEqual(data)
    expect(dnd.isDragging.value).toBe(true)
    expect(document.body.style.userSelect).toBe('none')
    expect(addEventListener).toHaveBeenCalledWith('drop', expect.any(Function))
    expect(addEventListener).toHaveBeenCalledWith('dragend', expect.any(Function))

    const dragOverTransfer = createDataTransfer()
    const preventDefault = vi.fn()
    dnd.onDragOver({ preventDefault, dataTransfer: dragOverTransfer })
    await nextTick()
    expect(dnd.isDragOver.value).toBe(true)
    expect(dragOverTransfer.dropEffect).toBe('move')
    dnd.onDragLeave()
    expect(dnd.isDragOver.value).toBe(false)

    document.dispatchEvent(new Event('drop'))
    await nextTick()
    expect(dnd.draggedData.value).toBeNull()
    expect(dnd.isDragging.value).toBe(false)
    expect(dnd.isDragOver.value).toBe(false)
    expect(document.body.style.userSelect).toBe('')
    expect(removeEventListener).toHaveBeenCalledWith('drop', expect.any(Function))
    expect(removeEventListener).toHaveBeenCalledWith('dragend', expect.any(Function))
  })

  it('clears the drag state when the browser cancels the native drag', async () => {
    const dnd = mountHarness()
    const removeEventListener = vi.spyOn(document, 'removeEventListener')

    dnd.onDragStart({ dataTransfer: createDataTransfer() }, { type: 'NoteAction', name: '备注' })
    await nextTick()
    dnd.onDragOver({ preventDefault: vi.fn(), dataTransfer: createDataTransfer() })
    await nextTick()

    document.dispatchEvent(new Event('dragend'))
    await nextTick()

    expect(dnd.draggedData.value).toBeNull()
    expect(dnd.isDragging.value).toBe(false)
    expect(dnd.isDragOver.value).toBe(false)
    expect(document.body.style.userSelect).toBe('')
    expect(removeEventListener).toHaveBeenCalledWith('drop', expect.any(Function))
    expect(removeEventListener).toHaveBeenCalledWith('dragend', expect.any(Function))
  })

  it('deep clones dropped data and centers the node after Vue Flow initializes it', async () => {
    const dnd = mountHarness()
    const data = {
      type: 'ScanFileAction',
      name: '扫描目录',
      description: '扫描媒体目录',
      data: { nested: { enabled: true } },
    }

    dnd.onDragStart({ dataTransfer: createDataTransfer() }, data)
    dnd.onDrop({ clientX: 80, clientY: 120 })

    expect(mocks.screenToFlowCoordinate).toHaveBeenCalledWith({ x: 80, y: 120 })
    expect(mocks.addNodes).toHaveBeenCalledOnce()
    const node = mocks.addNodes.mock.calls[0][0]
    expect(node).toMatchObject({
      type: 'ScanFileAction',
      name: '扫描目录',
      description: '扫描媒体目录',
      position: { x: 80, y: 120 },
      data: { nested: { enabled: true } },
    })
    expect(node.id).toMatch(/^act_/)
    expect(node.data).not.toBe(data.data)

    data.data.nested.enabled = false
    expect(node.data.nested.enabled).toBe(true)

    expect(mocks.onNodesInitialized).toHaveBeenCalledOnce()
    mocks.onNodesInitializedCallback?.()
    expect(mocks.updateNode).toHaveBeenCalledWith(node.id, expect.any(Function))
    const update = mocks.updateNode.mock.calls[0][1] as (node: {
      position: { x: number; y: number }
      dimensions: { width: number; height: number }
    }) => { position: { x: number; y: number } }
    expect(update({ position: { x: 80, y: 120 }, dimensions: { width: 40, height: 20 } })).toEqual({
      position: { x: 60, y: 110 },
    })
    expect(mocks.off).toHaveBeenCalledOnce()
  })

  it('cleans the global selection style and drop listener when unmounted during a drag', async () => {
    const dnd = mountHarness()
    const removeEventListener = vi.spyOn(document, 'removeEventListener')

    dnd.onDragStart({ dataTransfer: createDataTransfer() }, { type: 'NoteAction', name: '备注' })
    await nextTick()
    expect(document.body.style.userSelect).toBe('none')

    wrapper!.unmount()
    await nextTick()

    expect(document.body.style.userSelect).toBe('')
    expect(dnd.isDragging.value).toBe(false)
    expect(dnd.isDragOver.value).toBe(false)
    expect(dnd.draggedData.value).toBeNull()
    expect(removeEventListener).toHaveBeenCalledWith('drop', expect.any(Function))
    expect(removeEventListener).toHaveBeenCalledWith('dragend', expect.any(Function))
  })
})
