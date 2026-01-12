<script lang="ts" setup>
import api from '@/api'
import QRCode from 'qrcode'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 多语言支持
const { t } = useI18n()

// 定义输入
const props = defineProps({
  conf: {
    type: Object as PropType<{ [key: string]: any }>,
    required: true,
  },
})

// 定义事件
const emit = defineEmits(['done', 'close'])

// 二维码内容
const qrCodeContent = ref('')

// 二维码图片 base64
const qrCodeImage = ref('')

// 下方的提示信息
const text = ref(t('dialog.u115Auth.scanQrCode'))

// 提醒类型
const alertType = ref<'success' | 'info' | 'error' | 'warning' | undefined>('info')

// timeout定时器
let timeoutTimer: NodeJS.Timeout | undefined = undefined

// 完成
async function handleDone() {
  clearTimeout(timeoutTimer)
  emit('done')
}

// 重置配置
async function handleReset() {
  try {
    const result: { [key: string]: any } = await api.get('/storage/reset/u115')
    if (result.success) {
      // 重置成功
      alertType.value = 'success'
      handleDone()
    } else {
      alertType.value = 'error'
      text.value = result.message
    }
  } catch (e) {
    console.error(e)
  }
}
// 调用/u115/qrcode api生成二维码
async function getQrcode() {
  try {
    const result: { [key: string]: any } = await api.get('/storage/qrcode/u115')
    if (result.success && result.data) {
      qrCodeContent.value = result.data.codeContent
      // 生成二维码图片
      qrCodeImage.value = await QRCode.toDataURL(result.data.codeContent, {
        width: 200,
        margin: 1,
      })
      timeoutTimer = setTimeout(checkQrcode, 3000)
    } else {
      text.value = result.message
    }
  } catch (e) {
    console.error(e)
  }
}

// 调用/aliyun/check api验证二维码
async function checkQrcode() {
  try {
    const result: { [key: string]: any } = await api.get('/storage/check/u115')
    if (result.success && result.data) {
      const status = result.data.status
      text.value = result.data.tip
      if (status == 0) {
        alertType.value = 'info'
        // 新建、待扫码
        clearTimeout(timeoutTimer)
        timeoutTimer = setTimeout(checkQrcode, 3000)
      } else if (status == 1) {
        // 已扫码
        alertType.value = 'info'
        text.value = t('dialog.u115Auth.scanned')
        clearTimeout(timeoutTimer)
        timeoutTimer = setTimeout(checkQrcode, 3000)
      } else if (status == 2) {
        // 已确认完成
        alertType.value = 'success'
        handleDone()
      } else {
        // 过期或者已取消
        alertType.value = 'error'
      }
    } else {
      alertType.value = 'error'
      text.value = result.message
    }
  } catch (e) {
    console.error(e)
  }
}

onMounted(async () => {
  await getQrcode()
})

onUnmounted(() => {
  if (timeoutTimer) clearTimeout(timeoutTimer)
})
</script>

<template>
  <VDialog width="40rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VDialogCloseBtn @click="emit('close')" />
      <VCardItem>
        <template #prepend>
          <VIcon icon="mdi-qrcode" class="me-2" />
        </template>
        <VCardTitle>
          {{ t('dialog.u115Auth.loginTitle') }}
        </VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText class="pt-2 flex flex-col items-center justify-center">
        <div class="mt-6 rounded text-center p-3 border">
          <VImg class="mx-auto" :src="qrCodeImage" width="200" height="200">
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
      <VCardActions>
        <VBtn color="error" @click="handleReset" prepend-icon="mdi-restore" class="px-5 me-3">
          {{ t('dialog.u115Auth.reset') }}
        </VBtn>
        <VSpacer />
        <VBtn @click="handleDone" prepend-icon="mdi-check" class="px-5 me-3">
          {{ t('dialog.u115Auth.complete') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
