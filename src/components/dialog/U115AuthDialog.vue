<script lang="ts" setup>
import api from '@/api'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 常量定义
const AUTH_WINDOW_WIDTH = 600
const AUTH_WINDOW_HEIGHT = 700
const POLL_INTERVAL = 2000
const AUTH_STATUS_SUCCESS = 2
const AUTH_STATUS_FAILED = -1

// 显示器宽度
const display = useDisplay()

// 多语言支持
const { t } = useI18n()

// Props 定义
const props = defineProps({
  conf: {
    type: Object as PropType<{ [key: string]: any }>,
    required: true,
  },
})

// Events 定义
const emit = defineEmits(['done', 'close'])

// 响应式状态
const authUrl = ref('')
const authState = ref('')
const text = ref('')
const alertType = ref<'success' | 'info' | 'error' | 'warning'>('info')

// 授权窗口引用
let authWindow: Window | null = null
let pollTimer: NodeJS.Timeout | undefined

// 清理资源
function cleanup() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = undefined
  }
  if (authWindow && !authWindow.closed) {
    authWindow.close()
    authWindow = null
  }
}

// 设置提示消息
function setMessage(type: typeof alertType.value, message: string) {
  alertType.value = type
  text.value = message
}

// 完成授权
function handleDone() {
  cleanup()
  emit('done')
}

// 重置配置
async function handleReset() {
  try {
    const result: { [key: string]: any } = await api.get('/storage/reset/u115')
    if (result.success) {
      setMessage('success', t('dialog.u115Auth.authSuccess'))
      handleDone()
    }
    else {
      setMessage('error', result.message || t('dialog.u115Auth.authFailed'))
    }
  }
  catch (error) {
    console.error('Reset failed:', error)
    setMessage('error', t('dialog.u115Auth.authFailed'))
  }
}

// 获取授权URL
async function fetchAuthUrl() {
  try {
    const result: { [key: string]: any } = await api.get('/storage/auth_url/u115')

    if (result.success && result.data) {
      authUrl.value = result.data.authUrl
      authState.value = result.data.state
    }
    else {
      setMessage('error', result.message || t('dialog.u115Auth.urlFetchFailed'))
    }
  }
  catch (error) {
    console.error('Fetch auth URL failed:', error)
    setMessage('error', t('dialog.u115Auth.urlFetchFailed'))
  }
}

// 打开授权窗口
function openAuthWindow() {
  if (!authUrl.value) {
    setMessage('error', t('dialog.u115Auth.urlEmpty'))
    return
  }

  const left = (window.screen.width - AUTH_WINDOW_WIDTH) / 2
  const top = (window.screen.height - AUTH_WINDOW_HEIGHT) / 2
  const features = [
    `width=${AUTH_WINDOW_WIDTH}`,
    `height=${AUTH_WINDOW_HEIGHT}`,
    `left=${left}`,
    `top=${top}`,
    'toolbar=no',
    'location=no',
    'status=no',
    'menubar=no',
    'scrollbars=yes',
    'resizable=yes',
  ].join(',')

  authWindow = window.open(authUrl.value, '115授权', features)

  if (authWindow) {
    setMessage('info', t('dialog.u115Auth.authorizing'))
    pollTimer = setTimeout(checkAuthStatus, POLL_INTERVAL)
  }
  else {
    setMessage('error', t('dialog.u115Auth.popupBlocked'))
  }
}

// 检查授权状态
async function checkAuthStatus() {
  try {
    const result: { [key: string]: any } = await api.get('/storage/check/u115')

    if (result.success && result.data) {
      const { status, tip } = result.data

      if (status === AUTH_STATUS_SUCCESS) {
        // 授权成功
        setMessage('success', t('dialog.u115Auth.authSuccess'))
        handleDone()
        return
      }

      if (status === AUTH_STATUS_FAILED) {
        // 授权失败或过期
        setMessage('error', tip || t('dialog.u115Auth.authFailed'))
        cleanup()
        return
      }

      // status === 0 或 1，继续等待
    }
  }
  catch (error) {
    console.error('Check auth status failed:', error)
  }

  // 检查窗口是否被用户关闭
  if (authWindow?.closed) {
    setMessage('warning', t('dialog.u115Auth.authCanceled'))
    cleanup()
    return
  }

  // 继续轮询
  pollTimer = setTimeout(checkAuthStatus, POLL_INTERVAL)
}

// 生命周期钩子
onMounted(() => {
  fetchAuthUrl()
})

onUnmounted(() => {
  cleanup()
})
</script>

<template>
  <VDialog width="40rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VDialogCloseBtn @click="emit('close')" />

      <VCardItem>
        <template #prepend>
          <VIcon icon="mdi-shield-key" class="me-2" />
        </template>
        <VCardTitle>
          {{ t('dialog.u115Auth.loginTitle') }}
        </VCardTitle>
      </VCardItem>

      <VDivider />

      <VCardText class="pt-2 flex flex-col items-center justify-center">
        <!-- 授权按钮 -->
        <div class="mt-6 mb-4 text-center">
          <VBtn
            size="x-large"
            color="primary"
            prepend-icon="mdi-login"
            :disabled="!authUrl"
            class="px-8"
            @click="openAuthWindow"
          >
            {{ t('dialog.u115Auth.openAuthWindow') }}
          </VBtn>
        </div>

        <!-- 状态提示 -->
        <div v-if="text" class="w-full">
          <VAlert
            variant="tonal"
            :type="alertType"
            :text="text"
            class="my-4 text-center"
          >
            <template #prepend />
          </VAlert>
        </div>
      </VCardText>

      <VCardActions class="app-dialog-actions">
        <VBtn
          color="error"
          variant="tonal"
          prepend-icon="mdi-restore"
          @click="handleReset"
        >
          {{ t('dialog.u115Auth.reset') }}
        </VBtn>

        <VSpacer />

        <VBtn
          color="primary"
          variant="flat"
          prepend-icon="mdi-check"
          class="px-5"
          @click="handleDone"
        >
          {{ t('dialog.u115Auth.complete') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
