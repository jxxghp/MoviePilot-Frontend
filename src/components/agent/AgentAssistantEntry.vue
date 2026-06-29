<script setup lang="ts">
import {
  onAgentAssistantBubble,
  setAgentAssistantBubbleEntryActive,
  type AgentAssistantBubbleKind,
  type AgentAssistantBubblePayload,
  type AgentAssistantBubbleVariant,
  type AgentAssistantNotificationBubblePayload,
} from '@/utils/agentAssistantBubble'
import { useI18n } from 'vue-i18n'

interface AgentAssistantEntryBubble {
  id: string
  kind: AgentAssistantBubbleKind
  variant: AgentAssistantBubbleVariant
  title?: string
  text: string
  keepOpen?: boolean
}

interface AgentAssistantEntryBubbleInput {
  id?: string
  kind?: AgentAssistantBubbleKind
  variant?: AgentAssistantBubbleVariant
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
const FAB_TOAST_BUBBLE_DURATION = 4500
const FAB_MAX_BUBBLES = 4
const FAB_DEFAULT_RIGHT_OFFSET = 18
const FAB_DEFAULT_VERTICAL_RATIO = 2 / 3
const FAB_MOBILE_VIEWPORT_WIDTH = 600
const FAB_BUBBLE_GAP = 12
const FAB_MOBILE_BUBBLE_GAP = 6
const FAB_BUBBLE_SAFE_MARGIN = 12
const FAB_BUBBLE_ARROW_MARGIN = 28
const FAB_BUBBLE_EDGE_ARROW_OFFSET = 38
const FAB_BUBBLE_UNDOCK_POSITION_SYNC_DELAY = 260
const FAB_RANDOM_ACTION_MIN_DELAY = 8000
const FAB_RANDOM_ACTION_MAX_DELAY = 18000
const FAB_RIGHT_EDGE_RESIZE_FOLLOW_DISTANCE = 128
const FAB_DRAG_SUPPRESS_CLICK_DELAY = 450

const FAB_RANDOM_ACTIONS = ['wave', 'sit', 'eye-roll', 'faint', 'disassemble', 'happy-jump'] as const

type FabRandomAction = (typeof FAB_RANDOM_ACTIONS)[number]
type FabBubblePlacement = 'bottom' | 'left' | 'right' | 'top'

const FAB_RANDOM_ACTION_DURATIONS: Record<FabRandomAction, number> = {
  wave: 2450,
  sit: 4200,
  'eye-roll': 1900,
  faint: 4800,
  disassemble: 6200,
  'happy-jump': 5200,
}

// 入口位置只保存在当前页面生命周期内，刷新后回到默认位置。
interface FabPosition {
  x: number
  y: number
}

interface FabPositionRangeOptions {
  useOpenBounds?: boolean
}

interface FabPositionRatio {
  x: number
  y: number
}

type FabPositionAnchor =
  | {
      mode: 'right'
      rightOffset: number
      yRatio: number
    }
  | {
      mode: 'free'
      xRatio: number
      yRatio: number
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

interface FabBubbleCandidate {
  placement: FabBubblePlacement
  idealX: number
  idealY: number
  weight: number
}

interface FabBubbleLayout {
  arrowX: number
  arrowY: number
  placement: FabBubblePlacement
  x: number
  y: number
}

interface FabBubbleArrowSource {
  kind: AgentAssistantBubbleKind
  variant: AgentAssistantBubbleVariant
}

const fabRootRef = ref<HTMLElement | null>(null)
const fabBubbleRef = ref<HTMLElement | null>(null)
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
const fabBubblePlacement = ref<FabBubblePlacement>('top')
const fabBubblePositionStyle = ref({
  '--agent-assistant-bubble-arrow-x': `${FAB_BUBBLE_EDGE_ARROW_OFFSET}px`,
  '--agent-assistant-bubble-arrow-y': '50%',
  '--agent-assistant-bubbles-x': '0px',
  '--agent-assistant-bubbles-y': '0px',
})
const fabBubblePositioned = ref(false)
const fabBubbleArrowSource = ref<FabBubbleArrowSource>({
  kind: 'custom',
  variant: 'default',
})
const fabPressed = ref(false)
const fabBubbles = ref<AgentAssistantEntryBubble[]>([])
const fabDragging = ref(false)
const fabRandomAction = ref<FabRandomAction | null>(null)

let fabIdleTimer: number | null = null
let fabDragState: FabDragState | null = null
let fabSuppressNextClick = false
let fabSuppressNextClickTimer: number | null = null
let fabPointerFrame = 0
let fabPendingPointerPoint: FabPointerPoint | null = null
let fabBubblePositionFrame = 0
let fabBubbleResizeObserver: ResizeObserver | null = null
let fabBubbleUndockPositionTimer: number | null = null
let fabLastRandomAction: FabRandomAction | null = null
let fabRandomActionTimer: number | null = null
let fabRandomActionEndTimer: number | null = null
let stopBubbleListener: (() => void) | null = null
let fabPositionAnchor: FabPositionAnchor | null = null
let stopFabTouchMoveGuard: (() => void) | null = null

const fabBubbleTimers = new Map<string, number>()

const hasFabBubbles = computed(() => fabBubbles.value.length > 0)
const hasKeepOpenFabBubbles = computed(() => fabBubbles.value.some(item => item.keepOpen))
const fabBubbleClassList = computed(() => [
  `agent-assistant-fab__bubbles--${fabBubblePlacement.value}`,
  `agent-assistant-fab__bubbles--arrow-${fabBubbleArrowSource.value.kind}`,
  `agent-assistant-fab__bubbles--arrow-${fabBubbleArrowSource.value.variant}`,
])

function createBubbleId(prefix = 'bubble') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getViewportSize() {
  const layoutWidth = window.innerWidth || document.documentElement.clientWidth || 0
  const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0
  const visualWidth = window.visualViewport?.width || 0
  const visualHeight = window.visualViewport?.height || 0

  // 取布局视口和可见视口的较小值，避免两者短暂不同步时把入口计算到屏幕外。
  return {
    height:
      visualHeight > 0 && layoutHeight > 0 ? Math.min(visualHeight, layoutHeight) : visualHeight || layoutHeight,
    width: visualWidth > 0 && layoutWidth > 0 ? Math.min(visualWidth, layoutWidth) : visualWidth || layoutWidth,
  }
}

// 判断当前 FAB 是否处于移动端布局，用于同步 JS 布局和 CSS 媒体查询。
function isMobileFabViewport() {
  return getViewportSize().width <= FAB_MOBILE_VIEWPORT_WIDTH
}

// 移动端气泡与机器人距离更短，避免 iOS 触摸视图里气泡显得过远。
function getFabBubbleGap() {
  return isMobileFabViewport() ? FAB_MOBILE_BUBBLE_GAP : FAB_BUBBLE_GAP
}

function getOpenFabSize() {
  const viewport = getViewportSize()
  const isMobile = isMobileFabViewport()

  return {
    height: isMobile ? 106 : 115,
    width: isMobile ? Math.min(198, Math.max(0, viewport.width - 16)) : 211,
  }
}

function getFallbackFabInteractiveBounds(): FabInteractiveBounds {
  const rootSize = getOpenFabSize()
  const triggerSize = isMobileFabViewport() ? { height: 77, width: 80 } : { height: 82, width: 86 }

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
  const root = getFabRootElement()
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

function getFabPositionRange(options: FabPositionRangeOptions = {}) {
  const viewport = getViewportSize()
  const bounds = options.useOpenBounds ? getFallbackFabInteractiveBounds() : getFabInteractiveBounds()
  const minX = -bounds.offsetX
  const minY = -bounds.offsetY
  const maxX = Math.max(minX, viewport.width - bounds.offsetX - bounds.width)
  const maxY = Math.max(minY, viewport.height - bounds.offsetY - bounds.height)

  return { maxX, maxY, minX, minY }
}

function clampFabPosition(position: FabPosition, options: FabPositionRangeOptions = {}) {
  if (typeof window === 'undefined') return position

  const range = getFabPositionRange(options)

  return {
    x: Math.min(range.maxX, Math.max(range.minX, position.x)),
    y: Math.min(range.maxY, Math.max(range.minY, position.y)),
  }
}

function clampFabY(y: number, options: FabPositionRangeOptions = {}) {
  const range = getFabPositionRange(options)

  return Math.min(range.maxY, Math.max(range.minY, y))
}

function getCurrentFabPosition() {
  return fabPosition.value || getDefaultFabPosition()
}

function getFabRightEdgeOffset(position = getCurrentFabPosition()) {
  const viewport = getViewportSize()
  const size = getOpenFabSize()

  return viewport.width - (position.x + size.width)
}

function getFabYRatio(position: FabPosition, options: FabPositionRangeOptions = {}) {
  return getFabFreePositionRatio(position, options).y
}

// 只在用户定位意图变化时更新锚点，窗口缩放时只消费该锚点重新计算位置。
function updateFabAnchorFromPosition(position = getCurrentFabPosition(), options: FabPositionRangeOptions = {}) {
  const rangeOptions = { useOpenBounds: options.useOpenBounds ?? fabDragging.value }
  const offset = getFabRightEdgeOffset(position)
  if (offset <= FAB_RIGHT_EDGE_RESIZE_FOLLOW_DISTANCE) {
    fabPositionAnchor = {
      mode: 'right',
      rightOffset: Math.max(0, offset),
      yRatio: getFabYRatio(position, rangeOptions),
    }
    return
  }

  const ratio = getFabFreePositionRatio(position, rangeOptions)
  fabPositionAnchor = {
    mode: 'free',
    xRatio: ratio.x,
    yRatio: ratio.y,
  }
}

function shouldFabAutoDock() {
  return fabPositionAnchor?.mode === 'right' && fabPositionAnchor.rightOffset <= FAB_RIGHT_EDGE_DOCK_DISTANCE
}

function getFabFreePositionRatio(position: FabPosition, options: FabPositionRangeOptions = {}): FabPositionRatio {
  const range = getFabPositionRange(options)
  const xRange = range.maxX - range.minX
  const yRange = range.maxY - range.minY

  return {
    x: xRange > 0 ? (position.x - range.minX) / xRange : 0,
    y: yRange > 0 ? (position.y - range.minY) / yRange : 0,
  }
}

function getFabPositionFromRatio(ratio: FabPositionRatio, options: FabPositionRangeOptions = {}) {
  const range = getFabPositionRange(options)

  return clampFabPosition(
    {
      x: range.minX + (range.maxX - range.minX) * ratio.x,
      y: range.minY + (range.maxY - range.minY) * ratio.y,
    },
    options,
  )
}

function getFabYFromRatio(yRatio: number, options: FabPositionRangeOptions = {}) {
  const range = getFabPositionRange(options)

  return range.minY + (range.maxY - range.minY) * yRatio
}

function getFabPositionFromAnchor(anchor: FabPositionAnchor) {
  if (anchor.mode === 'right') {
    const viewport = getViewportSize()
    const size = getOpenFabSize()

    return clampFabPosition(
      {
        x: viewport.width - size.width - anchor.rightOffset,
        y: getFabYFromRatio(anchor.yRatio, { useOpenBounds: true }),
      },
      { useOpenBounds: true },
    )
  }

  return getFabPositionFromRatio(
    {
      x: anchor.xRatio,
      y: anchor.yRatio,
    },
    { useOpenBounds: true },
  )
}

function getOpenFabPositionForDrag(currentPosition: FabPosition) {
  if (fabPositionAnchor) return getFabPositionFromAnchor(fabPositionAnchor)

  return clampFabPosition(
    {
      ...currentPosition,
      x: Math.min(
        currentPosition.x,
        Math.max(0, getViewportSize().width - getOpenFabSize().width - FAB_DEFAULT_RIGHT_OFFSET),
      ),
    },
    { useOpenBounds: true },
  )
}

function updateFabPosition(position: FabPosition, options: FabPositionRangeOptions & { syncAnchor?: boolean } = {}) {
  const rangeOptions = { useOpenBounds: options.useOpenBounds ?? fabDragging.value }

  fabPosition.value = clampFabPosition(position, rangeOptions)
  if (options.syncAnchor !== false) updateFabAnchorFromPosition(fabPosition.value, rangeOptions)
  scheduleFabBubblePositionUpdate()
}

// 将数值限制在指定范围内，避免指针和随机动作计算产生过大的位移。
function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getFabRootElement() {
  return fabRootRef.value || (document.querySelector('.agent-assistant-fab') as HTMLElement | null)
}

function getFabAnchorRect() {
  const root = getFabRootElement()
  const bot = root?.querySelector('.agent-assistant-fab__bot') as HTMLElement | null
  const trigger = root?.querySelector('.agent-assistant-fab__trigger') as HTMLElement | null
  const botRect = bot?.getBoundingClientRect()
  const triggerRect = trigger?.getBoundingClientRect()

  // 小屏下触发热区留白更明显，气泡按机器人可见图形定位会更贴近。
  if (isMobileFabViewport() && botRect && botRect.width > 0 && botRect.height > 0) return botRect

  if (triggerRect && triggerRect.width > 0 && triggerRect.height > 0) return triggerRect
  if (botRect && botRect.width > 0 && botRect.height > 0) return botRect

  return null
}

function getFabBubbleSize() {
  const viewport = getViewportSize()
  const rect = fabBubbleRef.value?.getBoundingClientRect()
  const fallbackWidth = Math.min(viewport.width - FAB_BUBBLE_SAFE_MARGIN * 2, viewport.width <= 600 ? 264 : 304)

  return {
    height: rect && rect.height > 0 ? rect.height : 160,
    width: rect && rect.width > 0 ? rect.width : Math.max(0, fallbackWidth),
  }
}

function clampBubbleAxis(value: number, size: number, viewportSize: number) {
  const min = FAB_BUBBLE_SAFE_MARGIN
  const max = Math.max(min, viewportSize - size - FAB_BUBBLE_SAFE_MARGIN)

  return clampNumber(value, min, max)
}

function clampBubbleArrow(value: number, size: number) {
  const margin = Math.min(FAB_BUBBLE_ARROW_MARGIN, size / 2)

  return clampNumber(value, margin, Math.max(margin, size - margin))
}

function getBubbleCandidatePenalty(
  candidate: FabBubbleCandidate,
  bubbleSize: { height: number; width: number },
  anchorRect: DOMRect,
  viewport: { height: number; width: number },
  bubbleGap: number,
) {
  const x = clampBubbleAxis(candidate.idealX, bubbleSize.width, viewport.width)
  const y = clampBubbleAxis(candidate.idealY, bubbleSize.height, viewport.height)
  const primaryAvailable = {
    bottom: viewport.height - anchorRect.bottom - FAB_BUBBLE_SAFE_MARGIN,
    left: anchorRect.left - FAB_BUBBLE_SAFE_MARGIN,
    right: viewport.width - anchorRect.right - FAB_BUBBLE_SAFE_MARGIN,
    top: anchorRect.top - FAB_BUBBLE_SAFE_MARGIN,
  }[candidate.placement]
  const primaryRequired =
    candidate.placement === 'left' || candidate.placement === 'right'
      ? bubbleSize.width + bubbleGap
      : bubbleSize.height + bubbleGap
  const fitPenalty = Math.max(0, primaryRequired - primaryAvailable) * 8
  const alignmentPenalty = Math.abs(x - candidate.idealX) + Math.abs(y - candidate.idealY)

  return {
    ...candidate,
    score: fitPenalty + alignmentPenalty + candidate.weight,
    x,
    y,
  }
}

function calculateFabBubbleLayout(): FabBubbleLayout | null {
  const rootRect = getFabRootElement()?.getBoundingClientRect()
  const anchorRect = getFabAnchorRect()
  if (!rootRect || !anchorRect) return null

  const viewport = getViewportSize()
  const bubbleSize = getFabBubbleSize()
  const bubbleGap = getFabBubbleGap()
  const anchorCenterX = anchorRect.left + anchorRect.width / 2
  const anchorCenterY = anchorRect.top + anchorRect.height / 2
  const mobileSidePlacement = anchorCenterX >= viewport.width / 2 ? 'left' : 'right'
  const preferMobileSideBubble = isMobileFabViewport()
  const candidates: FabBubbleCandidate[] = [
    {
      idealX: anchorCenterX - bubbleSize.width / 2,
      idealY: anchorRect.top - bubbleSize.height - bubbleGap,
      placement: 'top',
      weight: preferMobileSideBubble ? 18 : 0,
    },
    {
      idealX: anchorCenterX - bubbleSize.width / 2,
      idealY: anchorRect.bottom + bubbleGap,
      placement: 'bottom',
      weight: preferMobileSideBubble ? 22 : 4,
    },
    {
      idealX: anchorRect.right + bubbleGap,
      idealY: anchorCenterY - bubbleSize.height / 2,
      placement: 'right',
      weight: preferMobileSideBubble && mobileSidePlacement === 'right' ? -4 : 8,
    },
    {
      idealX: anchorRect.left - bubbleSize.width - bubbleGap,
      idealY: anchorCenterY - bubbleSize.height / 2,
      placement: 'left',
      weight: preferMobileSideBubble && mobileSidePlacement === 'left' ? -4 : 8,
    },
  ]
  const bestCandidate = candidates
    .map(candidate => getBubbleCandidatePenalty(candidate, bubbleSize, anchorRect, viewport, bubbleGap))
    .sort((a, b) => a.score - b.score)[0]

  if (!bestCandidate) return null

  const arrowX =
    bestCandidate.placement === 'left'
      ? bubbleSize.width
      : bestCandidate.placement === 'right'
        ? 0
        : clampBubbleArrow(anchorCenterX - bestCandidate.x, bubbleSize.width)
  const arrowY =
    bestCandidate.placement === 'top'
      ? bubbleSize.height
      : bestCandidate.placement === 'bottom'
        ? 0
        : clampBubbleArrow(anchorCenterY - bestCandidate.y, bubbleSize.height)

  return {
    arrowX,
    arrowY,
    placement: bestCandidate.placement,
    x: bestCandidate.x - rootRect.left,
    y: bestCandidate.y - rootRect.top,
  }
}

function getFallbackFabBubbleArrowSource(placement: FabBubblePlacement): FabBubbleArrowSource {
  const fallbackBubble =
    placement === 'bottom' || placement === 'right'
      ? fabBubbles.value[0]
      : fabBubbles.value.at(-1) || fabBubbles.value[0]

  return {
    kind: fallbackBubble?.kind || 'custom',
    variant: fallbackBubble?.variant || 'default',
  }
}

function getBubbleDistanceToArrow(rect: DOMRect, arrowX: number, arrowY: number, placement: FabBubblePlacement) {
  if (placement === 'left' || placement === 'right') {
    if (arrowY >= rect.top && arrowY <= rect.bottom) return 0

    return Math.min(Math.abs(arrowY - rect.top), Math.abs(arrowY - rect.bottom))
  }

  if (arrowX >= rect.left && arrowX <= rect.right) return 0

  return Math.min(Math.abs(arrowX - rect.left), Math.abs(arrowX - rect.right))
}

function syncFabBubbleArrowSource(layout: FabBubbleLayout, rootRect: DOMRect) {
  const bubbleElements = Array.from(
    fabBubbleRef.value?.querySelectorAll<HTMLElement>('.agent-assistant-fab__bubble') || [],
  )
  if (!bubbleElements.length) {
    fabBubbleArrowSource.value = getFallbackFabBubbleArrowSource(layout.placement)
    return
  }

  const arrowClientX = rootRect.left + layout.x + layout.arrowX
  const arrowClientY = rootRect.top + layout.y + layout.arrowY
  let matchedBubbleId = ''
  let matchedDistance = Number.POSITIVE_INFINITY

  for (const element of bubbleElements) {
    const rect = element.getBoundingClientRect()
    const distance = getBubbleDistanceToArrow(rect, arrowClientX, arrowClientY, layout.placement)

    if (distance < matchedDistance) {
      matchedDistance = distance
      matchedBubbleId = element.dataset.bubbleId || ''
    }
  }

  const matchedBubble = fabBubbles.value.find(item => item.id === matchedBubbleId)
  fabBubbleArrowSource.value = matchedBubble
    ? {
        kind: matchedBubble.kind,
        variant: matchedBubble.variant,
      }
    : getFallbackFabBubbleArrowSource(layout.placement)
}

function syncFabBubblePosition() {
  if (!hasFabBubbles.value || !props.active) return

  const rootRect = getFabRootElement()?.getBoundingClientRect()
  const layout = calculateFabBubbleLayout()
  if (!layout || !rootRect) return

  fabBubblePlacement.value = layout.placement
  fabBubblePositionStyle.value = {
    '--agent-assistant-bubble-arrow-x': `${Math.round(layout.arrowX)}px`,
    '--agent-assistant-bubble-arrow-y': `${Math.round(layout.arrowY)}px`,
    '--agent-assistant-bubbles-x': `${Math.round(layout.x)}px`,
    '--agent-assistant-bubbles-y': `${Math.round(layout.y)}px`,
  }
  syncFabBubbleArrowSource(layout, rootRect)
  fabBubblePositioned.value = true
}

function scheduleFabBubblePositionUpdate() {
  if (fabBubblePositionFrame || !hasFabBubbles.value) return

  fabBubblePositionFrame = window.requestAnimationFrame(() => {
    fabBubblePositionFrame = 0
    syncFabBubblePosition()
  })
}

function clearFabBubbleUndockPositionTimer() {
  if (fabBubbleUndockPositionTimer === null) return

  window.clearTimeout(fabBubbleUndockPositionTimer)
  fabBubbleUndockPositionTimer = null
}

function scheduleFabBubblePostUndockPositionUpdate() {
  clearFabBubbleUndockPositionTimer()
  fabBubbleUndockPositionTimer = window.setTimeout(() => {
    fabBubbleUndockPositionTimer = null
    syncFabBubblePosition()
  }, FAB_BUBBLE_UNDOCK_POSITION_SYNC_DELAY)
}

function syncFabBubbleResizeObserver() {
  fabBubbleResizeObserver?.disconnect()
  fabBubbleResizeObserver = null

  if (!fabBubbleRef.value || typeof ResizeObserver === 'undefined') return

  fabBubbleResizeObserver = new ResizeObserver(() => {
    scheduleFabBubblePositionUpdate()
  })
  fabBubbleResizeObserver.observe(fabBubbleRef.value)
}

function teardownFabBubblePositioning() {
  if (fabBubblePositionFrame) {
    window.cancelAnimationFrame(fabBubblePositionFrame)
    fabBubblePositionFrame = 0
  }

  fabBubbleResizeObserver?.disconnect()
  fabBubbleResizeObserver = null
  clearFabBubbleUndockPositionTimer()
}

function resetFabPosition() {
  fabPosition.value = getDefaultFabPosition()
  updateFabAnchorFromPosition(fabPosition.value)
  scheduleFabBubblePositionUpdate()
  if (shouldFabAutoDock()) scheduleFabAutoDock()
}

function handleWindowResize() {
  const currentPosition = getCurrentFabPosition()
  if (fabDocked.value) {
    const y = fabPositionAnchor ? getFabYFromRatio(fabPositionAnchor.yRatio) : currentPosition.y
    fabPosition.value = {
      ...currentPosition,
      x: getDockedFabX(),
      y: clampFabY(y),
    }
  } else if (fabPositionAnchor) {
    updateFabPosition(getFabPositionFromAnchor(fabPositionAnchor), { syncAnchor: false })
  } else {
    updateFabPosition(currentPosition)
  }
  scheduleFabBubblePositionUpdate()
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

function clearFabSuppressNextClickTimer() {
  if (fabSuppressNextClickTimer === null) return

  window.clearTimeout(fabSuppressNextClickTimer)
  fabSuppressNextClickTimer = null
}

function suppressNextFabClick() {
  fabSuppressNextClick = true
  clearFabSuppressNextClickTimer()
  fabSuppressNextClickTimer = window.setTimeout(() => {
    fabSuppressNextClick = false
    fabSuppressNextClickTimer = null
  }, FAB_DRAG_SUPPRESS_CLICK_DELAY)
}

function scheduleFabAutoDock() {
  clearFabIdleTimer()
  if (fabDocked.value || hasKeepOpenFabBubbles.value || fabRandomAction.value || !shouldFabAutoDock()) return

  fabIdleTimer = window.setTimeout(() => {
    fabIdleTimer = null
    if (fabDocked.value || hasKeepOpenFabBubbles.value || !shouldFabAutoDock()) return

    if (fabRandomAction.value) {
      scheduleFabAutoDock()
      return
    }

    setFabDocked(true)
  }, FAB_IDLE_DOCK_DELAY)
}

function pauseFabAutoDock() {
  clearFabIdleTimer()
}

// 返回下一次趣味动作的随机等待时间，让动作出现节奏更自然。
function getFabRandomActionDelay() {
  return (
    FAB_RANDOM_ACTION_MIN_DELAY +
    Math.round(Math.random() * (FAB_RANDOM_ACTION_MAX_DELAY - FAB_RANDOM_ACTION_MIN_DELAY))
  )
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

  const shouldAutoDock = !fabDocked.value && shouldFabAutoDock()

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
    if (!fabRandomAction.value && fabRandomActionTimer === null && fabRandomActionEndTimer === null)
      scheduleFabRandomAction()
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

function getBubbleVariant(payload: AgentAssistantBubblePayload): AgentAssistantBubbleVariant {
  return payload.variant || 'default'
}

function getBubbleIcon(variant: AgentAssistantBubbleVariant) {
  const icons: Record<AgentAssistantBubbleVariant, string> = {
    default: 'mdi-bell-outline',
    error: 'mdi-alert-circle-outline',
    info: 'mdi-information-outline',
    success: 'mdi-check-circle-outline',
    warning: 'mdi-alert-outline',
  }

  return icons[variant]
}

function getToastBubbleTitle(payload: AgentAssistantBubblePayload) {
  if (payload.title) return payload.title

  const titles: Record<AgentAssistantBubbleVariant, string> = {
    default: t('common.notice'),
    error: t('common.error'),
    info: t('common.notice'),
    success: t('common.success'),
    warning: t('common.notice'),
  }

  return titles[getBubbleVariant(payload)]
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

  const hadBubbles = hasFabBubbles.value
  const wasDocked = fabDocked.value
  const existingBubbles = fabBubbles.value.filter(item => item.id !== bubble.id)
  if (!hadBubbles) fabBubblePositioned.value = false
  fabBubbles.value = [bubble, ...existingBubbles].slice(0, FAB_MAX_BUBBLES)
  setFabDocked(false)
  nextTick(() => {
    syncFabBubbleResizeObserver()
    syncFabBubblePosition()
    if (wasDocked) scheduleFabBubblePostUndockPositionUpdate()
  })

  // 超出堆叠上限的气泡需要同步清理计时器，避免后续 timer 访问过期项。
  const visibleIds = new Set(fabBubbles.value.map(item => item.id))
  ;[...fabBubbleTimers.keys()].forEach(id => {
    if (!visibleIds.has(id)) clearFabBubbleTimer(id)
  })

  if (options.autoClose) scheduleFabBubbleRemoval(bubble.id, options.duration)
}

function showBubble(input: AgentAssistantEntryBubbleInput) {
  const text = stripMarkdownPreview(input.text)
  if (!text) return

  upsertFabBubble(
    {
      id: input.id || createBubbleId(input.kind || 'custom'),
      kind: input.kind || 'custom',
      variant: input.variant || 'default',
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
    variant: getBubbleVariant(payload),
    title: buildNotificationBubbleTitle(payload),
    text,
    autoClose: true,
    keepOpen: true,
  })
}

function showToastBubble(payload: AgentAssistantBubblePayload) {
  const text = stripMarkdownPreview(payload.text || payload.title || '')
  if (!text) return

  showBubble({
    id: payload.id,
    kind: 'toast',
    variant: getBubbleVariant(payload),
    title: getToastBubbleTitle(payload),
    text,
    autoClose: true,
    duration: payload.duration || FAB_TOAST_BUBBLE_DURATION,
    keepOpen: payload.keepOpen,
  })
}

function showAgentAssistantBubble(payload: AgentAssistantBubblePayload) {
  if ((payload.kind || 'notification') === 'toast') {
    showToastBubble(payload)
    return
  }

  showNotificationBubble(payload as AgentAssistantNotificationBubblePayload)
}

function closeBubble(id?: string) {
  if (id) {
    clearFabBubbleTimer(id)
    fabBubbles.value = fabBubbles.value.filter(item => item.id !== id)
  } else {
    fabBubbles.value.forEach(item => clearFabBubbleTimer(item.id))
    fabBubbles.value = []
  }

  if (!fabBubbles.value.length) fabBubblePositioned.value = false

  if (!hasKeepOpenFabBubbles.value) scheduleFabAutoDock()
  nextTick(() => {
    syncFabBubbleResizeObserver()
    syncFabBubblePosition()
  })
}

function clearBubbles() {
  closeBubble()
}

function resetFabBubbles() {
  fabBubbles.value.forEach(item => clearFabBubbleTimer(item.id))
  fabBubbles.value = []
  fabBubblePositioned.value = false
  nextTick(syncFabBubbleResizeObserver)
}

function setFabDocked(docked: boolean) {
  const currentPosition = getCurrentFabPosition()

  fabDocked.value = docked
  fabPressed.value = false

  if (docked) {
    clearFabIdleTimer()
    const dockedPosition = {
      ...currentPosition,
      x: getDockedFabX(),
      y: clampFabY(currentPosition.y),
    }
    fabPosition.value = dockedPosition
    scheduleFabBubblePositionUpdate()
    return
  }

  fabPosition.value = fabPositionAnchor
    ? getFabPositionFromAnchor(fabPositionAnchor)
    : clampFabPosition({
        ...currentPosition,
        x: Math.min(
          currentPosition.x,
          Math.max(0, getViewportSize().width - getOpenFabSize().width - FAB_DEFAULT_RIGHT_OFFSET),
        ),
      })
  scheduleFabBubblePositionUpdate()
  nextTick(() => {
    if (fabPositionAnchor) {
      updateFabPosition(getFabPositionFromAnchor(fabPositionAnchor), { syncAnchor: false })
      scheduleFabAutoDock()
      return
    }

    updateFabAnchorFromPosition()
    scheduleFabAutoDock()
  })
}

function clearFabDragState() {
  fabDragState = null
  fabDragging.value = false
  fabPressed.value = false
  teardownFabTouchMoveGuard()
}

function releaseFabPointerCapture(event: PointerEvent) {
  try {
    ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
  } catch {
    // 指针捕获可能已被浏览器或 DevTools 中断，状态以组件内清理为准。
  }
}

function cancelFabDrag() {
  const wasDragging = fabDragging.value

  clearFabDragState()
  if (!wasDragging) {
    scheduleFabAutoDock()
    return
  }

  if (shouldFabAutoDock()) {
    scheduleFabAutoDock()
  } else {
    clearFabIdleTimer()
  }
}

function guardFabPointerEvent(event: PointerEvent, options: { preventTouchDefault?: boolean } = {}) {
  event.stopPropagation()
  if (
    options.preventTouchDefault &&
    (event.pointerType === 'touch' || event.pointerType === 'pen') &&
    event.cancelable
  ) {
    event.preventDefault()
  }
}

function setupFabTouchMoveGuard() {
  if (stopFabTouchMoveGuard) return

  const handleTouchMove = (event: TouchEvent) => {
    if (!fabDragState) return

    event.stopPropagation()
    if (event.cancelable) event.preventDefault()
  }

  document.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false })
  stopFabTouchMoveGuard = () => {
    document.removeEventListener('touchmove', handleTouchMove, { capture: true })
    stopFabTouchMoveGuard = null
  }
}

function teardownFabTouchMoveGuard() {
  stopFabTouchMoveGuard?.()
}

function isPressedDragPointer(event: PointerEvent) {
  if (event.pointerType === 'touch' || event.pointerType === 'pen') {
    return event.buttons !== 0 || event.pressure > 0
  }

  return event.buttons !== 0
}

function handleFabTriggerPointerDown(event: PointerEvent) {
  guardFabPointerEvent(event)
  if (fabSuppressNextClick) {
    fabSuppressNextClick = false
    clearFabSuppressNextClickTimer()
  }
  fabPressed.value = true
  pauseFabAutoDock()
  if (event.pointerType === 'touch' || event.pointerType === 'pen') setupFabTouchMoveGuard()

  const currentPosition = getCurrentFabPosition()
  const dragStartPosition = fabDocked.value ? getOpenFabPositionForDrag(currentPosition) : currentPosition
  fabDragState = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: dragStartPosition.x,
    startY: dragStartPosition.y,
    moved: false,
  }
  try {
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  } catch {
    // 指针可能已被浏览器取消，拖拽状态仍按后续 pointermove/pointerup 收敛。
  }
}

function handleFabTriggerPointerMove(event: PointerEvent) {
  guardFabPointerEvent(event, { preventTouchDefault: true })
  updateFabPointer(event)
  if (!fabDragState || fabDragState.pointerId !== event.pointerId) return
  if (!isPressedDragPointer(event)) {
    releaseFabPointerCapture(event)
    cancelFabDrag()
    return
  }

  const deltaX = event.clientX - fabDragState.startClientX
  const deltaY = event.clientY - fabDragState.startClientY
  const movedDistance = Math.hypot(deltaX, deltaY)

  if (movedDistance < 4 && !fabDragState.moved) return

  fabDragState.moved = true
  fabDragging.value = true
  if (fabDocked.value) {
    fabDocked.value = false
    fabPosition.value = clampFabPosition(
      {
        x: fabDragState.startX,
        y: fabDragState.startY,
      },
      { useOpenBounds: true },
    )
    scheduleFabBubblePositionUpdate()
  }
  updateFabPosition({
    x: fabDragState.startX + deltaX,
    y: fabDragState.startY + deltaY,
  })
}

function handleFabTriggerPointerUp(event: PointerEvent) {
  guardFabPointerEvent(event)
  fabPressed.value = false
  const dragState = fabDragState
  const wasDragging = fabDragging.value

  if (wasDragging && dragState?.pointerId === event.pointerId) {
    updateFabPosition({
      x: dragState.startX + event.clientX - dragState.startClientX,
      y: dragState.startY + event.clientY - dragState.startClientY,
    })
  }

  fabDragging.value = false
  fabDragState = null
  teardownFabTouchMoveGuard()
  releaseFabPointerCapture(event)

  if (!wasDragging) {
    scheduleFabAutoDock()
    return
  }

  suppressNextFabClick()
  if (shouldFabAutoDock()) {
    scheduleFabAutoDock()
  } else {
    clearFabIdleTimer()
    fabDocked.value = false
  }
}

function handleFabTriggerPointerCancel(event: PointerEvent) {
  guardFabPointerEvent(event)
  fabPressed.value = false

  if (!fabDragState || fabDragState.pointerId !== event.pointerId) return

  releaseFabPointerCapture(event)

  cancelFabDrag()
}

function handleFabTriggerLostPointerCapture(event: PointerEvent) {
  if (!fabDragState || fabDragState.pointerId !== event.pointerId) return

  cancelFabDrag()
}

function handleWindowFabPointerEnd(event: PointerEvent) {
  if (!fabDragState || fabDragState.pointerId !== event.pointerId) return

  cancelFabDrag()
}

function handleFabTriggerClick(event: MouseEvent) {
  event.stopPropagation()
  if (fabSuppressNextClick && event.detail !== 0) {
    fabSuppressNextClick = false
    clearFabSuppressNextClickTimer()
    return
  }

  fabSuppressNextClick = false
  clearFabSuppressNextClickTimer()

  if (fabDocked.value) {
    setFabDocked(false)
    return
  }

  clearBubbles()
  emit('open')
}

function handleFabPointerLeave() {
  if (!fabDocked.value && shouldFabAutoDock()) scheduleFabAutoDock()
}

function handleFabPointerEnter() {
  pauseFabAutoDock()
}

onMounted(() => {
  nextTick(resetFabPosition)
  setAgentAssistantBubbleEntryActive(props.active)
  window.addEventListener('resize', handleWindowResize)
  window.visualViewport?.addEventListener('resize', handleWindowResize)
  window.addEventListener('pointerup', handleWindowFabPointerEnd, { passive: true })
  window.addEventListener('pointercancel', handleWindowFabPointerEnd, { passive: true })
  window.addEventListener('pointermove', handleGlobalFabPointer, { passive: true })
  window.addEventListener('pointerdown', handleGlobalFabPointer, { passive: true })
  stopBubbleListener = onAgentAssistantBubble(showAgentAssistantBubble)
  scheduleFabRandomAction()
})

watch(
  () => props.active,
  active => {
    setAgentAssistantBubbleEntryActive(active)

    if (active) {
      if (shouldFabAutoDock()) scheduleFabAutoDock()
      nextTick(() => {
        syncFabBubbleResizeObserver()
        syncFabBubblePosition()
      })
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
onScopeDispose(clearFabSuppressNextClickTimer)
onScopeDispose(clearFabRandomAction)
onScopeDispose(resetFabBubbles)
onScopeDispose(teardownFabBubblePositioning)
onScopeDispose(clearFabBubbleUndockPositionTimer)
onScopeDispose(teardownFabTouchMoveGuard)
onScopeDispose(() => {
  setAgentAssistantBubbleEntryActive(false)
  stopBubbleListener?.()
  stopBubbleListener = null
  window.removeEventListener('resize', handleWindowResize)
  window.visualViewport?.removeEventListener('resize', handleWindowResize)
  window.removeEventListener('pointerup', handleWindowFabPointerEnd)
  window.removeEventListener('pointercancel', handleWindowFabPointerEnd)
  teardownFabPointerTracking()
})

defineExpose({
  clearBubbles,
  closeBubble,
  setDocked: setFabDocked,
  showAssistantReplyPreview,
  showBubble,
  showNotificationBubble,
  showToastBubble,
})
</script>

<template>
  <div
    v-show="props.active"
    ref="fabRootRef"
    class="agent-assistant-fab"
    :class="{
      'is-docked': fabDocked,
      'is-dragging': fabDragging,
      'is-pressed': fabPressed,
      'is-thinking': props.thinking,
      'is-bubble-visible': hasFabBubbles,
      'is-bubble-positioned': fabBubblePositioned,
      [`is-action-${fabRandomAction}`]: fabRandomAction,
    }"
    :style="fabPositionStyle"
    @pointermove="updateFabPointer"
    @pointerenter="handleFabPointerEnter"
    @pointerleave="handleFabPointerLeave"
  >
    <div
      v-if="hasFabBubbles"
      ref="fabBubbleRef"
      class="agent-assistant-fab__bubbles"
      :class="fabBubbleClassList"
      :style="fabBubblePositionStyle"
      aria-live="polite"
    >
      <div class="agent-assistant-fab__bubble-stack">
        <div
          v-for="bubble in fabBubbles"
          :key="bubble.id"
          class="agent-assistant-fab__bubble"
          :class="[`agent-assistant-fab__bubble--${bubble.kind}`, `agent-assistant-fab__bubble--${bubble.variant}`]"
          :data-bubble-id="bubble.id"
          role="status"
        >
          <strong v-if="bubble.title" class="agent-assistant-fab__bubble-title">
            <VIcon class="agent-assistant-fab__bubble-icon" :icon="getBubbleIcon(bubble.variant)" size="20" />
            <span>{{ bubble.title }}</span>
          </strong>
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
    </div>

    <button
      class="agent-assistant-fab__trigger"
      type="button"
      :aria-label="t('agentAssistant.title')"
      :title="t('agentAssistant.title')"
      @pointerdown="handleFabTriggerPointerDown"
      @pointermove="handleFabTriggerPointerMove"
      @pointerup="handleFabTriggerPointerUp"
      @pointercancel="handleFabTriggerPointerCancel"
      @lostpointercapture="handleFabTriggerLostPointerCapture"
      @click="handleFabTriggerClick"
    >
      <span class="agent-assistant-fab__bot" aria-hidden="true">
        <span class="agent-assistant-fab__antenna" />
        <span class="agent-assistant-fab__head">
          <span class="agent-assistant-fab__face">
            <span class="agent-assistant-fab__eye agent-assistant-fab__eye--left" />
            <span class="agent-assistant-fab__eye agent-assistant-fab__eye--right" />
            <span class="agent-assistant-fab__smile" />
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
/* stylelint-disable no-duplicate-selectors */

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
  --agent-assistant-bubble-bg: rgba(var(--v-theme-surface), 0.92);
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
  outline: none;
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
  display: block;
  inline-size: clamp(15.5rem, 22vw, 19rem);
  inset-block-start: 0;
  inset-inline-start: 0;
  max-block-size: min(34rem, calc(100vh - 8rem));
  max-inline-size: calc(100vw - 1.5rem);
  opacity: 0;
  pointer-events: none;
  transform: translate3d(var(--agent-assistant-bubbles-x), var(--agent-assistant-bubbles-y), 0) scale(0.96);
  transform-origin: var(--agent-assistant-bubble-arrow-x) var(--agent-assistant-bubble-arrow-y);
  transition:
    opacity 0.2s ease,
    transform 0.24s ease;
}

.agent-assistant-fab__bubble-stack {
  display: grid;
  gap: 0.45rem;
  max-block-size: inherit;
  overflow-y: auto;
  padding: 0.12rem;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.agent-assistant-fab__bubble-stack::-webkit-scrollbar {
  display: none;
}

.agent-assistant-fab__bubble {
  position: relative;
  display: grid;

  --agent-assistant-bubble-accent: var(--v-theme-primary);
  --agent-assistant-bubble-accent-rgb: var(--v-theme-primary);

  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 18px;
  backdrop-filter: blur(12px);
  background: var(--agent-assistant-bubble-bg);
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

.agent-assistant-fab__bubble--success {
  --agent-assistant-bubble-accent-rgb: var(--v-theme-success);
}

.agent-assistant-fab__bubble--error {
  --agent-assistant-bubble-accent-rgb: var(--v-theme-error);
}

.agent-assistant-fab__bubble--warning {
  --agent-assistant-bubble-accent-rgb: 245, 158, 11;
}

.agent-assistant-fab__bubble--info {
  --agent-assistant-bubble-accent-rgb: 14, 165, 233;
}

.agent-assistant-fab__bubble--toast {
  border-color: rgba(var(--agent-assistant-bubble-accent-rgb), 0.3);
  background:
    linear-gradient(135deg, rgba(var(--agent-assistant-bubble-accent-rgb), 0.12), transparent 54%),
    rgba(var(--v-theme-surface), 0.95);
}

.agent-assistant-fab__bubble-title {
  display: inline-grid;
  overflow: hidden;
  align-items: center;
  color: rgba(var(--agent-assistant-bubble-accent-rgb), 0.92);
  column-gap: 0.32rem;
  font-size: 1.05rem;
  font-weight: 800;
  grid-template-columns: auto minmax(0, 1fr);
  line-height: 1.25;
  margin-block-end: 0.22rem;
}

.agent-assistant-fab__bubble-title span {
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-assistant-fab__bubble-icon {
  color: rgba(var(--agent-assistant-bubble-accent-rgb), 0.92) !important;
}

.agent-assistant-fab__bubble > span {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 1rem;
  font-weight: 600;
  -webkit-line-clamp: 8;
  line-height: 1.46;
  text-align: start;
  white-space: normal;
}

.agent-assistant-fab__bubbles::before {
  position: absolute;
  z-index: 2;
  --agent-assistant-bubble-arrow-accent-rgb: var(--v-theme-primary);
  --agent-assistant-bubble-arrow-border: rgba(var(--v-theme-on-surface), 0.08);
  --agent-assistant-bubble-arrow-bg: var(--agent-assistant-bubble-bg);

  border: 1px solid var(--agent-assistant-bubble-arrow-border);
  background: var(--agent-assistant-bubble-arrow-bg);
  block-size: 0.62rem;
  border-block-start: 0;
  border-inline-start: 0;
  content: '';
  inline-size: 0.62rem;
  inset-block-start: var(--agent-assistant-bubble-arrow-y);
  inset-inline-start: var(--agent-assistant-bubble-arrow-x);
  transform: rotate(45deg);
}

.agent-assistant-fab__bubbles--arrow-notification::before {
  --agent-assistant-bubble-arrow-border: rgba(var(--v-theme-primary), 0.22);
  --agent-assistant-bubble-arrow-bg: linear-gradient(
      135deg,
      rgba(var(--v-theme-primary), 0.1),
      transparent 48%
    ),
    rgba(var(--v-theme-surface), 0.94);
}

.agent-assistant-fab__bubbles--arrow-success::before {
  --agent-assistant-bubble-arrow-accent-rgb: var(--v-theme-success);
}

.agent-assistant-fab__bubbles--arrow-error::before {
  --agent-assistant-bubble-arrow-accent-rgb: var(--v-theme-error);
}

.agent-assistant-fab__bubbles--arrow-warning::before {
  --agent-assistant-bubble-arrow-accent-rgb: 245, 158, 11;
}

.agent-assistant-fab__bubbles--arrow-info::before {
  --agent-assistant-bubble-arrow-accent-rgb: 14, 165, 233;
}

.agent-assistant-fab__bubbles--arrow-toast::before {
  --agent-assistant-bubble-arrow-border: rgba(var(--agent-assistant-bubble-arrow-accent-rgb), 0.3);
  --agent-assistant-bubble-arrow-bg: linear-gradient(
      135deg,
      rgba(var(--agent-assistant-bubble-arrow-accent-rgb), 0.12),
      transparent 54%
    ),
    rgba(var(--v-theme-surface), 0.95);
}

.agent-assistant-fab__bubbles--top::before {
  margin-block-start: -0.31rem;
  margin-inline-start: -0.31rem;
  border-block-start: 0;
  border-inline-start: 0;
}

.agent-assistant-fab__bubbles--bottom::before {
  margin-block-start: -0.31rem;
  margin-inline-start: -0.31rem;
  border-block-end: 0;
  border-inline-end: 0;
}

.agent-assistant-fab__bubbles--left::before {
  margin-block-start: -0.31rem;
  margin-inline-start: -0.31rem;
  border-block-end: 0;
  border-inline-start: 0;
}

.agent-assistant-fab__bubbles--right::before {
  margin-block-start: -0.31rem;
  margin-inline-start: -0.31rem;
  border-block-start: 0;
  border-inline-end: 0;
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

.agent-assistant-fab__bubble-close:focus-visible {
  opacity: 1;
}

.agent-assistant-fab__bubble-close:hover {
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.86) !important;
}

.agent-assistant-fab.is-bubble-visible.is-bubble-positioned:not(.is-docked) .agent-assistant-fab__bubble {
  pointer-events: auto;
}

.agent-assistant-fab.is-bubble-visible.is-bubble-positioned:not(.is-docked) .agent-assistant-fab__bubbles {
  opacity: 1;
  pointer-events: auto;
  transform: translate3d(var(--agent-assistant-bubbles-x), var(--agent-assistant-bubbles-y), 0) scale(1);
}

.agent-assistant-fab.is-docked .agent-assistant-fab__bubbles {
  opacity: 0;
  pointer-events: none;
  transform: translate3d(var(--agent-assistant-bubbles-x), var(--agent-assistant-bubbles-y), 0) scale(0.9);
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
  animation: agent-fab-antenna-idle 3.9s ease-in-out infinite;
  background: var(--agent-assistant-robot-outline);
  block-size: 0.66rem;
  inline-size: 0.18rem;
  inset-block-start: 0.72rem;
  inset-inline-start: 2.62rem;
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
  animation: agent-fab-head-idle 4.6s ease-in-out infinite;
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
  transform: translate(var(--agent-assistant-head-x), var(--agent-assistant-head-y));
  transform-origin: 50% 85%;
}

.agent-assistant-fab__face {
  position: absolute;
  display: block;
  overflow: hidden;
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

.agent-assistant-fab__smile {
  position: absolute;
  display: block;
  border-radius: 0 0 999px 999px;
  block-size: 0.32rem;
  border-block-end: 0.13rem solid var(--agent-assistant-robot-eye);
  inline-size: 0.7rem;
  inset-block-start: 0.75rem;
  inset-inline-start: 50%;
  opacity: 0;
  transform: translateX(-50%) scale(0.72);
  transform-origin: center top;
}

.agent-assistant-fab__body {
  position: absolute;
  z-index: 3;
  display: block;
  border: 2px solid var(--agent-assistant-robot-outline);
  border-radius: 0.65rem 0.65rem 0.55rem 0.55rem;
  animation: agent-fab-body-idle 4.2s ease-in-out infinite;
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

@media (hover: hover) and (pointer: fine) {
  .agent-assistant-fab.is-bubble-visible .agent-assistant-fab__bubble:hover {
    box-shadow: var(--app-surface-hover-shadow);
  }

  .agent-assistant-fab__bubble:hover .agent-assistant-fab__bubble-close {
    opacity: 1;
  }

  .agent-assistant-fab__trigger:hover .agent-assistant-fab__bot {
    filter: drop-shadow(0 0.7rem 0.7rem var(--agent-assistant-robot-shadow-strong));
  }
}

@media (hover: none), (pointer: coarse) {
  .agent-assistant-fab__bubble-close {
    opacity: 1;
  }
}

.agent-assistant-fab__trigger:focus-visible .agent-assistant-fab__bot {
  filter:
    drop-shadow(0 0.55rem 0.55rem var(--agent-assistant-robot-shadow))
    drop-shadow(0 0 0.34rem rgba(var(--v-theme-primary), 0.55));
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
  transform: translate(calc(var(--agent-assistant-eye-x) * 0.24 - 0.22rem), calc(var(--agent-assistant-eye-y) * 0.24));
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
.agent-assistant-fab.is-action-happy-jump .agent-assistant-fab__antenna,
.agent-assistant-fab.is-action-wave .agent-assistant-fab__head,
.agent-assistant-fab.is-action-sit .agent-assistant-fab__head,
.agent-assistant-fab.is-action-eye-roll .agent-assistant-fab__head,
.agent-assistant-fab.is-action-faint .agent-assistant-fab__head,
.agent-assistant-fab.is-action-disassemble .agent-assistant-fab__head,
.agent-assistant-fab.is-action-happy-jump .agent-assistant-fab__head,
.agent-assistant-fab.is-action-wave .agent-assistant-fab__body,
.agent-assistant-fab.is-action-sit .agent-assistant-fab__body,
.agent-assistant-fab.is-action-eye-roll .agent-assistant-fab__body,
.agent-assistant-fab.is-action-faint .agent-assistant-fab__body,
.agent-assistant-fab.is-action-disassemble .agent-assistant-fab__body,
.agent-assistant-fab.is-action-happy-jump .agent-assistant-fab__body,
.agent-assistant-fab.is-action-wave .agent-assistant-fab__arm,
.agent-assistant-fab.is-action-sit .agent-assistant-fab__arm,
.agent-assistant-fab.is-action-eye-roll .agent-assistant-fab__arm,
.agent-assistant-fab.is-action-faint .agent-assistant-fab__arm,
.agent-assistant-fab.is-action-disassemble .agent-assistant-fab__arm,
.agent-assistant-fab.is-action-happy-jump .agent-assistant-fab__arm,
.agent-assistant-fab.is-action-wave .agent-assistant-fab__leg,
.agent-assistant-fab.is-action-sit .agent-assistant-fab__leg,
.agent-assistant-fab.is-action-eye-roll .agent-assistant-fab__leg,
.agent-assistant-fab.is-action-faint .agent-assistant-fab__leg,
.agent-assistant-fab.is-action-disassemble .agent-assistant-fab__leg,
.agent-assistant-fab.is-action-happy-jump .agent-assistant-fab__leg,
.agent-assistant-fab.is-action-happy-jump .agent-assistant-fab__eye,
.agent-assistant-fab.is-action-happy-jump .agent-assistant-fab__smile {
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

.agent-assistant-fab.is-action-happy-jump .agent-assistant-fab__bot {
  animation: agent-fab-action-happy-jump-bot 5.2s ease-in-out both;
}

.agent-assistant-fab.is-action-happy-jump .agent-assistant-fab__antenna {
  animation: agent-fab-action-happy-jump-antenna 5.2s ease-in-out both;
}

.agent-assistant-fab.is-action-happy-jump .agent-assistant-fab__head {
  animation: agent-fab-action-happy-jump-head 5.2s ease-in-out both;
}

.agent-assistant-fab.is-action-happy-jump .agent-assistant-fab__eye {
  animation: agent-fab-action-happy-jump-eye 5.2s ease-in-out both;
}

.agent-assistant-fab.is-action-happy-jump .agent-assistant-fab__smile {
  animation: agent-fab-action-happy-jump-smile 5.2s ease-in-out both;
}

.agent-assistant-fab.is-action-happy-jump .agent-assistant-fab__body {
  animation: agent-fab-action-happy-jump-body 5.2s ease-in-out both;
}

.agent-assistant-fab.is-action-happy-jump .agent-assistant-fab__arm--left {
  z-index: 6;
  animation: agent-fab-action-happy-jump-arm-left 5.2s ease-in-out both;
}

.agent-assistant-fab.is-action-happy-jump .agent-assistant-fab__arm--right {
  z-index: 6;
  animation: agent-fab-action-happy-jump-arm-right 5.2s ease-in-out both;
}

.agent-assistant-fab.is-action-happy-jump .agent-assistant-fab__leg--left {
  animation: agent-fab-action-happy-jump-leg-left 5.2s ease-in-out both;
}

.agent-assistant-fab.is-action-happy-jump .agent-assistant-fab__leg--right {
  animation: agent-fab-action-happy-jump-leg-right 5.2s ease-in-out both;
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
    transform: rotate(17deg);
  }

  16% {
    transform: translate(-0.08rem, -0.06rem) rotate(64deg);
  }

  30% {
    transform: translate(-0.26rem, -0.28rem) rotate(132deg);
  }

  44% {
    transform: translate(-0.18rem, -0.2rem) rotate(92deg);
  }

  58% {
    transform: translate(-0.26rem, -0.28rem) rotate(132deg);
  }

  72% {
    transform: translate(-0.1rem, -0.08rem) rotate(64deg);
  }

  88% {
    transform: translate(-0.02rem, -0.02rem) rotate(28deg);
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

@keyframes agent-fab-action-happy-jump-bot {
  /* 三段蓄力、起跳、落地，让开心连跳比单纯上下移动更像真人动作。 */
  0%,
  100% {
    transform: scale(var(--agent-assistant-bot-scale)) rotate(var(--agent-assistant-robot-tilt));
  }

  9%,
  37%,
  65% {
    transform: translateY(0.22rem) scale(var(--agent-assistant-bot-scale))
      rotate(calc(var(--agent-assistant-robot-tilt) - 3deg));
  }

  20%,
  48%,
  76% {
    transform: translateY(-0.76rem) scale(var(--agent-assistant-bot-scale))
      rotate(calc(var(--agent-assistant-robot-tilt) + 4deg));
  }

  29%,
  57%,
  85% {
    transform: translateY(0.1rem) scale(var(--agent-assistant-bot-scale))
      rotate(calc(var(--agent-assistant-robot-tilt) - 2deg));
  }

  92% {
    transform: translateY(-0.1rem) scale(var(--agent-assistant-bot-scale))
      rotate(calc(var(--agent-assistant-robot-tilt) + 1deg));
  }
}

@keyframes agent-fab-action-happy-jump-antenna {
  0%,
  100% {
    transform: translate(var(--agent-assistant-head-x), var(--agent-assistant-head-y)) rotate(22deg);
  }

  9%,
  37%,
  65% {
    transform: translate(var(--agent-assistant-head-x), calc(var(--agent-assistant-head-y) + 0.1rem)) rotate(34deg);
  }

  20%,
  48%,
  76% {
    transform: translate(var(--agent-assistant-head-x), calc(var(--agent-assistant-head-y) - 0.2rem)) rotate(-18deg);
  }

  29%,
  57%,
  85% {
    transform: translate(var(--agent-assistant-head-x), calc(var(--agent-assistant-head-y) + 0.04rem)) rotate(38deg);
  }
}

@keyframes agent-fab-action-happy-jump-head {
  0%,
  100% {
    transform: translate(var(--agent-assistant-head-x), var(--agent-assistant-head-y)) rotate(0deg);
  }

  9%,
  37%,
  65% {
    transform: translate(var(--agent-assistant-head-x), calc(var(--agent-assistant-head-y) + 0.1rem)) rotate(-4deg);
  }

  20%,
  48%,
  76% {
    transform: translate(var(--agent-assistant-head-x), calc(var(--agent-assistant-head-y) - 0.16rem)) rotate(7deg);
  }

  29%,
  57%,
  85% {
    transform: translate(var(--agent-assistant-head-x), calc(var(--agent-assistant-head-y) + 0.04rem)) rotate(-5deg);
  }

  92% {
    transform: translate(var(--agent-assistant-head-x), calc(var(--agent-assistant-head-y) - 0.04rem)) rotate(2deg);
  }
}

@keyframes agent-fab-action-happy-jump-eye {
  0%,
  100% {
    border-block-end-width: 0.15rem;
    opacity: 1;
    transform: translate(var(--agent-assistant-eye-x), var(--agent-assistant-eye-y)) scale(1, 1);
  }

  8%,
  36%,
  64%,
  92% {
    border-block-end-width: 0.18rem;
    transform: translate(0, -0.06rem) scale(1.08, 0.72);
  }

  20%,
  48%,
  76% {
    border-block-end-width: 0.19rem;
    transform: translate(0, -0.12rem) scale(1.16, 0.58);
  }
}

@keyframes agent-fab-action-happy-jump-smile {
  0%,
  100% {
    opacity: 0;
    transform: translateX(-50%) scale(0.72);
  }

  6%,
  90% {
    opacity: 1;
  }

  9%,
  37%,
  65% {
    transform: translateX(-50%) translateY(0.02rem) scale(0.92, 0.82);
  }

  20%,
  48%,
  76% {
    transform: translateX(-50%) translateY(-0.04rem) scale(1.22, 1.08);
  }
}

@keyframes agent-fab-action-happy-jump-body {
  0%,
  100% {
    transform: translate(var(--agent-assistant-body-x), var(--agent-assistant-body-y)) scaleY(1);
  }

  9%,
  37%,
  65% {
    transform: translate(var(--agent-assistant-body-x), calc(var(--agent-assistant-body-y) + 0.18rem)) scaleY(0.84)
      rotate(-2deg);
  }

  20%,
  48%,
  76% {
    transform: translate(var(--agent-assistant-body-x), calc(var(--agent-assistant-body-y) - 0.1rem)) scaleY(1.08)
      rotate(4deg);
  }

  29%,
  57%,
  85% {
    transform: translate(var(--agent-assistant-body-x), calc(var(--agent-assistant-body-y) + 0.08rem)) scaleY(0.94)
      rotate(-3deg);
  }
}

@keyframes agent-fab-action-happy-jump-arm-left {
  0%,
  100% {
    transform: rotate(17deg);
  }

  9%,
  37%,
  65% {
    transform: translate(-0.08rem, 0.06rem) rotate(54deg);
  }

  20%,
  48%,
  76% {
    transform: translate(-0.24rem, -0.38rem) rotate(152deg);
  }

  29%,
  57%,
  85% {
    transform: translate(-0.1rem, -0.02rem) rotate(96deg);
  }
}

@keyframes agent-fab-action-happy-jump-arm-right {
  0%,
  100% {
    transform: rotate(-17deg);
  }

  9%,
  37%,
  65% {
    transform: translate(0.08rem, 0.06rem) rotate(-54deg);
  }

  20%,
  48%,
  76% {
    transform: translate(0.24rem, -0.38rem) rotate(-152deg);
  }

  29%,
  57%,
  85% {
    transform: translate(0.1rem, -0.02rem) rotate(-96deg);
  }
}

@keyframes agent-fab-action-happy-jump-leg-left {
  0%,
  100% {
    transform: rotate(0deg);
  }

  9%,
  37%,
  65% {
    transform: translate(0.08rem, -0.22rem) rotate(82deg);
  }

  20%,
  48%,
  76% {
    transform: translate(-0.18rem, 0.08rem) rotate(-32deg);
  }

  29%,
  57%,
  85% {
    transform: translate(0.12rem, -0.08rem) rotate(44deg);
  }
}

@keyframes agent-fab-action-happy-jump-leg-right {
  0%,
  100% {
    transform: rotate(0deg);
  }

  9%,
  37%,
  65% {
    transform: translate(-0.08rem, -0.22rem) rotate(-82deg);
  }

  20%,
  48%,
  76% {
    transform: translate(0.18rem, 0.08rem) rotate(32deg);
  }

  29%,
  57%,
  85% {
    transform: translate(-0.12rem, -0.08rem) rotate(-44deg);
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
    inline-size: min(16.5rem, calc(100vw - 5.6rem));
    max-block-size: min(30rem, calc(100vh - 9.2rem));
  }

  .agent-assistant-fab__bubble-stack {
    gap: 0.38rem;
  }

  .agent-assistant-fab__bubble {
    padding-block: 0.56rem;
    padding-inline: 0.72rem 1.62rem;
  }

  .agent-assistant-fab__bubble-title {
    font-size: 1.05rem;
  }

  .agent-assistant-fab__bubble > span {
    font-size: 1rem;
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
