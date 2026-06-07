<script setup lang="ts">
import api from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { WorkflowShare } from '@/api/types'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { useGlobalSettingsStore } from '@/stores'
import { VueFlow, useVueFlow } from '@vue-flow/core'

// 国际化
const { t } = useI18n()

// 输入参数
const props = defineProps({
  workflow: Object as PropType<WorkflowShare>,
  eventTypes: {
    type: Array as PropType<Array<{ title: string; value: string }>>,
    default: () => [],
  },
})

// 定义事件
const emit = defineEmits(['fork', 'delete', 'close'])

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 提示框
const $toast = useToast()

// 处理中
const processing = ref(false)

// 删除中
const deleting = ref(false)

// 根据事件类型值获取显示文本
const getEventTypeText = (eventTypeValue: string) => {
  const eventType = props.eventTypes.find(item => item.value === eventTypeValue)
  return eventType ? eventType.title : eventTypeValue
}

// 流程图相关
const { nodes, edges } = useVueFlow()

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

// 解析工作流数据
const parsedWorkflow = computed(() => {
  if (!props.workflow) return null

  try {
    const workflow = { ...props.workflow }

    // 解析actions
    if (typeof workflow.actions === 'string') {
      workflow.actions = JSON.parse(workflow.actions)
    }

    // 解析flows
    if (typeof workflow.flows === 'string') {
      workflow.flows = JSON.parse(workflow.flows)
    }

    return workflow
  } catch (error) {
    console.error('解析工作流数据失败:', error)
    return props.workflow
  }
})

// 初始化流程图数据
onMounted(() => {
  if (parsedWorkflow.value) {
    nodes.value = parsedWorkflow.value.actions ?? []
    edges.value = parsedWorkflow.value.flows ?? []
  }
})

// 复用工作流
async function doFork() {
  // 开始处理
  startNProgress()
  try {
    processing.value = true
    // 请求API
    const result: { [key: string]: any } = await api.post('workflow/fork', props.workflow)
    // 工作流状态
    if (result.success) {
      $toast.success(t('workflow.addSuccess', { name: props.workflow?.share_title }))
      // 完成
      emit('fork', result.data.id)
    } else {
      $toast.error(t('workflow.addFailed', { name: props.workflow?.share_title, message: result.message }))
    }
  } catch (error) {
    console.error(error)
  } finally {
    processing.value = false
    doneNProgress()
  }
}

