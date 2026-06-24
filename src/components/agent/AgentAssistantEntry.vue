<script setup lang="ts">
import {
  onAgentAssistantNotificationBubble,
  type AgentAssistantNotificationBubblePayload,
} from '@/utils/agentAssistantBubble'
import { useI18n } from 'vue-i18n'

type AgentAssistantEntryBubbleKind = 'assistant' | 'custom' | 'notification'

interface AgentAssistantEntryBubble {
  id: string
  kind: AgentAssistantEntryBubbleKind
  title?: string
  text: string
  keepOpen?: boolean
}

interface AgentAssistantEntryBubbleInput {
  id?: string
  kind?: AgentAssistantEntryBubbleKind
  title?: string
  text: string
  autoClose?: boolean
  duration?: number
  keepOpen?: boolean
}

const props = withDefaults(
  defineProps<{
    active?: boolean
    thinking?: boolean
  }>(),
  {
    active: true,
    thinking: false,
  },
)

const emit = defineEmits<{
  open: []
}>()

const { t } = useI18n()

const FAB_IDLE_DOCK_DELAY = 4200
const FAB_RIGHT_EDGE_DOCK_DISTANCE = 88
const FAB_NOTIFICATION_BUBBLE_DURATION = 7000
const FAB_MAX_BUBBLES = 4
const FAB_DEFAULT_RIGHT_OFFSET = 18
const FAB_DEFAULT_VERTICAL_RATIO = 2 / 3
const FAB_RANDOM_ACTION_MIN_DELAY = 8000
const FAB_RANDOM_ACTION_MAX_DELAY = 18000

const FAB_RANDOM_ACTIONS = ['wave', 'sit', 'eye-roll', 'faint', 'disassemble'] as const

type FabRandomAction = (typeof FAB_RANDOM_ACTIONS)[number]

const FAB_RANDOM_ACTION_DURATIONS: Record<FabRandomAction, number> = {
  wave: 2300,
  sit: 4200,
  'eye-roll': 1900,
  faint: 4800,
  disassemble: 6200,
}

// 入口位置只保存在当前页面生命周期内，刷新后回到默认位置。
interface FabPosition {
  x: number
  y: number
}

interface FabInteractiveBounds {
  height: number
  offsetX: number
  offsetY: number
  rootHeight: number
  rootWidth: number
  width: number
}

interface FabDragState {
  pointerId: number
  startClientX: number
  startClientY: number
  startX: number
  startY: number
  moved: boolean
}

interface FabPointerPoint {
  clientX: number
  clientY: number
}

const fabDocked = ref(false)
const fabPosition = ref<FabPosition | null>(null)
const fabPointerStyle = ref({
  '--agent-assistant-body-x': '0px',
  '--agent-assistant-body-y': '0px',
  '--agent-assistant-eye-x': '0px',
  '--agent-assistant-eye-y': '0px',
  '--agent-assistant-head-x': '0px',
  '--agent-assistant-head-y': '0px',
  '--agent-assistant-pointer-x': '0px',
  '--agent-assistant-pointer-y': '0px',
  '--agent-assistant-robot-tilt': '0deg',
})
const fabPositionStyle = computed(() => {
  const position = fabPosition.value || getDefaultFabPosition()

  return {
    ...fabPointerStyle.value,
    '--agent-assistant-fab-x': `${position.x}px`,
    '--agent-assistant-fab-y': `${position.y}px`,
  }
})
const fabPressed = ref(false)
const fabBubbles = ref<AgentAssistantEntryBubble[]>([])
const fabDragging = ref(false)
const fabRandomAction = ref<FabRandomAction | null>(null)

let fabIdleTimer: number | null = null
let fabDragState: FabDragState | null = null
let fabSuppressNextClick = false
let fabPointerFrame = 0
let fabPendingPointerPoint: FabPointerPoint | null = null
let fabLastRandomAction: FabRandomAction | null = null
let fabRandomActionTimer: number | null = null
let fabRandomActionEndTimer: number | null = null
let stopNotificationBubbleListener: (() => void) | null = null

const fabBubbleTimers = new Map<string, number>()

const hasFabBubbles = computed(() => fabBubbles.value.length > 0)
const hasKeepOpenFabBubbles = computed(() => fabBubbles.value.some(item => item.keepOpen))

function createBubbleId(prefix = 'bubble') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getViewportSize() {
  return {
    height: window.innerHeight || document.documentElement.clientHeight || 0,
    width: window.innerWidth || document.documentElement.clientWidth || 0,
  }
}

function getOpenFabSize() {
  const viewport = getViewportSize()
  const isMobile = viewport.width <= 600

  return {
    height: isMobile ? 106 : 115,
    width: isMobile ? Math.min(198, Math.max(0, viewport.width - 16)) : 211,
  }
}

function getFallbackFabInteractiveBounds(): FabInteractiveBounds {
  const viewport = getViewportSize()
  const rootSize = getOpenFabSize()
  const triggerSize = viewport.width <= 600 ? { height: 77, width: 80 } : { height: 82, width: 86 }

  return {
    height: triggerSize.height,
    offsetX: rootSize.width - triggerSize.width,
    offsetY: rootSize.height - triggerSize.height,
    rootHeight: rootSize.height,
    rootWidth: rootSize.width,
    width: triggerSize.width,
  }
}

function getDockedFabX() {
  return Math.max(0, getViewportSize().width - 42)
}

function getFabInteractiveBounds(): FabInteractiveBounds {
  const root = document.querySelector('.agent-assistant-fab') as HTMLElement | null
  const trigger = root?.querySelector('.agent-assistant-fab__trigger') as HTMLElement | null
  const rootRect = root?.getBoundingClientRect()
  const triggerRect = trigger?.getBoundingClientRect()

  // 拖拽边界按实际机器人热区计算，避免外层气泡容器的空白区域阻止贴边。
  if (rootRect && triggerRect && triggerRect.width > 0 && triggerRect.height > 0) {
    return {
      height: triggerRect.height,
      offsetX: triggerRect.left - rootRect.left,
      offsetY: triggerRect.top - rootRect.top,
      rootHeight: rootRect.height,
      rootWidth: rootRect.width,
      width: triggerRect.width,
    }
  }

  return getFallbackFabInteractiveBounds()
}

function getFabSize() {
  const root = document.querySelector('.agent-assistant-fab') as HTMLElement | null
  const rect = root?.getBoundingClientRect()

  return {
    height: rect?.height || 115,
    width: rect?.width || 211,
  }
}

function getDefaultFabPosition() {
  if (typeof window === 'undefined') return { x: 0, y: 0 }

  const viewport = getViewportSize()
  const size = getOpenFabSize()

  // 默认落点放在视窗约 2/3 高度，避开页面底部 FAB 和移动端底部导航。
  return clampFabPosition({
    x: viewport.width - size.width - FAB_DEFAULT_RIGHT_OFFSET,
    y: Math.round(viewport.height * FAB_DEFAULT_VERTICAL_RATIO - size.height / 2),
  })
}

function clampFabPosition(position: FabPosition) {
  if (typeof window === 'undefined') return position

  const viewport = getViewportSize()
  const bounds = getFabInteractiveBounds()
  const minX = -bounds.offsetX
  const minY = -bounds.offsetY
  const maxX = Math.max(minX, viewport.width - bounds.offsetX - bounds.width)
  const maxY = Math.max(minY, viewport.height - bounds.offsetY - bounds.height)

  return {
    x: Math.min(maxX, Math.max(minX, position.x)),
    y: Math.min(maxY, Math.max(minY, position.y)),
  }
}

function getCurrentFabPosition() {
  return fabPosition.value || getDefaultFabPosition()
}

function isFabNearRightEdge(position = getCurrentFabPosition()) {
  const viewport = getViewportSize()
  const size = getFabSize()

  return viewport.width - (position.x + size.width) <= FAB_RIGHT_EDGE_DOCK_DISTANCE
}

