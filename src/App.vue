<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import { useTheme } from 'vuetify'
import api from '@/api'
import store from './store'


// 提示框
const $toast = useToast()

// 设置主题
function setTheme() {
  const { global: globalTheme } = useTheme()
  let theme = localStorage.getItem('theme') || 'light'
  if (theme === 'auto')
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  globalTheme.name.value = theme
}

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

// 加载用户监控面板配置
async function loadDashboardConfig() {
  const response = await api.get('/user/config/Dashboard')
  if (response && response.data && response.data.value) {
      const data = JSON.stringify(response.data.value)
      if (data != localStorage.getItem("MP_DASHBOARD")) {
        localStorage.setItem("MP_DASHBOARD", data)
      }
    }
}

// 尝试加载用户监控面板配置（本地无配置时才加载）
async function tryLoadDashboardConfig() {
  if (localStorage.getItem("MP_DASHBOARD")) {
    return
  }
  await loadDashboardConfig()
}

// 页面加载时，加载当前用户数据
onBeforeMount(async () => {
  setTheme()
  startSSEMessager()
  await tryLoadDashboardConfig()
})
</script>

<template>
  <VApp>
    <RouterView />
  </VApp>
</template>
