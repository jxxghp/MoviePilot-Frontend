import WorkflowActionsDialog from '@/components/dialog/WorkflowActionsDialog.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, type PropType, type Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type FlowNode = Record<string, unknown>
type FlowEdge = Record<string, unknown>
type Connection = {
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}
type ConditionItem = { title: string; value: string }
type ActionData = { settings: { enabled: boolean; tags: string[] } }

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  flowNodes: undefined as Ref<FlowNode[]> | undefined,
  flowEdges: undefined as Ref<FlowEdge[]> | undefined,
  nodeTypes: undefined as Record<string, unknown> | undefined,
  setNodes: vi.fn(),
  setEdges: vi.fn(),
  onConnect: undefined as ((connection: Connection) => void) | undefined,
  isValidConnection: undefined as ((connection: Connection) => boolean) | undefined,
  conditionItems: [] as ConditionItem[],
  importCode: '',
  actionData: { settings: { enabled: true, tags: ['source'] } } as ActionData,
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
    put: (...args: unknown[]) => mocks.apiPut(...args),
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  }),
}))

vi.mock('@vue-flow/core', async () => {
  const { defineComponent: defineVueComponent, h: createElement, ref } = await import('vue')

  mocks.flowNodes ??= ref<FlowNode[]>([])
  mocks.flowEdges ??= ref<FlowEdge[]>([])

  const VueFlowStub = defineVueComponent({
    name: 'VueFlow',
    props: {
      nodes: { type: Array as PropType<FlowNode[]>, default: () => [] },
      edges: { type: Array as PropType<FlowEdge[]>, default: () => [] },
      nodeTypes: { type: Object as PropType<Record<string, unknown>>, default: () => ({}) },
      isValidConnection: { type: Function as PropType<(connection: Connection) => boolean> },
    },
    emits: ['edge-click'],
    setup(props, { emit }) {
      mocks.isValidConnection = props.isValidConnection
      mocks.nodeTypes = props.nodeTypes
      return () =>
        createElement('div', { 'data-testid': 'vue-flow' }, [
          createElement(
            'button',
            {
              'data-testid': 'select-edge',
              type: 'button',
              onClick: () => emit('edge-click', { edge: props.edges[0] }),
            },
            'select edge',
          ),
        ])
    },
  })

  return {
    VueFlow: VueFlowStub,
    useVueFlow: () => ({
      addEdges: (newEdges: FlowEdge[] | FlowEdge) =>
        mocks.flowEdges?.value.push(...(Array.isArray(newEdges) ? newEdges : [newEdges])),
      addNodes: (newNodes: FlowNode[] | FlowNode) =>
        mocks.flowNodes?.value.push(...(Array.isArray(newNodes) ? newNodes : [newNodes])),
      setNodes: (newNodes: FlowNode[]) => {
        mocks.setNodes(newNodes)
        if (mocks.flowNodes) mocks.flowNodes.value = newNodes
      },
      setEdges: (newEdges: FlowEdge[]) => {
        mocks.setEdges(newEdges)
        if (mocks.flowEdges) mocks.flowEdges.value = newEdges
      },
      edges: mocks.flowEdges,
      nodes: mocks.flowNodes,
      onConnect: (handler: (connection: Connection) => void) => {
        mocks.onConnect = handler
      },
      onNodesInitialized: (handler: () => void) => ({ off: () => undefined, handler }),
      screenToFlowCoordinate: (point: { x: number; y: number }) => point,
      updateNode: vi.fn(),
    }),
  }
})

vi.mock('@vue-flow/minimap', async () => {
  const { defineComponent: defineVueComponent, h: createElement } = await import('vue')
  return {
    MiniMap: defineVueComponent({
      name: 'MiniMap',
      setup: () => () => createElement('div', { 'data-testid': 'mini-map' }),
    }),
  }
})

vi.mock('@core/utils/workflow', async () => {
  const { ref } = await import('vue')
  return {
    default: () => ({
      isDragOver: ref(false),
      onDragLeave: vi.fn(),
      onDragOver: vi.fn(),
      onDrop: vi.fn(),
    }),
  }
})

