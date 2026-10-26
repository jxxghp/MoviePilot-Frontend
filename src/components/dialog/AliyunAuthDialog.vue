<script lang="ts" setup>
import { manageStorage } from '@/api/manage'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 多语言支持
const { t } = useI18n()

// 定义输入
defineProps({
  conf: {
    type: Object as PropType<{ [key: string]: any }>,
    required: true,
  },
})

// 定义事件
const emit = defineEmits(['done', 'close'])

// 二维码内容
const qrCodeUrl = ref('')

// 下方的提示信息
const text = ref(t('dialog.aliyunAuth.scanQrCode'))

// 提醒类型
const alertType = ref<'success' | 'info' | 'error' | 'warning' | undefined>('info')

// timeout定时器
let timeoutTimer: NodeJS.Timeout | undefined = undefined

let disposed = false
const authController = new AbortController()

/** 关闭后立即撤销整个授权会话，而不只取消已经建立的定时器。 */
function cleanup() {
  disposed = true
  authController.abort()
  clearTimeout(timeoutTimer)
}
function handleClose() {
  cleanup()
  emit('close')
}

// 完成
async function handleDone() {
  if (disposed) return
  cleanup()
  emit('done')
}

// 调用存储统一管理接口生成二维码
async function getQrcode() {
  if (disposed) return
  try {
    const result = await manageStorage<{ codeUrl: string }>(
      'alipan',
      'generate_qrcode',
      {},
      { feedback: 'silent', signal: authController.signal },
    )
    if (disposed) return
    qrCodeUrl.value = result.codeUrl
    timeoutTimer = setTimeout(checkQrcode, 3000)
  } catch (e) {
    if (disposed) return
    console.error(e)
    text.value = e instanceof Error ? e.message : t('common.apiRequestFailed')
  }
}

// 调用存储统一管理接口验证二维码
async function checkQrcode() {
  if (disposed) return
  try {
    const result = await manageStorage<{ status: string; tip: string }>(
      'alipan',
      'check_login',
      {},
      { feedback: 'silent', signal: authController.signal },
    )
    if (disposed) return
    const qrCodeStatus = result.status
    text.value = result.tip
    if (qrCodeStatus == 'LoginSuccess') {
      // 登录成功
      alertType.value = 'success'
      handleDone()
    } else if (qrCodeStatus == 'WaitLogin' || qrCodeStatus == 'ScanSuccess') {
      // 等待登录扫码成功
      alertType.value = 'info'
      clearTimeout(timeoutTimer)
      timeoutTimer = setTimeout(checkQrcode, 3000)
    } else {
      // 二维码过期
      alertType.value = 'error'
    }
  } catch (e) {
    if (disposed) return
    console.error(e)
    alertType.value = 'error'
    text.value = e instanceof Error ? e.message : t('common.apiRequestFailed')
  }
}

// 重置配置
async function handleReset() {
  if (disposed) return
  try {
    await manageStorage('alipan', 'reset_config', {}, { feedback: 'silent', signal: authController.signal })
    if (disposed) return
    // 重置成功
    alertType.value = 'success'
    handleDone()
  } catch (e) {
    if (disposed) return
    console.error(e)
    alertType.value = 'error'
    text.value = e instanceof Error ? e.message : t('common.apiRequestFailed')
  }
}

onMounted(async () => {
  await getQrcode()
})

onBeforeUnmount(cleanup)
</script>

<template>
  <VDialog width="40rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VDialogCloseBtn @click="handleClose" />
      <VCardItem>
        <template #prepend>
          <VIcon icon="mdi-qrcode" class="me-2" />
        </template>
        <VCardTitle>
          {{ t('dialog.aliyunAuth.loginTitle') }}
        </VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText class="pt-2 flex flex-col items-center justify-center">
        <div class="mt-6 rounded text-center p-3 border">
          <VImg class="mx-auto" :src="qrCodeUrl" width="200" height="200">
            <template #placeholder>
              <div class="w-full h-full">
                <VSkeletonLoader class="object-cover aspect-w-1 aspect-h-1" />
              </div>
            </template>
          </VImg>
        </div>
        <div>
          <VAlert variant="tonal" :type="alertType" class="my-4 text-center" :text="text">
            <template #prepend />
          </VAlert>
        </div>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VBtn color="error" variant="tonal" @click="handleReset" prepend-icon="mdi-restore">
          {{ t('dialog.aliyunAuth.reset') }}
        </VBtn>
        <VSpacer />
        <VBtn color="primary" variant="flat" @click="handleDone" prepend-icon="mdi-check" class="px-5">
          {{ t('dialog.aliyunAuth.complete') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
