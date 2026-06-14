<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import type { Subscribe, SubscribeShare } from '@/api/types'
import { useDisplay } from 'vuetify'
import { formatSeason } from '@/@core/utils/formatters'
import { useI18n } from 'vue-i18n'

// 多语言支持
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  sub: Object as PropType<Subscribe>,
})

// 定义触发的自定义事件
const emit = defineEmits(['close'])

// 分享处理状态
const shareDoing = ref(false)

// 订阅编辑表单
const shareForm = ref<SubscribeShare>({
  subscribe_id: props.sub?.id ?? 0,
  share_title: `${props.sub?.name} ${formatSeason(props.sub?.season ? props.sub?.season.toString() : '')}`,
})

// 分享订阅
async function doShare() {
  if (!shareForm.value.share_title || !shareForm.value.share_comment || !shareForm.value.share_user) return
  try {
    shareDoing.value = true
    const result: { [key: string]: any } = await api.post('subscribe/share', shareForm.value)
    shareDoing.value = false
    // 提示
    if (result.success) {
      $toast.success(t('dialog.subscribeShare.shareSuccess', { name: props.sub?.name }))
      // 通知父组件刷新
      emit('close')
    } else {
      $toast.error(t('dialog.subscribeShare.shareFailed', { name: props.sub?.name, message: result.message }))
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
        <VCardTitle>{{ t('dialog.subscribeShare.shareSubscription') }}</VCardTitle>
        <VCardSubtitle>
          {{ props.sub?.name }}
          {{ props.sub?.season ? t('dialog.subscribeShare.season', { number: props.sub?.season }) : '' }}
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
                :label="t('dialog.subscribeShare.title')"
                :rules="[requiredValidator]"
                persistent-hint
                prepend-inner-icon="mdi-format-title"
              />
            </VCol>
            <VCol cols="12">
              <VTextarea
                v-model="shareForm.share_comment"
                :label="t('dialog.subscribeShare.description')"
                :rules="[requiredValidator]"
                :hint="t('dialog.subscribeShare.descriptionHint')"
                persistent-hint
                prepend-inner-icon="mdi-comment-text-outline"
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="shareForm.share_user"
                :label="t('dialog.subscribeShare.shareUser')"
                :rules="[requiredValidator]"
                :hint="t('dialog.subscribeShare.shareUserHint')"
                persistent-hint
                prepend-inner-icon="mdi-account-outline"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          :disabled="shareDoing"
          @click="doShare"
          prepend-icon="mdi-share"
          class="px-5"
          :loading="shareDoing"
        >
          {{ t('dialog.subscribeShare.confirmShare') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
