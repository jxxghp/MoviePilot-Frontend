<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import type { Subscribe, SubscribeShare } from '@/api/types'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  sub: Object as PropType<Subscribe>,
})

// 定义触发的自定义事件
const emit = defineEmits(['close'])

// 订阅编辑表单
const shareForm = ref<SubscribeShare>({
  subscribe_id: props.sub?.id ?? 0,
})

// 分享订阅
async function doShare() {
  if (!shareForm.value.share_title || !shareForm.value.share_comment || !shareForm.value.share_user) return
  try {
    const result: { [key: string]: any } = await api.post('subscribe/share', shareForm.value)
    // 提示
    if (result.success) {
      $toast.success(`${props.sub?.name} 分享成功！`)
      // 通知父组件刷新
      emit('close')
    } else {
      $toast.error(`${props.sub?.name} 分享失败：${result.message}！`)
    }
  } catch (e) {
    console.log(e)
  }
}

// 提示框
const $toast = useToast()
</script>

<template>
  <VDialog scrollable max-width="50rem" :fullscreen="!display.mdAndUp.value">
    <VCard
      :title="`分享订阅 - ${props.sub?.name} ${props.sub?.season ? `第 ${props.sub?.season} 季` : ''}`"
      class="rounded-t"
    >
      <VCardText>
        <DialogCloseBtn @click="emit('close')" />
        <VForm @submit.prevent="() => {}" class="pt-2">
          <VRow>
            <VCol cols="12">
              <VTextField
                v-model="shareForm.share_title"
                label="标题"
                hint="给分享取一个便于识别的名称"
                :rules="[requiredValidator]"
                persistent-hint
              />
            </VCol>
            <VCol cols="12">
              <VTextarea
                v-model="shareForm.share_comment"
                label="说明"
                :rules="[requiredValidator]"
                hint="关于该订阅的说明"
                persistent-hint
              />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="shareForm.share_user"
                label="分享用户"
                :rules="[requiredValidator]"
                hint="分享人的昵称"
                persistent-hint
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions class="pt-3">
        <VSpacer />
        <VBtn variant="elevated" @click="doShare" prepend-icon="mdi-share" class="px-5"> 确认分享 </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
