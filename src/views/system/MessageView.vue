<script lang="ts" setup>
import store from '@/store'
import type { Message } from '@/api/types'
import MessageCard from '@/components/cards/MessageCard.vue'
import api from '@/api'

// 定义事件
const emit = defineEmits(['scroll'])

// 消息列表
const messages = ref<Message[]>([])
// 当前页数据
const currData = ref<Message[]>([])

// 是否完成加载
const isLoaded = ref(false)

// 是否加载中
const loading = ref(false)

// 当前页码
const page = ref(1)

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
    })

    onBeforeUnmount(() => {
      eventSource.close()
    })
  }
}

// 调用API加载存量消息
async function loadMessages({ done }: { done: any }) {
  // 如果正在加载中，直接返回
  if (loading.value) {
    done('ok')
    return
  }
  // 设置加载中
  loading.value = true
  try {
    currData.value = await api.get('message/web', {
      params: {
        page: page.value,
        size: 20,
      },
    })
    if (currData.value.length > 0) {
      // 合并数据
      messages.value = [...currData.value, ...messages.value]
      // 加载完成
      done('ok')
      if (page.value === 1) {
        // 滚动到底部
        emit('scroll')
      }
      // 页码+1
      page.value++
    }
    else {
      done('ok')
    }
    loading.value = false
    isLoaded.value = true
  }
  catch (error) {
    console.error(error)
  }
}

onMounted(() => {
  // 监听新消息
  startSSEMessager()
})
</script>

<template>
  <VInfiniteScroll
    mode="intersect"
    side="start"
    :items="messages"
    class="overflow-hidden"
    @load="loadMessages"
  >
    <template #loading>
      <VProgressCircular
        v-if="loading"
        indeterminate
        size="48"
        class="mb-5"
        color="primary"
      />
    </template>
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
    <div
      v-if="messages.length === 0 && isLoaded && !loading"
      class="w-full text-center flex flex-col items-center"
    >
      <span class="mb-3">当前没有消息</span>
    </div>
  </VInfiniteScroll>
</template>
