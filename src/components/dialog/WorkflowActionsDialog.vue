<script lang="ts" setup>
import { ref } from 'vue'
import { VueFlow, useVueFlow, type Connection, type GraphNode } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import useDragAndDrop from '@core/utils/workflow'
import { Workflow } from '@/api/types'
import { useToast } from 'vue-toastification'
import api from '@/api'
import WorkflowSidebar from '@/layouts/components/WorkflowSidebar.vue'
import DropzoneBackground from '@/layouts/components/DropzoneBackground.vue'
import ImportCodeDialog from '@/components/dialog/ImportCodeDialog.vue'
import { useI18n } from 'vue-i18n'

// 多语言支持
const { t } = useI18n()

const { onConnect, addEdges, nodes, edges, addNodes, screenToFlowCoordinate } = useVueFlow()

const { onDragOver, onDrop, onDragLeave, isDragOver } = useDragAndDrop()

// 连接事件
onConnect((connection: Connection) => {
  // 双重校验
  if (!isValidConnection(connection)) {
    $toast.warning(t('dialog.workflowActions.invalidConnection'))
    return
  }
  addEdges(
    normalizeWorkflowEdge({
      ...connection,
      id: `edge_${connection.source}_${connection.target}_${Date.now()}`,
      type: 'animation',
      animated: true,
    }),
  )
})

// 当前选中的流程边ID
const selectedEdgeId = ref<string | null>(null)

// 当前选中的动作节点ID
const selectedNodeId = ref<string | null>(null)

// 流程边配置表单
const edgeForm = ref({
  condition: '',
  join_policy: '',
  branch_policy: '',
})

// 动作节点执行配置表单
const nodeForm = ref({
  inputs_text: '',
  outputs_text: '',
  join_policy: '',
  fail_policy: '',
  branch_policy: '',
  concurrency_key: '',
  timeout: null as number | null,
  retry_max_attempts: null as number | null,
  retry_interval: null as number | null,
  retry_backoff: null as number | null,
})

// 汇合策略选项
const joinPolicyOptions = computed(() => [
  { title: t('dialog.workflowActions.joinPolicyDefault'), value: '' },
  { title: t('dialog.workflowActions.joinPolicyAllSuccess'), value: 'all_success' },
  { title: t('dialog.workflowActions.joinPolicyAnySuccess'), value: 'any_success' },
  { title: t('dialog.workflowActions.joinPolicyAllDone'), value: 'all_done' },
  { title: t('dialog.workflowActions.joinPolicyFailFast'), value: 'fail_fast' },
])

// 分支策略选项
const branchPolicyOptions = computed(() => [
  { title: t('dialog.workflowActions.branchPolicyDefault'), value: '' },
  { title: t('dialog.workflowActions.branchPolicyParallel'), value: 'parallel' },
  { title: t('dialog.workflowActions.branchPolicyExclusive'), value: 'exclusive' },
])

// 失败策略选项
const failPolicyOptions = computed(() => [
  { title: t('dialog.workflowActions.failPolicyDefault'), value: '' },
  { title: t('dialog.workflowActions.failPolicyStop'), value: 'stop' },
  { title: t('dialog.workflowActions.failPolicyContinue'), value: 'continue' },
  { title: t('dialog.workflowActions.failPolicyIgnore'), value: 'ignore' },
])

// 获取指定节点端口的类型（输入/输出）
const getPortType = (node: GraphNode, handleId: string) => {
  // 检查是否是输入端口（对应 handleBounds.target）
  const isInput = node.handleBounds?.target?.some(h => h.id === handleId)
  if (isInput) return 'input'

  // 检查是否是输出端口（对应 handleBounds.source）
  const isOutput = node.handleBounds?.source?.some(h => h.id === handleId)
  return isOutput ? 'output' : null
}

