<script lang="ts" setup>
import { Workflow } from '@/api/types'
import { useToast } from 'vue-toast-notification'
import { useConfirm } from 'vuetify-use-dialog'
import WorkflowAddEditDialog from '@/components/dialog/WorkflowAddEditDialog.vue'
import WorkflowActionsDialog from '@/components/dialog/WorkflowActionsDialog.vue'
import api from '@/api'

// 定义输入参数
const props = defineProps({
  workflow: {
    required: true,
    type: Object as PropType<Workflow>,
  },
})

// 定义事件
const emit = defineEmits(['refresh'])

// 提示框
const $toast = useToast()

// 确认框
const createConfirm = useConfirm()

// 编辑对话框
const editDialog = ref(false)

// 流程对话框
const flowDialog = ref(false)

// 加载中
const loading = ref(false)

// 编辑任务
function handleEdit(item: Workflow) {
  editDialog.value = true
}

// 编辑流程
function handleFlow(item: Workflow) {
  flowDialog.value = true
}

// 计算已完成的动作数
function resolveDoneActions(item: Workflow) {
  return item.current_action?.split(',').length || 0
}

// 编辑完成
function editDone() {
  editDialog.value = false
  flowDialog.value = false
  emit('refresh')
}

// 删除任务
async function handleDelete(item: Workflow) {
  const isConfirmed = await createConfirm({
    title: '确认',
    content: `是否确认删除任务 ${item.name} ?`,
  })

  if (!isConfirmed) return

  try {
    const result: { [key: string]: string } = await api.delete(`workflow/${item.id}`)
    if (result.success) {
      $toast.success('删除任务成功！')
      emit('refresh')
    } else {
      $toast.error(`删除任务失败：${result.message}`)
    }
  } catch (error) {
    console.error(error)
  }
}

// 开始任务
async function handleEnable(item: Workflow) {
  loading.value = true
  try {
    const result: { [key: string]: string } = await api.post(`workflow/${item.id}/start`)
    if (result.success) {
      $toast.success('启用任务成功！')
      emit('refresh')
    } else {
      $toast.error(`启用任务失败：${result.message}`)
    }
  } catch (error) {
    console.error(error)
  }
  loading.value = false
}

// 停用任务
async function handlePause(item: Workflow) {
  loading.value = true
  try {
    const result: { [key: string]: string } = await api.post(`workflow/${item.id}/pause`)
    if (result.success) {
      $toast.success('停用任务成功！')
      emit('refresh')
    } else {
      $toast.error(`停用任务失败：${result.message}`)
    }
  } catch (error) {
    console.error(error)
  }
  loading.value = false
}

// 立即执行任务
async function handleRun(item: Workflow, from_begin: boolean) {
  loading.value = true
  try {
    setTimeout(() => {
      emit('refresh')
    }, 500)
    const result: { [key: string]: string } = await api.post(`workflow/${item.id}/run?from_begin=${from_begin}`, {
      from_begin,
    })
    if (result.success) {
      $toast.success('任务执行完成！')
      emit('refresh')
    } else {
      $toast.error(`任务执行失败：${result.message}`)
      emit('refresh')
    }
  } catch (error) {
    console.error(error)
  }
  loading.value = false
}

// 重置任务
async function handleReset(item: Workflow) {
  const isConfirmed = await createConfirm({
    title: '确认',
    content: `是否确认重置任务 ${item.name} ?`,
  })

  if (!isConfirmed) return

  try {
    const result: { [key: string]: string } = await api.post(`workflow/${item.id}/reset`)
    if (result.success) {
      $toast.success('重置任务成功！')
      emit('refresh')
    } else {
      $toast.error(`重置任务失败：${result.message}`)
    }
  } catch (error) {
    console.error(error)
  }
}

// 计算状态颜色
const resolveStatusVariant = (status: string | undefined) => {
  if (status === 'S') return { color: 'success', text: '成功' }
  else if (status === 'R') return { color: 'primary', text: '运行中' }
  else if (status === 'F') return { color: 'error', text: '失败' }
  else if (status === 'P') return { color: 'secondary', text: '暂停' }
  else return { color: 'info', text: '等待' }
}

