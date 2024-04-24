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

// 存量消息最新时间
const lastTime = ref('')

// SSE消息对象
let eventSource: EventSource | null = null

// SSE持续获取消息
function startSSEMessager() {
  const token = store.state.auth.token
  if (token) {
    eventSource = new EventSource(
      `${import.meta.env.VITE_API_BASE_URL}system/message?token=${token}&role=user`,
    )

    eventSource.addEventListener('message', (event) => {
      const message = event.data
      if (message) {
        const object = JSON.parse(message)
        if (compareTime(object.date, lastTime.value) <= 0)
          return
        messages.value.push(object)
        emit('scroll')
      }
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
  try {
    // 设置加载中
    loading.value = true
    currData.value = await api.get('message/web', {
      params: {
        page: page.value,
        size: 20,
      },
    })
    // 已加载过
    isLoaded.value = true
    if (currData.value.length > 0) {
      // 取最后一条时间为存量消息最新时间
      lastTime.value = currData.value[currData.value.length - 1].reg_time ?? ''
      // 合并数据
      messages.value = [...currData.value, ...messages.value]
      if (page.value === 1) {
        // 滚动到底部
        emit('scroll')
      }
      // 页码+1
      page.value++
      // 完成
      done('ok')
    }
    else {
      // 没有新数据
      done('empty')
    }
    // 取消加载中
    loading.value = false
    // 监听SSE消息
    startSSEMessager()
  }
  catch (error) {
    console.error(error)
  }
}

// 比较yyyy-MM-dd HH:mm:ss时间大小
function compareTime(time1: string, time2: string) {
  if (!time1)
    return -1
  if (!time2)
    return 1
  return new Date(time1.replaceAll(/-/g, '/')).getTime() - new Date(time2.replaceAll(/-/g, '/')).getTime()
}

onBeforeUnmount(() => {
  if (eventSource)
    eventSource.close()
})
</script>

<template>
  <VInfiniteScroll
    :mode="!isLoaded ? 'intersect' : 'manual'"
    side="start"
    :items="messages"
    class="overflow-hidden"
    @load="loadMessages"
    load-more-text="加载更多 ..."
  >
    <template #loading>
      <LoadingBanner />
    </template>
    <template #empty>
      没有更多数据
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
