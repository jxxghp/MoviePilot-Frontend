<script lang="ts" setup>
import { ref } from 'vue'
import { VueFlow, useVueFlow, type Connection, type GraphNode } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import useDragAndDrop from '@core/utils/workflow'
import { Workflow } from '@/api/types'
import { useToast } from 'vue-toastification'
import api from '@/api'
import WorkflowSidebar from '@/components/workflow/WorkflowSidebar.vue'
import DropzoneBackground from '@/components/workflow/DropzoneBackground.vue'
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

// 流程边配置表单
const edgeForm = ref({
  condition: '',
})

// 后端动作固定契约，供条件构造器读取上一节点输出
const actionDefinitions = ref<any[]>([])

// 动作类型到契约的映射
const actionContractMap = computed(() => {
  return actionDefinitions.value.reduce((result, action) => {
    result[action.type] = action.contract || {}
    return result
  }, {} as Record<string, any>)
})

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

// 复制对象并移除不再由前端编辑的高级配置
const omitConfigKeys = (value: any, keys: string[]) => {
  const result = { ...(value || {}) }
  keys.forEach(key => delete result[key])
  return result
}

// 统一流程边数据结构，前端只编辑边条件，汇合和分支策略由执行器默认处理
const normalizeWorkflowEdge = (edge: any) => {
  const condition = String(getEdgeConfigValue(edge, 'condition') || '').trim()
  const edgeClass = String(edge?.class || '')
    .replace(/\bworkflow-conditional-edge\b/g, '')
    .trim()
  const data = omitConfigKeys(edge?.data, ['join_policy', 'branch_policy'])
  data.condition = condition || undefined
  const edgePayload = omitConfigKeys(edge, ['join_policy', 'branch_policy'])

  return {
    ...edgePayload,
    animated: edge?.animated ?? true,
    type: edge?.type || 'animation',
    label: condition ? t('dialog.workflowActions.edgeConditionalLabel') : undefined,
    class: [edgeClass, condition ? 'workflow-conditional-edge' : ''].filter(Boolean).join(' ') || undefined,
    condition: condition || undefined,
    data,
  }
}

// 标准化所有流程边，导入和保存前都会调用
const normalizeWorkflowEdges = () => {
  edges.value = (edges.value || []).map(edge => normalizeWorkflowEdge(edge))
}

// 统一动作节点数据结构，高级运行配置由后端默认值和动作契约接管
const normalizeWorkflowNode = (node: any) => {
  const hiddenConfigKeys = [
    'inputs',
    'outputs',
    'join_policy',
    'fail_policy',
    'branch_policy',
    'concurrency_key',
    'timeout',
    'retry',
    'contract',
    '_contract',
  ]
  const data = omitConfigKeys(node?.data, hiddenConfigKeys)
  const nodePayload = omitConfigKeys(node, hiddenConfigKeys)

  return {
    ...nodePayload,
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

// 获取流程边源节点可用于条件判断的输出字段
const getEdgeConditionFields = (edge: any) => {
  const sourceNode = edge
    ? nodes.value.find(node => node.id === edge.source)
    : null
  const contract = sourceNode ? actionContractMap.value[sourceNode.type] || {} : {}
  const fields = contract.condition_fields || contract.outputs || []
  return Array.isArray(fields)
    ? fields.filter((field: any) => field?.name || field)
    : []
}

// 判断流程边是否存在可编辑条件
const canConfigureEdge = (edge: any) => {
  const condition = String(getEdgeConfigValue(edge, 'condition') || '').trim()
  return Boolean(condition || getEdgeConditionFields(edge).length)
}

// 选中流程边时打开设置面板
async function handleEdgeClick(params: any) {
  const edge = params?.edge
  if (!edge) return
  if (!actionDefinitions.value.length) {
    await loadActionDefinitions()
  }
  if (!canConfigureEdge(edge)) {
    closeEdgeSettings()
    $toast.info(t('dialog.workflowActions.edgeNoConditionFields'))
    return
  }
  selectedEdgeId.value = edge.id
  edgeForm.value = {
    condition: String(getEdgeConfigValue(edge, 'condition') || ''),
  }
}

// 关闭流程边设置面板
function closeEdgeSettings() {
  selectedEdgeId.value = null
  edgeForm.value = {
    condition: '',
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
      data: {
        ...(edge.data || {}),
        condition: edgeForm.value.condition,
      },
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

// 当前边可用于条件判断的输出字段
const selectedEdgeConditionFields = computed(() => (
  selectedEdge.value ? getEdgeConditionFields(selectedEdge.value) : []
))

// 当前边的条件下拉选项，按源节点固定输出自动生成
const edgeConditionOptions = computed(() => {
  const sourceNode = selectedEdge.value
    ? nodes.value.find(node => node.id === selectedEdge.value?.source)
    : null
  const options = [{ title: t('dialog.workflowActions.conditionAlways'), value: '' }]
  selectedEdgeConditionFields.value.forEach((field: any) => {
    const fieldName = field.name || field
    if (!fieldName) return
    const fieldLabel = field.label || fieldName
    if (field.kind === 'list') {
      options.push({
        title: t('dialog.workflowActions.conditionHasOutput', { field: fieldLabel }),
        value: `outputs.${sourceNode?.id}.${fieldName}.count > 0`,
      })
      options.push({
        title: t('dialog.workflowActions.conditionNoOutput', { field: fieldLabel }),
        value: `outputs.${sourceNode?.id}.${fieldName}.count == 0`,
      })
      return
    }
    options.push({
      title: t('dialog.workflowActions.conditionHasValue', { field: fieldLabel }),
      value: `outputs.${sourceNode?.id}.${fieldName} != None`,
    })
  })
  if (edgeForm.value.condition && !options.some(item => item.value === edgeForm.value.condition)) {
    options.push({
      title: t('dialog.workflowActions.conditionCustom'),
      value: edgeForm.value.condition,
    })
  }
  return options
})

// 选中动作节点时关闭可能打开的边条件面板，不再提供节点运行设置
function handleNodeClick() {
  closeEdgeSettings()
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

// 加载动作契约，供边条件构造器使用
async function loadActionDefinitions() {
  try {
    const actionList = await api.get('workflow/actions')
    actionDefinitions.value = Array.isArray(actionList) ? actionList : []
  } catch (error) {
    console.error(error)
    actionDefinitions.value = []
  }
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
  loadActionDefinitions()
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
    if (selectedEdge.value && !canConfigureEdge(selectedEdge.value)) {
      closeEdgeSettings()
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

            <VSelect
              v-model="edgeForm.condition"
              :items="edgeConditionOptions"
              :label="t('dialog.workflowActions.edgeConditionLabel')"
              clearable
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
  background-color: rgb(var(--v-theme-surface));
  gap: 14px;
  inline-size: min(360px, calc(100vw - 32px));
  inset-block-start: 20px;
  inset-inline-end: 20px;
  max-block-size: calc(100% - 40px);
  overflow-y: auto;
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

.vue-flow__minimap {
  overflow: hidden;
  background-color: rgba(var(--v-theme-surface), 0.8);
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
  &:hover {
    transform: translateY(-2px);
  }

  &.selected {
    box-shadow: 0 0 0 1px rgb(var(--v-theme-primary));
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

}
</style>
