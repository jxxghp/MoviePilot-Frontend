<script lang="ts" setup>
import { Workflow } from '@/api/types'
import { useToast } from 'vue-toastification'
import { useConfirm } from '@/composables/useConfirm'
import WorkflowAddEditDialog from '@/components/dialog/WorkflowAddEditDialog.vue'
import WorkflowActionsDialog from '@/components/dialog/WorkflowActionsDialog.vue'
import WorkflowShareDialog from '@/components/dialog/WorkflowShareDialog.vue'
import api from '@/api'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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

// 分享对话框
const shareDialog = ref(false)

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

// 分享工作流
function handleShare(item: Workflow) {
  shareDialog.value = true
}

// 编辑完成
function editDone() {
  editDialog.value = false
  flowDialog.value = false
  shareDialog.value = false
  emit('refresh')
}

// 删除任务
async function handleDelete(item: Workflow) {
  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('workflow.task.confirmDelete', { name: item.name }),
  })

  if (!isConfirmed) return

  try {
    const result: { [key: string]: string } = await api.delete(`workflow/${item.id}`)
    if (result.success) {
      $toast.success(t('workflow.task.deleteSuccess'))
      emit('refresh')
    } else {
      $toast.error(t('workflow.task.deleteFailed', { message: result.message }))
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
      $toast.success(t('workflow.task.enableSuccess'))
      emit('refresh')
    } else {
      $toast.error(t('workflow.task.enableFailed', { message: result.message }))
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
      $toast.success(t('workflow.task.pauseSuccess'))
      emit('refresh')
    } else {
      $toast.error(t('workflow.task.pauseFailed', { message: result.message }))
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
      $toast.success(t('workflow.task.runSuccess'))
      emit('refresh')
    } else {
      $toast.error(t('workflow.task.runFailed', { message: result.message }))
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
    title: t('common.confirm'),
    content: t('workflow.task.confirmReset', { name: item.name }),
  })

  if (!isConfirmed) return

  try {
    const result: { [key: string]: string } = await api.post(`workflow/${item.id}/reset`)
    if (result.success) {
      $toast.success(t('workflow.task.resetSuccess'))
      emit('refresh')
    } else {
      $toast.error(t('workflow.task.resetFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
  }
}

// 计算状态颜色
const resolveStatusVariant = (status: string | undefined) => {
  if (status === 'S') return { color: 'success', text: t('workflow.task.status.success') }
  else if (status === 'R') return { color: 'primary', text: t('workflow.task.status.running') }
  else if (status === 'F') return { color: 'error', text: t('workflow.task.status.failed') }
  else if (status === 'P') return { color: 'secondary', text: t('workflow.task.status.paused') }
  else return { color: 'info', text: t('workflow.task.status.waiting') }
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
        class="mx-auto h-full"
        @click="handleFlow(workflow)"
        :ripple="false"
        :loading="loading"
        :class="{ 'transition transform-cpu duration-300 -translate-y-1': hover.isHovering }"
      >
        <VCardItem
          :class="{
            'py-1': workflow?.description,
            'py-3': !workflow?.description,
            [`bg-${resolveStatusVariant(workflow?.state).color}`]: true,
          }"
        >
          <template #prepend>
            <VAvatar variant="text" class="me-2">
              <VIcon
                v-if="workflow?.state === 'P'"
                color="success"
                size="x-large"
                icon="mdi-play"
                @click.stop="handleEnable(workflow)"
              />
              <VIcon v-else color="warning" icon="mdi-pause" size="x-large" @click.stop="handlePause(workflow)" />
            </VAvatar>
          </template>
          <VCardTitle class="text-white">
            {{ workflow?.name }}
          </VCardTitle>
          <VCardSubtitle class="text-white">{{ workflow?.description }}</VCardSubtitle>
          <template #append>
            <IconBtn>
              <VIcon icon="mdi-vector-polyline-edit" @click.stop="handleFlow(workflow)" />
            </IconBtn>
            <IconBtn>
              <VIcon icon="mdi-dots-vertical" />
              <VMenu activator="parent" close-on-content-click>
                <VList>
                  <VListItem base-color="primary" @click="handleEdit(workflow)">
                    <template #prepend>
                      <VIcon icon="mdi-note-edit" />
                    </template>
                    <VListItemTitle>{{ t('workflow.task.edit') }}</VListItemTitle>
                  </VListItem>
                  <VListItem v-if="workflow.current_action" base-color="info" @click="handleRun(workflow, false)">
                    <template #prepend>
                      <VIcon icon="mdi-play-speed" />
                    </template>
                    <VListItemTitle>{{ t('workflow.task.continue') }}</VListItemTitle>
                  </VListItem>
                  <VListItem v-if="workflow.current_action" base-color="info" @click="handleRun(workflow, true)">
                    <template #prepend>
                      <VIcon icon="mdi-replay" />
                    </template>
                    <VListItemTitle>{{ t('workflow.task.restart') }}</VListItemTitle>
                  </VListItem>
                  <VListItem v-else base-color="info" @click="handleRun(workflow, true)">
                    <template #prepend>
                      <VIcon icon="mdi-run" />
                    </template>
                    <VListItemTitle>{{ t('workflow.task.run') }}</VListItemTitle>
                  </VListItem>
                  <VListItem base-color="warning" @click="handleReset(workflow)">
                    <template #prepend>
                      <VIcon icon="mdi-restore-alert" />
                    </template>
                    <VListItemTitle>{{ t('workflow.task.reset') }}</VListItemTitle>
                  </VListItem>
                  <VListItem base-color="info" @click="handleShare(workflow)">
                    <template #prepend>
                      <VIcon icon="mdi-share" />
                    </template>
                    <VListItemTitle>{{ t('workflow.task.share') }}</VListItemTitle>
                  </VListItem>
                  <VListItem base-color="error" @click="handleDelete(workflow)">
                    <template #prepend>
                      <VIcon icon="mdi-delete" />
                    </template>
                    <VListItemTitle>{{ t('workflow.task.delete') }}</VListItemTitle>
                  </VListItem>
                </VList>
              </VMenu>
            </IconBtn>
          </template>
        </VCardItem>
        <VDivider />
        <VCardText>
          <div class="d-flex flex-column gap-y-4">
            <div class="d-flex flex-wrap gap-x-6">
              <div class="flex-1">
                <div class="mb-1">{{ t('workflow.task.info.timer') }}</div>
                <h5 class="text-h6">{{ workflow?.timer }}</h5>
              </div>
              <div class="flex-1">
                <div class="mb-1">{{ t('workflow.task.info.status') }}</div>
                <h5 class="text-h6" :class="`text-${resolveStatusVariant(workflow?.state).color}`">
                  {{ resolveStatusVariant(workflow?.state).text }}
                </h5>
              </div>
            </div>
            <div class="d-flex flex-wrap gap-x-6">
              <div class="flex-1">
                <div class="mb-1">{{ t('workflow.task.info.actionCount') }}</div>
                <div>
                  <VAvatar size="32" color="primary" variant="tonal">
                    <span class="text-sm">{{ workflow?.actions?.length }}</span>
                  </VAvatar>
                </div>
              </div>
              <div class="flex-1">
                <div class="mb-1">{{ t('workflow.task.info.runCount') }}</div>
                <h5 class="text-h6">{{ workflow?.run_count }}</h5>
              </div>
            </div>
            <div class="d-flex flex-wrap gap-x-6">
              <div class="flex-1">
                <div class="mb-1">{{ t('workflow.task.info.progress') }}</div>
                <div class="d-flex align-center gap-5">
                  <div class="flex-grow-1">
                    <VProgressLinear color="info" rounded :model-value="resolveProgress(workflow)" />
                  </div>
                  <span> {{ resolveProgress(workflow) }}% </span>
                </div>
              </div>
            </div>
            <div class="d-flex flex-wrap gap-x-6" v-if="workflow?.result">
              <div class="flex-1">
                <div class="mb-1">{{ t('workflow.task.info.error') }}</div>
                <div class="text-error">{{ workflow?.result }}</div>
              </div>
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
    <!-- 分享对话框 -->
    <WorkflowShareDialog
      v-if="shareDialog"
      :workflow="workflow"
      @close="shareDialog = false"
    />
  </div>
</template>
