<script setup lang="ts">
import { usePreferredReducedMotion } from '@vueuse/core'
import type {
  ThemeCustomizerGlassAppearance,
  ThemeCustomizerGlassDynamicsMode,
  ThemeCustomizerGlassQuality,
} from '@/composables/useThemeCustomizer'
import { useGlassMobilePresentation } from '@/composables/useGlassPresentationCapabilities'
import { usePagePresentationMotion } from '@/composables/usePagePresentationMotion'
import {
  createGlassWallpaperSourceCache,
  getGlassWallpaperPreparationKey,
  setGlassRendererState,
  useGlassOpticalInteractionSource,
  useGlassOpticalRenderer,
  type GlassRendererState,
} from '@/composables/useGlassOpticalRenderer'

const props = defineProps<{
  /** 当前玻璃材质，用于选择透明、色调或磨砂的光学参数。 */
  appearance: ThemeCustomizerGlassAppearance
  /** 用户选择的局部非均匀形变强度。 */
  deformationStrength: number
  /** 用户选择的轨迹、尾波与惯性强度。 */
  flowStrength: number
  /** 用户保存的动态效果模式；能力降级不会回写该选择。 */
  dynamicsMode: ThemeCustomizerGlassDynamicsMode
  /** 当前光学质量；标准档不会挂载该组件。 */
  quality: Exclude<ThemeCustomizerGlassQuality, 'css'>
  /** 用户选择的亮边、镜面高光与焦散强度。 */
  reflectionStrength: number
  /** 用户选择的真实壁纸可见度。 */
  transparencyStrength: number
  /** 玻璃内部壁纸采样的透射亮度；不会改变外层壁纸的曝光合同。 */
  transmissionStrength: number
  /** 用户选择的共享壁纸采样平移强度。 */
  translationStrength: number
  /** 路由变化标识，用于在页面内容稳定后重新发现高价值表面。 */
  routeKey: string
  /** 由用户主色派生的大面积玻璃材料色，用于同步色调材质的光学高光。 */
  tintColor: string
  /** 外层壁纸交叉淡化的时长，shader 使用同一时钟混合双纹理。 */
  transitionDuration: number
  /** 外层壁纸交叉淡化的 performance timeline 起点。 */
  transitionStartedAt: number
  /** 与 CSS 背景保持一致的活动壁纸。 */
  wallpaperUrl: string
  /** 切换期保留的上一张壁纸；空值表示当前没有交叉淡化。 */
  previousWallpaperUrl: string
  /** 下一张同源壁纸；两个 context 均完成上传后才允许外层提交切换。 */
  pendingWallpaperUrl?: string
  /** 单调递增的壁纸准备事务版本；相同 URL 的旧回执不得完成新事务。 */
  pendingWallpaperRevision?: number
  /** 父层已完成可见图片预载，允许两个 context 在同一绘制帧提交该 revision。 */
  activateWallpaperRevision?: number
}>()

const timingWindow = window as typeof window & {
  __glassPerformanceProbeEnabled?: boolean
  __glassLaunchTimings?: Array<{ detail?: string; stage: string; time: number }>
}
if (import.meta.env.DEV && timingWindow.__glassPerformanceProbeEnabled) {
  timingWindow.__glassLaunchTimings ??= []
  timingWindow.__glassLaunchTimings.push({
    stage: 'optical-layer-setup',
    time: performance.now(),
  })
}

const emit = defineEmits<{
  /** fixed 与 scroll renderer 均已准备同一张待切换纹理。 */
  wallpaperPrepared: [url: string, revision: number]
  /** 任一 context 无法准备当前 revision；父层必须立即取消整笔事务。 */
  wallpaperPreparationFailed: [url: string, revision: number]
  /** fixed 与 scroll renderer 均已消费 prepared 纹理并切到活动槽。 */
  wallpaperActivated: [url: string, revision: number, startedAt: number]
  /** 任一 context 提交失败；父层必须取消该 revision。 */
  wallpaperActivationFailed: [url: string, revision: number]
}>()