// 校验连接是否合法
const isValidConnection = (connection: Connection) => {
  // 获取连接的源节点和目标节点
  const sourceNode = nodes.value.find(n => n.id === connection.source)
  const targetNode = nodes.value.find(n => n.id === connection.target)

  if (!sourceNode || !targetNode) return false

  // 获取端口类型
  const sourcePortType = getPortType(sourceNode, connection.sourceHandle!)
  const targetPortType = getPortType(targetNode, connection.targetHandle!)

  /* 同时满足三个条件，才允许连接：
   * 1. 源端口是输出类型（output）
   * 2. 目标端口是输入类型（input）
   * 3. 不是同一节点的连接
   */
  return sourcePortType === 'output' && targetPortType === 'input' && connection.source !== connection.target
}

// 读取流程边扩展配置，兼容后端支持的顶层字段与 data 字段
const getEdgeConfigValue = (edge: any, key: string) => {
  return edge?.[key] ?? edge?.data?.[key] ?? ''
}

// 统一流程边数据结构，确保条件和汇合策略能被后端读取
const normalizeWorkflowEdge = (edge: any) => {
  const condition = String(getEdgeConfigValue(edge, 'condition') || '').trim()
  const joinPolicy = String(getEdgeConfigValue(edge, 'join_policy') || '').trim()
  const branchPolicy = String(getEdgeConfigValue(edge, 'branch_policy') || '').trim()
  const edgeClass = String(edge?.class || '')
    .replace(/\bworkflow-conditional-edge\b/g, '')
    .trim()
  const data = {
    ...(edge?.data || {}),
    condition: condition || undefined,
    join_policy: joinPolicy || undefined,
    branch_policy: branchPolicy || undefined,
  }

  return {
    ...edge,
    animated: edge?.animated ?? true,
    type: edge?.type || 'animation',
    label: condition ? t('dialog.workflowActions.edgeConditionalLabel') : undefined,
    class: [edgeClass, condition ? 'workflow-conditional-edge' : ''].filter(Boolean).join(' ') || undefined,
    condition: condition || undefined,
    join_policy: joinPolicy || undefined,
    branch_policy: branchPolicy || undefined,
    data,
  }
}

// 标准化所有流程边，导入和保存前都会调用
const normalizeWorkflowEdges = () => {
  edges.value = (edges.value || []).map(edge => normalizeWorkflowEdge(edge))
}

// 判断扩展配置是否为空，避免旧 data 中的空值覆盖顶层字段
const isEmptyConfigValue = (value: any) => {
  if (value === undefined || value === null || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

// 读取动作节点扩展配置，兼容顶层字段与 data 字段
const getNodeConfigValue = (node: any, key: string) => {
  const nodeValue = node?.[key]
  if (!isEmptyConfigValue(nodeValue)) return nodeValue
  const dataValue = node?.data?.[key]
  return isEmptyConfigValue(dataValue) ? undefined : dataValue
}

// 将输入声明统一为路径数组
const normalizeInputPaths = (value: any) => {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,]+/)
      .map(item => item.trim())
      .filter(Boolean)
  }
  return []
}

// 解析 JSON 形式的结构化配置
const parseStructuredConfig = (value: string, label: string) => {
  const text = String(value || '').trim()
  if (!text) return undefined
  try {
    const parsed = JSON.parse(text)
    if (parsed && (Array.isArray(parsed) || typeof parsed === 'object')) {
      return parsed
    }
  } catch (error) {
    console.error(error)
  }
  throw new Error(t('dialog.workflowActions.invalidJsonConfig', { label }))
}

// 尝试把存量结构化配置标准化为对象或数组
const normalizeStructuredConfig = (value: any) => {
  if (isEmptyConfigValue(value)) return undefined
  if (Array.isArray(value) || typeof value === 'object') return value
  if (typeof value !== 'string') return undefined
  try {
    const parsed = JSON.parse(value)
    return parsed && (Array.isArray(parsed) || typeof parsed === 'object') ? parsed : undefined
  } catch {
    return undefined
  }
}

// 将结构化配置格式化为面板中的 JSON 文本
const stringifyStructuredConfig = (value: any) => {
  const normalizedValue = normalizeStructuredConfig(value)
  return normalizedValue ? JSON.stringify(normalizedValue, null, 2) : ''
}

