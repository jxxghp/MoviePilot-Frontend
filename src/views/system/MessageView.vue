<script lang="ts" setup>
import type { Message } from '@/api/types'
import MessageCard from '@/components/cards/MessageCard.vue'
import api from '@/api'
import { useI18n } from 'vue-i18n'
import { useBackground } from '@/composables/useBackground'

// 国际化
const { t } = useI18n()
const { useSSE } = useBackground()

// 消息列表
const messages = ref<Message[]>([])
// 当前页数据
const currData = ref<Message[]>([])

// 已加载消息的签名集合
// 使用消息内容签名去重，避免仅按秒级时间戳判断时误吞同一秒内的不同消息。
const messageKeys = new Set<string>()

// 是否完成加载
const isLoaded = ref(false)

// 是否加载中
const loading = ref(false)

// 当前页码
const page = ref(1)

// 存量消息最新时间
const lastTime = ref('')

// 消息列表滚动容器
const messageListRef = ref<any>(null)

// 自动滚动状态
const shouldAutoScroll = ref(true)
const isSyncingScroll = ref(false)

const MESSAGE_AUTO_SCROLL_THRESHOLD = 64

let scrollTimer: number | undefined
let scrollReleaseTimer: number | undefined

// 获取消息时间
function getMessageTime(message: Message) {
  return message.reg_time || message.date || ''
}

// 生成消息签名
function getMessageKey(message: Message) {
  return [
    message.action ?? '',
    message.userid ?? '',
    message.reg_time ?? '',
    message.date ?? '',
    message.title ?? '',
    message.text ?? '',
    message.image ?? '',
    message.link ?? '',
    message.note ?? '',
  ].join('::')
}

// 排序消息列表，确保最新消息始终位于底部
function sortMessages(items: Message[]) {
  return [...items].sort((a, b) => compareTime(getMessageTime(a), getMessageTime(b)))
}

// 记录最新消息时间
function updateLastTime(message: Message) {
  const messageTime = getMessageTime(message)
  if (messageTime && compareTime(messageTime, lastTime.value) > 0) {
    lastTime.value = messageTime
  }
}

function getScrollContainer() {
  const container = messageListRef.value?.$el ?? messageListRef.value

  return container instanceof HTMLElement ? container : null
}

function isNearBottom(container: HTMLElement) {
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight

  return distanceFromBottom <= Math.max(MESSAGE_AUTO_SCROLL_THRESHOLD, container.clientHeight / 3)
}

function updateAutoScrollState() {
  const container = getScrollContainer()
  if (!container || isSyncingScroll.value) {
    return
  }

  shouldAutoScroll.value = isNearBottom(container)
}

function handleScroll() {
  updateAutoScrollState()
}

function bindScrollListener() {
  const container = getScrollContainer()
  if (!container) {
    return
  }

  container.removeEventListener('scroll', handleScroll)
  container.addEventListener('scroll', handleScroll, { passive: true })
  updateAutoScrollState()
}

function unbindScrollListener() {
  getScrollContainer()?.removeEventListener('scroll', handleScroll)
}

function scrollContainerToEnd() {
  const container = getScrollContainer()
  if (!container) {
    return
  }

  isSyncingScroll.value = true
  container.scrollTop = container.scrollHeight

  requestAnimationFrame(() => {
    const latestContainer = getScrollContainer()
    if (!latestContainer) {
      isSyncingScroll.value = false
      return
    }

    latestContainer.scrollTop = latestContainer.scrollHeight
    shouldAutoScroll.value = true

    if (scrollReleaseTimer) {
      window.clearTimeout(scrollReleaseTimer)
    }

    scrollReleaseTimer = window.setTimeout(() => {
      isSyncingScroll.value = false
      updateAutoScrollState()
    }, 80)
  })
}

function requestScrollToEnd(force = false) {
  if (!force && !shouldAutoScroll.value) {
    return
  }

  if (scrollTimer) {
    window.clearTimeout(scrollTimer)
  }

  scrollTimer = window.setTimeout(() => {
    nextTick(() => {
      requestAnimationFrame(() => {
        scrollContainerToEnd()
      })
    })
  }, force ? 0 : 80)
}

function forceScrollToEnd() {
  requestScrollToEnd(true)
}

// 合并消息到当前列表
function mergeMessages(items: Message[]) {
  let hasNewMessage = false

  for (const item of sortMessages(items)) {
    const messageKey = getMessageKey(item)
    if (messageKeys.has(messageKey)) {
      continue
    }

    messageKeys.add(messageKey)
    messages.value.push(item)
    updateLastTime(item)
    hasNewMessage = true
  }

  if (hasNewMessage) {
    messages.value = sortMessages(messages.value)
  }

  return hasNewMessage
}