function updateFabPosition(position: FabPosition) {
  fabPosition.value = clampFabPosition(position)
}

// 将数值限制在指定范围内，避免指针和随机动作计算产生过大的位移。
function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function resetFabPosition() {
  fabPosition.value = getDefaultFabPosition()
  if (isFabNearRightEdge()) scheduleFabAutoDock()
}

function handleWindowResize() {
  updateFabPosition(getCurrentFabPosition())
  if (fabDocked.value && isFabNearRightEdge()) {
    fabPosition.value = {
      ...getCurrentFabPosition(),
      x: getDockedFabX(),
    }
  }
}

function stripMarkdownPreview(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// 根据页面坐标更新机器人注视方向，即使指针不在机器人热区内也能跟随。
function updateFabPointerFromPoint(point: FabPointerPoint) {
  const face = document.querySelector('.agent-assistant-fab__face') as HTMLElement | null
  const bot = document.querySelector('.agent-assistant-fab__bot') as HTMLElement | null
  const rect = face?.getBoundingClientRect() || bot?.getBoundingClientRect()

  if (!rect || rect.width <= 0 || rect.height <= 0) return

  const viewport = getViewportSize()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const normalizedX = clampNumber((point.clientX - centerX) / Math.max(96, viewport.width * 0.26), -1, 1)
  const normalizedY = clampNumber((point.clientY - centerY) / Math.max(72, viewport.height * 0.22), -1, 1)

  fabPointerStyle.value = {
    '--agent-assistant-body-x': `${(normalizedX * 0.42).toFixed(2)}px`,
    '--agent-assistant-body-y': `${(normalizedY * 0.18).toFixed(2)}px`,
    '--agent-assistant-eye-x': `${(normalizedX * 5).toFixed(2)}px`,
    '--agent-assistant-eye-y': `${(normalizedY * 3.4).toFixed(2)}px`,
    '--agent-assistant-head-x': `${(normalizedX * 0.85).toFixed(2)}px`,
    '--agent-assistant-head-y': `${(normalizedY * 0.42).toFixed(2)}px`,
    '--agent-assistant-pointer-x': `${(normalizedX * 5).toFixed(2)}px`,
    '--agent-assistant-pointer-y': `${(normalizedY * 3.4).toFixed(2)}px`,
    '--agent-assistant-robot-tilt': `${(normalizedX * 2.4).toFixed(2)}deg`,
  }
}

// 使用 requestAnimationFrame 合并高频指针事件，降低全局跟随的渲染开销。
function queueFabPointerUpdate(clientX: number, clientY: number) {
  if (!props.active) return

  fabPendingPointerPoint = { clientX, clientY }
  if (fabPointerFrame) return

  fabPointerFrame = window.requestAnimationFrame(() => {
    fabPointerFrame = 0
    if (!fabPendingPointerPoint) return

    updateFabPointerFromPoint(fabPendingPointerPoint)
    fabPendingPointerPoint = null
  })
}

// 接收全局 PointerEvent，让鼠标移动和触摸按下都能驱动机器人眼神。
function handleGlobalFabPointer(event: PointerEvent) {
  queueFabPointerUpdate(event.clientX, event.clientY)
}

// 在拖拽事件中同步眼神方向，保持捕获指针后的跟随连续性。
function updateFabPointer(event: PointerEvent) {
  queueFabPointerUpdate(event.clientX, event.clientY)
}

function resetFabPointer() {
  fabPressed.value = false
  fabPointerStyle.value = {
    '--agent-assistant-body-x': '0px',
    '--agent-assistant-body-y': '0px',
    '--agent-assistant-eye-x': '0px',
    '--agent-assistant-eye-y': '0px',
    '--agent-assistant-head-x': '0px',
    '--agent-assistant-head-y': '0px',
    '--agent-assistant-pointer-x': '0px',
    '--agent-assistant-pointer-y': '0px',
    '--agent-assistant-robot-tilt': '0deg',
  }
}

function clearFabIdleTimer() {
  if (fabIdleTimer === null) return

  window.clearTimeout(fabIdleTimer)
  fabIdleTimer = null
}

function scheduleFabAutoDock() {
  clearFabIdleTimer()
  if (fabDocked.value || hasKeepOpenFabBubbles.value || fabRandomAction.value || !isFabNearRightEdge()) return

  fabIdleTimer = window.setTimeout(() => {
    if (fabRandomAction.value) {
      scheduleFabAutoDock()
      return
    }

    setFabDocked(true)
    fabIdleTimer = null
  }, FAB_IDLE_DOCK_DELAY)
}

function pauseFabAutoDock() {
  clearFabIdleTimer()
}

// 返回下一次趣味动作的随机等待时间，让动作出现节奏更自然。
function getFabRandomActionDelay() {
  return FAB_RANDOM_ACTION_MIN_DELAY + Math.round(Math.random() * (FAB_RANDOM_ACTION_MAX_DELAY - FAB_RANDOM_ACTION_MIN_DELAY))
}

// 判断当前交互状态是否适合播放随机动作，避免干扰半隐藏、拖拽和思考态。
function canRunFabRandomAction() {
  return props.active && !fabDocked.value && !fabDragging.value && !fabPressed.value && !props.thinking
}

// 随机选择一个不同于上一次的趣味动作，减少连续重复带来的机械感。
function pickFabRandomAction(): FabRandomAction {
  const candidates = FAB_RANDOM_ACTIONS.filter(action => action !== fabLastRandomAction)
  const action = candidates[Math.floor(Math.random() * candidates.length)] || FAB_RANDOM_ACTIONS[0]

  fabLastRandomAction = action
  return action
}

// 清理等待中的随机动作计时器。
function clearFabRandomActionTimer() {
  if (fabRandomActionTimer === null) return

  window.clearTimeout(fabRandomActionTimer)
  fabRandomActionTimer = null
}

// 清理正在播放动作的结束计时器。
function clearFabRandomActionEndTimer() {
  if (fabRandomActionEndTimer === null) return

  window.clearTimeout(fabRandomActionEndTimer)
  fabRandomActionEndTimer = null
}

// 停止当前随机动作并清理相关计时器。
function clearFabRandomAction() {
  clearFabRandomActionTimer()
  clearFabRandomActionEndTimer()
  fabRandomAction.value = null
}

// 安排下一次随机动作，只在机器人完全可见且空闲时生效。
function scheduleFabRandomAction() {
  clearFabRandomActionTimer()
  if (!canRunFabRandomAction() || fabRandomAction.value || fabRandomActionEndTimer !== null) return

  fabRandomActionTimer = window.setTimeout(() => {
    fabRandomActionTimer = null
    runFabRandomAction()
  }, getFabRandomActionDelay())
}

// 完成当前随机动作后恢复空闲态，并继续排队下一次动作。
function finishFabRandomAction() {
  clearFabRandomActionEndTimer()
  fabRandomAction.value = null

  const shouldAutoDock = !fabDocked.value && isFabNearRightEdge()

  if (shouldAutoDock) {
    scheduleFabAutoDock()
    return
  }

  scheduleFabRandomAction()
}

// 播放一个随机趣味动作，动作期间由 CSS 类驱动部件动画。
function runFabRandomAction() {
  if (!canRunFabRandomAction()) return

  const action = pickFabRandomAction()

  fabRandomAction.value = action
  fabRandomActionEndTimer = window.setTimeout(finishFabRandomAction, FAB_RANDOM_ACTION_DURATIONS[action])
}

// 根据当前显示和交互状态同步随机动作队列。
function syncFabRandomActionSchedule() {
  if (canRunFabRandomAction()) {
    if (!fabRandomAction.value && fabRandomActionTimer === null && fabRandomActionEndTimer === null) scheduleFabRandomAction()
    return
  }

  clearFabRandomAction()
}

// 取消挂起的全局指针帧并移除监听器。
function teardownFabPointerTracking() {
  if (fabPointerFrame) {
    window.cancelAnimationFrame(fabPointerFrame)
    fabPointerFrame = 0
  }

  fabPendingPointerPoint = null
  window.removeEventListener('pointermove', handleGlobalFabPointer)
  window.removeEventListener('pointerdown', handleGlobalFabPointer)
}

function buildNotificationBubbleTitle(payload: AgentAssistantNotificationBubblePayload) {
  return payload.title || payload.source || payload.mtype || t('notification.center')
}

function buildNotificationBubbleText(payload: AgentAssistantNotificationBubblePayload) {
  return stripMarkdownPreview(payload.text || payload.title || payload.source || payload.mtype || '')
}

function clearFabBubbleTimer(id: string) {
  const timer = fabBubbleTimers.get(id)
  if (!timer) return

  window.clearTimeout(timer)
  fabBubbleTimers.delete(id)
}

function scheduleFabBubbleRemoval(id: string, duration = FAB_NOTIFICATION_BUBBLE_DURATION) {
  clearFabBubbleTimer(id)
  fabBubbleTimers.set(
    id,
    window.setTimeout(() => {
      closeBubble(id)
    }, duration),
  )
}

function upsertFabBubble(bubble: AgentAssistantEntryBubble, options: { autoClose?: boolean; duration?: number } = {}) {
  if (!props.active || !bubble.text) return

  const existingBubbles = fabBubbles.value.filter(item => item.id !== bubble.id)
  fabBubbles.value = [bubble, ...existingBubbles].slice(0, FAB_MAX_BUBBLES)

  // 超出堆叠上限的气泡需要同步清理计时器，避免后续 timer 访问过期项。
  const visibleIds = new Set(fabBubbles.value.map(item => item.id))
  ;[...fabBubbleTimers.keys()].forEach(id => {
    if (!visibleIds.has(id)) clearFabBubbleTimer(id)
  })

  if (options.autoClose) scheduleFabBubbleRemoval(bubble.id, options.duration)
  setFabDocked(false)
}

function showBubble(input: AgentAssistantEntryBubbleInput) {
  const text = stripMarkdownPreview(input.text)
  if (!text) return

  upsertFabBubble(
    {
      id: input.id || createBubbleId(input.kind || 'custom'),
      kind: input.kind || 'custom',
      title: input.title,
      text,
      keepOpen: input.keepOpen,
    },
    {
      autoClose: input.autoClose,
      duration: input.duration,
    },
  )
}

function showAssistantReplyPreview(value: string) {
  showBubble({
    id: 'assistant-preview',
    kind: 'assistant',
    text: value,
  })
}

function showNotificationBubble(payload: AgentAssistantNotificationBubblePayload) {
  const text = buildNotificationBubbleText(payload)
  if (!text) return

  showBubble({
    id: payload.id,
    kind: 'notification',
    title: buildNotificationBubbleTitle(payload),
    text,
    autoClose: true,
    keepOpen: true,
  })
}

function closeBubble(id?: string) {
  if (id) {
    clearFabBubbleTimer(id)
    fabBubbles.value = fabBubbles.value.filter(item => item.id !== id)
  } else {
    fabBubbles.value.forEach(item => clearFabBubbleTimer(item.id))
    fabBubbles.value = []
  }

  if (!hasKeepOpenFabBubbles.value) scheduleFabAutoDock()
}

function clearBubbles() {
  closeBubble()
}

function resetFabBubbles() {
  fabBubbles.value.forEach(item => clearFabBubbleTimer(item.id))
  fabBubbles.value = []
}

function setFabDocked(docked: boolean) {
  const currentPosition = getCurrentFabPosition()

  fabDocked.value = docked
  fabPressed.value = false

  if (docked) {
    clearFabIdleTimer()
    fabPosition.value = {
      ...currentPosition,
      x: getDockedFabX(),
    }
    return
  }

  updateFabPosition({
    ...currentPosition,
    x: Math.min(currentPosition.x, Math.max(0, getViewportSize().width - getOpenFabSize().width - FAB_DEFAULT_RIGHT_OFFSET)),
  })
  scheduleFabAutoDock()
}

function handleFabTriggerPointerDown(event: PointerEvent) {
  fabPressed.value = true
  pauseFabAutoDock()

  const currentPosition = getCurrentFabPosition()
  fabDragState = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: currentPosition.x,
    startY: currentPosition.y,
    moved: false,
  }

  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function handleFabTriggerPointerMove(event: PointerEvent) {
  updateFabPointer(event)
  if (!fabDragState || fabDragState.pointerId !== event.pointerId) return

  const deltaX = event.clientX - fabDragState.startClientX
  const deltaY = event.clientY - fabDragState.startClientY
  const movedDistance = Math.hypot(deltaX, deltaY)

  if (movedDistance < 4 && !fabDragState.moved) return

  fabDragState.moved = true
  fabDragging.value = true
  fabSuppressNextClick = true
  fabDocked.value = false
  updateFabPosition({
    x: fabDragState.startX + deltaX,
    y: fabDragState.startY + deltaY,
  })
}

function handleFabTriggerPointerUp(event: PointerEvent) {
  fabPressed.value = false
  const wasDragging = fabDragging.value

  fabDragging.value = false
  fabDragState = null
  ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)

  if (!wasDragging) {
    scheduleFabAutoDock()
    return
  }

  if (isFabNearRightEdge()) {
    scheduleFabAutoDock()
  } else {
    clearFabIdleTimer()
    fabDocked.value = false
  }
}