// 数值字段统一清洗，空值会在保存时被移除
const normalizeNumber = (value: any, minValue = 0, integer = false) => {
  if (value === undefined || value === null || value === '') return undefined
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue < minValue) return undefined
  return integer ? Math.floor(numberValue) : numberValue
}

// 读取节点重试策略
const normalizeRetryConfig = (value: any) => {
  const retryConfig = normalizeStructuredConfig(value)
  return retryConfig && !Array.isArray(retryConfig) ? retryConfig : {}
}

// 根据面板表单构造重试策略
const buildRetryConfigFromForm = () => {
  const retryConfig: Record<string, number> = {}
  const maxAttempts = normalizeNumber(nodeForm.value.retry_max_attempts, 1, true)
  const interval = normalizeNumber(nodeForm.value.retry_interval, 0)
  const backoff = normalizeNumber(nodeForm.value.retry_backoff, 1)
  if (maxAttempts !== undefined) retryConfig.max_attempts = maxAttempts
  if (interval !== undefined) retryConfig.interval = interval
  if (backoff !== undefined) retryConfig.backoff = backoff
  return Object.keys(retryConfig).length ? retryConfig : undefined
}

// 统一动作节点数据结构，确保执行策略能被后端读取
const normalizeWorkflowNode = (node: any) => {
  const inputPaths = normalizeInputPaths(getNodeConfigValue(node, 'inputs'))
  const outputs = normalizeStructuredConfig(getNodeConfigValue(node, 'outputs'))
  const joinPolicy = String(getNodeConfigValue(node, 'join_policy') || '').trim()
  const failPolicy = String(getNodeConfigValue(node, 'fail_policy') || '').trim()
  const branchPolicy = String(getNodeConfigValue(node, 'branch_policy') || '').trim()
  const concurrencyKey = String(getNodeConfigValue(node, 'concurrency_key') || '').trim()
  const timeout = normalizeNumber(getNodeConfigValue(node, 'timeout'), 1, true)
  const retryConfig = normalizeRetryConfig(getNodeConfigValue(node, 'retry'))
  const retry = Object.keys(retryConfig).length ? retryConfig : undefined
  const data = {
    ...(node?.data || {}),
    inputs: inputPaths.length ? inputPaths : undefined,
    outputs: outputs || undefined,
    join_policy: joinPolicy || undefined,
    fail_policy: failPolicy || undefined,
    branch_policy: branchPolicy || undefined,
    concurrency_key: concurrencyKey || undefined,
    timeout: timeout || undefined,
    retry,
  }

  return {
    ...node,
    inputs: inputPaths.length ? inputPaths : undefined,
    outputs: outputs || undefined,
    join_policy: joinPolicy || undefined,
    fail_policy: failPolicy || undefined,
    branch_policy: branchPolicy || undefined,
    concurrency_key: concurrencyKey || undefined,
    timeout: timeout || undefined,
    retry,
    data,
  }
}

// 标准化所有动作节点，导入和保存前都会调用
const normalizeWorkflowNodes = () => {
  nodes.value = (nodes.value || []).map(node => normalizeWorkflowNode(node))
}

// 获取节点名称，便于在边设置面板展示流转关系
const getNodeName = (nodeId?: string) => {
  const node = nodes.value.find(item => item.id === nodeId)
  return (node as any)?.name || node?.data?.label || nodeId || ''
}

// 选中流程边时打开设置面板
function handleEdgeClick(params: any) {
  const edge = params?.edge
  if (!edge) return
  selectedNodeId.value = null
  selectedEdgeId.value = edge.id
  edgeForm.value = {
    condition: String(getEdgeConfigValue(edge, 'condition') || ''),
    join_policy: String(getEdgeConfigValue(edge, 'join_policy') || ''),
    branch_policy: String(getEdgeConfigValue(edge, 'branch_policy') || ''),
  }
}

// 关闭流程边设置面板
function closeEdgeSettings() {
  selectedEdgeId.value = null
  edgeForm.value = {
    condition: '',
    join_policy: '',
    branch_policy: '',
  }
}