const fixedCanvas = ref<HTMLCanvasElement | null>(null)
const scrollCanvas = ref<HTMLCanvasElement | null>(null)
const usesMobilePresentation = useGlassMobilePresentation()
const preferredMotion = usePreferredReducedMotion()
const compositeFailureLatched = ref(false)
const compositeRecoveryPending = ref(false)
const presentationMode = computed<ThemeCustomizerGlassDynamicsMode>(() =>
  usesMobilePresentation.value || preferredMotion.value === 'reduce' ? 'off' : props.dynamicsMode,
)
const effectiveDynamicsMode = computed<ThemeCustomizerGlassDynamicsMode>(() =>
  compositeFailureLatched.value ? 'off' : presentationMode.value,
)
const dynamicsActive = computed(() => effectiveDynamicsMode.value !== 'off')
const interactionSource = useGlassOpticalInteractionSource(dynamicsActive)
const pagePresentationMotion = usePagePresentationMotion()
const wallpaperSourceCache = createGlassWallpaperSourceCache()
const fixedRenderer = useGlassOpticalRenderer({
  active: true,
  appearance: () => props.appearance,
  canvas: fixedCanvas,
  deformationStrength: () => props.deformationStrength,
  dynamicsActive,
  dynamicsMode: effectiveDynamicsMode,
  flowStrength: () => props.flowStrength,
  interactionSource,
  quality: () => props.quality,
  reflectionStrength: () => props.reflectionStrength,
  transparencyStrength: () => props.transparencyStrength,
  transmissionStrength: () => props.transmissionStrength,
  translationStrength: () => props.translationStrength,
  routeKey: () => props.routeKey,
  tintColor: () => props.tintColor,
  transitionDuration: () => props.transitionDuration,
  transitionStartedAt: () => props.transitionStartedAt,
  wallpaperUrl: () => props.wallpaperUrl,
  wallpaperSourceCache,
  previousWallpaperUrl: () => props.previousWallpaperUrl,
  pendingWallpaperUrl: () => props.pendingWallpaperUrl ?? '',
  pendingWallpaperRevision: () => props.pendingWallpaperRevision ?? 0,
  surfaceSpace: 'fixed',
  syncDocumentState: false,
})
const scrollRenderer = useGlassOpticalRenderer({
  active: true,
  appearance: () => props.appearance,
  canvas: scrollCanvas,
  deformationStrength: () => props.deformationStrength,
  dynamicsActive,
  dynamicsMode: effectiveDynamicsMode,
  flowStrength: () => props.flowStrength,
  interactionSource,
  pageMotion: pagePresentationMotion.reader,
  quality: () => props.quality,
  reflectionStrength: () => props.reflectionStrength,
  transparencyStrength: () => props.transparencyStrength,
  transmissionStrength: () => props.transmissionStrength,
  translationStrength: () => props.translationStrength,
  routeKey: () => props.routeKey,
  tintColor: () => props.tintColor,
  transitionDuration: () => props.transitionDuration,
  transitionStartedAt: () => props.transitionStartedAt,
  wallpaperUrl: () => props.wallpaperUrl,
  wallpaperSourceCache,
  previousWallpaperUrl: () => props.previousWallpaperUrl,
  pendingWallpaperUrl: () => props.pendingWallpaperUrl ?? '',
  pendingWallpaperRevision: () => props.pendingWallpaperRevision ?? 0,
  surfaceSpace: 'scroll',
  syncDocumentState: false,
})

/** 用户显式改选动态策略时，用同一代次重建两个已进入复合回退的 renderer。 */
function retryCompositeRenderers() {
  compositeRecoveryPending.value = true
  compositeFailureLatched.value = false
  void Promise.allSettled([fixedRenderer.retryAfterFailure(), scrollRenderer.retryAfterFailure()])
}

watch(
  () => props.dynamicsMode,
  (mode, previousMode) => {
    if (mode === previousMode || (!compositeFailureLatched.value && !compositeRecoveryPending.value)) return

    retryCompositeRenderers()
  },
)

const rendererState = ref<GlassRendererState>('loading')