function handleFabTriggerClick() {
  if (fabSuppressNextClick) {
    fabSuppressNextClick = false
    return
  }

  if (fabDocked.value) {
    setFabDocked(false)
    return
  }

  clearBubbles()
  emit('open')
}

function handleFabPointerLeave() {
  if (!fabDocked.value && isFabNearRightEdge()) scheduleFabAutoDock()
}

function handleFabPointerEnter() {
  pauseFabAutoDock()
}

onMounted(() => {
  nextTick(resetFabPosition)
  window.addEventListener('resize', handleWindowResize)
  window.addEventListener('pointermove', handleGlobalFabPointer, { passive: true })
  window.addEventListener('pointerdown', handleGlobalFabPointer, { passive: true })
  stopNotificationBubbleListener = onAgentAssistantNotificationBubble(showNotificationBubble)
  scheduleFabRandomAction()
})

watch(
  () => props.active,
  active => {
    if (active) {
      if (isFabNearRightEdge()) scheduleFabAutoDock()
      return
    }

    clearBubbles()
    clearFabIdleTimer()
    clearFabRandomAction()
    resetFabPointer()
  },
)

watch([() => props.active, () => props.thinking, fabDocked, fabDragging, fabPressed], syncFabRandomActionSchedule)

onScopeDispose(clearFabIdleTimer)
onScopeDispose(clearFabRandomAction)
onScopeDispose(resetFabBubbles)
onScopeDispose(() => {
  stopNotificationBubbleListener?.()
  stopNotificationBubbleListener = null
  window.removeEventListener('resize', handleWindowResize)
  teardownFabPointerTracking()
})

defineExpose({
  clearBubbles,
  closeBubble,
  setDocked: setFabDocked,
  showAssistantReplyPreview,
  showBubble,
  showNotificationBubble,
})
</script>

