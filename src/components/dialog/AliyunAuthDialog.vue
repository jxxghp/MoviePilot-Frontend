<script lang="ts" setup>
import QrcodeVue from 'qrcode.vue'
import api from '@/api'

// 定义事件
const emit = defineEmits(['done', 'close'])

// 二维码内容
const qrCodeContent = ref('')

// ck参数
const ck = ref('')

// t参数
const t = ref('')

// 下方的提示信息
const text = ref('请用阿里云盘 App 扫码')

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
    const result: { [key: string]: any } = await api.get('/aliyun/qrcode')
    if (result.success && result.data) {
      qrCodeContent.value = result.data.codeContent
      ck.value = result.data.ck
      t.value = result.data.t
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
    const result: { [key: string]: any } = await api.get('/aliyun/check', {
      params: {
        ck: ck.value,
        t: t.value,
      },
    })
    if (result.success && result.data) {
      const qrCodeStatus = result.data.qrCodeStatus
      text.value = result.data.tip
      if (qrCodeStatus == 'CONFIRMED') {
        // 已确认完成
        alertType.value = 'success'
        handleDone()
      } else if (qrCodeStatus == 'NEW' || qrCodeStatus == 'SCANED') {
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
    <VCard title="阿里云盘登录" class="rounded-t">
      <DialogCloseBtn @click="emit('close')" />
      <VCardText class="pt-2 flex flex-col items-center">
        <div class="my-6 shadow-lg rounded text-center p-3 border">
          <QrcodeVue class="mx-auto" :value="qrCodeContent" :size="200" />
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
