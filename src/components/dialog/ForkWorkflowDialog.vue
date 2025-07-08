<script setup lang="ts">
import api from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { WorkflowShare } from '@/api/types'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { useGlobalSettingsStore } from '@/stores'

// 国际化
const { t } = useI18n()

// 输入参数
const props = defineProps({
  media: Object as PropType<WorkflowShare>,
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

// 是否折叠
const isExpanded = ref(false)

// 折叠展开
function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

// 复用工作流
async function doFork() {
  // 开始处理
  startNProgress()
  try {
    processing.value = true
    // 请求API
    const result: { [key: string]: any } = await api.post('workflow/fork', props.media)
    // 工作流状态
    if (result.success) {
      $toast.success(t('workflow.addSuccess', { name: props.media?.share_title }))
      // 完成
      emit('fork', result.data.id)
    } else {
      $toast.error(t('workflow.addFailed', { name: props.media?.share_title, message: result.message }))
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
    const result: { [key: string]: any } = await api.delete(`workflow/share/${props.media?.id}`, {
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
      <VDialogCloseBtn @click="emit('close')" />
      <VCardText>
        <VCol>
          <div class="d-flex justify-space-between flex-wrap flex-md-nowrap flex-column flex-md-row">
            <div class="flex-grow">
              <VCardItem>
                <VCardTitle
                  class="text-center text-md-left break-words whitespace-break-spaces line-clamp-2 overflow-hidden text-ellipsis"
                >
                  {{ props.media?.share_title }}
                </VCardTitle>
                <VCardSubtitle
                  class="text-center text-md-left break-words whitespace-break-spaces line-clamp-4 overflow-hidden text-ellipsis"
                >
                  {{ props.media?.share_comment }}
                </VCardSubtitle>
                <VList lines="one">
                  <VListItem class="ps-0">
                    <VListItemTitle class="text-center text-md-left">
                      <span class="font-weight-medium">{{ t('workflow.sharer') }}：</span>
                      <span class="text-body-1"> {{ media?.share_user }}</span>
                    </VListItemTitle>
                  </VListItem>
                  <VListItem class="ps-0" v-if="media?.timer">
                    <VListItemTitle class="text-center text-md-left">
                      <span class="font-weight-medium">{{ t('workflow.timer') }}：</span>
                      <span class="text-body-1"> {{ media?.timer }}</span>
                    </VListItemTitle>
                  </VListItem>
                  <VListItem class="ps-0" v-if="media?.actions">
                    <VListItemTitle class="text-center text-md-left">
                      <span class="font-weight-medium">{{ t('workflow.actionCount') }}：</span>
                      <span class="text-body-1"> {{ media?.actions?.length }}</span>
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
                        (props.media?.share_uid && props.media?.share_uid === globalSettings.USER_UNIQUE_ID) ||
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
                  <div class="text-xs mt-2" v-if="props.media?.count">
                    <VIcon icon="mdi-fire" />{{
                      t('workflow.usageCount', { count: props.media?.count?.toLocaleString() })
                    }}
                  </div>
                </div>
              </VCardItem>
            </div>
          </div>
        </VCol>
      </VCardText>
    </VCard>
  </VDialog>
</template>