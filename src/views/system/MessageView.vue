<script lang="ts" setup>
import type { Message } from '@/api/types'
import MessageCard from '@/components/cards/MessageCard.vue'
import VirtualList from '@/components/virtual/VirtualList.vue'
import api from '@/api'
import { useI18n } from 'vue-i18n'
import { useBackgroundOptimization } from '@/composables/useBackgroundOptimization'

// 国际化
const { t } = useI18n()
const { useSSE } = useBackgroundOptimization()

// 消息列表（按时间升序：旧 -> 新，最新在底部）
const messages = ref<Message[]>([])

// 已加载消息的签名集合，仅按秒级时间戳会误吞同一秒内的不同消息
const messageKeys = new Set<string>()

// 是否完成首屏加载（影响空态文案显示）
const isLoaded = ref(false)
// 是否加载中（避免并发）
const loading = ref(false)
// 还有更早的消息可加载？拉到空页后置 false
const hasMoreOlder = ref(true)
// 当前页码：拉取「更早」消息时递增
const page = ref(1)
// 存量消息最新时间
const lastTime = ref('')

// 反向加载阈值。首屏完成 + forceScrollToEnd 之后才打开，否则
// reverse sentinel 在 items 首次渲染时会和跳到底部竞速，多拉一页。
const reverseThreshold = ref(0)

// 虚拟列表实例引用：用于读取 scrollEl 做智能滚动
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

// 生成消息签名（多字段 fallback 链，单字段 keyField 表达不了，
// 所以走 VirtualList 的 getItemKey 函数 prop）
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

// 排序确保最新消息始终位于底部
function sortMessages(items: Message[]) {
  return [...items].sort((a, b) => compareTime(getMessageTime(a), getMessageTime(b)))
}

function updateLastTime(message: Message) {
  const messageTime = getMessageTime(message)
  if (messageTime && compareTime(messageTime, lastTime.value) > 0) {
    lastTime.value = messageTime
  }
}

function getScrollContainer() {
  const container =
    messageListRef.value?.getScrollElement?.() ?? messageListRef.value?.$el ?? messageListRef.value

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

function mergeMessages(items: Message[]) {
  let hasNewMessage = false
  for (const item of sortMessages(items)) {
    const messageKey = getMessageKey(item)
    if (messageKeys.has(messageKey)) continue
    messageKeys.add(messageKey)
    messages.value.push(item)
    updateLastTime(item)
    hasNewMessage = true
  }
  if (hasNewMessage) messages.value = sortMessages(messages.value)
  return hasNewMessage
}

// SSE 新消息到达 -> 智能跟随到底
function handleSSEMessage(event: MessageEvent) {
  const message = event.data
  if (!message) return

  const object = JSON.parse(message)
  if (mergeMessages([object])) {
    requestScrollToEnd()
  }
}

// 使用优化的 SSE 连接
const { manager } = useSSE(
  `${import.meta.env.VITE_API_BASE_URL}system/message?role=user`,
  handleSSEMessage,
  'message-view',
  { backgroundCloseDelay: 5000, reconnectDelay: 3000, maxReconnectAttempts: 3 },
)

// 加载更早一页：首屏 + 用户向上滚动时由 @load-more-reverse 触发
async function loadOlderMessages() {
  if (loading.value || !hasMoreOlder.value) return
  try {
    loading.value = true
    const data = (await api.get('message/web', {
      params: { page: page.value, size: 20 },
    })) as Message[]
    isLoaded.value = true
    if (data.length > 0) {
      const hasNewMessage = mergeMessages(data)

      if (page.value === 1 && hasNewMessage) {
        requestScrollToEnd(true)
      }

      page.value++
    } else {
      hasMoreOlder.value = false
    }
  } catch (error) {
    console.error('加载消息失败:', error)
  } finally {
    loading.value = false
  }
}

// 主动刷新最新一页，作为 SSE 偶发丢流时的兜底
async function refreshLatestMessages() {
  try {
    const latestMessages = (await api.get('message/web', {
      params: { page: 1, size: 20 },
    })) as Message[]

    if (mergeMessages(latestMessages)) {
      requestScrollToEnd()
    }
  } catch (error) {
    console.error('刷新最新消息失败:', error)
  }
}

// 比较时间
function compareTime(time1: string, time2: string) {
  if (!time1 && !time2) return 0
  if (!time1) return -1
  if (!time2) return 1
  try {
    const normalizeTime = (time: string) => {
      if (time.includes('T')) return new Date(time).getTime()
      return new Date(time.replaceAll(/-/g, '/')).getTime()
    }
    return normalizeTime(time1) - normalizeTime(time2)
  } catch (error) {
    console.error('时间比较错误:', error, 'time1:', time1, 'time2:', time2)
    return 0
  }
}

// 图片加载完成 -> 智能跟随（图片把行撑高，需要重判距底距离）
function handleImageLoad() {
  requestScrollToEnd()
}

// 暂停/恢复 SSE
function pauseSSE() {
  manager?.removeMessageListener('message-view')
}

function resumeSSE() {
  if (manager) {
    manager.removeMessageListener('message-view')
    manager.addMessageListener('message-view', handleSSEMessage)
  }
  refreshLatestMessages()
}

defineExpose({
  pauseSSE,
  resumeSSE,
  refreshLatestMessages,
  forceScrollToEnd,
})

onMounted(async () => {
  await loadOlderMessages()
  await nextTick()
  scrollContainerToEnd()
  requestAnimationFrame(() => {
    reverseThreshold.value = 1
  })
})

onBeforeUnmount(() => {
  if (scrollTimer) {
    window.clearTimeout(scrollTimer)
  }

  if (scrollReleaseTimer) {
    window.clearTimeout(scrollReleaseTimer)
  }
})
</script>

<template>
  <VirtualList
    ref="messageListRef"
    :items="messages"
    :estimate-size="160"
    :get-item-key="getMessageKey"
    :load-more-reverse-threshold="reverseThreshold"
    container-height="100%"
    class="h-full overflow-auto"
    @load-more-reverse="loadOlderMessages"
    @scroll="handleScroll"
  >
    <template #empty>
      <div class="d-flex justify-center align-center h-full text-medium-emphasis">
        {{ isLoaded ? t('message.noMoreData') : '' }}
      </div>
    </template>

    <template #loading>
      <LoadingBanner v-if="loading" />
    </template>

    <template #item="{ item }">
      <div
        class="chat-group d-flex mt-5 mb-8"
        :class="item.action == 1 ? 'flex-row align-start' : 'flex-row-reverse align-end'"
      >
        <div
          class="d-inline-flex flex-column"
          :class="item.action == 1 ? 'align-start' : 'align-end'"
        >
          <MessageCard :message="item" @imageload="handleImageLoad" />
        </div>
      </div>
    </template>
  </VirtualList>
</template>