// 删除工作流分享
async function doDelete() {
  // 开始处理
  startNProgress()
  try {
    deleting.value = true
    // 请求API
    const result: { [key: string]: any } = await api.delete(`workflow/share/${props.workflow?.id}`, {
      params: {
        share_uid: globalSettings.USER_UNIQUE_ID,
      },
    })
    // 工作流状态
    if (result.success) {
      $toast.success(t('workflow.cancelSuccess'))
      // 完成
      emit('delete', result.data.id)
    } else {
      $toast.error(t('workflow.cancelFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
  } finally {
    deleting.value = false
    doneNProgress()
  }
}
</script>
<template>
  <VDialog max-width="40rem" scrollable>
    <VCard>
      <VCardText>
        <VCol>
          <div class="d-flex justify-space-between flex-wrap flex-md-nowrap flex-column flex-md-row">
            <div class="ma-auto mt-5">
              <div class="workflow-preview">
                <VueFlow
                  :nodes="nodes"
                  :edges="edges"
                  :nodeTypes="nodeTypes"
                  :default-edge-options="{ type: 'animation', animated: true }"
                  :delete-key-code="null"
                  :select-nodes-on-drag="false"
                  :nodes-draggable="false"
                  :nodes-connectable="false"
                  :fit-view="true"
                  :fit-view-options="{ padding: 0.1, minZoom: 0.2, maxZoom: 1 }"
                  :default-viewport="{ x: 0, y: 0, zoom: 0.2 }"
                  class="workflow-preview-flow"
                />
              </div>
            </div>

            <!-- 右侧内容 -->
            <div class="flex-grow">
              <VCardItem>
                <VCardTitle
                  class="text-center text-md-left break-words whitespace-break-spaces line-clamp-2 overflow-hidden text-ellipsis"
                >
                  {{ props.workflow?.share_title }}
                </VCardTitle>
                <VCardSubtitle
                  class="text-center text-md-left break-words whitespace-break-spaces line-clamp-4 overflow-hidden text-ellipsis"
                >
                  {{ props.workflow?.share_comment }}
                </VCardSubtitle>
                <VList lines="one" class="border-0">
                  <VListItem class="ps-0">
                    <VListItemTitle class="text-center text-md-left">
                      <span class="font-weight-medium">{{ t('workflow.sharer') }}：</span>
                      <span class="text-body-1"> {{ props.workflow?.share_user }}</span>
                    </VListItemTitle>
                  </VListItem>
                  <VListItem class="ps-0" v-if="props.workflow?.trigger_type || props.workflow?.timer">
                    <VListItemTitle class="text-center text-md-left">
                      <span class="font-weight-medium">{{ t('workflow.trigger') }}：</span>
                      <span class="text-body-1">
                        <span v-if="props.workflow?.trigger_type === 'timer' || !props.workflow?.trigger_type">
                          <VIcon icon="mdi-clock-outline" size="small" class="me-1" />
                          {{ props.workflow?.timer }}
                        </span>
                        <span v-else-if="props.workflow?.trigger_type === 'event'">
                          <VIcon icon="mdi-calendar-check" size="small" class="me-1" />
                          {{ getEventTypeText(props.workflow?.event_type || '') }}
                        </span>
                        <span v-else-if="props.workflow?.trigger_type === 'manual'">
                          <VIcon icon="mdi-hand-pointing-up" size="small" class="me-1" />
                          {{ t('workflow.manualTrigger') }}
                        </span>
                      </span>
                    </VListItemTitle>
                  </VListItem>
                  <VListItem class="ps-0" v-if="parsedWorkflow?.actions">
                    <VListItemTitle class="text-center text-md-left">
                      <span class="font-weight-medium">{{ t('workflow.actionCount') }}：</span>
                      <span class="text-body-1"> {{ parsedWorkflow?.actions?.length }}</span>
                    </VListItemTitle>
                  </VListItem>
                </VList>
                <div class="text-center text-md-left">
                  <div>
                    <VBtn
                      color="primary"
                      :disabled="processing"
                      @click="doFork"
                      prepend-icon="mdi-heart"
                      :loading="processing"
                      class="mb-2 me-2"
                    >
                      {{ t('workflow.normalFork') }}
                    </VBtn>
                    <VBtn
                      v-if="
                        (props.workflow?.share_uid && props.workflow?.share_uid === globalSettings.USER_UNIQUE_ID) ||
                        globalSettings.WORKFLOW_SHARE_MANAGE
                      "
                      color="error"
                      :disabled="deleting"
                      @click="doDelete"
                      prepend-icon="mdi-delete"
                      :loading="deleting"
                      class="mb-2 me-2"
                    >
                      {{ t('workflow.cancelShare') }}
                    </VBtn>
                  </div>
                  <div class="text-xs mt-2" v-if="props.workflow?.count">
                    <VIcon icon="mdi-fire" />{{
                      t('workflow.usageCount', { count: props.workflow?.count?.toLocaleString() })
                    }}
                  </div>
                </div>
              </VCardItem>
            </div>
          </div>
        </VCol>
      </VCardText>
      <VDialogCloseBtn @click="emit('close')" />
    </VCard>
  </VDialog>
</template>

<style lang="scss">
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/minimap/dist/style.css';

.workflow-preview {
  position: relative;
  overflow: hidden;
  background-color: rgba(var(--v-theme-surface), 0.8);
  block-size: 280px;
  inline-size: 240px;
}

.workflow-preview-flow {
  block-size: 100%;
  inline-size: 100%;

  .vue-flow__node {
    font-size: 10px;

    &:hover {
      box-shadow: none;
      transform: none;
    }

    &.selected {
      box-shadow: none;
    }
  }

  .vue-flow__edge-path,
  .vue-flow__connection-path {
    stroke-width: 2;
  }

  .vue-flow__handle {
    border-radius: 2px;
    block-size: 12px;
    inline-size: 4px;
  }

  // 自定义动作连线样式
  .vue-flow__edge.animation {
    .vue-flow__edge-path {
      stroke: rgb(var(--v-theme-primary));
    }

    &.selected {
      .vue-flow__edge-path {
        stroke: rgb(var(--v-theme-primary));
        stroke-width: 3;
      }
    }
  }
}

@media screen and (width <= 600px) {
  .workflow-preview {
    block-size: 240px;
    inline-size: 240px;
  }
}
</style>
