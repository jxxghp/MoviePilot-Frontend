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
import AgentPetStage from './pet/AgentPetStage.vue'
import type { AgentPetActionName, AgentPetIntent } from './pet/types'
import { useAgentPetMachine } from './pet/useAgentPetMachine'

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
const FAB_RIGHT_EDGE_RESIZE_FOLLOW_DISTANCE = 128
const FAB_DRAG_SUPPRESS_CLICK_DELAY = 450

type FabBubblePlacement = 'bottom' | 'left' | 'right' | 'top'

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

let fabIdleTimer: number | null = null
let fabDragState: FabDragState | null = null
let fabSuppressNextClick = false
let fabSuppressNextClickTimer: number | null = null
let fabPointerFrame = 0
let fabPendingPointerPoint: FabPointerPoint | null = null
let fabBubblePositionFrame = 0
let fabBubbleResizeObserver: ResizeObserver | null = null
let fabBubbleUndockPositionTimer: number | null = null
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
const agentPetIntent = computed<AgentPetIntent>(() => {
  if (fabDragging.value) return 'dragging'
  if (fabDocked.value) return 'docked'
  if (props.thinking) return 'thinking'
  if (hasFabBubbles.value) return 'notify'

  return 'idle'
})
const {
  clearAction: clearFabRandomAction,
  currentAction: fabRandomAction,
  playAction: playAgentPetAction,
  scheduleRandomAction: scheduleFabRandomAction,
} = useAgentPetMachine({
  active: () => props.active,
  docked: fabDocked,
  dragging: fabDragging,
  pressed: fabPressed,
  scheduleAutoDock: scheduleFabAutoDock,
  shouldAutoDock: shouldFabAutoDock,
  thinking: () => props.thinking,
})

// 生成气泡唯一 ID，避免通知、toast 和预览气泡在堆叠中冲突。
function createBubbleId(prefix = 'bubble') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// 获取当前可用视口尺寸，兼容布局视口和可视视口短暂不同步的场景。
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

// 获取展开状态下入口外层容器尺寸，用于默认定位和拖拽边界计算。
function getOpenFabSize() {
  const viewport = getViewportSize()
  const isMobile = isMobileFabViewport()

  return {
    height: isMobile ? 106 : 115,
    width: isMobile ? Math.min(198, Math.max(0, viewport.width - 16)) : 211,
  }
}

// 在 DOM 尺寸不可用时返回入口触发热区的兜底边界。
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

// 计算入口贴到右侧边缘时的横向坐标。
function getDockedFabX() {
  return Math.max(0, getViewportSize().width - 42)
}

// 获取实际机器人触发热区边界，避免外层空白影响拖拽贴边。
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

// 计算入口默认落点，刷新后回到右侧约三分之二高度。
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

// 计算入口在当前视口内允许移动的坐标范围。
function getFabPositionRange(options: FabPositionRangeOptions = {}) {
  const viewport = getViewportSize()
  const bounds = options.useOpenBounds ? getFallbackFabInteractiveBounds() : getFabInteractiveBounds()
  const minX = -bounds.offsetX
  const minY = -bounds.offsetY
  const maxX = Math.max(minX, viewport.width - bounds.offsetX - bounds.width)
  const maxY = Math.max(minY, viewport.height - bounds.offsetY - bounds.height)

  return { maxX, maxY, minX, minY }
}

// 把入口位置限制在允许移动范围内。
function clampFabPosition(position: FabPosition, options: FabPositionRangeOptions = {}) {
  if (typeof window === 'undefined') return position

  const range = getFabPositionRange(options)

  return {
    x: Math.min(range.maxX, Math.max(range.minX, position.x)),
    y: Math.min(range.maxY, Math.max(range.minY, position.y)),
  }
}

// 把入口纵向位置限制在允许移动范围内。
function clampFabY(y: number, options: FabPositionRangeOptions = {}) {
  const range = getFabPositionRange(options)

  return Math.min(range.maxY, Math.max(range.minY, y))
}

// 获取当前入口位置，未初始化时回退到默认位置。
function getCurrentFabPosition() {
  return fabPosition.value || getDefaultFabPosition()
}

// 计算入口右侧与视口右边缘之间的距离。
function getFabRightEdgeOffset(position = getCurrentFabPosition()) {
  const viewport = getViewportSize()
  const size = getOpenFabSize()

  return viewport.width - (position.x + size.width)
}

