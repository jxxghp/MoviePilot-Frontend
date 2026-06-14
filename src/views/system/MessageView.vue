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
// SSE 消息与数据库消息的字段来源不同（date vs reg_time, null vs {}），签名已归一化处理。
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
let boundScrollContainer: HTMLElement | null = null

// 生成消息去重签名
// SSE 消息只有 date 没有 reg_time，数据库消息只有 reg_time 没有 date；
// note 在 SSE 侧为 null，数据库侧为 {}，需要归一化。
function normalizeNote(note: Message['note']): string {
  if (note == null) return ''
  if (typeof note === 'string') return note
  if (typeof note === 'object' && !Array.isArray(note) && Object.keys(note).length === 0) return ''
  return JSON.stringify(note)
}

function getMessageKey(message: Message) {
  return [
    message.action ?? '',
    message.userid ?? '',
    message.reg_time || message.date || '',
    message.title ?? '',
    message.text ?? '',
    message.image ?? '',
    message.link ?? '',
    normalizeNote(message.note),
  ].join('::')
}

// 获取消息时间
function getMessageTime(message: Message) {
  return message.reg_time || message.date || ''
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

/** 判断元素自身是否是真正承载滚动的位置。 */
function isScrollableElement(element: HTMLElement) {
  const { overflowY } = window.getComputedStyle(element)
  const canScroll = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'

  return canScroll && element.scrollHeight > element.clientHeight + 1
}

/** 获取消息列表所在的真实滚动容器。 */
function getScrollContainer() {
  const element = messageListRef.value?.$el ?? messageListRef.value

  if (!(element instanceof HTMLElement)) {
    return null
  }

  let container: HTMLElement | null = element
  while (container) {
    if (isScrollableElement(container)) {
      return container
    }

    container = container.parentElement
  }

  const dialogCardText = element.closest('.v-card-text')

  return dialogCardText instanceof HTMLElement ? dialogCardText : element
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

  if (boundScrollContainer && boundScrollContainer !== container) {
    boundScrollContainer.removeEventListener('scroll', handleScroll)
  }

  container.removeEventListener('scroll', handleScroll)
  container.addEventListener('scroll', handleScroll, { passive: true })
  boundScrollContainer = container
  updateAutoScrollState()
}

function unbindScrollListener() {
  boundScrollContainer?.removeEventListener('scroll', handleScroll)
  boundScrollContainer = null
}

/** 滚动到底部，并在布局稳定前连续几帧校正滚动位置。 */
function scrollContainerToEnd(retryCount = 1) {
  const container = getScrollContainer()
  if (!container) {
    return
  }

  bindScrollListener()
  isSyncingScroll.value = true
  container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight)

  requestAnimationFrame(() => {
    const latestContainer = getScrollContainer()
    if (!latestContainer) {
      isSyncingScroll.value = false
      return
    }

    latestContainer.scrollTop = Math.max(0, latestContainer.scrollHeight - latestContainer.clientHeight)
    shouldAutoScroll.value = true

    if (retryCount > 0) {
      scrollContainerToEnd(retryCount - 1)
      return
    }

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
        scrollContainerToEnd(force ? 6 : 1)
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
    const isFirstPage = page.value === 1

    currData.value = await api.get('message/web', {
      params: {
        page: page.value,
        size: 20,
      },
    })
    // 已加载过
    isLoaded.value = true
    if (currData.value.length > 0) {
      mergeMessages(currData.value)

      // 页码+1
      page.value++
      // 完成
      done('ok')

      // 首次加载完成后再滚动，避免列表尚未完成布局时滚动失效。
      if (isFirstPage) {
        requestScrollToEnd(true)
      }
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
    <div
      v-for="(item, index) in messages"
      :key="getMessageKey(item) || index"
      class="chat-group d-flex mt-5 mb-8"
      :class="item.action == 1 ? 'flex-row align-start' : 'flex-row-reverse align-end'"
    >
      <div class="d-inline-flex flex-column" :class="item.action == 1 ? 'align-start' : 'align-end'">
        <MessageCard :message="item" @imageload="handleImageLoad" />
      </div>
    </div>
  </VInfiniteScroll>
</template>