// 保存流程边设置
function saveEdgeSettings() {
  if (!selectedEdgeId.value) return
  edges.value = edges.value.map(edge => {
    if (edge.id !== selectedEdgeId.value) return edge
    return normalizeWorkflowEdge({
      ...edge,
      condition: edgeForm.value.condition,
      join_policy: edgeForm.value.join_policy,
      data: {
        ...(edge.data || {}),
        condition: edgeForm.value.condition,
        join_policy: edgeForm.value.join_policy,
        branch_policy: edgeForm.value.branch_policy,
      },
      branch_policy: edgeForm.value.branch_policy,
    })
  })
  $toast.success(t('dialog.workflowActions.edgeSaveSuccess'))
}

// 删除当前选中的流程边
function deleteSelectedEdge() {
  if (!selectedEdgeId.value) return
  edges.value = edges.value.filter(edge => edge.id !== selectedEdgeId.value)
  closeEdgeSettings()
}

// 当前选中的流程边
const selectedEdge = computed(() => {
  if (!selectedEdgeId.value) return null
  return edges.value.find(edge => edge.id === selectedEdgeId.value) || null
})

// 当前选中的动作节点
const selectedNode = computed(() => {
  if (!selectedNodeId.value) return null
  return nodes.value.find(node => node.id === selectedNodeId.value) || null
})

// 将节点数据填入右侧执行配置面板
function fillNodeForm(node: any) {
  const retryConfig = normalizeRetryConfig(getNodeConfigValue(node, 'retry'))
  nodeForm.value = {
    inputs_text: normalizeInputPaths(getNodeConfigValue(node, 'inputs')).join('\n'),
    outputs_text: stringifyStructuredConfig(getNodeConfigValue(node, 'outputs')),
    join_policy: String(getNodeConfigValue(node, 'join_policy') || ''),
    fail_policy: String(getNodeConfigValue(node, 'fail_policy') || ''),
    branch_policy: String(getNodeConfigValue(node, 'branch_policy') || ''),
    concurrency_key: String(getNodeConfigValue(node, 'concurrency_key') || ''),
    timeout: normalizeNumber(getNodeConfigValue(node, 'timeout'), 1, true) ?? null,
    retry_max_attempts: normalizeNumber(retryConfig.max_attempts, 1, true) ?? null,
    retry_interval: normalizeNumber(retryConfig.interval, 0) ?? null,
    retry_backoff: normalizeNumber(retryConfig.backoff, 1) ?? null,
  }
}

// 选中动作节点时打开执行配置面板
function handleNodeClick(params: any) {
  const node = params?.node
  if (!node) return
  if (node.name == '备注') return
  selectedEdgeId.value = null
  selectedNodeId.value = node.id
  fillNodeForm(node)
}

// 关闭动作节点执行配置面板
function closeNodeSettings() {
  selectedNodeId.value = null
  nodeForm.value = {
    inputs_text: '',
    outputs_text: '',
    join_policy: '',
    fail_policy: '',
    branch_policy: '',
    concurrency_key: '',
    timeout: null,
    retry_max_attempts: null,
    retry_interval: null,
    retry_backoff: null,
  }
}

// 根据面板表单构造动作节点执行配置
function buildNodeConfigFromForm() {
  return {
    inputs: normalizeInputPaths(nodeForm.value.inputs_text),
    outputs: parseStructuredConfig(nodeForm.value.outputs_text, t('dialog.workflowActions.nodeOutputsLabel')),
    join_policy: nodeForm.value.join_policy,
    fail_policy: nodeForm.value.fail_policy,
    branch_policy: nodeForm.value.branch_policy,
    concurrency_key: nodeForm.value.concurrency_key,
    timeout: normalizeNumber(nodeForm.value.timeout, 1, true),
    retry: buildRetryConfigFromForm(),
  }
}

