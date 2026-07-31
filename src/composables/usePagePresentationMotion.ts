import { readonly, ref, type Ref } from 'vue'

export const PAGE_PRESENTATION_MOTION_DURATION_MS = 180
export const PAGE_PRESENTATION_MOTION_START_OPACITY = 0.88
export const PAGE_PRESENTATION_MOTION_START_TRANSLATE_Y = 4
export const PAGE_PRESENTATION_FROSTED_START_TRANSLATE_Y = 8
export const PAGE_PRESENTATION_LAYOUT_STABLE_MS = 120
export const PAGE_PRESENTATION_LAYOUT_HOLD_MAX_MS = 480

/** renderer 只读取同一帧已经提交到 DOM 的页面呈现状态。 */
export interface PagePresentationMotionReader {
  /** renderer 确认当前事务的 surface 几何已稳定后，允许页面开始 reveal。 */
  acknowledgeGeometryReady: (motionEpoch: number, timestamp?: number) => boolean
  /** 页面是否处于共享呈现事务中。 */
  active: Readonly<Ref<boolean>>
  /** 当前呈现事务版本；旧 surface 采样不得完成新事务。 */
  epoch: Readonly<Ref<number>>
  /** 页面内容的呈现透明度；renderer 按材质合成约束决定是否使用。 */
  opacity: Readonly<Ref<number>>
  /** 每次 DOM motion 样式提交后递增，renderer 据此在同一帧刷新表面。 */
  revision: Readonly<Ref<number>>
}

const active = ref(false)
const epoch = ref(0)
const opacity = ref(1)
const progress = ref(1)
const revision = ref(0)
const routeKey = ref('')
const translateY = ref(0)
let animationFrame: number | null = null
let layoutHoldActive = false
let layoutHoldStartedAt = 0
let layoutStableSince = 0
let layoutSignature = ''
let motionStartTranslateY = PAGE_PRESENTATION_MOTION_START_TRANSLATE_Y
let startedAt = 0
let preserveFrostedMaterial = false

function sampleBezier(time: number, start: number, end: number) {
  const inverse = 1 - time

  return 3 * inverse * inverse * time * start + 3 * inverse * time * time * end + time * time * time
}

/** 计算玻璃页面统一使用的 `cubic-bezier(0.2, 0.8, 0.2, 1)` 进度。 */
export function getPagePresentationMotionProgress(elapsed: number, duration = PAGE_PRESENTATION_MOTION_DURATION_MS) {
  if (duration <= 0 || elapsed >= duration) return 1
  if (elapsed <= 0) return 0

  const target = elapsed / duration
  let lower = 0
  let upper = 1
  let parameter = target

  for (let iteration = 0; iteration < 10; iteration += 1) {
    parameter = (lower + upper) * 0.5
    if (sampleBezier(parameter, 0.2, 0.2) < target) lower = parameter
    else upper = parameter
  }

  return sampleBezier(parameter, 0.8, 1)
}

function clearDocumentMotionState() {
  const root = document.documentElement
  delete root.dataset.pagePresentationMotion
  root.style.removeProperty('--mp-page-motion-opacity')
  root.style.removeProperty('--mp-page-motion-translate-y')
}

/** 先提交 DOM 样式，再发布 revision，保证 renderer 读取到同一帧的真实矩形。 */
function applyMotionFrame(nextProgress: number) {
  const root = document.documentElement
  const nextOpacity = preserveFrostedMaterial
    ? 1
    : PAGE_PRESENTATION_MOTION_START_OPACITY + (1 - PAGE_PRESENTATION_MOTION_START_OPACITY) * nextProgress
  const nextTranslateY = motionStartTranslateY * (1 - nextProgress)

  root.dataset.pagePresentationMotion = 'active'
  root.style.setProperty('--mp-page-motion-opacity', nextOpacity.toFixed(4))
  root.style.setProperty('--mp-page-motion-translate-y', `${nextTranslateY.toFixed(3)}px`)
  opacity.value = nextOpacity
  progress.value = nextProgress
  translateY.value = nextTranslateY
  revision.value += 1
}

/** 布局门关闭时 DOM 与 renderer 都不暴露尚未稳定的页面几何。 */
function applyLayoutHoldFrame() {
  const root = document.documentElement

  root.dataset.pagePresentationMotion = 'active'
  root.style.setProperty('--mp-page-motion-opacity', preserveFrostedMaterial ? '1' : '0')
  root.style.setProperty('--mp-page-motion-translate-y', `${motionStartTranslateY}px`)
  opacity.value = preserveFrostedMaterial ? 1 : 0
  progress.value = 0
  translateY.value = motionStartTranslateY
  revision.value += 1
}

function getLayoutSignature(root: HTMLElement) {
  return `${root.offsetWidth},${root.offsetHeight},${root.scrollWidth},${root.scrollHeight}`
}

function beginReveal(timestamp: number, motionEpoch: number) {
  if (!active.value || epoch.value !== motionEpoch) return

  layoutHoldActive = false
  startedAt = timestamp
  applyMotionFrame(0)
  animationFrame = window.requestAnimationFrame(nextTimestamp => renderFrame(nextTimestamp, motionEpoch))
}