vi.mock('@/components/workflow/WorkflowSidebar.vue', async () => {
  const { defineComponent: defineVueComponent, h: createElement } = await import('vue')
  return {
    default: defineVueComponent({
      name: 'WorkflowSidebar',
      emits: ['component-click'],
      setup:
        (_, { emit }) =>
        () =>
          createElement('div', { 'data-testid': 'workflow-sidebar' }, [
            createElement(
              'button',
              {
                'data-testid': 'add-action',
                type: 'button',
                onClick: () =>
                  emit('component-click', {
                    type: 'NewAction',
                    name: '新动作',
                    desc: '测试动作',
                    data: mocks.actionData,
                  }),
              },
              'add action',
            ),
            createElement(
              'button',
              {
                'data-testid': 'add-action-without-data',
                type: 'button',
                onClick: () => emit('component-click', { type: 'EmptyAction', name: '空动作' }),
              },
              'add empty action',
            ),
          ]),
    }),
  }
})

vi.mock('@/components/workflow/DropzoneBackground.vue', async () => {
  const { defineComponent: defineVueComponent, h: createElement } = await import('vue')
  return {
    default: defineVueComponent({
      name: 'DropzoneBackground',
      setup: () => () => createElement('div', { 'data-testid': 'dropzone-background' }),
    }),
  }
})

vi.mock('@/components/dialog/ImportCodeDialog.vue', async () => {
  const { defineComponent: defineVueComponent, h: createElement } = await import('vue')
  return {
    default: defineVueComponent({
      name: 'ImportCodeDialog',
      emits: ['close', 'save', 'update:modelValue'],
      setup:
        (_, { emit }) =>
        () =>
          createElement(
            'button',
            {
              'data-testid': 'import-code-save',
              type: 'button',
              onClick: () => {
                emit('save', 'workflow', { value: mocks.importCode })
                emit('close')
              },
            },
            'import',
          ),
    }),
  }
})

const SelectStub = defineComponent({
  name: 'VSelect',
  props: {
    items: { type: Array as PropType<ConditionItem[]>, default: () => [] },
    modelValue: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup:
    (props, { emit }) =>
    () => {
      mocks.conditionItems = props.items
      return h(
        'select',
        {
          'data-testid': 'edge-condition-select',
          value: props.modelValue,
          onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value),
        },
        props.items.map(item => h('option', { key: item.value, value: item.value }, item.title)),
      )
    },
})

const DialogStub = defineComponent({
  name: 'VDialog',
  setup:
    (_, { slots }) =>
    () =>
      h('div', { role: 'dialog' }, slots.default?.()),
})

function createNode(id: string, type = 'SourceAction', advanced: Record<string, unknown> = {}) {
  return {
    id,
    type,
    name: id,
    position: { x: 0, y: 0 },
    handleBounds: {
      source: [{ id: 'out' }],
      target: [{ id: 'in' }],
    },
    data: {},
    ...advanced,
  }
}

function createWorkflow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'workflow-1',
    name: '工作流契约测试',
    actions: [createNode('source'), createNode('target', 'TargetAction')],
    flows: [{ id: 'flow-1', source: 'source', target: 'target' }],
    execution_config: { max_workers: 2 },
    ...overrides,
  }
}

async function renderDialog(workflow = createWorkflow(), onSave = vi.fn()) {
  return renderWithProviders(WorkflowActionsDialog, {
    props: { workflow, onSave },
    global: {
      stubs: {
        VDialog: DialogStub,
        VSelect: SelectStub,
      },
    },
  })
}

async function clickToolbarButton(container: ParentNode, index: number) {
  const buttons = container.querySelectorAll('.v-toolbar button')
  const button = buttons[index]
  if (!button) throw new Error(`Missing toolbar button ${index}`)
  await fireEvent.click(button)
}

