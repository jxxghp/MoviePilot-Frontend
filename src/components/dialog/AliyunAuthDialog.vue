<script lang="ts" setup>
import QrcodeVue from 'qrcode.vue'
import api from '@/api'
import { isNullOrEmptyObject } from '@/@core/utils'

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

// 认证数据
const UserAliyunParams = ref({})

// timeout定时器
let timeoutTimer: NodeJS.Timeout | undefined = undefined

// 存储认证数据
async function saveAliyunParams() {
  if (isNullOrEmptyObject(UserAliyunParams.value)) return
  try {
    await api.post('system/setting/UserAliyunParams', UserAliyunParams.value)
  } catch (error) {
    console.log(error)
  }
}

// 完成
async function handleDone() {
  // 存储认证数据
  await saveAliyunParams()
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
        UserAliyunParams.value = result.data
        handleDone()
      } else if (qrCodeStatus == 'NEW' || qrCodeStatus == 'SCANED') {
        alertType.value = 'warning'
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
      <VCardText class="pt-2">
        <div class="my-6">
          <QrcodeVue class="mx-auto" :value="qrCodeContent" :size="200" max-width="25rem" />
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
