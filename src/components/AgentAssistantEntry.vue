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
    thinking?: boolean
  }>(),
  {
    thinking: false,
  },
)

const emit = defineEmits<{
  open: []
}>()

const { t } = useI18n()

const FAB_DOCK_STORAGE_KEY = 'moviepilot-agent-assistant-entry-docked'
const FAB_IDLE_DOCK_DELAY = 4200
const FAB_DOCK_REVEAL_DISTANCE = 18
const FAB_NOTIFICATION_BUBBLE_DURATION = 7000
const FAB_MAX_BUBBLES = 4

const fabDocked = ref(false)
const fabPointerStyle = ref({
  '--agent-assistant-pointer-x': '0px',
  '--agent-assistant-pointer-y': '0px',
  '--agent-assistant-robot-tilt': '0deg',
})
const fabPressed = ref(false)
const fabBubbles = ref<AgentAssistantEntryBubble[]>([])
const fabDragging = ref(false)

let fabIdleTimer: number | null = null
let fabDragStart: { pointerId: number; x: number; y: number } | null = null
let fabSuppressNextClick = false
let stopNotificationBubbleListener: (() => void) | null = null

const fabBubbleTimers = new Map<string, number>()

const hasFabBubbles = computed(() => fabBubbles.value.length > 0)
const hasKeepOpenFabBubbles = computed(() => fabBubbles.value.some(item => item.keepOpen))

function createBubbleId(prefix = 'bubble') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
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

// 将指针位置压成小幅 CSS 变量，驱动机器人眼睛和身体的跟随动效。
function updateFabPointer(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const offsetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2
  const offsetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2
  const normalizedX = Math.max(-1, Math.min(1, offsetX))
  const normalizedY = Math.max(-1, Math.min(1, offsetY))

  fabPointerStyle.value = {
    '--agent-assistant-pointer-x': `${(normalizedX * 4).toFixed(2)}px`,
    '--agent-assistant-pointer-y': `${(normalizedY * 3).toFixed(2)}px`,
    '--agent-assistant-robot-tilt': `${(normalizedX * 5).toFixed(2)}deg`,
  }
}