// SSE消息处理函数
function handleSSEMessage(event: MessageEvent) {
  const message = event.data
  if (message) {
    const object = JSON.parse(message)
    if (mergeMessages([object])) {
      requestScrollToEnd() // 新消息到达时触发智能滚动
    }
  }
}

// 使用SSE连接
const { manager, isConnected } = useSSE(
  `${import.meta.env.VITE_API_BASE_URL}system/message?role=user`,
  handleSSEMessage,
  'message-view',
  {
    backgroundCloseDelay: 5000,
    reconnectDelay: 3000,
    maxReconnectAttempts: 3,
  },
)

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
      const hasNewMessage = mergeMessages(currData.value)

      // 首次加载时滚动到底部
      if (page.value === 1 && hasNewMessage) {
        requestScrollToEnd(true)
      }
      // 页码+1
      page.value++
      // 完成
      done('ok')
    } else {
      // 没有新数据
      done('empty')
    }
  } catch (error) {
    console.error('加载消息失败:', error)
    done('error')
  } finally {
    loading.value = false
  }
}

// 主动刷新最新一页消息，作为SSE偶发丢流时的兜底
async function refreshLatestMessages() {
  try {
    const latestMessages = (await api.get('message/web', {
      params: {
        page: 1,
        size: 20,
      },
    })) as Message[]

    if (mergeMessages(latestMessages)) {
      requestScrollToEnd()
    }
  } catch (error) {
    console.error('刷新最新消息失败:', error)
  }
}

// 比较yyyy-MM-dd HH:mm:ss时间大小
function compareTime(time1: string, time2: string) {
  if (!time1 && !time2) return 0
  if (!time1) return -1
  if (!time2) return 1

  try {
    // 统一时间格式处理，支持多种格式
    const normalizeTime = (time: string) => {
      // 如果是ISO格式，直接使用
      if (time.includes('T')) {
        return new Date(time).getTime()
      }
      // 如果是yyyy-MM-dd HH:mm:ss格式，替换-为/
      return new Date(time.replaceAll(/-/g, '/')).getTime()
    }

    const timestamp1 = normalizeTime(time1)
    const timestamp2 = normalizeTime(time2)

    return timestamp1 - timestamp2
  } catch (error) {
    console.error('时间比较错误:', error, 'time1:', time1, 'time2:', time2)
    return 0
  }
}

// 图片加载完成时触发智能滚动
function handleImageLoad() {
  requestScrollToEnd()
}

// 暂停SSE连接
function pauseSSE() {
  if (manager) {
    manager.removeMessageListener('message-view')
  }
}

// 恢复SSE连接
function resumeSSE() {
  if (manager) {
    // 先移除再重建监听，确保恢复时拿到一条新的SSE连接。
    manager.removeMessageListener('message-view')
    manager.addMessageListener('message-view', handleSSEMessage)
  }

  refreshLatestMessages()
}

// 暴露方法给父组件
defineExpose({
  pauseSSE,
  resumeSSE,
  refreshLatestMessages,
  forceScrollToEnd,
})

onMounted(() => {
  nextTick(() => {
    bindScrollListener()
    requestScrollToEnd(true)
  })
})

onBeforeUnmount(() => {
  if (scrollTimer) {
    window.clearTimeout(scrollTimer)
  }

  if (scrollReleaseTimer) {
    window.clearTimeout(scrollReleaseTimer)
  }

  unbindScrollListener()
})
</script>

<template>
  <VInfiniteScroll
    ref="messageListRef"
    :mode="!isLoaded ? 'intersect' : 'manual'"
    side="start"
    :items="messages"
    class="overflow-auto h-full"
    @load="loadMessages"
    :load-more-text="t('message.loadMore') + ' ...'"
  >
    <template #loading>
      <LoadingBanner />
    </template>
    <template #empty> {{ t('message.noMoreData') }} </template>
    <VVirtualScroll renderless :items="messages" :item-height="160">
      <template #default="{ item, index, itemRef }">
        <div
          :ref="itemRef"
          :key="getMessageKey(item) || index"
          class="chat-group d-flex mt-5 mb-8"
          :class="item.action == 1 ? 'flex-row align-start' : 'flex-row-reverse align-end'"
        >
          <div class="d-inline-flex flex-column" :class="item.action == 1 ? 'align-start' : 'align-end'">
            <MessageCard :message="item" @imageload="handleImageLoad" />
          </div>
        </div>
      </template>
    </VVirtualScroll>
  </VInfiniteScroll>
</template>
