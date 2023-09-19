<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import { useTheme } from 'vuetify'
import store from './store'

// 第一时间应用主题
const { global: globalTheme } = useTheme()
globalTheme.name.value = localStorage.getItem('theme') || 'light'

// 提示框
const $toast = useToast()

// 是否加载完成
const isLoaded = ref(false)

// SSE持续接收消息
function startSSEMessager() {
  const token = store.state.auth.token
  if (token) {
    const eventSource = new EventSource(
      `${import.meta.env.VITE_API_BASE_URL}system/message?token=${token}`,
    )

    eventSource.addEventListener('message', (event) => {
      const message = event.data
      if (message)
        $toast.info(message)
    })

    onBeforeUnmount(() => {
      eventSource.close()
    })
  }
}

// 是否LG大屏幕
const isLargeScreen = ref(false)
// 检测屏幕大小
function checkScreenSize() {
  const screenWidth = window.innerWidth
  isLargeScreen.value = screenWidth >= 1024
}

// 页面加载时，加载当前用户数据
onBeforeMount(async () => {
  checkScreenSize()
  startSSEMessager()
  // 如果是小屏幕，1秒后才显示界面
  if (!isLargeScreen.value) {
    setTimeout(() => {
      isLoaded.value = true
    }, 1000)
  }
  else {
    isLoaded.value = true
  }
})
</script>

<template>
  <div
    v-if="!isLoaded"
    class="mt-12 w-full text-center text-gray-500 text-sm flex flex-col items-center"
  >
    <VProgressCircular
      size="48"
      indeterminate
      color="primary"
    />
  </div>
  <VApp v-show="isLoaded">
    <RouterView />
  </VApp>
</template>
