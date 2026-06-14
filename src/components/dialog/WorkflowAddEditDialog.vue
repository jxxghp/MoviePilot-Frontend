<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import type { Workflow } from '@/api/types'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

// 多语言支持
const { t } = useI18n()

// 输入参数
const props = defineProps({
  // 任务信息
  workflow: Object as PropType<Workflow>,
})

// 新增或修改字样
const title = computed(() =>
  props.workflow ? t('dialog.workflowAddEdit.editTitle') : t('dialog.workflowAddEdit.addTitle'),
)

// 显示器宽度
const display = useDisplay()

// 注册事件
const emit = defineEmits(['save', 'remove', 'close'])

// 站点编辑表单数据
const workflowForm = ref<Workflow>(
  props.workflow || {
    name: undefined,
    timer: undefined,
    description: undefined,
    trigger_type: 'timer',
    event_type: undefined,
    state: 'P',
    run_count: 0,
    execution_config: {},
  },
)

// 将并发数清洗为正整数，空值表示使用后端默认值
const normalizePositiveInteger = (value: any) => {
  if (value === undefined || value === null || value === '') return undefined
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue < 1) return undefined
  return Math.floor(numberValue)
}

// 工作流级执行配置中的最大并行数
const workflowMaxWorkers = computed<number | null>({
  get() {
    return normalizePositiveInteger(workflowForm.value.execution_config?.max_workers) ?? null
  },
  set(value) {
    const executionConfig = { ...(workflowForm.value.execution_config || {}) }
    const maxWorkers = normalizePositiveInteger(value)
    if (maxWorkers) {
      executionConfig.max_workers = maxWorkers
    } else {
      delete executionConfig.max_workers
    }
    workflowForm.value.execution_config = Object.keys(executionConfig).length ? executionConfig : undefined
  },
})

// 监听props变化，处理存量数据
watch(
  () => props.workflow,
  newWorkflow => {
    if (newWorkflow) {
      // 如果trigger_type为空，默认为timer
      if (!newWorkflow.trigger_type) {
        newWorkflow.trigger_type = 'timer'
      }
      workflowForm.value = {
        ...newWorkflow,
        execution_config: { ...(newWorkflow.execution_config || {}) },
      }
    }
  },
  { immediate: true },
)

// 事件类型列表
const eventTypes = ref<Array<{ title: string; value: string }>>([])

// 触发类型选项
const triggerTypeOptions = computed(() => [
  {
    title: t('dialog.workflowAddEdit.triggerTypeTimer'),
    value: 'timer',
    prependIcon: 'mdi-clock-outline',
  },
  {
    title: t('dialog.workflowAddEdit.triggerTypeEvent'),
    value: 'event',
    prependIcon: 'mdi-calendar-check',
  },
  {
    title: t('dialog.workflowAddEdit.triggerTypeManual'),
    value: 'manual',
    prependIcon: 'mdi-hand-pointing-up',
  },
])

// 加载事件类型列表
async function loadEventTypes() {
  try {
    eventTypes.value = await api.get('workflow/event_types')
  } catch (error) {
    console.error('Failed to load event types:', error)
  }
}

// 监听触发类型变化
watch(
  () => workflowForm.value.trigger_type,
  newType => {
    if (newType !== 'event') {
      workflowForm.value.event_type = undefined
    }
  },
)

// 提示框
const $toast = useToast()

// 保存前统一清洗工作流执行配置
function normalizeWorkflowExecutionConfig() {
  const executionConfig = { ...(workflowForm.value.execution_config || {}) }
  const maxWorkers = normalizePositiveInteger(executionConfig.max_workers)
  if (maxWorkers) {
    executionConfig.max_workers = maxWorkers
  } else {
    delete executionConfig.max_workers
  }
  workflowForm.value.execution_config = Object.keys(executionConfig).length ? executionConfig : undefined
}