// 计算入口纵向位置在可移动范围内的比例。
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

// 判断当前锚点是否满足自动贴边收起条件。
function shouldFabAutoDock() {
  return fabPositionAnchor?.mode === 'right' && fabPositionAnchor.rightOffset <= FAB_RIGHT_EDGE_DOCK_DISTANCE
}

// 把自由拖拽坐标转换成可随视口缩放恢复的比例坐标。
function getFabFreePositionRatio(position: FabPosition, options: FabPositionRangeOptions = {}): FabPositionRatio {
  const range = getFabPositionRange(options)
  const xRange = range.maxX - range.minX
  const yRange = range.maxY - range.minY

  return {
    x: xRange > 0 ? (position.x - range.minX) / xRange : 0,
    y: yRange > 0 ? (position.y - range.minY) / yRange : 0,
  }
}

// 根据比例坐标还原入口位置。
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

// 根据纵向比例还原入口 Y 坐标。
function getFabYFromRatio(yRatio: number, options: FabPositionRangeOptions = {}) {
  const range = getFabPositionRange(options)

  return range.minY + (range.maxY - range.minY) * yRatio
}

// 根据右侧贴边或自由位置锚点还原入口坐标。
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

// 获取从贴边状态开始拖拽时应恢复的展开位置。
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

// 更新入口位置并按需同步锚点和气泡位置。
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

// 获取入口根节点，优先使用组件 ref，兜底查询 DOM。
function getFabRootElement() {
  return fabRootRef.value || (document.querySelector('.agent-assistant-fab') as HTMLElement | null)
}

// 获取气泡定位使用的机器人锚点区域。
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

// 获取气泡容器尺寸，未渲染完成时使用响应式兜底宽高。
function getFabBubbleSize() {
  const viewport = getViewportSize()
  const rect = fabBubbleRef.value?.getBoundingClientRect()
  const fallbackWidth = Math.min(viewport.width - FAB_BUBBLE_SAFE_MARGIN * 2, viewport.width <= 600 ? 264 : 304)

  return {
    height: rect && rect.height > 0 ? rect.height : 160,
    width: rect && rect.width > 0 ? rect.width : Math.max(0, fallbackWidth),
  }
}

// 把气泡单轴坐标限制在视口安全边距内。
function clampBubbleAxis(value: number, size: number, viewportSize: number) {
  const min = FAB_BUBBLE_SAFE_MARGIN
  const max = Math.max(min, viewportSize - size - FAB_BUBBLE_SAFE_MARGIN)

  return clampNumber(value, min, max)
}

// 把气泡箭头位置限制在气泡边缘安全范围内。
function clampBubbleArrow(value: number, size: number) {
  const margin = Math.min(FAB_BUBBLE_ARROW_MARGIN, size / 2)

  return clampNumber(value, margin, Math.max(margin, size - margin))
}

// 计算某个气泡候选位置的空间不足和偏移惩罚。
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

// 根据机器人位置、气泡尺寸和视口空间选择最佳气泡布局。
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

// 在无法匹配具体气泡元素时推断箭头颜色来源。
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

// 计算气泡元素到箭头落点的距离，用于匹配箭头来源。
function getBubbleDistanceToArrow(rect: DOMRect, arrowX: number, arrowY: number, placement: FabBubblePlacement) {
  if (placement === 'left' || placement === 'right') {
    if (arrowY >= rect.top && arrowY <= rect.bottom) return 0

    return Math.min(Math.abs(arrowY - rect.top), Math.abs(arrowY - rect.bottom))
  }

  if (arrowX >= rect.left && arrowX <= rect.right) return 0

  return Math.min(Math.abs(arrowX - rect.left), Math.abs(arrowX - rect.right))
}

// 同步当前箭头指向的气泡类型和状态颜色。
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

// 把计算出的气泡位置和箭头位置写入 CSS 变量。
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

// 使用 requestAnimationFrame 合并气泡位置更新。
function scheduleFabBubblePositionUpdate() {
  if (fabBubblePositionFrame || !hasFabBubbles.value) return

  fabBubblePositionFrame = window.requestAnimationFrame(() => {
    fabBubblePositionFrame = 0
    syncFabBubblePosition()
  })
}