describe('WorkflowActionsDialog data contract', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPut.mockReset()
    mocks.toastError.mockReset()
    mocks.toastInfo.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastWarning.mockReset()
    mocks.flowNodes!.value = []
    mocks.flowEdges!.value = []
    mocks.nodeTypes = undefined
    mocks.setNodes.mockReset()
    mocks.setEdges.mockReset()
    mocks.onConnect = undefined
    mocks.isValidConnection = undefined
    mocks.conditionItems = []
    mocks.importCode = ''
    mocks.actionData = { settings: { enabled: true, tags: ['source'] } }
    mocks.apiGet.mockResolvedValue([
      {
        type: 'SourceAction',
        name: '来源动作',
        contract: {
          condition_fields: [
            { name: 'torrents', label: '资源', kind: 'list' },
            { name: 'title', label: '标题', kind: 'scalar' },
          ],
        },
      },
    ])
    mocks.apiPut.mockResolvedValue(null)
  })

  it('registers workflow action components for Vue Flow nodes', async () => {
    await renderDialog()

    await waitFor(() =>
      expect(mocks.nodeTypes).toEqual(expect.objectContaining({ AddDownloadAction: expect.anything() })),
    )
  })

  it('loads persisted workflow nodes and edges through Vue Flow setters', async () => {
    await renderDialog()

    expect(mocks.setNodes).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'source', type: 'SourceAction' })]),
    )
    expect(mocks.setEdges).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'flow-1', source: 'source', target: 'target' })]),
    )
  })

  it('accepts only known output-to-input connections and rejects invalid endpoints', async () => {
    const { container } = await renderDialog()
    await waitFor(() => expect(mocks.isValidConnection).toBeTypeOf('function'))

    const valid = { source: 'source', sourceHandle: 'out', target: 'target', targetHandle: 'in' }
    expect(mocks.isValidConnection?.(valid)).toBe(true)
    expect(mocks.isValidConnection?.({ ...valid, source: 'missing' })).toBe(false)
    expect(mocks.isValidConnection?.({ ...valid, sourceHandle: 'in' })).toBe(false)
    expect(mocks.isValidConnection?.({ ...valid, targetHandle: 'out' })).toBe(false)
    expect(mocks.isValidConnection?.({ ...valid, target: 'source', targetHandle: 'in' })).toBe(false)

    mocks.onConnect?.(valid)
    expect(mocks.flowEdges!.value).toHaveLength(2)
    expect(mocks.flowEdges!.value[1]).toEqual(
      expect.objectContaining({
        source: 'source',
        sourceHandle: 'out',
        target: 'target',
        targetHandle: 'in',
        type: 'animation',
        animated: true,
      }),
    )
    expect(container.querySelector('[data-testid="vue-flow"]')).toBeInTheDocument()
  })

  it('rejects connections when either node has no declared handle bounds', async () => {
    const { container } = await renderDialog(
      createWorkflow({
        actions: [createNode('source'), { id: 'target', type: 'TargetAction', data: {} }],
      }),
    )
    await waitFor(() => expect(mocks.isValidConnection).toBeTypeOf('function'))

    expect(
      mocks.isValidConnection?.({ source: 'source', sourceHandle: 'out', target: 'target', targetHandle: 'in' }),
    ).toBe(false)
    expect(container.querySelector('[data-testid="vue-flow"]')).toBeInTheDocument()
  })

  it('warns and does not add an invalid connection through the connect callback', async () => {
    await renderDialog()
    await waitFor(() => expect(mocks.onConnect).toBeTypeOf('function'))

    mocks.onConnect?.({ source: 'source', sourceHandle: 'in', target: 'target', targetHandle: 'in' })

    expect(mocks.toastWarning).toHaveBeenCalledWith('非法连接：不能连接自身或同类型端口！')
    expect(mocks.flowEdges!.value).toHaveLength(1)
  })

  it('builds list, scalar, and custom condition expressions from the source action contract', async () => {
    const workflow = createWorkflow({
      flows: [{ id: 'flow-1', source: 'source', target: 'target', condition: 'outputs.source.legacy == 1' }],
    })
    const { container } = await renderDialog(workflow)

    await fireEvent.click(screen.getByTestId('select-edge'))
    await waitFor(() => expect(mocks.conditionItems).toHaveLength(5))

    expect(mocks.conditionItems).toEqual([
      { title: '无条件流转', value: '' },
      { title: '有资源输出', value: 'outputs.source.torrents.count > 0' },
      { title: '没有资源输出', value: 'outputs.source.torrents.count == 0' },
      { title: '标题有值', value: 'outputs.source.title != None' },
      { title: '自定义条件（保留现有）', value: 'outputs.source.legacy == 1' },
    ])
    expect(container.querySelector('[data-testid="edge-condition-select"]')).toBeInTheDocument()
  })

  it('keeps an existing condition editable without a contract and closes the panel after deleting the edge', async () => {
    mocks.apiGet.mockResolvedValue([])
    const { container } = await renderDialog(
      createWorkflow({
        flows: [{ id: 'flow-1', source: 'source', target: 'target', condition: 'outputs.source.ready == True' }],
      }),
    )

    await fireEvent.click(screen.getByTestId('select-edge'))
    await waitFor(() =>
      expect(mocks.conditionItems).toEqual([
        { title: '无条件流转', value: '' },
        { title: '自定义条件（保留现有）', value: 'outputs.source.ready == True' },
      ]),
    )

    const panel = container.querySelector('.workflow-edge-panel')
    expect(panel).toBeInTheDocument()
    const actionButtons = panel?.querySelector('.edge-panel-actions')?.querySelectorAll('button')
    if (!actionButtons) throw new Error('Missing edge action buttons')
    await fireEvent.click(actionButtons[0])
    expect(mocks.flowEdges!.value).toHaveLength(0)
    expect(container.querySelector('.workflow-edge-panel')).not.toBeInTheDocument()
  })

  it('closes the edge panel when the selected edge is removed from the graph', async () => {
    const { container } = await renderDialog(
      createWorkflow({
        flows: [{ id: 'flow-1', source: 'source', target: 'target', condition: 'outputs.source.ready == True' }],
      }),
    )

    await fireEvent.click(screen.getByTestId('select-edge'))
    await waitFor(() => expect(container.querySelector('.workflow-edge-panel')).toBeInTheDocument())

    mocks.flowEdges!.value = []
    await waitFor(() => expect(container.querySelector('.workflow-edge-panel')).not.toBeInTheDocument())
  })

  it('closes the edge panel when a graph update leaves the selected edge without a condition source', async () => {
    mocks.apiGet.mockResolvedValue([])
    const { container } = await renderDialog(
      createWorkflow({
        flows: [{ id: 'flow-1', source: 'source', target: 'target', condition: 'outputs.source.ready == True' }],
      }),
    )

    await fireEvent.click(screen.getByTestId('select-edge'))
    await waitFor(() => expect(container.querySelector('.workflow-edge-panel')).toBeInTheDocument())
    const select = screen.getByTestId('edge-condition-select')
    await fireEvent.update(select, '')
    const saveButton = container.querySelector('.edge-panel-actions')?.querySelectorAll('button')[2]
    if (!saveButton) throw new Error('Missing edge save button')
    await fireEvent.click(saveButton)

    mocks.flowNodes!.value[0].type = 'UnknownAction'
    await waitFor(() => expect(container.querySelector('.workflow-edge-panel')).not.toBeInTheDocument())
  })

  it('falls back to declared output fields when the action contract has no condition_fields', async () => {
    mocks.apiGet.mockResolvedValue([
      {
        type: 'SourceAction',
        name: '来源动作',
        contract: { outputs: [{ name: 'ready', label: '就绪', kind: 'scalar' }] },
      },
    ])
    await renderDialog()

    await fireEvent.click(screen.getByTestId('select-edge'))
    await waitFor(() =>
      expect(mocks.conditionItems).toEqual([
        { title: '无条件流转', value: '' },
        { title: '就绪有值', value: 'outputs.source.ready != None' },
      ]),
    )
  })

  it('skips malformed condition fields and accepts action contracts without metadata', async () => {
    mocks.apiGet.mockResolvedValue([
      {
        type: 'SourceAction',
        name: '来源动作',
        contract: {
          condition_fields: [null, { name: 'status', label: '', kind: 'scalar' }],
        },
      },
      { type: 'TargetAction', name: '目标动作' },
    ])
    await renderDialog()

    await fireEvent.click(screen.getByTestId('select-edge'))
    await waitFor(() =>
      expect(mocks.conditionItems).toEqual([
        { title: '无条件流转', value: '' },
        { title: 'status有值', value: 'outputs.source.status != None' },
      ]),
    )
  })

  it('adds a mobile action and copies the normalized workflow without dropping fields', async () => {
    const writeText = vi.fn()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const { container } = await renderDialog()

    await fireEvent.click(screen.getByTestId('add-action'))
    expect(mocks.flowNodes!.value).toHaveLength(3)
    expect(mocks.flowNodes!.value[2]).toEqual(
      expect.objectContaining({
        type: 'NewAction',
        name: '新动作',
        description: '测试动作',
        data: { settings: { enabled: true, tags: ['source'] } },
        position: { x: window.innerWidth / 2, y: window.innerHeight / 3 },
      }),
    )
    const firstActionData = mocks.flowNodes!.value[2].data as ActionData
    firstActionData.settings.enabled = false
    firstActionData.settings.tags.push('mutated')
    expect(mocks.actionData).toEqual({ settings: { enabled: true, tags: ['source'] } })

    await fireEvent.click(screen.getByTestId('add-action'))
    expect(mocks.flowNodes!.value[3].data).toEqual({ settings: { enabled: true, tags: ['source'] } })
    expect(mocks.flowNodes!.value[3].data).not.toBe(firstActionData)

    await fireEvent.click(screen.getByTestId('add-action-without-data'))
    expect(mocks.flowNodes!.value[4].data).toEqual({})
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已添加组件到画布')

    await clickToolbarButton(container, 2)
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual(
      expect.objectContaining({
        actions: expect.any(Array),
        flows: expect.any(Array),
        execution_config: { max_workers: 2 },
      }),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('任务流程代码已复制到剪贴板！')
  })

  it('starts with an empty editor when workflow and action lists are omitted', async () => {
    const { container } = await renderWithProviders(WorkflowActionsDialog, {
      props: { workflow: undefined },
      global: {
        stubs: {
          VDialog: DialogStub,
          VSelect: SelectStub,
        },
      },
    })

    await waitFor(() => expect(mocks.flowNodes!.value).toEqual([]))
    expect(mocks.flowEdges!.value).toEqual([])

    await fireEvent.click(screen.getByTestId('add-action-without-data'))
    expect(mocks.flowNodes!.value).toHaveLength(1)
    expect(mocks.flowNodes!.value[0].data).toEqual({})

    await clickToolbarButton(container, 3)
    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledTimes(1))
    expect(mocks.apiPut.mock.calls[0][1]).toEqual(
      expect.objectContaining({ actions: expect.any(Array), flows: expect.any(Array) }),
    )
  })

  it('rejects an edge without a condition or source contract after action loading fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.apiGet.mockRejectedValue(new Error('actions unavailable'))
    const { container } = await renderDialog()

    await fireEvent.click(screen.getByTestId('select-edge'))
    await waitFor(() => expect(mocks.toastInfo).toHaveBeenCalledWith('上一节点没有可用于条件判断的输出'))
    expect(container.querySelector('.workflow-edge-panel')).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalled()
  })

  it('treats a non-array action response as an empty contract list', async () => {
    mocks.apiGet.mockResolvedValue({ unexpected: true })
    const { container } = await renderDialog(
      createWorkflow({
        flows: [{ id: 'flow-1', source: 'source', target: 'target', condition: 'outputs.source.ready == True' }],
      }),
    )

    await fireEvent.click(screen.getByTestId('select-edge'))
    await waitFor(() => expect(container.querySelector('.workflow-edge-panel')).toBeInTheDocument())
    expect(mocks.conditionItems).toEqual([
      { title: '无条件流转', value: '' },
      { title: '自定义条件（保留现有）', value: 'outputs.source.ready == True' },
    ])
  })

  it('preserves backend action and flow fields in both top-level and data forms when saving', async () => {
    const action = createNode('source', 'SourceAction', {
      inputs: ['medias'],
      outputs: { medias: { kind: 'list' } },
      join_policy: 'any_success',
      fail_policy: 'continue',
      branch_policy: 'exclusive',
      concurrency_key: 'source-key',
      timeout: 12,
      retry: { max_attempts: 3, interval: 2, backoff: 1.5 },
      data: {
        inputs: ['legacy.medias'],
        outputs: [{ name: 'legacy', kind: 'list' }],
        join_policy: 'all_done',
        fail_policy: 'ignore',
        branch_policy: 'parallel',
        concurrency_key: 'legacy-key',
        timeout: 20,
        retry: { max_attempts: 2, interval: 1, backoff: 2 },
      },
    })
    const flow = {
      id: 'flow-1',
      source: 'source',
      target: 'target',
      condition: 'outputs.source.medias != None',
      join_policy: 'any_success',
      branch_policy: 'exclusive',
      data: {
        condition: 'outputs.source.legacy != None',
        join_policy: 'all_done',
        branch_policy: 'parallel',
      },
    }
    const { container } = await renderDialog(
      createWorkflow({ actions: [action, createNode('target', 'TargetAction')], flows: [flow] }),
    )

    await clickToolbarButton(container, 3)
    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledTimes(1))

    const payload = mocks.apiPut.mock.calls[0][1]
    expect(payload.actions[0]).toEqual(
      expect.objectContaining({
        inputs: ['medias'],
        outputs: { medias: { kind: 'list' } },
        join_policy: 'any_success',
        fail_policy: 'continue',
        branch_policy: 'exclusive',
        concurrency_key: 'source-key',
        timeout: 12,
        retry: { max_attempts: 3, interval: 2, backoff: 1.5 },
      }),
    )
    expect(payload.actions[0].data).toEqual(
      expect.objectContaining({
        inputs: ['legacy.medias'],
        outputs: [{ name: 'legacy', kind: 'list' }],
        join_policy: 'all_done',
        fail_policy: 'ignore',
        branch_policy: 'parallel',
        concurrency_key: 'legacy-key',
        timeout: 20,
        retry: { max_attempts: 2, interval: 1, backoff: 2 },
      }),
    )
    expect(payload.flows[0]).toEqual(
      expect.objectContaining({
        condition: 'outputs.source.medias != None',
        join_policy: 'any_success',
        branch_policy: 'exclusive',
      }),
    )
    expect(payload.flows[0].data).toEqual(
      expect.objectContaining({
        condition: 'outputs.source.medias != None',
        join_policy: 'all_done',
        branch_policy: 'parallel',
      }),
    )
  })

  it('imports workflow JSON and keeps backend fields in the next save payload', async () => {
    mocks.importCode = JSON.stringify({
      actions: [
        createNode('imported', 'SourceAction', {
          timeout: 9,
          retry: { max_attempts: 4 },
          data: { fail_policy: 'continue', timeout: 11 },
        }),
      ],
      flows: [],
      execution_config: { max_workers: 4 },
    })
    const { container } = await renderDialog(createWorkflow({ actions: [], flows: [] }))

    await clickToolbarButton(container, 1)
    await fireEvent.click(await screen.findByTestId('import-code-save'))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('导入成功！')
    expect(mocks.flowNodes!.value[0]).toEqual(
      expect.objectContaining({
        timeout: 9,
        retry: { max_attempts: 4 },
        data: { fail_policy: 'continue', timeout: 11 },
      }),
    )

    await clickToolbarButton(container, 3)
    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledTimes(1))
    expect(mocks.apiPut.mock.calls[0][1].execution_config).toEqual({ max_workers: 4 })
    expect(mocks.apiPut.mock.calls[0][1].actions[0]).toEqual(
      expect.objectContaining({
        timeout: 9,
        retry: { max_attempts: 4 },
        data: { fail_policy: 'continue', timeout: 11 },
      }),
    )
  })

  it('keeps the caller workflow unchanged when import succeeds and the dialog closes', async () => {
    const workflow = createWorkflow({
      actions: [
        createNode('source', 'SourceAction', {
          data: { settings: { enabled: true, tags: ['original'] } },
        }),
      ],
      flows: [{ id: 'flow-1', source: 'source', target: 'target', data: { branch_policy: 'parallel' } }],
      execution_config: { max_workers: 2, nested: { enabled: true } },
    })
    const beforeImport = structuredClone(workflow)
    mocks.importCode = JSON.stringify({
      actions: [createNode('imported', 'SourceAction', { data: { settings: { enabled: false, tags: ['imported'] } } })],
      flows: [],
      execution_config: { max_workers: 5, nested: { enabled: false } },
    })
    const { container } = await renderDialog(workflow)

    await clickToolbarButton(container, 1)
    await fireEvent.click(await screen.findByTestId('import-code-save'))

    expect(workflow).toEqual(beforeImport)
    expect(screen.queryByTestId('import-code-save')).not.toBeInTheDocument()
  })

  it.each([
    ['HTTP', new Error('http failure')],
    ['业务', { kind: 'business', message: '保存被拒绝' }],
  ])('keeps the caller workflow unchanged after %s save failure', async (_failureKind, failure) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const workflow = createWorkflow({
      actions: [
        createNode('source', 'SourceAction', {
          data: { settings: { enabled: true, tags: ['original'] } },
        }),
      ],
      flows: [{ id: 'flow-1', source: 'source', target: 'target', data: { branch_policy: 'parallel' } }],
      execution_config: { max_workers: 2, nested: { enabled: true } },
    })
    const beforeSave = structuredClone(workflow)
    mocks.apiPut.mockRejectedValueOnce(failure)
    const { container } = await renderDialog(workflow)

    await clickToolbarButton(container, 3)
    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledTimes(1))

    expect(workflow).toEqual(beforeSave)
    expect(consoleError).toHaveBeenCalled()
  })

  it('does not save or emit after malformed import or failed update', async () => {
    const onSave = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { container } = await renderDialog(createWorkflow(), onSave)
    mocks.importCode = '{broken'

    await clickToolbarButton(container, 1)
    await fireEvent.click(await screen.findByTestId('import-code-save'))
    expect(mocks.toastError).toHaveBeenCalledWith('导入失败！')
    expect(mocks.apiPut).not.toHaveBeenCalled()

    mocks.apiPut.mockRejectedValueOnce(new Error('save failed'))
    await clickToolbarButton(container, 3)
    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledTimes(1))
    expect(onSave).not.toHaveBeenCalled()
  })
})