<template>
  <div
    v-show="props.active"
    class="agent-assistant-fab"
    :class="{
      'is-docked': fabDocked,
      'is-dragging': fabDragging,
      'is-pressed': fabPressed,
      'is-thinking': props.thinking,
      'is-bubble-visible': hasFabBubbles,
      [`is-action-${fabRandomAction}`]: fabRandomAction,
    }"
    :style="fabPositionStyle"
    @pointermove="updateFabPointer"
    @pointerenter="handleFabPointerEnter"
    @pointerleave="handleFabPointerLeave"
  >
    <div v-if="hasFabBubbles" class="agent-assistant-fab__bubbles" aria-live="polite">
      <div
        v-for="bubble in fabBubbles"
        :key="bubble.id"
        class="agent-assistant-fab__bubble"
        :class="`agent-assistant-fab__bubble--${bubble.kind}`"
        role="status"
      >
        <strong v-if="bubble.title">{{ bubble.title }}</strong>
        <span>{{ bubble.text }}</span>
        <button
          class="agent-assistant-fab__bubble-close"
          type="button"
          :aria-label="t('common.close')"
          :title="t('common.close')"
          @click.stop="closeBubble(bubble.id)"
        >
          <VIcon icon="mdi-close" size="14" />
        </button>
      </div>
    </div>

    <button
      class="agent-assistant-fab__trigger"
      type="button"
      :aria-label="t('agentAssistant.title')"
      :title="t('agentAssistant.title')"
      @pointerdown="handleFabTriggerPointerDown"
      @pointermove="handleFabTriggerPointerMove"
      @pointerup="handleFabTriggerPointerUp"
      @pointercancel="handleFabTriggerPointerUp"
      @click="handleFabTriggerClick"
    >
      <span class="agent-assistant-fab__bot" aria-hidden="true">
        <span class="agent-assistant-fab__antenna" />
        <span class="agent-assistant-fab__head">
          <span class="agent-assistant-fab__face">
            <span class="agent-assistant-fab__eye agent-assistant-fab__eye--left" />
            <span class="agent-assistant-fab__eye agent-assistant-fab__eye--right" />
          </span>
        </span>
        <span class="agent-assistant-fab__body">
          <span class="agent-assistant-fab__core" />
        </span>
        <span class="agent-assistant-fab__arm agent-assistant-fab__arm--left" />
        <span class="agent-assistant-fab__arm agent-assistant-fab__arm--right" />
        <span class="agent-assistant-fab__leg agent-assistant-fab__leg--left" />
        <span class="agent-assistant-fab__leg agent-assistant-fab__leg--right" />
      </span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
/* stylelint-disable no-descending-specificity */

.agent-assistant-fab {
  position: fixed;

  /* 保持高于菜单浮层，但低于 agent 会话面板（2101）。 */
  z-index: 2100;

  --agent-assistant-robot-outline: #5b00c5;
  --agent-assistant-robot-outline-soft: #7432df;
  --agent-assistant-robot-shell-start: #d3bbff;
  --agent-assistant-robot-shell-mid: #a576ff;
  --agent-assistant-robot-shell-end: #8d51f9;
  --agent-assistant-robot-face-start: #24124e;
  --agent-assistant-robot-face-end: #100525;
  --agent-assistant-robot-eye: #f1dcff;
  --agent-assistant-robot-play: #fff;
  --agent-assistant-robot-shadow: rgba(54, 0, 126, 28%);
  --agent-assistant-robot-shadow-strong: rgba(54, 0, 126, 34%);
  --agent-assistant-bot-scale: 1;
  --agent-assistant-bot-pressed-scale: 0.96;
  --agent-assistant-fab-x: calc(100vw - 14.3rem);
  --agent-assistant-fab-y: calc(100vh - 13.2rem);

  block-size: 7.2rem;
  inline-size: 13.2rem;
  inset-block-start: 0;
  inset-inline-start: 0;
  pointer-events: none;
  transform: translate3d(var(--agent-assistant-fab-x), var(--agent-assistant-fab-y), 0);
  transition:
    inline-size 0.24s ease,
    transform 0.24s ease;
  user-select: none;
}

.agent-assistant-fab.is-docked {
  inline-size: 3.85rem;
}

.agent-assistant-fab.is-dragging {
  transition: none;
}

.agent-assistant-fab__trigger {
  position: absolute;
  display: block;
  padding: 0;
  border: 0;
  background: transparent;
  block-size: 5.1rem;
  color: inherit;
  cursor: pointer;
  inline-size: 5.4rem;
  inset-block: auto 0;
  inset-inline: auto 0;
  pointer-events: auto;
  text-align: start;
  touch-action: none;
}

.agent-assistant-fab.is-dragging .agent-assistant-fab__trigger {
  cursor: grabbing;
}

.agent-assistant-fab__trigger::after {
  position: absolute;
  z-index: 1;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.14);
  block-size: 3.2rem;
  content: '';
  inline-size: 0.18rem;
  inset-block-end: 0.95rem;
  inset-inline-end: 0.32rem;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.agent-assistant-fab.is-docked .agent-assistant-fab__trigger::after {
  opacity: 1;
}

.agent-assistant-fab__bubbles {
  position: absolute;
  display: grid;
  overflow: visible;
  gap: 0.45rem;
  inline-size: 13.2rem;
  inset-block-end: 4.45rem;
  inset-inline-end: 2.75rem;
  max-block-size: min(22rem, calc(100vh - 8rem));
  max-inline-size: calc(100vw - 6.4rem);
  opacity: 0;
  pointer-events: none;
  transform: translateY(0.22rem) scale(0.96);
  transform-origin: 100% 100%;
  transition:
    opacity 0.2s ease,
    transform 0.24s ease;
}

.agent-assistant-fab__bubble {
  position: relative;
  display: grid;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 18px;
  backdrop-filter: blur(12px);
  background: rgba(var(--v-theme-surface), 0.92);
  box-shadow: var(--app-surface-shadow);
  padding-block: 0.7rem;
  padding-inline: 0.85rem 1.85rem;
  pointer-events: auto;
}

.agent-assistant-fab__bubble--notification {
  border-color: rgba(var(--v-theme-primary), 0.22);
  background:
    linear-gradient(135deg, rgba(var(--v-theme-primary), 0.1), transparent 48%), rgba(var(--v-theme-surface), 0.94);
}

.agent-assistant-fab__bubble strong {
  overflow: hidden;
  color: rgba(var(--v-theme-primary), 0.92);
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.25;
  margin-block-end: 0.22rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-assistant-fab__bubble span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 0.78rem;
  font-weight: 600;
  -webkit-line-clamp: 4;
  line-height: 1.42;
  text-align: start;
  white-space: normal;
}

.agent-assistant-fab__bubble::before {
  position: absolute;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: inherit;
  block-size: 0.62rem;
  border-block-start: 0;
  border-inline-start: 0;
  content: '';
  inline-size: 0.62rem;
  inset-block-end: -0.34rem;
  inset-inline-end: 1.85rem;
  transform: rotate(45deg);
}

.agent-assistant-fab__bubble-close {
  position: absolute;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  block-size: 1.25rem;
  color: rgba(var(--v-theme-on-surface), 0.58) !important;
  cursor: pointer;
  inline-size: 1.25rem;
  inset-block-start: 0.34rem;
  inset-inline-end: 0.34rem;
  opacity: 0;
  pointer-events: auto;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    opacity 0.18s ease;
}

.agent-assistant-fab__bubble:hover .agent-assistant-fab__bubble-close,
.agent-assistant-fab__bubble-close:focus-visible {
  opacity: 1;
}

.agent-assistant-fab__bubble-close:hover {
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.86) !important;
}

.agent-assistant-fab.is-bubble-visible:not(.is-docked) .agent-assistant-fab__bubble {
  pointer-events: auto;
}

.agent-assistant-fab.is-bubble-visible:not(.is-docked) .agent-assistant-fab__bubbles {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}

.agent-assistant-fab.is-docked .agent-assistant-fab__bubbles {
  opacity: 0;
  pointer-events: none;
  transform: translateX(1.4rem) scale(0.9);
}

.agent-assistant-fab__bot,
.agent-assistant-fab__bot span {
  box-sizing: border-box;
}