/** 两个呈现 context 作为同一材质能力接管 CSS，避免部分就绪时出现混合材质。 */
watchEffect(() => {
  const states = [fixedRenderer.state.value, scrollRenderer.state.value]
  const allReady = states.every(value => value === 'ready')
  const anyFallback = states.some(value => value === 'fallback')
  const anyLoading = states.some(value => value === 'loading')
  if (compositeRecoveryPending.value) {
    if (allReady) compositeRecoveryPending.value = false
    else if (anyFallback && !anyLoading) {
      compositeRecoveryPending.value = false
      compositeFailureLatched.value = true
    }
  } else if (anyFallback) compositeFailureLatched.value = true
  else if (compositeFailureLatched.value && allReady) compositeFailureLatched.value = false
  const state: GlassRendererState = compositeRecoveryPending.value
    ? 'loading'
    : compositeFailureLatched.value
      ? 'fallback'
      : allReady
        ? 'ready'
        : 'loading'

  setGlassRendererState(rendererState, state)
  if (import.meta.env.DEV && timingWindow.__glassPerformanceProbeEnabled) {
    timingWindow.__glassLaunchTimings?.push({
      detail: state,
      stage: 'optical-layer-state',
      time: performance.now(),
    })
  }
})

watchEffect(() => {
  document.documentElement.dataset.glassDynamicsMode = props.dynamicsMode
  document.documentElement.dataset.glassDynamicsEffectiveMode = effectiveDynamicsMode.value
})

let lastPreparedAcknowledgement = ''
watchEffect(() => {
  const url = props.pendingWallpaperUrl
  const revision = props.pendingWallpaperRevision ?? 0
  const preparationKey = getGlassWallpaperPreparationKey(props.appearance, props.quality, props.routeKey, url ?? '')
  const acknowledgement = `${revision}:${preparationKey}:${url}`
  const prepared =
    Boolean(url) &&
    revision > 0 &&
    fixedRenderer.state.value === 'ready' &&
    scrollRenderer.state.value === 'ready' &&
    fixedRenderer.preparedWallpaperUrl.value === url &&
    fixedRenderer.preparedWallpaperRevision.value === revision &&
    fixedRenderer.preparedWallpaperPreparationKey.value === preparationKey &&
    scrollRenderer.preparedWallpaperUrl.value === url &&
    scrollRenderer.preparedWallpaperRevision.value === revision &&
    scrollRenderer.preparedWallpaperPreparationKey.value === preparationKey
  if (prepared && acknowledgement !== lastPreparedAcknowledgement) {
    lastPreparedAcknowledgement = acknowledgement
    emit('wallpaperPrepared', url, revision)
  }
})

let lastPreparationFailedAcknowledgement = ''
watchEffect(() => {
  const url = props.pendingWallpaperUrl ?? ''
  const revision = props.pendingWallpaperRevision ?? 0
  const preparationKey = getGlassWallpaperPreparationKey(props.appearance, props.quality, props.routeKey, url)
  const acknowledgement = `${revision}:${preparationKey}:${url}`
  const failed = [fixedRenderer, scrollRenderer].some(
    renderer =>
      renderer.failedWallpaperUrl.value === url &&
      renderer.failedWallpaperRevision.value === revision &&
      renderer.failedWallpaperPreparationKey.value === preparationKey,
  )
  if (url && revision > 0 && failed && acknowledgement !== lastPreparationFailedAcknowledgement) {
    lastPreparationFailedAcknowledgement = acknowledgement
    emit('wallpaperPreparationFailed', url, revision)
  }
})

let activationFrame: number | null = null
let scheduledActivation = ''
let lastActivatedAcknowledgement = ''
let lastFailedAcknowledgement = ''

function rollbackWallpaperActivation(url: string, revision: number) {
  for (const renderer of [fixedRenderer, scrollRenderer]) {
    try {
      renderer.rollbackPreparedWallpaperActivation(url, revision)
    } catch {
      // 两个 context 独立回滚；一个异常不得阻止另一个恢复并通知父层取消。
    }
  }
}

