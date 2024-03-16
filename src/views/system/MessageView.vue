<script lang="ts" setup>
import store from '@/store'
import MessageCard from '@/components/cards/MessageCard.vue'
import type { Message } from '@/api/types'
import api from '@/api'

// 定义事件
const emit = defineEmits(['scroll'])

// 消息列表
const messages = ref<Message[]>([])

// 是否完成加载
const isLoaded = ref(false)

// SSE持续获取消息
function startSSEMessager() {
  const token = store.state.auth.token
  if (token) {
    const eventSource = new EventSource(
      `${import.meta.env.VITE_API_BASE_URL}system/message?token=${token}&role=user`,
    )

    eventSource.addEventListener('message', (event) => {
      const message = event.data
      if (message) {
        const object = JSON.parse(message)
        messages.value.push(object)
        emit('scroll')
      }
      isLoaded.value = true
    })

    onBeforeUnmount(() => {
      eventSource.close()
    })
  }
}

// 调用API加载存量消息
async function loadMessages() {
  try {
    messages.value = await api.get('message/web')
    if (messages.value.length > 0) {
      isLoaded.value = true
      emit('scroll')
    }
  }
  catch (error) {
    console.error(error)
  }
}

onMounted(() => {
  // 加载存量消息
  loadMessages()
  // 监听新消息
  startSSEMessager()
})
</script>

<template>
  <div
    v-if="!isLoaded"
    class="mt-5 w-full text-center flex flex-col items-center"
  >
    <VProgressCircular
      size="48"
      indeterminate
      color="primary"
    />
    <span class="mt-3">正在刷新 ...</span>
  </div>
  <div
    v-if="messages.length === 0 && isLoaded"
    class="w-full text-center flex flex-col items-center"
  >
    <span class="mb-3">当前没有消息</span>
  </div>
  <div>
    <VRow
      v-for="(msg, index) in messages"
      :key="index"
      :class="{
        'justify-end': msg.action === 0,
        'justify-start': msg.action === 1,
      }"
    >
      <VCol
        cols="10"
        lg="6"
        xl="4"
        style="position: relative;"
      >
        <MessageCard
          :message="msg"
        />
      </VCol>
    </VRow>
  </div>
</template>