function resetFabPointer() {
  fabPressed.value = false
  fabPointerStyle.value = {
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
  if (fabDocked.value || hasKeepOpenFabBubbles.value) return

  fabIdleTimer = window.setTimeout(() => {
    setFabDocked(true, { persist: false })
    fabIdleTimer = null
  }, FAB_IDLE_DOCK_DELAY)
}

function pauseFabAutoDock() {
  clearFabIdleTimer()
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
  if (!bubble.text) return

  const existingBubbles = fabBubbles.value.filter(item => item.id !== bubble.id)
  fabBubbles.value = [bubble, ...existingBubbles].slice(0, FAB_MAX_BUBBLES)

  // 超出堆叠上限的气泡需要同步清理计时器，避免后续 timer 访问过期项。
  const visibleIds = new Set(fabBubbles.value.map(item => item.id))
  ;[...fabBubbleTimers.keys()].forEach(id => {
    if (!visibleIds.has(id)) clearFabBubbleTimer(id)
  })

  if (options.autoClose) scheduleFabBubbleRemoval(bubble.id, options.duration)
  setFabDocked(false, { persist: false })
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

function setFabDocked(docked: boolean, options: { persist?: boolean } = {}) {
  const { persist = true } = options
  fabDocked.value = docked
  resetFabPointer()
  if (docked) clearFabIdleTimer()
  else scheduleFabAutoDock()
  if (!persist) return

  try {
    localStorage.setItem(FAB_DOCK_STORAGE_KEY, JSON.stringify(fabDocked.value))
  } catch (error) {
    // 停靠状态只是入口偏好，写入失败时保持当前内存状态即可。
  }
}

function restoreFabDockState() {
  try {
    fabDocked.value = JSON.parse(localStorage.getItem(FAB_DOCK_STORAGE_KEY) || 'true') !== false
  } catch (error) {
    fabDocked.value = true
  }
}

function handleFabTriggerPointerDown(event: PointerEvent) {
  fabPressed.value = true
  pauseFabAutoDock()

  if (!fabDocked.value) return

  fabDragStart = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function handleFabTriggerPointerMove(event: PointerEvent) {
  updateFabPointer(event)
  if (!fabDocked.value || !fabDragStart) return

  const movedX = fabDragStart.x - event.clientX
  const movedY = Math.abs(fabDragStart.y - event.clientY)
  if (movedX > FAB_DOCK_REVEAL_DISTANCE && movedY < 48) {
    fabDragging.value = true
    fabSuppressNextClick = true
    setFabDocked(false, { persist: false })
  }
}

function handleFabTriggerPointerUp(event: PointerEvent) {
  fabPressed.value = false
  fabDragging.value = false
  fabDragStart = null
  ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
  if (!fabDocked.value) scheduleFabAutoDock()
}

function handleFabTriggerClick() {
  if (fabSuppressNextClick) {
    fabSuppressNextClick = false
    return
  }

  if (fabDocked.value) {
    setFabDocked(false, { persist: false })
    return
  }

  clearBubbles()
  setFabDocked(true, { persist: false })
  emit('open')
}

function handleFabPointerLeave() {
  resetFabPointer()
  if (!fabDocked.value) scheduleFabAutoDock()
}

function handleFabPointerEnter() {
  pauseFabAutoDock()
}

onMounted(() => {
  restoreFabDockState()
  stopNotificationBubbleListener = onAgentAssistantNotificationBubble(showNotificationBubble)
})

onScopeDispose(clearFabIdleTimer)
onScopeDispose(resetFabBubbles)
onScopeDispose(() => {
  stopNotificationBubbleListener?.()
  stopNotificationBubbleListener = null
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
    class="agent-assistant-fab"
    :class="{
      'is-docked': fabDocked,
      'is-pressed': fabPressed,
      'is-thinking': props.thinking,
      'is-bubble-visible': hasFabBubbles,
    }"
    :style="fabPointerStyle"
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
  z-index: 1000;

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

  block-size: 7.2rem;
  inline-size: 13.2rem;

  /* 入口停在右下侧，但保留一点悬浮感，避免挡住底部导航和常用操作。 */
  inset-block-start: clamp(12rem, 66vh, calc(100vh - 8.2rem));
  inset-inline-end: max(1.1rem, env(safe-area-inset-right));
  pointer-events: none;
  transform: translateY(-50%);
  transition:
    inline-size 0.24s ease,
    inset-inline-end 0.24s ease,
    transform 0.24s ease;
}

.agent-assistant-fab.is-docked {
  inline-size: 3.85rem;
  inset-inline-end: max(-1.55rem, calc(env(safe-area-inset-right) - 1.55rem));
}

.agent-assistant-fab__trigger {
  position: absolute;
  display: block;
  padding: 0;
  border: 0;
  background: transparent;
  block-size: 100%;
  color: inherit;
  cursor: pointer;
  inline-size: 100%;
  inset: 0;
  pointer-events: auto;
  text-align: start;
  touch-action: manipulation;
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
  animation: agent-fab-float 3.4s ease-in-out infinite;
  block-size: 4.7rem;
  filter: drop-shadow(0 0.55rem 0.55rem var(--agent-assistant-robot-shadow));
  inline-size: 3.85rem;
  inset-block-end: 0.1rem;
  inset-inline-end: 1.42rem;
  transform: translate(var(--agent-assistant-pointer-x), var(--agent-assistant-pointer-y))
    rotate(var(--agent-assistant-robot-tilt));
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
  transform: rotate(22deg);
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
  transform: translate(var(--agent-assistant-pointer-x), var(--agent-assistant-pointer-y));
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
  animation: agent-fab-wave-left 2.8s ease-in-out infinite;
  inset-inline-start: 0.9rem;
  transform: rotate(17deg);
  transform-origin: top center;
}

.agent-assistant-fab__arm--right {
  animation: agent-fab-wave-right 2.8s ease-in-out infinite;
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
  inset-inline-start: 1.48rem;
}

.agent-assistant-fab__leg--right {
  inset-inline-start: 2.46rem;
}

.agent-assistant-fab.is-bubble-visible .agent-assistant-fab__bubble:hover {
  box-shadow: var(--app-surface-hover-shadow);
}

.agent-assistant-fab__trigger:hover .agent-assistant-fab__bot {
  filter: drop-shadow(0 0.7rem 0.7rem var(--agent-assistant-robot-shadow-strong));
}

.agent-assistant-fab.is-pressed .agent-assistant-fab__bot {
  transform: translate(var(--agent-assistant-pointer-x), calc(var(--agent-assistant-pointer-y) + 0.22rem))
    rotate(var(--agent-assistant-robot-tilt)) scale(0.96);
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
  transform: translate(
      calc(var(--agent-assistant-pointer-x) * 0.24),
      calc(var(--agent-assistant-pointer-y) * 0.24 - 0.2rem)
    )
    rotate(-19deg);
}

.agent-assistant-fab.is-docked .agent-assistant-fab__eye {
  transform: translate(
    calc(var(--agent-assistant-pointer-x) * 0.24 - 0.22rem),
    calc(var(--agent-assistant-pointer-y) * 0.24)
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
  opacity: 0.75;
  transform: translate(0.34rem, 0.02rem) rotate(2deg) scale(0.82);
}

@keyframes agent-fab-float {
  0%,
  100% {
    translate: 0 0;
  }

  50% {
    translate: 0 -0.32rem;
  }
}

@keyframes agent-fab-wave-left {
  0%,
  100% {
    transform: rotate(17deg);
  }

  50% {
    transform: rotate(7deg);
  }
}

@keyframes agent-fab-wave-right {
  0%,
  100% {
    transform: rotate(-17deg);
  }

  50% {
    transform: rotate(-7deg);
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
    inset-block: auto calc(env(safe-area-inset-bottom, 0px) + 5.6rem);
    inset-inline-end: 0.7rem;
    transform: none;
  }

  .agent-assistant-fab.is-docked {
    inline-size: 3.45rem;
    inset-inline-end: -1.28rem;
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

  .agent-assistant-fab__bot {
    inset-inline-end: 1.02rem;
    transform: scale(0.82) translate(var(--agent-assistant-pointer-x), var(--agent-assistant-pointer-y))
      rotate(var(--agent-assistant-robot-tilt));
    transform-origin: 70% 78%;
  }

  .agent-assistant-fab.is-pressed .agent-assistant-fab__bot {
    transform: scale(0.78) translate(var(--agent-assistant-pointer-x), calc(var(--agent-assistant-pointer-y) + 0.18rem))
      rotate(var(--agent-assistant-robot-tilt));
  }

  .agent-assistant-fab.is-docked .agent-assistant-fab__bot {
    inset-inline-end: -0.48rem;
    transform: scale(0.82)
      translate(calc(var(--agent-assistant-pointer-x) * 0.24), calc(var(--agent-assistant-pointer-y) * 0.24 - 0.16rem))
      rotate(-19deg);
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