watchEffect(() => {
  const url = props.pendingWallpaperUrl
  const revision = props.pendingWallpaperRevision ?? 0
  const activationRevision = props.activateWallpaperRevision ?? 0
  const preparationKey = getGlassWallpaperPreparationKey(props.appearance, props.quality, props.routeKey, url ?? '')
  const acknowledgement = `${revision}:${preparationKey}:${url}`
  const canActivate =
    Boolean(url) &&
    revision > 0 &&
    activationRevision === revision &&
    fixedRenderer.state.value === 'ready' &&
    scrollRenderer.state.value === 'ready' &&
    fixedRenderer.preparedWallpaperUrl.value === url &&
    fixedRenderer.preparedWallpaperRevision.value === revision &&
    fixedRenderer.preparedWallpaperPreparationKey.value === preparationKey &&
    scrollRenderer.preparedWallpaperUrl.value === url &&
    scrollRenderer.preparedWallpaperRevision.value === revision &&
    scrollRenderer.preparedWallpaperPreparationKey.value === preparationKey
  if (
    !canActivate ||
    acknowledgement === lastActivatedAcknowledgement ||
    acknowledgement === lastFailedAcknowledgement ||
    acknowledgement === scheduledActivation
  ) {
    return
  }

  if (activationFrame !== null) cancelAnimationFrame(activationFrame)
  scheduledActivation = acknowledgement
  activationFrame = requestAnimationFrame(startedAt => {
    activationFrame = null
    scheduledActivation = ''
    const currentUrl = props.pendingWallpaperUrl ?? ''
    const currentRevision = props.pendingWallpaperRevision ?? 0
    const currentPreparationKey = getGlassWallpaperPreparationKey(
      props.appearance,
      props.quality,
      props.routeKey,
      currentUrl,
    )
    const currentAcknowledgement = `${currentRevision}:${currentPreparationKey}:${currentUrl}`
    if (
      currentAcknowledgement !== acknowledgement ||
      props.activateWallpaperRevision !== currentRevision ||
      !fixedRenderer.canActivatePreparedWallpaper(currentUrl, currentRevision, currentPreparationKey) ||
      !scrollRenderer.canActivatePreparedWallpaper(currentUrl, currentRevision, currentPreparationKey)
    ) {
      return
    }

    try {
      const fixedActivated = fixedRenderer.activatePreparedWallpaper(
        currentUrl,
        currentRevision,
        currentPreparationKey,
        startedAt,
      )
      const scrollActivated =
        fixedActivated &&
        scrollRenderer.activatePreparedWallpaper(currentUrl, currentRevision, currentPreparationKey, startedAt)
      if (!fixedActivated || !scrollActivated) {
        rollbackWallpaperActivation(currentUrl, currentRevision)
        lastFailedAcknowledgement = acknowledgement
        emit('wallpaperActivationFailed', currentUrl, currentRevision)
        return
      }
    } catch {
      rollbackWallpaperActivation(currentUrl, currentRevision)
      lastFailedAcknowledgement = acknowledgement
      emit('wallpaperActivationFailed', currentUrl, currentRevision)
      return
    }

    lastActivatedAcknowledgement = acknowledgement
    emit('wallpaperActivated', currentUrl, currentRevision, startedAt)
  })
})

onScopeDispose(() => {
  if (activationFrame !== null) cancelAnimationFrame(activationFrame)
  delete document.documentElement.dataset.glassDynamicsMode
  delete document.documentElement.dataset.glassDynamicsEffectiveMode
  setGlassRendererState(rendererState, 'fallback')
})
</script>

<template>
  <canvas
    ref="fixedCanvas"
    class="glass-optical-layer glass-optical-layer--fixed"
    aria-hidden="true"
    data-presentation-space="fixed"
    :data-state="fixedRenderer.state.value"
  />
  <canvas
    ref="scrollCanvas"
    class="glass-optical-layer glass-optical-layer--scroll"
    aria-hidden="true"
    data-presentation-space="scroll"
    :data-state="scrollRenderer.state.value"
  />
</template>