// 清理贴边展开后的延迟气泡定位计时器。
function clearFabBubbleUndockPositionTimer() {
  if (fabBubbleUndockPositionTimer === null) return

  window.clearTimeout(fabBubbleUndockPositionTimer)
  fabBubbleUndockPositionTimer = null
}

// 安排贴边展开动画后的气泡位置复算。
function scheduleFabBubblePostUndockPositionUpdate() {
  clearFabBubbleUndockPositionTimer()
  fabBubbleUndockPositionTimer = window.setTimeout(() => {
    fabBubbleUndockPositionTimer = null
    syncFabBubblePosition()
  }, FAB_BUBBLE_UNDOCK_POSITION_SYNC_DELAY)
}

// 同步气泡 ResizeObserver，让内容高度变化后重新定位。
function syncFabBubbleResizeObserver() {
  fabBubbleResizeObserver?.disconnect()
  fabBubbleResizeObserver = null

  if (!fabBubbleRef.value || typeof ResizeObserver === 'undefined') return

  fabBubbleResizeObserver = new ResizeObserver(() => {
    scheduleFabBubblePositionUpdate()
  })
  fabBubbleResizeObserver.observe(fabBubbleRef.value)
}

// 清理气泡定位相关的动画帧、观察器和计时器。
function teardownFabBubblePositioning() {
  if (fabBubblePositionFrame) {
    window.cancelAnimationFrame(fabBubblePositionFrame)
    fabBubblePositionFrame = 0
  }

  fabBubbleResizeObserver?.disconnect()
  fabBubbleResizeObserver = null
  clearFabBubbleUndockPositionTimer()
}

// 重置入口到默认位置并同步锚点和气泡位置。
function resetFabPosition() {
  fabPosition.value = getDefaultFabPosition()
  updateFabAnchorFromPosition(fabPosition.value)
  scheduleFabBubblePositionUpdate()
  if (shouldFabAutoDock()) scheduleFabAutoDock()
}

// 在窗口或可视视口变化时按锚点恢复入口位置。
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

// 把 Markdown 内容压缩成适合气泡预览的纯文本。
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

// 重置机器人按压状态和眼神跟随位移。
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

// 清理入口自动贴边计时器。
function clearFabIdleTimer() {
  if (fabIdleTimer === null) return

  window.clearTimeout(fabIdleTimer)
  fabIdleTimer = null
}

// 清理拖拽后抑制点击的恢复计时器。
function clearFabSuppressNextClickTimer() {
  if (fabSuppressNextClickTimer === null) return

  window.clearTimeout(fabSuppressNextClickTimer)
  fabSuppressNextClickTimer = null
}

// 拖拽结束后短暂抑制下一次点击，避免误打开面板。
function suppressNextFabClick() {
  fabSuppressNextClick = true
  clearFabSuppressNextClickTimer()
  fabSuppressNextClickTimer = window.setTimeout(() => {
    fabSuppressNextClick = false
    fabSuppressNextClickTimer = null
  }, FAB_DRAG_SUPPRESS_CLICK_DELAY)
}

// 在入口靠近右侧边缘且空闲时安排自动贴边收起。
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