/** GPU surface 比整页高度更早稳定时，直接结束布局等待。 */
function acknowledgeGeometryReady(motionEpoch: number, timestamp = performance.now()) {
  if (!active.value || epoch.value !== motionEpoch || !layoutHoldActive) return false

  if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
  animationFrame = null
  beginReveal(timestamp, motionEpoch)

  return true
}

/** 页面根持续稳定后才开始 reveal；上限避免持续布局页面永久不可见。 */
function sampleLayoutHold(timestamp: number, motionEpoch: number, root: HTMLElement) {
  if (!active.value || epoch.value !== motionEpoch) return
  animationFrame = null

  const nextSignature = getLayoutSignature(root)
  if (nextSignature !== layoutSignature) {
    layoutSignature = nextSignature
    layoutStableSince = timestamp
  }

  if (
    timestamp - layoutStableSince >= PAGE_PRESENTATION_LAYOUT_STABLE_MS ||
    timestamp - layoutHoldStartedAt >= PAGE_PRESENTATION_LAYOUT_HOLD_MAX_MS
  ) {
    beginReveal(timestamp, motionEpoch)
    return
  }

  animationFrame = window.requestAnimationFrame(nextTimestamp => sampleLayoutHold(nextTimestamp, motionEpoch, root))
}

function settleMotion() {
  layoutHoldActive = false
  active.value = false
  opacity.value = 1
  progress.value = 1
  translateY.value = 0
  clearDocumentMotionState()
}

function cancel() {
  const needsRendererCommit =
    active.value ||
    opacity.value !== 1 ||
    translateY.value !== 0 ||
    document.documentElement.dataset.pagePresentationMotion === 'active'

  if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
  animationFrame = null
  if (needsRendererCommit) epoch.value += 1
  settleMotion()
  if (needsRendererCommit) revision.value += 1
}

function renderFrame(timestamp: number, motionEpoch: number) {
  if (!active.value || epoch.value !== motionEpoch) return
  animationFrame = null

  const nextProgress = getPagePresentationMotionProgress(timestamp - startedAt)
  applyMotionFrame(nextProgress)
  if (nextProgress < 1) {
    animationFrame = window.requestAnimationFrame(nextTimestamp => renderFrame(nextTimestamp, motionEpoch))
    return
  }

  settleMotion()
}

/**
 * 需要 renderer 同步或保持磨砂密度的玻璃页面由共享控制器接管；其他页面交给普通 WAAPI。
 * 返回 true 表示本次路由变化已经处理，包括 reduced-motion 的即时提交。
 */
function start(nextRouteKey: string, layoutRoot?: HTMLElement | null) {
  if (document.documentElement.dataset.theme !== 'glass') {
    cancel()
    return false
  }

  if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
  animationFrame = null
  layoutHoldActive = false
  epoch.value += 1
  const motionEpoch = epoch.value
  routeKey.value = nextRouteKey
  preserveFrostedMaterial = document.documentElement.dataset.glassAppearance === 'frosted'
  const usesCssQuality = document.documentElement.dataset.glassQuality === 'css'
  if (usesCssQuality && !preserveFrostedMaterial) {
    settleMotion()
    revision.value += 1
    return false
  }

  motionStartTranslateY = preserveFrostedMaterial
    ? PAGE_PRESENTATION_FROSTED_START_TRANSLATE_Y
    : PAGE_PRESENTATION_MOTION_START_TRANSLATE_Y

  // 启动屏已完整遮罩页面；在其背后再等待布局稳定会把一次启动拆成两次可见揭示。
  if (document.documentElement.dataset.launchLoading === 'true' && document.getElementById('loading-bg')) {
    settleMotion()
    revision.value += 1
    return true
  }

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    settleMotion()
    revision.value += 1
    return true
  }

  active.value = true
  const timestamp = performance.now()
  if (layoutRoot && !usesCssQuality) {
    layoutHoldActive = true
    layoutHoldStartedAt = timestamp
    layoutStableSince = timestamp
    layoutSignature = getLayoutSignature(layoutRoot)
    applyLayoutHoldFrame()
    animationFrame = window.requestAnimationFrame(nextTimestamp =>
      sampleLayoutHold(nextTimestamp, motionEpoch, layoutRoot),
    )
  } else {
    beginReveal(timestamp, motionEpoch)
  }

  return true
}

const reader: PagePresentationMotionReader = {
  acknowledgeGeometryReady,
  active: readonly(active),
  epoch: readonly(epoch),
  opacity: readonly(opacity),
  revision: readonly(revision),
}

/** 提供默认布局与 glass renderer 共享的短时页面呈现事务。 */
export function usePagePresentationMotion() {
  return {
    active: readonly(active),
    cancel,
    epoch: readonly(epoch),
    opacity: reader.opacity,
    progress: readonly(progress),
    reader,
    revision: reader.revision,
    routeKey: readonly(routeKey),
    start,
    translateY: readonly(translateY),
  }
}