// 计算当前动作占比
const resolveProgress = (item: Workflow) => {
  const current_action_length = item.current_action?.split(',').length || 0
  return item.actions?.length ? Math.round((current_action_length / (item.actions.length || 1)) * 100) : 0
}
</script>
<template>
  <div class="h-full">
    <VHover v-slot="hover">
      <VCard
        v-bind="hover.props"
        class="workflow-card mx-auto h-full"
        @click="handleFlow(workflow)"
        :ripple="false"
        :loading="loading"
        :class="{ 'transition transform-cpu duration-300 -translate-y-1': hover.isHovering }"
      >
        <!-- 状态指示条 -->
        <div class="status-indicator" :class="`bg-${resolveStatusVariant(workflow?.state).color}`"></div>
        
        <VCardItem class="py-3 px-4">
          <template #prepend>
            <VAvatar 
              variant="tonal" 
              :color="resolveStatusVariant(workflow?.state).color" 
              size="42"
              class="workflow-avatar me-3"
            >
              <VIcon
                v-if="workflow?.state === 'P'"
                icon="mdi-play"
                @click.stop="handleEnable(workflow)"
                size="small"
              />
              <VIcon v-else icon="mdi-pause" @click.stop="handlePause(workflow)" size="small" />
            </VAvatar>
          </template>
          
          <div class="d-flex flex-column">
            <VCardTitle class="text-body-1 font-weight-bold ps-0 pt-0 pb-1">
              {{ workflow?.name }}
            </VCardTitle>
            <VCardSubtitle class="text-caption text-medium-emphasis ps-0">
              {{ workflow?.description }}
            </VCardSubtitle>
          </div>
          
          <template #append>
            <div class="d-flex align-center">
              <IconBtn class="workflow-action-btn me-1" @click.stop="handleFlow(workflow)">
                <VIcon size="18" icon="mdi-vector-polyline-edit" />
              </IconBtn>
              
              <IconBtn class="workflow-action-btn">
                <VIcon size="18" icon="mdi-dots-vertical" />
                <VMenu activator="parent" close-on-content-click location="end">
                  <VList density="compact" class="workflow-menu pa-1">
                    <VListItem variant="plain" density="compact" @click="handleEdit(workflow)">
                      <template #prepend>
                        <VIcon size="small" icon="mdi-note-edit" color="primary" />
                      </template>
                      <VListItemTitle class="text-caption">编辑任务</VListItemTitle>
                    </VListItem>
                    
                    <VListItem
                      v-if="workflow.current_action"
                      variant="plain"
                      density="compact"
                      @click="handleRun(workflow, false)"
                    >
                      <template #prepend>
                        <VIcon size="small" icon="mdi-play-speed" color="info" />
                      </template>
                      <VListItemTitle class="text-caption">继续执行</VListItemTitle>
                    </VListItem>
                    
                    <VListItem
                      v-if="workflow.current_action"
                      variant="plain"
                      density="compact"
                      @click="handleRun(workflow, true)"
                    >
                      <template #prepend>
                        <VIcon size="small" icon="mdi-replay" color="info" />
                      </template>
                      <VListItemTitle class="text-caption">重新执行</VListItemTitle>
                    </VListItem>
                    
                    <VListItem v-else variant="plain" density="compact" @click="handleRun(workflow, true)">
                      <template #prepend>
                        <VIcon size="small" icon="mdi-run" color="info" />
                      </template>
                      <VListItemTitle class="text-caption">立即执行</VListItemTitle>
                    </VListItem>
                    
                    <VListItem variant="plain" density="compact" @click="handleReset(workflow)">
                      <template #prepend>
                        <VIcon size="small" icon="mdi-restore-alert" color="warning" />
                      </template>
                      <VListItemTitle class="text-caption">重置任务</VListItemTitle>
                    </VListItem>
                    
                    <VListItem variant="plain" density="compact" @click="handleDelete(workflow)">
                      <template #prepend>
                        <VIcon size="small" icon="mdi-delete" color="error" />
                      </template>
                      <VListItemTitle class="text-caption">删除任务</VListItemTitle>
                    </VListItem>
                  </VList>
                </VMenu>
              </IconBtn>
            </div>
          </template>
        </VCardItem>
        
        <VDivider class="mx-3" />
        
        <VCardText class="pa-3">
          <!-- 进度条和状态 -->
          <div class="d-flex align-center justify-space-between mb-2">
            <VChip
              size="x-small" 
              :color="resolveStatusVariant(workflow?.state).color"
              label
              class="font-weight-bold px-2 text-white"
            >
              {{ resolveStatusVariant(workflow?.state).text }}
            </VChip>
            <span class="text-caption font-weight-medium">
              进度: {{ resolveProgress(workflow) }}%
            </span>
          </div>
          
          <VProgressLinear 
            :model-value="resolveProgress(workflow)" 
            height="6"
            :color="resolveStatusVariant(workflow?.state).color"
            bg-opacity="0.12"
            rounded
            class="mb-3"
          />
          
          <!-- 信息网格 -->
          <div class="workflow-stats d-flex justify-space-around">
            <!-- 定时 -->
            <div class="workflow-stat-item">
              <div class="d-flex align-center justify-center mb-1">
                <VIcon size="18" icon="mdi-clock-outline" class="mr-1" />
                <span class="text-caption text-medium-emphasis">定时</span>
              </div>
              <div class="text-body-2 font-weight-medium text-center">
                {{ workflow?.timer || '--' }}
              </div>
            </div>
            
            <!-- 动作数 -->
            <div class="workflow-stat-item">
              <div class="d-flex align-center justify-center mb-1">
                <VIcon size="18" icon="mdi-source-branch" class="mr-1" />
                <span class="text-caption text-medium-emphasis">动作数</span>
              </div>
              <div class="text-body-2 font-weight-medium text-center badge-container">
                <VChip
                  size="x-small"
                  :color="resolveStatusVariant(workflow?.state).color"
                  class="px-2 text-white font-weight-bold"
                >
                  {{ workflow?.actions?.length || 0 }}
                </VChip>
              </div>
            </div>
            
            <!-- 执行次数 -->
            <div class="workflow-stat-item">
              <div class="d-flex align-center justify-center mb-1">
                <VIcon size="18" icon="mdi-refresh" class="mr-1" />
                <span class="text-caption text-medium-emphasis">执行次数</span>
              </div>
              <div class="text-body-2 font-weight-medium text-center">
                {{ workflow?.run_count || 0 }}
              </div>
            </div>
          </div>
          
          <!-- 错误信息 -->
          <div v-if="workflow?.result" class="error-message pa-2 mt-3">
            <div class="d-flex align-start">
              <VIcon size="16" color="error" icon="mdi-alert-circle" class="me-1 mt-1 flex-shrink-0" />
              <span class="text-caption text-error">{{ workflow?.result }}</span>
            </div>
          </div>
        </VCardText>
      </VCard>
    </VHover>
    
    <!-- 流程对话框 -->
    <WorkflowActionsDialog
      v-if="flowDialog"
      v-model="flowDialog"
      @close="flowDialog = false"
      @save="editDone"
      :workflow="workflow"
    />
    
    <!-- 编辑对话框 -->
    <WorkflowAddEditDialog
      v-if="editDialog"
      v-model="editDialog"
      @close="editDialog = false"
      @save="editDone"
      :workflow="workflow"
    />
  </div>