// 暂停入口自动贴边收起。
function pauseFabAutoDock() {
  clearFabIdleTimer()
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

// 构建通知气泡标题，缺省时回退到来源或通知中心文案。
function buildNotificationBubbleTitle(payload: AgentAssistantNotificationBubblePayload) {
  return payload.title || payload.source || payload.mtype || t('notification.center')
}

// 构建通知气泡正文，并清理 Markdown 标记。
function buildNotificationBubbleText(payload: AgentAssistantNotificationBubblePayload) {
  return stripMarkdownPreview(payload.text || payload.title || payload.source || payload.mtype || '')
}

// 获取气泡视觉状态，缺省使用默认状态。
function getBubbleVariant(payload: AgentAssistantBubblePayload): AgentAssistantBubbleVariant {
  return payload.variant || 'default'
}

// 根据气泡状态选择标题图标。
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

// 根据 toast 类型构建 Agent 气泡标题。
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

// 清理指定气泡的自动关闭计时器。
function clearFabBubbleTimer(id: string) {
  const timer = fabBubbleTimers.get(id)
  if (!timer) return

  window.clearTimeout(timer)
  fabBubbleTimers.delete(id)
}

// 安排气泡在指定时长后自动移除。
function scheduleFabBubbleRemoval(id: string, duration = FAB_NOTIFICATION_BUBBLE_DURATION) {
  clearFabBubbleTimer(id)
  fabBubbleTimers.set(
    id,
    window.setTimeout(() => {
      closeBubble(id)
    }, duration),
  )
}

// 新增或更新气泡，并维护堆叠上限和定位。
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

// 规范化气泡输入并展示到入口气泡堆叠。
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

// 展示助手回复预览气泡。
function showAssistantReplyPreview(value: string) {
  showBubble({
    id: 'assistant-preview',
    kind: 'assistant',
    text: value,
  })
}

// 展示通知中心推送过来的气泡。
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

// 展示全局 toast 路由过来的气泡。
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

// 根据全局气泡事件类型分发到通知或 toast 展示逻辑。
function showAgentAssistantBubble(payload: AgentAssistantBubblePayload) {
  if ((payload.kind || 'notification') === 'toast') {
    showToastBubble(payload)
    return
  }

  showNotificationBubble(payload as AgentAssistantNotificationBubblePayload)
}

// 主动播放一个宠物动作，供外部入口或后续复杂动画事件复用。
function playPetAction(action: AgentPetActionName) {
  playAgentPetAction(action)
}

// 关闭指定气泡，未传 ID 时关闭全部气泡。
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

// 清空入口上的全部气泡。
function clearBubbles() {
  closeBubble()
}

// 清理所有气泡和自动关闭计时器。
function resetFabBubbles() {
  fabBubbles.value.forEach(item => clearFabBubbleTimer(item.id))
  fabBubbles.value = []
  fabBubblePositioned.value = false
  nextTick(syncFabBubbleResizeObserver)
}

// 切换入口贴边收起状态并恢复对应位置。
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

// 清理拖拽状态和触摸移动拦截。
function clearFabDragState() {
  fabDragState = null
  fabDragging.value = false
  fabPressed.value = false
  teardownFabTouchMoveGuard()
}

// 释放指针捕获，容忍浏览器提前中断捕获的情况。
function releaseFabPointerCapture(event: PointerEvent) {
  try {
    ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
  } catch {
    // 指针捕获可能已被浏览器或 DevTools 中断，状态以组件内清理为准。
  }
}

// 取消当前拖拽并根据位置恢复自动贴边策略。
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

// 拦截入口指针事件，按需阻止触摸默认滚动。
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

// 在触摸拖拽期间拦截页面滚动。
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

// 移除触摸拖拽滚动拦截。
function teardownFabTouchMoveGuard() {
  stopFabTouchMoveGuard?.()
}

// 判断当前指针事件是否仍处于按压拖拽状态。
function isPressedDragPointer(event: PointerEvent) {
  if (event.pointerType === 'touch' || event.pointerType === 'pen') {
    return event.buttons !== 0 || event.pressure > 0
  }

  return event.buttons !== 0
}

// 处理入口触发区按下事件并初始化拖拽状态。
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

// 处理入口拖拽移动并同步位置和眼神跟随。
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

// 处理入口拖拽释放并决定是否贴边收起。
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

// 处理指针取消事件并终止拖拽。
function handleFabTriggerPointerCancel(event: PointerEvent) {
  guardFabPointerEvent(event)
  fabPressed.value = false

  if (!fabDragState || fabDragState.pointerId !== event.pointerId) return

  releaseFabPointerCapture(event)

  cancelFabDrag()
}

// 处理指针捕获丢失时的拖拽收敛。
function handleFabTriggerLostPointerCapture(event: PointerEvent) {
  if (!fabDragState || fabDragState.pointerId !== event.pointerId) return

  cancelFabDrag()
}

// 兜底处理窗口级指针结束事件。
function handleWindowFabPointerEnd(event: PointerEvent) {
  if (!fabDragState || fabDragState.pointerId !== event.pointerId) return

  cancelFabDrag()
}

// 处理入口点击，贴边时先展开，否则打开助手面板。
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

// 处理指针离开入口时的自动贴边排队。
function handleFabPointerLeave() {
  if (!fabDocked.value && shouldFabAutoDock()) scheduleFabAutoDock()
}

// 处理指针进入入口时暂停自动贴边。
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

onScopeDispose(clearFabIdleTimer)
onScopeDispose(clearFabSuppressNextClickTimer)
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
  playPetAction,
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
      <AgentPetStage :action="fabRandomAction" :intent="agentPetIntent" :thinking="props.thinking" />
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
</style>
