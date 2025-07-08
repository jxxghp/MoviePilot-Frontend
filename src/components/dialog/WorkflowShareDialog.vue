<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import type { Workflow, WorkflowShare } from '@/api/types'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

// 多语言支持
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  workflow: Object as PropType<Workflow>,
})

// 定义触发的自定义事件
const emit = defineEmits(['close'])

// 分享处理状态
const shareDoing = ref(false)

// 工作流分享表单
const shareForm = ref<WorkflowShare>({
  workflow_id: props.workflow?.id ?? '',
  share_title: props.workflow?.name ?? '',
})

// 监听props变化
watch(() => props.workflow, (newWorkflow) => {
  if (newWorkflow) {
    shareForm.value.workflow_id = newWorkflow.id ?? ''
    shareForm.value.share_title = newWorkflow.name ?? ''
  }
}, { immediate: true })

// 分享工作流
async function doShare() {
  if (!shareForm.value.share_title || !shareForm.value.share_comment || !shareForm.value.share_user) return
  try {
    shareDoing.value = true
    const result: { [key: string]: any } = await api.post('workflow/share', shareForm.value)
    shareDoing.value = false
    // 提示
    if (result.success) {
      $toast.success(t('dialog.workflowShare.shareSuccess', { name: props.workflow?.name }))
      // 通知父组件刷新
      emit('close')
    } else {
      $toast.error(t('dialog.workflowShare.shareFailed', { name: props.workflow?.name, message: result.message }))
    }
  } catch (e) {
    console.log(e)
  }
}

// 提示框
const $toast = useToast()
</script>

<template>
  <VDialog scrollable max-width="30rem" :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon icon="mdi-share-outline" class="me-2" />
        </template>
        <VCardTitle>{{ t('dialog.workflowShare.shareWorkflow') }}</VCardTitle>
        <VCardSubtitle>
          {{ props.workflow?.name }}
        </VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VDialogCloseBtn @click="emit('close')" />
        <VForm @submit.prevent="() => {}" class="pt-2">
          <VRow>
            <VCol cols="12">
              <VTextField
                v-model="shareForm.share_title"
                readonly
                :label="t('dialog.workflowShare.title')"
                :rules="[requiredValidator]"
                persistent-hint
                prepend-inner-icon="mdi-format-title"
              />
            </VCol>
            <VCol cols="12">
              <VTextarea
                v-model="shareForm.share_comment"
                :label="t('dialog.workflowShare.description')"
                :rules="[requiredValidator]"
                :hint="t('dialog.workflowShare.descriptionHint')"
                persistent-hint
                prepend-inner-icon="mdi-comment-text-outline"
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="shareForm.share_user"
                :label="t('dialog.workflowShare.shareUser')"
                :rules="[requiredValidator]"
                :hint="t('dialog.workflowShare.shareUserHint')"
                persistent-hint
                prepend-inner-icon="mdi-account-outline"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions class="pt-3">
        <VSpacer />
        <VBtn :disabled="shareDoing" @click="doShare" prepend-icon="mdi-share" class="px-5" :loading="shareDoing">
          {{ t('dialog.workflowShare.confirmShare') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>