.agent-assistant-fab__bot {
  position: absolute;
  display: block;
  block-size: 4.7rem;
  filter: drop-shadow(0 0.55rem 0.55rem var(--agent-assistant-robot-shadow));
  inline-size: 3.85rem;
  inset-block-end: 0.1rem;
  inset-inline-end: 1.42rem;
  transform: scale(var(--agent-assistant-bot-scale)) rotate(var(--agent-assistant-robot-tilt));
  transform-origin: 50% 72%;
  transition:
    inset-inline-end 0.24s ease,
    filter 0.18s ease,
    transform 0.14s ease;
}

.agent-assistant-fab__antenna {
  position: absolute;
  z-index: 3;
  display: block;
  border-radius: 999px;
  background: var(--agent-assistant-robot-outline);
  block-size: 0.66rem;
  inline-size: 0.18rem;
  inset-block-start: 0.72rem;
  inset-inline-start: 2.62rem;
  animation: agent-fab-antenna-idle 3.9s ease-in-out infinite;
  transform: translate(var(--agent-assistant-head-x), var(--agent-assistant-head-y)) rotate(22deg);
  transform-origin: bottom center;
  transition:
    opacity 0.2s ease,
    transform 0.22s ease;
}

.agent-assistant-fab__antenna::after {
  position: absolute;
  border: 2px solid var(--agent-assistant-robot-outline);
  border-radius: 999px;
  background: var(--agent-assistant-robot-shell-start);
  block-size: 0.38rem;
  content: '';
  inline-size: 0.38rem;
  inset-block-start: -0.34rem;
  inset-inline-start: -0.13rem;
}

.agent-assistant-fab__head {
  position: absolute;
  z-index: 4;
  display: block;
  border: 2px solid var(--agent-assistant-robot-outline);
  border-radius: 11px;
  background: linear-gradient(
    145deg,
    var(--agent-assistant-robot-shell-start) 0%,
    var(--agent-assistant-robot-shell-end) 100%
  );
  block-size: 2.05rem;
  box-shadow:
    inset 0 -0.2rem 0 rgba(54, 0, 126, 26%),
    inset 0.15rem 0.14rem 0 rgba(255, 255, 255, 24%);
  inline-size: 2.82rem;
  inset-block-start: 1.42rem;
  inset-inline-start: 0.88rem;
  animation: agent-fab-head-idle 4.6s ease-in-out infinite;
  transform: translate(var(--agent-assistant-head-x), var(--agent-assistant-head-y));
  transform-origin: 50% 85%;
}

.agent-assistant-fab__face {
  position: absolute;
  display: block;
  border: 2px solid var(--agent-assistant-robot-outline-soft);
  border-radius: 8px;
  background: linear-gradient(
    180deg,
    var(--agent-assistant-robot-face-start) 0%,
    var(--agent-assistant-robot-face-end) 100%
  );
  block-size: 1.28rem;
  box-shadow: inset 0 0.1rem 0 rgba(255, 255, 255, 8%);
  inline-size: 2.1rem;
  inset-block-start: 0.33rem;
  inset-inline-start: 0.25rem;
  overflow: hidden;
}

.agent-assistant-fab__eye {
  position: absolute;
  display: block;
  border-radius: 0 0 999px 999px;
  animation: agent-fab-blink 4.8s ease-in-out infinite;
  block-size: 0.42rem;
  border-block-end: 0.15rem solid var(--agent-assistant-robot-eye);
  inline-size: 0.42rem;
  inset-block-start: 0.36rem;
  transform: translate(var(--agent-assistant-eye-x), var(--agent-assistant-eye-y));
  /* 触屏设备没有连续 hover 轨迹，给眼神位移补过渡避免点按时瞬移。 */
  transition: transform 0.2s ease-out;
}

.agent-assistant-fab__eye--left {
  inset-inline-start: 0.43rem;
}

.agent-assistant-fab__eye--right {
  inset-inline-end: 0.43rem;
}

.agent-assistant-fab__body {
  position: absolute;
  z-index: 3;
  display: block;
  border: 2px solid var(--agent-assistant-robot-outline);
  border-radius: 0.65rem 0.65rem 0.55rem 0.55rem;
  background: linear-gradient(
    145deg,
    var(--agent-assistant-robot-shell-mid) 0%,
    var(--agent-assistant-robot-shell-end) 82%
  );
  block-size: 1.34rem;
  box-shadow:
    inset 0 -0.18rem 0 rgba(54, 0, 126, 24%),
    inset 0.16rem 0.12rem 0 rgba(255, 255, 255, 24%);
  inline-size: 1.88rem;
  inset-block-start: 3.24rem;
  inset-inline-start: 1.32rem;
  animation: agent-fab-body-idle 4.2s ease-in-out infinite;
  transform: translate(var(--agent-assistant-body-x), var(--agent-assistant-body-y));
  transform-origin: 50% 18%;
  transition:
    opacity 0.2s ease,
    transform 0.22s ease;
}

.agent-assistant-fab__core {
  position: absolute;
  display: block;
  background: transparent;
  block-size: 100%;
  box-shadow: none;
  inline-size: 100%;
  inset: 0;
  pointer-events: none;
}

.agent-assistant-fab__core::before {
  position: absolute;
  background: var(--agent-assistant-robot-play);
  block-size: 0.46rem;
  clip-path: polygon(18% 8%, 18% 92%, 90% 50%);
  content: '';
  inline-size: 0.48rem;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  transform: translate(-42%, -50%);
}

.agent-assistant-fab__arm,
.agent-assistant-fab__leg {
  position: absolute;
  z-index: 2;
  display: block;
  border: 2px solid var(--agent-assistant-robot-outline);
  background: linear-gradient(
    160deg,
    var(--agent-assistant-robot-shell-mid) 0%,
    var(--agent-assistant-robot-outline-soft) 100%
  );
  box-shadow: inset 0 -0.12rem 0 rgba(54, 0, 126, 24%);
  transition:
    opacity 0.2s ease,
    transform 0.22s ease;
}

.agent-assistant-fab__arm {
  border-radius: 999px;
  block-size: 1rem;
  inline-size: 0.46rem;
  inset-block-start: 3.3rem;
}

.agent-assistant-fab__arm--left {
  animation: agent-fab-arm-left-idle 3.8s ease-in-out infinite;
  inset-inline-start: 0.9rem;
  transform: rotate(17deg);
  transform-origin: top center;
}

.agent-assistant-fab__arm--right {
  animation: agent-fab-arm-right-idle 4.1s ease-in-out infinite;
  inset-inline-start: 3.08rem;
  transform: rotate(-17deg);
  transform-origin: top center;
}

.agent-assistant-fab__leg {
  border-radius: 0.35rem;
  block-size: 0.66rem;
  inline-size: 0.48rem;
  inset-block-start: 4.36rem;
}

.agent-assistant-fab__leg--left {
  animation: agent-fab-leg-left-idle 4.8s ease-in-out infinite;
  inset-inline-start: 1.48rem;
  transform-origin: top center;
}

.agent-assistant-fab__leg--right {
  animation: agent-fab-leg-right-idle 4.8s ease-in-out 0.35s infinite;
  inset-inline-start: 2.46rem;
  transform-origin: top center;
}

.agent-assistant-fab.is-bubble-visible .agent-assistant-fab__bubble:hover {
  box-shadow: var(--app-surface-hover-shadow);
}

.agent-assistant-fab__trigger:hover .agent-assistant-fab__bot {
  filter: drop-shadow(0 0.7rem 0.7rem var(--agent-assistant-robot-shadow-strong));
}

.agent-assistant-fab.is-pressed .agent-assistant-fab__bot {
  transform: translateY(0.22rem) scale(var(--agent-assistant-bot-pressed-scale))
    rotate(var(--agent-assistant-robot-tilt));
}

.agent-assistant-fab.is-thinking .agent-assistant-fab__face {
  box-shadow:
    inset 0 0.1rem 0 rgba(255, 255, 255, 8%),
    0 0 0.65rem rgba(114, 255, 240, 50%);
}

.agent-assistant-fab.is-thinking .agent-assistant-fab__core {
  animation: agent-fab-core-pulse 0.9s ease-in-out infinite;
}