// 保存动作节点执行配置
function saveNodeSettings() {
  if (!selectedNodeId.value) return
  let nodeConfig: any
  try {
    nodeConfig = buildNodeConfigFromForm()
  } catch (error: any) {
    $toast.error(error.message)
    return
  }
  nodes.value = nodes.value.map(node => {
    if (node.id !== selectedNodeId.value) return node
    return normalizeWorkflowNode({
      ...node,
      inputs: nodeConfig.inputs,
      outputs: nodeConfig.outputs,
      join_policy: nodeConfig.join_policy,
      fail_policy: nodeConfig.fail_policy,
      branch_policy: nodeConfig.branch_policy,
      concurrency_key: nodeConfig.concurrency_key,
      timeout: nodeConfig.timeout,
      retry: nodeConfig.retry,
      data: {
        ...(node.data || {}),
        inputs: nodeConfig.inputs,
        outputs: nodeConfig.outputs,
        join_policy: nodeConfig.join_policy,
        fail_policy: nodeConfig.fail_policy,
        branch_policy: nodeConfig.branch_policy,
        concurrency_key: nodeConfig.concurrency_key,
        timeout: nodeConfig.timeout,
        retry: nodeConfig.retry,
      },
    })
  })
  $toast.success(t('dialog.workflowActions.nodeSaveSuccess'))
}

// 自定义节点类型
const nodeTypes: Record<string, any> = ref({})

// 自动扫描目录下所有的 .vue 文件
const components = import.meta.glob('../workflow/*Action.vue')

// 动态加载某个组件
const loadComponent = async (componentName: string) => {
  const component = components[`../workflow/${componentName}.vue`]
  if (component) {
    return ((await component()) as any).default
  }
  throw new Error(t('dialog.workflowActions.componentNotFound', { component: componentName }))
}

// 将所有components中的组件加载到nodeTypes中
for (const path in components) {
  const componentName = path.match(/\.\/workflow\/(.*).vue$/)?.[1]
  if (!componentName) {
    continue
  }
  loadComponent(componentName).then(component => {
    nodeTypes.value[componentName] = markRaw(component)
  })
}

// 定义输入参数
const props = defineProps({
  workflow: Object as PropType<Workflow>,
})

// 定义事件
const emit = defineEmits(['close', 'save'])

// 站点编辑表单数据
const workflowForm = ref<any>(props.workflow || {})

// 提示框
const $toast = useToast()

// 导入代码对话框
const importCodeDialog = ref(false)

// 为移动端生成节点ID
function getId() {
  return 'act_' + Math.random().toString(36).substr(2, 9)
}

// 处理移动端组件点击事件
function handleComponentClick(action: any) {
  // 计算当前视图中心点
  const centerX = window.innerWidth / 2
  const centerY = window.innerHeight / 3

  // 转换为画布坐标
  const position = screenToFlowCoordinate({
    x: centerX,
    y: centerY,
  })

  // 生成一个新节点ID
  const nodeId = getId()

  // 创建新节点
  const newNode = {
    id: nodeId,
    type: action.type,
    name: action.name,
    description: action.desc || '',
    position,
    data: {},
  }

  // 添加节点到画布
  addNodes(newNode)

  // 显示提示
  $toast.success(t('dialog.workflowActions.componentAdded'))
}

