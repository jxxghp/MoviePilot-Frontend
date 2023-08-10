<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import { useTheme } from 'vuetify'
import api from './api'
import type { User } from './api/types'
import store from './store'
import avatar1 from '@images/avatars/avatar-1.png'

// 第一时间应用主题
const { global: globalTheme } = useTheme()
globalTheme.name.value = localStorage.getItem('theme') || 'light'

// 路由
const route = useRoute()

// 提示框
const $toast = useToast()

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

// 当前用户信息
const accountInfo = ref<User>({
  id: 0,
  name: '',
  password: '',
  email: '',
  is_active: false,
  is_superuser: false,
  avatar: avatar1,
})

// 调用API，加载当前用户数据
async function loadAccountInfo() {
  try {
    const user: User = await api.get('user/current')

    accountInfo.value = user
    if (!accountInfo.value.avatar)
      accountInfo.value.avatar = avatar1
  }
  catch (error) {
    console.log(error)
  }
}

// 页面加载时，加载当前用户数据
onMounted(() => {
  loadAccountInfo()
  startSSEMessager()
})

// 提供给所有元素复用
provide('accountInfo', accountInfo)
</script>

<template>
  <VApp>
    <RouterView :key="route.fullPath + route.query" />
  </VApp>
</template>