.agent-assistant-fab.is-docked .agent-assistant-fab__bot {
  inset-inline-end: -0.42rem;
  transform: translateY(-0.2rem) scale(var(--agent-assistant-bot-scale)) rotate(-19deg);
}

.agent-assistant-fab.is-docked .agent-assistant-fab__eye {
  transform: translate(
    calc(var(--agent-assistant-eye-x) * 0.24 - 0.22rem),
    calc(var(--agent-assistant-eye-y) * 0.24)
  );
}

.agent-assistant-fab.is-docked .agent-assistant-fab__body,
.agent-assistant-fab.is-docked .agent-assistant-fab__leg {
  opacity: 0;
  transform: translateX(0.8rem) scale(0.72);
}

.agent-assistant-fab.is-docked .agent-assistant-fab__arm--left,
.agent-assistant-fab.is-docked .agent-assistant-fab__arm--right {
  animation: none;
  opacity: 0;
  transform: translateX(0.8rem) scale(0.72);
}

.agent-assistant-fab.is-docked .agent-assistant-fab__arm--left {
  z-index: 5;
  block-size: 0.95rem;
  inline-size: 0.42rem;
  inset-block-start: 3.62rem;
  inset-inline-start: 1.86rem;
  opacity: 1;
  transform: rotate(78deg) scale(0.9);
}

.agent-assistant-fab.is-docked .agent-assistant-fab__antenna {
  animation: none;
  opacity: 0.75;
  transform: translate(0.34rem, 0.02rem) rotate(2deg) scale(0.82);
}

.agent-assistant-fab.is-action-wave .agent-assistant-fab__antenna,
.agent-assistant-fab.is-action-sit .agent-assistant-fab__antenna,
.agent-assistant-fab.is-action-eye-roll .agent-assistant-fab__antenna,
.agent-assistant-fab.is-action-faint .agent-assistant-fab__antenna,
.agent-assistant-fab.is-action-disassemble .agent-assistant-fab__antenna,
.agent-assistant-fab.is-action-wave .agent-assistant-fab__head,
.agent-assistant-fab.is-action-sit .agent-assistant-fab__head,
.agent-assistant-fab.is-action-eye-roll .agent-assistant-fab__head,
.agent-assistant-fab.is-action-faint .agent-assistant-fab__head,
.agent-assistant-fab.is-action-disassemble .agent-assistant-fab__head,
.agent-assistant-fab.is-action-wave .agent-assistant-fab__body,
.agent-assistant-fab.is-action-sit .agent-assistant-fab__body,
.agent-assistant-fab.is-action-eye-roll .agent-assistant-fab__body,
.agent-assistant-fab.is-action-faint .agent-assistant-fab__body,
.agent-assistant-fab.is-action-disassemble .agent-assistant-fab__body,
.agent-assistant-fab.is-action-wave .agent-assistant-fab__arm,
.agent-assistant-fab.is-action-sit .agent-assistant-fab__arm,
.agent-assistant-fab.is-action-eye-roll .agent-assistant-fab__arm,
.agent-assistant-fab.is-action-faint .agent-assistant-fab__arm,
.agent-assistant-fab.is-action-disassemble .agent-assistant-fab__arm,
.agent-assistant-fab.is-action-wave .agent-assistant-fab__leg,
.agent-assistant-fab.is-action-sit .agent-assistant-fab__leg,
.agent-assistant-fab.is-action-eye-roll .agent-assistant-fab__leg,
.agent-assistant-fab.is-action-faint .agent-assistant-fab__leg,
.agent-assistant-fab.is-action-disassemble .agent-assistant-fab__leg {
  transition: none;
}

.agent-assistant-fab.is-action-wave .agent-assistant-fab__bot {
  animation: agent-fab-action-wave-bot 2.3s ease-in-out both;
}

.agent-assistant-fab.is-action-wave .agent-assistant-fab__head {
  animation: agent-fab-action-wave-head 2.3s ease-in-out both;
}

.agent-assistant-fab.is-action-wave .agent-assistant-fab__arm--left {
  z-index: 6;
  block-size: 1.16rem;
  inset-block-start: 3.08rem;
  inset-inline-start: 0.66rem;
  animation: agent-fab-action-wave-arm-left 2.3s ease-in-out both;
  transform-origin: top center;
}

.agent-assistant-fab.is-action-wave .agent-assistant-fab__arm--right {
  animation: agent-fab-action-wave-arm-right 2.3s ease-in-out both;
}

.agent-assistant-fab.is-action-sit .agent-assistant-fab__bot {
  animation: agent-fab-action-sit-bot 4.2s ease-in-out both;
}

.agent-assistant-fab.is-action-sit .agent-assistant-fab__head {
  animation: agent-fab-action-sit-head 4.2s ease-in-out both;
}

.agent-assistant-fab.is-action-sit .agent-assistant-fab__body {
  animation: agent-fab-action-sit-body 4.2s ease-in-out both;
}

.agent-assistant-fab.is-action-sit .agent-assistant-fab__arm--left {
  animation: agent-fab-action-sit-arm-left 4.2s ease-in-out both;
}

.agent-assistant-fab.is-action-sit .agent-assistant-fab__arm--right {
  animation: agent-fab-action-sit-arm-right 4.2s ease-in-out both;
}

.agent-assistant-fab.is-action-sit .agent-assistant-fab__leg--left {
  z-index: 5;
  animation: agent-fab-action-sit-leg-left 4.2s ease-in-out both;
}

.agent-assistant-fab.is-action-sit .agent-assistant-fab__leg--right {
  z-index: 5;
  animation: agent-fab-action-sit-leg-right 4.2s ease-in-out both;
}

.agent-assistant-fab.is-action-eye-roll .agent-assistant-fab__head {
  animation: agent-fab-action-eye-roll-head 1.9s ease-in-out both;
}

.agent-assistant-fab.is-action-eye-roll .agent-assistant-fab__eye {
  animation:
    agent-fab-blink 4.8s ease-in-out infinite,
    agent-fab-action-eye-roll 0.95s ease-in-out 2;
}

.agent-assistant-fab.is-action-faint .agent-assistant-fab__bot {
  animation: agent-fab-action-faint-bot 4.8s ease-in-out both;
}

.agent-assistant-fab.is-action-faint .agent-assistant-fab__antenna {
  animation: agent-fab-action-faint-antenna 4.8s ease-in-out both;
}

.agent-assistant-fab.is-action-faint .agent-assistant-fab__head {
  animation: agent-fab-action-faint-head 4.8s ease-in-out both;
}

.agent-assistant-fab.is-action-faint .agent-assistant-fab__body {
  animation: agent-fab-action-faint-body 4.8s ease-in-out both;
}

.agent-assistant-fab.is-action-faint .agent-assistant-fab__arm--left {
  animation: agent-fab-action-faint-arm-left 4.8s ease-in-out both;
}

.agent-assistant-fab.is-action-faint .agent-assistant-fab__arm--right {
  animation: agent-fab-action-faint-arm-right 4.8s ease-in-out both;
}

.agent-assistant-fab.is-action-faint .agent-assistant-fab__leg--left {
  animation: agent-fab-action-faint-leg-left 4.8s ease-in-out both;
}

.agent-assistant-fab.is-action-faint .agent-assistant-fab__leg--right {
  animation: agent-fab-action-faint-leg-right 4.8s ease-in-out both;
}

.agent-assistant-fab.is-action-disassemble .agent-assistant-fab__bot {
  animation: agent-fab-action-disassemble-bot 6.2s ease-in-out both;
}

.agent-assistant-fab.is-action-disassemble .agent-assistant-fab__antenna {
  animation: agent-fab-action-disassemble-antenna 6.2s ease-in-out both;
}

.agent-assistant-fab.is-action-disassemble .agent-assistant-fab__head {
  animation: agent-fab-action-disassemble-head 6.2s ease-in-out both;
}

