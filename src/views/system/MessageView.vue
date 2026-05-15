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

// 消息列表（按时间升序：旧 → 新，最新在底部）
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

// 反向加载阈值。首屏完成 + scrollToBottom 之后才打开 —— 否则
// reverse sentinel 在 items 首次渲染时本就在视口内，会和 onMounted
// 的"跳到底"竞速直接抢拉第 2 页，造成多拉一页。
const reverseThreshold = ref(0)

// 虚拟列表实例引用：用于读取 scrollEl 做智能滚动
const messageListRef = ref<any>(null)

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

// SSE 新消息到达 → 智能跟随到底
function handleSSEMessage(event: MessageEvent) {
  const message = event.data
  if (!message) return
  const object = JSON.parse(message)
  if (mergeMessages([object])) nextTick(smartScrollToEnd)
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
      mergeMessages(data)
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
    if (mergeMessages(latestMessages)) nextTick(smartScrollToEnd)
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

// 智能滚动到底：仅当用户已在底部 1/3 屏幕范围内时才跟随到底（chat 标准行为）。
// setTimeout(0) 让 DOM 先把新消息布局完再读 scrollHeight。
function smartScrollToEnd() {
  setTimeout(() => {
    try {
      const el = messageListRef.value?.getScrollElement?.()
      if (!el) return
      const { scrollTop, scrollHeight, clientHeight } = el
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      if (distanceFromBottom <= clientHeight / 3) {
        el.scrollTop = el.scrollHeight
      }
    } catch (e) {
      console.error('智能滚动失败:', e)
    }
  }, 0)
}

// 无条件滚动到底：用于首屏加载完成后跳到最新
function scrollToBottom() {
  const el = messageListRef.value?.getScrollElement?.()
  if (el) el.scrollTop = el.scrollHeight
}

// 图片加载完成 → 智能跟随（图片把行撑高,需要重判距底距离）
function handleImageLoad() {
  smartScrollToEnd()
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
  smartScrollToEnd,
  scrollToBottom,
})

onMounted(async () => {
  // 首屏：先拉最新一页 → 跳到底 → 再打开反向加载阈值
  // 顺序很关键，详见 reverseThreshold 注释
  await loadOlderMessages()
  await nextTick()
  scrollToBottom()
  reverseThreshold.value = 1
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