// 调用API 编辑任务
async function updateWorkflow() {
  // 更新节点和流程
  normalizeWorkflowNodes()
  normalizeWorkflowEdges()
  workflowForm.value.actions = nodes.value
  workflowForm.value.flows = edges.value

  try {
    const result: { [key: string]: string } = await api.put(`workflow/${workflowForm.value.id}`, workflowForm.value)
    if (result.success) {
      $toast.success(t('dialog.workflowActions.saveSuccess'))
      emit('save')
    } else {
      $toast.error(t('dialog.workflowActions.saveFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
  }
}

// 保存导入的代码，直接覆盖原有值
function saveCodeString(type: string, code: any) {
  try {
    if (code) {
      const codeObject = JSON.parse(code.value)
      if (type === 'workflow') {
        nodes.value = codeObject.actions || []
        edges.value = codeObject.flows || []
        if (codeObject.execution_config) {
          workflowForm.value.execution_config = codeObject.execution_config
        }
        normalizeWorkflowNodes()
        normalizeWorkflowEdges()
      }
      importCodeDialog.value = false
      $toast.success(t('dialog.workflowActions.importSuccess'))
    }
  } catch (error) {
    $toast.error(t('dialog.workflowActions.importFailed'))
    console.error(error)
  }
}

// 分享工作流程
function shareWorkflow() {
  normalizeWorkflowNodes()
  normalizeWorkflowEdges()
  const codeString = JSON.stringify({
    actions: nodes.value,
    flows: edges.value,
    execution_config: workflowForm.value.execution_config,
  })
  navigator.clipboard.writeText(codeString)
  $toast.success(t('dialog.workflowActions.codeCopied'))
}

onMounted(() => {
  if (props.workflow) {
    nodes.value = props.workflow.actions ?? []
    edges.value = props.workflow.flows ?? []
    normalizeWorkflowNodes()
    normalizeWorkflowEdges()
  }
})

watch(
  edges,
  () => {
    if (selectedEdgeId.value && !selectedEdge.value) {
      closeEdgeSettings()
    }
  },
  { deep: true },
)

watch(
  nodes,
  () => {
    if (selectedNodeId.value && !selectedNode.value) {
      closeNodeSettings()
    }
  },
  { deep: true },
)

// 判断是不是MACOS
const isMacOS = computed(() => {
  return /Macintosh|MacIntel|MacPPC|Mac68K/.test(navigator.userAgent)
})
</script>

<template>
  <VDialog scrollable fullscreen :scrim="false" transition="dialog-bottom-transition">
    <VCard class="workflow-dialog">
      <!-- Toolbar -->
      <VToolbar color="primary" density="comfortable">
        <VToolbarItems>
          <VBtn icon @click="emit('close')" class="ms-3">
            <VIcon size="large" color="white" icon="mdi-close" />
          </VBtn>
        </VToolbarItems>
        <VToolbarTitle> {{ t('dialog.workflowActions.title') }} - {{ workflow?.name }} </VToolbarTitle>
        <VToolbarItems>
          <VBtn icon variant="text" @click="importCodeDialog = true" class="ms-2">
            <VIcon size="24" color="white" icon="mdi-import" />
          </VBtn>
          <VBtn icon variant="text" @click="shareWorkflow" class="ms-2">
            <VIcon size="24" color="white" icon="mdi-share" />
          </VBtn>
          <VBtn icon variant="text" @click="updateWorkflow" class="ms-2 me-3">
            <VIcon size="24" color="white" icon="mdi-content-save" />
          </VBtn>
        </VToolbarItems>
      </VToolbar>

      <VCardText class="workflow-content pa-0">
        <div class="workflow-canvas" @drop="onDrop">
          <VueFlow
            :nodes="nodes"
            :edges="edges"
            :nodeTypes="nodeTypes"
            :is-valid-connection="isValidConnection"
            :default-edge-options="{ type: 'animation', animated: true }"
            :edge-updater-radius="10"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @node-click="handleNodeClick"
            @edge-click="handleEdgeClick"
            :delete-key-code="isMacOS ? 'Backspace' : 'Delete'"
            auto-connect
          >
            <MiniMap />
            <DropzoneBackground
              :style="{
                backgroundColor: isDragOver ? '#e7f3ff' : 'transparent',
                transition: 'background-color 0.2s ease',
              }"
            >
            </DropzoneBackground>
          </VueFlow>

          <div v-if="selectedEdge" class="workflow-edge-panel">
            <div class="edge-panel-header">
              <div class="edge-panel-title">
                <VIcon icon="mdi-source-branch" size="20" />
                <span>{{ t('dialog.workflowActions.edgeSettingsTitle') }}</span>
              </div>
              <VBtn icon variant="text" size="small" @click="closeEdgeSettings">
                <VIcon icon="mdi-close" />
              </VBtn>
            </div>

            <div class="edge-route">
              <span>{{ getNodeName(selectedEdge.source) }}</span>
              <VIcon icon="mdi-arrow-right" size="18" />
              <span>{{ getNodeName(selectedEdge.target) }}</span>
            </div>

            <VTextarea
              v-model="edgeForm.condition"
              :label="t('dialog.workflowActions.edgeConditionLabel')"
              :placeholder="t('dialog.workflowActions.edgeConditionPlaceholder')"
              rows="3"
              auto-grow
              clearable
              variant="outlined"
              density="comfortable"
              hide-details="auto"
            />

            <VSelect
              v-model="edgeForm.join_policy"
              :items="joinPolicyOptions"
              :label="t('dialog.workflowActions.edgeJoinPolicyLabel')"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
            />

            <VSelect
              v-model="edgeForm.branch_policy"
              :items="branchPolicyOptions"
              :label="t('dialog.workflowActions.edgeBranchPolicyLabel')"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
            />

            <div class="edge-panel-actions">
              <VBtn icon variant="text" color="error" @click="deleteSelectedEdge">
                <VIcon icon="mdi-delete" />
              </VBtn>
              <VSpacer />
              <VBtn variant="text" @click="closeEdgeSettings">
                {{ t('dialog.workflowActions.edgeCancel') }}
              </VBtn>
              <VBtn color="primary" @click="saveEdgeSettings">
                {{ t('dialog.workflowActions.edgeSave') }}
              </VBtn>
            </div>
          </div>

          <div v-if="selectedNode" class="workflow-edge-panel workflow-node-panel">
            <div class="edge-panel-header">
              <div class="edge-panel-title">
                <VIcon icon="mdi-tune-variant" size="20" />
                <span>{{ t('dialog.workflowActions.nodeSettingsTitle') }}</span>
              </div>
              <VBtn icon variant="text" size="small" @click="closeNodeSettings">
                <VIcon icon="mdi-close" />
              </VBtn>
            </div>

            <div class="edge-route">
              <VIcon icon="mdi-checkbox-blank-circle-outline" size="16" />
              <span>{{ getNodeName(selectedNode.id) }}</span>
            </div>

            <VSelect
              v-model="nodeForm.join_policy"
              :items="joinPolicyOptions"
              :label="t('dialog.workflowActions.nodeJoinPolicyLabel')"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
            />

            <VSelect
              v-model="nodeForm.fail_policy"
              :items="failPolicyOptions"
              :label="t('dialog.workflowActions.nodeFailPolicyLabel')"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
            />

            <VSelect
              v-model="nodeForm.branch_policy"
              :items="branchPolicyOptions"
              :label="t('dialog.workflowActions.nodeBranchPolicyLabel')"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
            />

            <VTextField
              v-model="nodeForm.concurrency_key"
              :label="t('dialog.workflowActions.nodeConcurrencyKeyLabel')"
              :placeholder="t('dialog.workflowActions.nodeConcurrencyKeyPlaceholder')"
              clearable
              variant="outlined"
              density="comfortable"
              hide-details="auto"
            />

            <div class="workflow-number-grid">
              <VTextField
                v-model.number="nodeForm.timeout"
                type="number"
                min="1"
                :label="t('dialog.workflowActions.nodeTimeoutLabel')"
                clearable
                variant="outlined"
                density="comfortable"
                hide-details="auto"
              />
              <VTextField
                v-model.number="nodeForm.retry_max_attempts"
                type="number"
                min="1"
                :label="t('dialog.workflowActions.nodeRetryAttemptsLabel')"
                clearable
                variant="outlined"
                density="comfortable"
                hide-details="auto"
              />
              <VTextField
                v-model.number="nodeForm.retry_interval"
                type="number"
                min="0"
                step="0.1"
                :label="t('dialog.workflowActions.nodeRetryIntervalLabel')"
                clearable
                variant="outlined"
                density="comfortable"
                hide-details="auto"
              />
              <VTextField
                v-model.number="nodeForm.retry_backoff"
                type="number"
                min="1"
                step="0.1"
                :label="t('dialog.workflowActions.nodeRetryBackoffLabel')"
                clearable
                variant="outlined"
                density="comfortable"
                hide-details="auto"
              />
            </div>

            <div class="edge-panel-actions">
              <VSpacer />
              <VBtn variant="text" @click="closeNodeSettings">
                {{ t('dialog.workflowActions.edgeCancel') }}
              </VBtn>
              <VBtn color="primary" @click="saveNodeSettings">
                {{ t('dialog.workflowActions.edgeSave') }}
              </VBtn>
            </div>
          </div>

          <WorkflowSidebar @component-click="handleComponentClick" />
        </div>
      </VCardText>
    </VCard>

    <ImportCodeDialog
      v-if="importCodeDialog"
      v-model="importCodeDialog"
      :title="t('dialog.workflowActions.importTitle')"
      dataType="workflow"
      @close="importCodeDialog = false"
      @save="saveCodeString"
    />
  </VDialog>
</template>

<style lang="scss">
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/controls/dist/style.css';
@import '@vue-flow/minimap/dist/style.css';
@import '@vue-flow/node-resizer/dist/style.css';

.workflow-dialog {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  block-size: 100%;
}

.workflow-content {
  position: relative;
  overflow: hidden;
  flex: 1;
}

.workflow-canvas {
  position: relative;
  block-size: 100%;
  inline-size: 100%;
}

.workflow-edge-panel {
  position: absolute;
  z-index: 120;
  display: flex;
  flex-direction: column;
  padding: 16px;
  border: 1px solid rgb(var(--v-theme-primary));
  border-radius: 8px;
  background-color: rgb(var(--v-theme-surface));
  box-shadow: 0 8px 24px rgba(var(--v-shadow-key-umbra-color), 0.32);
  gap: 14px;
  inline-size: min(360px, calc(100vw - 32px));
  inset-block-start: 20px;
  inset-inline-end: 20px;
  max-block-size: calc(100% - 40px);
  overflow-y: auto;
}

.workflow-node-panel {
  inline-size: min(420px, calc(100vw - 32px));
}

.edge-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.edge-panel-title {
  display: flex;
  align-items: center;
  color: rgb(var(--v-theme-on-surface));
  font-size: 16px;
  font-weight: 600;
  gap: 8px;
}

.edge-route {
  display: flex;
  align-items: center;
  border-radius: 6px;
  background-color: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-on-surface));
  font-size: 13px;
  gap: 8px;
  padding-block: 8px;
  padding-inline: 10px;

  span {
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.edge-panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.workflow-number-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.vue-flow__minimap {
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  background-color: rgba(var(--v-theme-surface), 0.8);
  box-shadow: 0 4px 15px rgba(var(--v-shadow-key-umbra-color), 0.1);
  inset-block-end: 20px;
  inset-inline-end: 20px;
  transform: scale(75%);
  transform-origin: bottom right;
}

.vue-flow__handle {
  border-radius: 4px;
  block-size: 24px;
  inline-size: 8px;
}

.vue-flow__edge-path,
.vue-flow__connection-path {
  stroke-width: 3;
}

.vue-flow__handle-left {
  background-color: rgb(var(--v-theme-info));
}

.vue-flow__handle-right {
  background-color: rgb(var(--v-theme-error));
}

// 自定义节点样式
.vue-flow__node {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;

  &:hover {
    box-shadow: 0 8px 16px rgba(var(--v-shadow-key-umbra-color), 0.15) !important;
    transform: translateY(-2px);
  }

  &.selected {
    box-shadow: 0 0 0 1px rgb(var(--v-theme-primary)) !important;
  }
}

// 自定义动作连线样式
.vue-flow__edge.animation {
  .vue-flow__edge-path {
    stroke: rgb(var(--v-theme-primary));
  }

  &.selected {
    .vue-flow__edge-path {
      stroke: rgb(var(--v-theme-primary));
      stroke-width: 4;
    }
  }
}

.vue-flow__edge.workflow-conditional-edge {
  .vue-flow__edge-path {
    stroke: rgb(var(--v-theme-warning));
  }
}

@media screen and (width <= 600px) {
  .vue-flow__minimap {
    display: none;
  }

  .workflow-edge-panel {
    inline-size: auto;
    inset-block: auto 88px;
    inset-inline: 16px;
    max-block-size: min(72vh, calc(100% - 112px));
  }

  .workflow-number-grid {
    grid-template-columns: 1fr;
  }
}
</style>