.agent-assistant-fab.is-action-disassemble .agent-assistant-fab__body {
  animation: agent-fab-action-disassemble-body 6.2s ease-in-out both;
}

.agent-assistant-fab.is-action-disassemble .agent-assistant-fab__arm--left {
  animation: agent-fab-action-disassemble-arm-left 6.2s ease-in-out both;
}

.agent-assistant-fab.is-action-disassemble .agent-assistant-fab__arm--right {
  animation: agent-fab-action-disassemble-arm-right 6.2s ease-in-out both;
}

.agent-assistant-fab.is-action-disassemble .agent-assistant-fab__leg--left {
  animation: agent-fab-action-disassemble-leg-left 6.2s ease-in-out both;
}

.agent-assistant-fab.is-action-disassemble .agent-assistant-fab__leg--right {
  animation: agent-fab-action-disassemble-leg-right 6.2s ease-in-out both;
}

@keyframes agent-fab-head-idle {
  0%,
  100% {
    transform: translate(var(--agent-assistant-head-x), var(--agent-assistant-head-y)) rotate(0deg);
  }

  50% {
    transform: translate(var(--agent-assistant-head-x), calc(var(--agent-assistant-head-y) - 0.06rem)) rotate(-1.8deg);
  }
}

@keyframes agent-fab-body-idle {
  0%,
  100% {
    transform: translate(var(--agent-assistant-body-x), var(--agent-assistant-body-y)) scaleY(1);
  }

  50% {
    transform: translate(var(--agent-assistant-body-x), calc(var(--agent-assistant-body-y) + 0.04rem)) scaleY(0.97);
  }
}

@keyframes agent-fab-antenna-idle {
  0%,
  100% {
    transform: translate(var(--agent-assistant-head-x), var(--agent-assistant-head-y)) rotate(22deg);
  }

  50% {
    transform: translate(var(--agent-assistant-head-x), var(--agent-assistant-head-y)) rotate(15deg);
  }
}

@keyframes agent-fab-arm-left-idle {
  0%,
  100% {
    transform: rotate(17deg);
  }

  50% {
    transform: rotate(12deg) translateY(0.05rem);
  }
}

@keyframes agent-fab-arm-right-idle {
  0%,
  100% {
    transform: rotate(-17deg);
  }

  50% {
    transform: rotate(-11deg) translateY(0.05rem);
  }
}

@keyframes agent-fab-leg-left-idle {
  0%,
  100% {
    transform: rotate(0deg);
  }

  50% {
    transform: rotate(4deg) translateY(0.03rem);
  }
}

@keyframes agent-fab-leg-right-idle {
  0%,
  100% {
    transform: rotate(0deg);
  }

  50% {
    transform: rotate(-4deg) translateY(0.03rem);
  }
}

@keyframes agent-fab-action-wave-bot {
  0%,
  100% {
    transform: scale(var(--agent-assistant-bot-scale)) rotate(var(--agent-assistant-robot-tilt));
  }

  22%,
  66% {
    transform: scale(var(--agent-assistant-bot-scale)) rotate(calc(var(--agent-assistant-robot-tilt) - 4deg));
  }
}

@keyframes agent-fab-action-wave-head {
  0%,
  100% {
    transform: translate(var(--agent-assistant-head-x), var(--agent-assistant-head-y)) rotate(0deg);
  }

  30%,
  66% {
    transform: translate(var(--agent-assistant-head-x), calc(var(--agent-assistant-head-y) - 0.1rem)) rotate(-4deg);
  }
}

@keyframes agent-fab-action-wave-arm-left {
  0%,
  100% {
    transform: translateX(-0.04rem) rotate(18deg);
  }

  16% {
    transform: translateX(-0.08rem) rotate(64deg);
  }

  30% {
    transform: translateX(-0.14rem) rotate(132deg);
  }

  44% {
    transform: translateX(-0.1rem) rotate(92deg);
  }

  58% {
    transform: translateX(-0.14rem) rotate(132deg);
  }

  72% {
    transform: translateX(-0.08rem) rotate(64deg);
  }
}

@keyframes agent-fab-action-wave-arm-right {
  0%,
  100% {
    transform: rotate(-17deg);
  }

  30%,
  70% {
    transform: rotate(-28deg) translateY(0.06rem);
  }
}

@keyframes agent-fab-action-sit-bot {
  0%,
  100% {
    transform: scale(var(--agent-assistant-bot-scale)) rotate(var(--agent-assistant-robot-tilt));
  }

  22%,
  84% {
    transform: translateY(0.36rem) scale(var(--agent-assistant-bot-scale)) rotate(var(--agent-assistant-robot-tilt));
  }
}

@keyframes agent-fab-action-sit-head {
  0%,
  100% {
    transform: translate(var(--agent-assistant-head-x), var(--agent-assistant-head-y)) rotate(0deg);
  }

  22%,
  84% {
    transform: translate(var(--agent-assistant-head-x), calc(var(--agent-assistant-head-y) + 0.1rem)) rotate(2deg);
  }
}

@keyframes agent-fab-action-sit-body {
  0%,
  100% {
    transform: translate(var(--agent-assistant-body-x), var(--agent-assistant-body-y)) scaleY(1);
  }

  22%,
  84% {
    transform: translate(var(--agent-assistant-body-x), calc(var(--agent-assistant-body-y) + 0.22rem)) scaleY(0.82);
  }
}

@keyframes agent-fab-action-sit-arm-left {
  0%,
  100% {
    transform: rotate(17deg);
  }

  22%,
  84% {
    transform: translate(0.08rem, 0.22rem) rotate(76deg);
  }
}

@keyframes agent-fab-action-sit-arm-right {
  0%,
  100% {
    transform: rotate(-17deg);
  }

  22%,
  84% {
    transform: translate(-0.08rem, 0.22rem) rotate(-76deg);
  }
}

@keyframes agent-fab-action-sit-leg-left {
  0%,
  100% {
    transform: rotate(0deg);
  }

  22%,
  84% {
    transform: translate(0.18rem, -0.18rem) rotate(94deg);
  }
}

@keyframes agent-fab-action-sit-leg-right {
  0%,
  100% {
    transform: rotate(0deg);
  }

  22%,
  84% {
    transform: translate(-0.18rem, -0.18rem) rotate(-94deg);
  }
}

@keyframes agent-fab-action-eye-roll-head {
  0%,
  100% {
    transform: translate(var(--agent-assistant-head-x), var(--agent-assistant-head-y)) rotate(0deg);
  }

  24% {
    transform: translate(var(--agent-assistant-head-x), calc(var(--agent-assistant-head-y) - 0.06rem)) rotate(-6deg);
  }

  52% {
    transform: translate(var(--agent-assistant-head-x), var(--agent-assistant-head-y)) rotate(5deg);
  }

  78% {
    transform: translate(var(--agent-assistant-head-x), calc(var(--agent-assistant-head-y) - 0.03rem)) rotate(-3deg);
  }
}

@keyframes agent-fab-action-eye-roll {
  0%,
  100% {
    transform: translate(var(--agent-assistant-eye-x), var(--agent-assistant-eye-y));
  }

  22% {
    transform: translate(0.22rem, -0.2rem);
  }

  48% {
    transform: translate(0, -0.3rem);
  }

  72% {
    transform: translate(-0.22rem, -0.2rem);
  }
}

@keyframes agent-fab-action-faint-bot {
  0%,
  100% {
    transform: scale(var(--agent-assistant-bot-scale)) rotate(var(--agent-assistant-robot-tilt));
  }

  26% {
    transform: translateY(-0.1rem) scale(var(--agent-assistant-bot-scale)) rotate(12deg);
  }

  34%,
  86% {
    transform: translate(0.58rem, 1.08rem) scale(var(--agent-assistant-bot-scale)) rotate(98deg);
  }
}