</template>

<style lang="scss" scoped>
.workflow-card {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(var(--v-shadow-key-umbra-color), 0.07), 
              0 1px 3px rgba(var(--v-shadow-key-penumbra-color), 0.1);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.workflow-card:hover {
  box-shadow: 0 7px 25px rgba(var(--v-shadow-key-umbra-color), 0.12), 
              0 5px 10px rgba(var(--v-shadow-key-penumbra-color), 0.08);
}

.status-indicator {
  position: absolute;
  height: 3px;
  width: 100%;
  top: 0;
  left: 0;
  z-index: 1;
}

.workflow-avatar {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  box-shadow: 0 2px 6px rgba(var(--v-shadow-key-umbra-color), 0.1);
}

.workflow-action-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  
  &:hover {
    background-color: rgba(var(--v-theme-primary), 0.08);
  }
}

.workflow-stats {
  padding: 8px 0;
  margin-top: 4px;
}

.workflow-stat-item {
  padding: 0 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  
  &:not(:last-child)::after {
    content: '';
    position: absolute;
    right: 0;
    top: 10%;
    height: 80%;
    width: 1px;
    background-color: rgba(var(--v-border-color), var(--v-border-opacity));
  }
}

.badge-container {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 2px;
}

.workflow-menu {
  border-radius: 8px;
  overflow: hidden;
  min-width: 140px;
  box-shadow: 0 5px 20px rgba(var(--v-shadow-key-umbra-color), 0.15);
}

.error-message {
  background-color: rgba(var(--v-theme-error), 0.05);
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-error), 0.1);
}
</style>
