<script setup lang="ts">
import api from '@/api'
import { clearAppBadge } from '@/utils/badge'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

const MessageView = defineAsyncComponent(() => import('@/views/system/MessageView.vue'))

type MessageViewExpose = {
  pauseSSE?: () => void
  resumeSSE?: () => void
  refreshLatestMessages?: () => Promise<void> | void
  forceScrollToEnd?: () => void
}

// 国际化
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close'])

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 输入消息
const user_message = ref('')

// 发送按钮是否可用
const sendButtonDisabled = ref(false)

// 消息视图引用
const messageViewRef = ref<MessageViewExpose | null>(null)

/** 发送 Web 消息。 */
async function sendMessage() {
  const messageText = user_message.value.trim()
  if (!messageText) {
    return
  }

  try {
    sendButtonDisabled.value = true
    await api.post(`message/web?text=${encodeURIComponent(messageText)}`)
    user_message.value = ''
    messageViewRef.value?.forceScrollToEnd?.()
  } catch (error) {
    console.error(error)
  } finally {
    sendButtonDisabled.value = false
  }
}

watch(visible, async newValue => {
  if (newValue) {
    await nextTick()
    messageViewRef.value?.resumeSSE?.()
    messageViewRef.value?.forceScrollToEnd?.()

    window.setTimeout(() => {
      void clearAppBadge()
    }, 500)

    return
  }

  messageViewRef.value?.pauseSSE?.()
})

onMounted(async () => {
  await nextTick()
  messageViewRef.value?.resumeSSE?.()
  messageViewRef.value?.forceScrollToEnd?.()

  window.setTimeout(() => {
    void clearAppBadge()
  }, 500)
})

onUnmounted(() => {
  messageViewRef.value?.pauseSSE?.()
})
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="50rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-message" class="me-2" />
          {{ t('shortcut.message.subtitle') }}
        </VCardTitle>
        <VDialogCloseBtn v-model="visible" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <MessageView ref="messageViewRef" />
      </VCardText>
      <VDivider />
      <VCardActions class="pa-4">
        <div class="d-flex w-100 gap-2">
          <VTextField
            v-model="user_message"
            variant="outlined"
            hide-details
            density="compact"
            :placeholder="t('common.inputMessage')"
            @keyup.enter="sendMessage"
          />
          <VBtn
            variant="elevated"
            :disabled="sendButtonDisabled"
            @click="sendMessage"
            :loading="sendButtonDisabled"
            color="primary"
            prepend-icon="mdi-send"
            >{{ t('common.send') }}
          </VBtn>
        </div>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
