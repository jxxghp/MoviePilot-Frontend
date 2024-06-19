<script lang="ts" setup>
import QrcodeVue from 'qrcode.vue'
import api from '@/api'

// 定义事件
const emit = defineEmits(['done', 'close'])

// 二维码内容
const qrCodeContent = ref('')

// 下方的提示信息
const text = ref('请使用微信或115客户端扫码')

// 提醒类型
const alertType = ref<'success' | 'info' | 'error' | 'warning' | undefined>('info')

// timeout定时器
let timeoutTimer: NodeJS.Timeout | undefined = undefined

// 完成
async function handleDone() {
  emit('done')
}

// 调用/aliyun/qrcode api生成二维码
async function getQrcode() {
  try {
    const result: { [key: string]: any } = await api.get('/u115/qrcode')
    if (result.success && result.data) {
      qrCodeContent.value = result.data.codeContent
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
    const result: { [key: string]: any } = await api.get('/u115/check')
    if (result.success && result.data) {
      const status = result.data.status
      text.value = result.data.tip
      if (status == 1) {
        // 已确认完成
        alertType.value = 'success'
        handleDone()
      } else if (status == 0) {
        alertType.value = 'info'
        // 新建、待扫码
        clearTimeout(timeoutTimer)
        timeoutTimer = setTimeout(checkQrcode, 3000)
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
  timeoutTimer = setTimeout(checkQrcode, 3000)
})

onUnmounted(() => {
  if (timeoutTimer) clearTimeout(timeoutTimer)
})
</script>

<template>
  <VDialog width="40rem" scrollable max-height="85vh">
    <VCard title="115网盘登录" class="rounded-t">
      <DialogCloseBtn @click="emit('close')" />
      <VCardText class="pt-2 flex flex-col items-center">
        <div class="my-6 shadow-lg rounded border">
          <VImg class="mx-auto" :src="qrCodeContent" style="block-size: 200px; inline-size: 200px">
            <VSkeletonLoader v-if="!qrCodeContent" class="w-full h-full" />
          </VImg>
        </div>
        <VAlert variant="tonal" :type="alertType" class="my-4 text-center" :text="text">
          <template #prepend />
        </VAlert>
      </VCardText>
      <VCardActions>
        <VSpacer />
        <VBtn variant="elevated" @click="handleDone" prepend-icon="mdi-check" class="px-5 me-3"> 完成 </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