@keyframes agent-fab-action-faint-antenna {
  0%,
  100% {
    transform: translate(var(--agent-assistant-head-x), var(--agent-assistant-head-y)) rotate(22deg);
  }

  34%,
  86% {
    transform: translate(0.08rem, 0.02rem) rotate(-18deg);
  }
}

@keyframes agent-fab-action-faint-head {
  0%,
  100% {
    transform: translate(var(--agent-assistant-head-x), var(--agent-assistant-head-y)) rotate(0deg);
  }

  28% {
    transform: translate(var(--agent-assistant-head-x), calc(var(--agent-assistant-head-y) - 0.04rem)) rotate(9deg);
  }

  34%,
  86% {
    transform: translate(0.04rem, 0.02rem) rotate(-3deg);
  }
}

@keyframes agent-fab-action-faint-body {
  0%,
  100% {
    transform: translate(var(--agent-assistant-body-x), var(--agent-assistant-body-y));
  }

  34%,
  86% {
    transform: translate(0.04rem, 0.02rem) scaleY(0.9);
  }
}

@keyframes agent-fab-action-faint-arm-left {
  0%,
  100% {
    transform: rotate(17deg);
  }

  34%,
  86% {
    transform: translate(-0.12rem, 0.16rem) rotate(118deg);
  }
}

@keyframes agent-fab-action-faint-arm-right {
  0%,
  100% {
    transform: rotate(-17deg);
  }

  34%,
  86% {
    transform: translate(0.12rem, 0.16rem) rotate(-118deg);
  }
}

@keyframes agent-fab-action-faint-leg-left {
  0%,
  100% {
    transform: rotate(0deg);
  }

  34%,
  86% {
    transform: translate(-0.24rem, -0.02rem) rotate(82deg);
  }
}

@keyframes agent-fab-action-faint-leg-right {
  0%,
  100% {
    transform: rotate(0deg);
  }

  34%,
  86% {
    transform: translate(0.24rem, -0.02rem) rotate(-82deg);
  }
}

@keyframes agent-fab-action-disassemble-bot {
  /* 34%-70% 让散落状态停留片刻，再用 84% 的轻微过冲表现回装吸附感。 */
  0%,
  100% {
    transform: scale(var(--agent-assistant-bot-scale)) rotate(var(--agent-assistant-robot-tilt));
  }

  12% {
    transform: translateY(-0.08rem) scale(var(--agent-assistant-bot-scale)) rotate(-5deg);
  }

  24%,
  72% {
    transform: translateY(0.18rem) scale(var(--agent-assistant-bot-scale)) rotate(0deg);
  }

  86% {
    transform: translateY(-0.04rem) scale(var(--agent-assistant-bot-scale)) rotate(3deg);
  }
}

@keyframes agent-fab-action-disassemble-antenna {
  0%,
  100% {
    transform: translate(var(--agent-assistant-head-x), var(--agent-assistant-head-y)) rotate(22deg);
  }

  16% {
    transform: translate(0.02rem, -0.14rem) rotate(44deg);
  }

  32%,
  70% {
    transform: translate(0.96rem, 3.42rem) rotate(268deg);
  }

  84% {
    transform: translate(-0.05rem, -0.08rem) rotate(8deg);
  }
}

@keyframes agent-fab-action-disassemble-head {
  0%,
  100% {
    transform: translate(var(--agent-assistant-head-x), var(--agent-assistant-head-y)) rotate(0deg);
  }

  16% {
    transform: translate(var(--agent-assistant-head-x), calc(var(--agent-assistant-head-y) - 0.24rem)) rotate(-8deg);
  }

  32%,
  70% {
    transform: translate(-1.18rem, 2.72rem) rotate(-46deg);
  }

  84% {
    transform: translate(0.08rem, -0.1rem) rotate(6deg);
  }
}

@keyframes agent-fab-action-disassemble-body {
  0%,
  100% {
    transform: translate(var(--agent-assistant-body-x), var(--agent-assistant-body-y));
  }

  18% {
    transform: translate(var(--agent-assistant-body-x), calc(var(--agent-assistant-body-y) + 0.08rem)) rotate(4deg);
  }

  34%,
  70% {
    transform: translate(0.26rem, 1.56rem) rotate(18deg);
  }

  84% {
    transform: translate(-0.05rem, -0.08rem) rotate(-5deg);
  }
}

@keyframes agent-fab-action-disassemble-arm-left {
  0%,
  100% {
    transform: rotate(17deg);
  }

  18% {
    transform: translate(-0.16rem, -0.08rem) rotate(78deg);
  }

  34%,
  70% {
    transform: translate(-1.72rem, 1.84rem) rotate(248deg);
  }

  84% {
    transform: translate(0.08rem, -0.04rem) rotate(-4deg);
  }
}

@keyframes agent-fab-action-disassemble-arm-right {
  0%,
  100% {
    transform: rotate(-17deg);
  }

  18% {
    transform: translate(0.16rem, -0.08rem) rotate(-78deg);
  }

  34%,
  70% {
    transform: translate(1.58rem, 1.72rem) rotate(-238deg);
  }

  84% {
    transform: translate(-0.08rem, -0.04rem) rotate(4deg);
  }
}

@keyframes agent-fab-action-disassemble-leg-left {
  0%,
  100% {
    transform: rotate(0deg);
  }

  20% {
    transform: translate(-0.12rem, 0.18rem) rotate(34deg);
  }

  34%,
  70% {
    transform: translate(-0.98rem, 0.96rem) rotate(112deg);
  }

  84% {
    transform: translate(0.07rem, -0.08rem) rotate(-8deg);
  }
}

@keyframes agent-fab-action-disassemble-leg-right {
  0%,
  100% {
    transform: rotate(0deg);
  }

  20% {
    transform: translate(0.12rem, 0.18rem) rotate(-34deg);
  }

  34%,
  70% {
    transform: translate(0.92rem, 1.04rem) rotate(-118deg);
  }

  84% {
    transform: translate(-0.07rem, -0.08rem) rotate(8deg);
  }
}

@keyframes agent-fab-core-pulse {
  0%,
  100% {
    opacity: 0.78;
    transform: scale(1);
  }

  50% {
    opacity: 1;
    transform: scale(1.18);
  }
}

@keyframes agent-fab-blink {
  0%,
  4%,
  8%,
  100% {
    opacity: 1;
    scale: 1 1;
  }

  6% {
    opacity: 0.45;
    scale: 1 0.15;
  }
}

@media (width <= 600px) {
  .agent-assistant-fab {
    block-size: 6.65rem;
    inline-size: min(12.4rem, calc(100vw - 1rem));
  }

  .agent-assistant-fab.is-docked {
    inline-size: 3.45rem;
  }

  .agent-assistant-fab__bubbles {
    gap: 0.38rem;
    inline-size: min(9.6rem, calc(100vw - 5.6rem));
    inset-inline-end: 2.35rem;
    max-block-size: min(18rem, calc(100vh - 9.2rem));
  }

  .agent-assistant-fab__bubble {
    padding-block: 0.56rem;
    padding-inline: 0.72rem 1.62rem;
  }

  .agent-assistant-fab__bubble strong {
    font-size: 0.8rem;
  }

  .agent-assistant-fab__bubble span {
    font-size: 0.68rem;
  }

  .agent-assistant-fab__trigger {
    block-size: 4.8rem;
    inline-size: 5rem;
  }

  .agent-assistant-fab__bot {
    inset-inline-end: 1.02rem;
    transform-origin: 70% 78%;
  }

  .agent-assistant-fab {
    --agent-assistant-bot-scale: 0.82;
    --agent-assistant-bot-pressed-scale: 0.78;
  }

  .agent-assistant-fab.is-docked .agent-assistant-fab__bot {
    inset-inline-end: -0.72rem;
    transform: translateY(-0.16rem) scale(var(--agent-assistant-bot-scale)) rotate(-19deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .agent-assistant-fab,
  .agent-assistant-fab * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