// 调用API 新增任务
async function addWorkflow() {
  if (!workflowForm.value.name) {
    $toast.error(t('dialog.workflowAddEdit.nameRequired'))
    return
  }

  if (!workflowForm.value.trigger_type) {
    $toast.error(t('dialog.workflowAddEdit.triggerRequired'))
    return
  }

  // 根据触发类型验证必填字段
  if (workflowForm.value.trigger_type === 'timer' && !workflowForm.value.timer) {
    $toast.error(t('dialog.workflowAddEdit.timerRequired'))
    return
  }

  if (workflowForm.value.trigger_type === 'event' && !workflowForm.value.event_type) {
    $toast.error(t('dialog.workflowAddEdit.eventTypeRequired'))
    return
  }

  normalizeWorkflowExecutionConfig()
  startNProgress()
  try {
    const result: { [key: string]: string } = await api.post('workflow/', workflowForm.value)
    if (result.success) {
      $toast.success(t('dialog.workflowAddEdit.addSuccess'))
      emit('save')
    } else {
      $toast.error(t('dialog.workflowAddEdit.addFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
  }
  doneNProgress()
}

// 调用API 编辑任务
async function editWorkflow() {
  if (!workflowForm.value.name) {
    $toast.error(t('dialog.workflowAddEdit.nameRequired'))
    return
  }

  if (!workflowForm.value.trigger_type) {
    $toast.error(t('dialog.workflowAddEdit.triggerRequired'))
    return
  }

  // 根据触发类型验证必填字段
  if (workflowForm.value.trigger_type === 'timer' && !workflowForm.value.timer) {
    $toast.error(t('dialog.workflowAddEdit.timerRequired'))
    return
  }

  if (workflowForm.value.trigger_type === 'event' && !workflowForm.value.event_type) {
    $toast.error(t('dialog.workflowAddEdit.eventTypeRequired'))
    return
  }

  normalizeWorkflowExecutionConfig()
  startNProgress()
  try {
    const result: { [key: string]: string } = await api.put(`workflow/${workflowForm.value.id}`, workflowForm.value)
    if (result.success) {
      $toast.success(t('dialog.workflowAddEdit.editSuccess'))
      emit('save')
    } else {
      $toast.error(t('dialog.workflowAddEdit.editFailed', { message: result.message }))
    }
  } catch (error) {
    console.error(error)
  }
  doneNProgress()
}

// 组件挂载时加载事件类型
onMounted(() => {
  loadEventTypes()
})
</script>

<template>
  <VDialog scrollable :close-on-back="false" eager max-width="30rem" :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem>
        <template #prepend>
          <VIcon icon="mdi-workflow-outline" class="me-2" />
        </template>
        <VCardTitle>{{ title }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12">
              <VTextField
                v-model="workflowForm.name"
                :label="t('dialog.workflowAddEdit.name')"
                :rules="[requiredValidator]"
                persistent-hint
                :hint="t('dialog.workflowAddEdit.namePlaceholder')"
                prepend-inner-icon="mdi-workflow"
              />
            </VCol>
            <VCol cols="12">
              <VSelect
                v-model="workflowForm.trigger_type"
                :label="t('dialog.workflowAddEdit.triggerType')"
                :items="triggerTypeOptions"
                item-title="title"
                item-value="value"
                :rules="[requiredValidator]"
                prepend-inner-icon="mdi-run"
              >
                <template #item="{ item, props: itemProps }">
                  <VListItem v-bind="itemProps">
                    <template #prepend>
                      <VIcon :icon="item.raw.prependIcon" />
                    </template>
                  </VListItem>
                </template>
              </VSelect>
            </VCol>
            <VCol v-if="workflowForm.trigger_type === 'timer'" cols="12">
              <VCronField
                v-model="workflowForm.timer"
                :label="t('dialog.workflowAddEdit.schedule')"
                :rules="[requiredValidator]"
                placeholder="5位cron表达式"
                persistent-hint
                :hint="t('dialog.workflowAddEdit.cronExprDesc')"
                prepend-inner-icon="mdi-clock-outline"
              />
            </VCol>
            <VCol v-if="workflowForm.trigger_type === 'event'" cols="12">
              <VSelect
                v-model="workflowForm.event_type"
                :label="t('dialog.workflowAddEdit.eventType')"
                :items="eventTypes"
                item-title="title"
                item-value="value"
                :rules="[requiredValidator]"
                persistent-hint
                :hint="t('dialog.workflowAddEdit.eventTypePlaceholder')"
                prepend-inner-icon="mdi-calendar-check"
              />
            </VCol>
            <VCol cols="12">
              <VTextarea
                v-model="workflowForm.description"
                :label="t('dialog.workflowAddEdit.desc')"
                :placeholder="t('dialog.workflowAddEdit.descPlaceholder')"
                prepend-inner-icon="mdi-text-box-outline"
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model.number="workflowMaxWorkers"
                type="number"
                min="1"
                clearable
                :label="t('dialog.workflowAddEdit.maxWorkers')"
                prepend-inner-icon="mdi-call-split"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          v-if="workflow"
          color="primary"
          variant="flat"
          @click="editWorkflow"
          prepend-icon="mdi-content-save"
          class="px-5"
        >
          {{ t('dialog.workflowAddEdit.confirm') }}
        </VBtn>
        <VBtn v-else color="primary" variant="flat" @click="addWorkflow" prepend-icon="mdi-plus" class="px-5">
          {{ t('dialog.workflowAddEdit.confirm') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
