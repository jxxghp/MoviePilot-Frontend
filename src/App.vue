<script lang="ts" setup>
import { usePreferredReducedMotion } from '@vueuse/core'
import { useTheme } from 'vuetify'
import { ensureRenderComplete, removeEl } from './@core/utils/dom'
import api from '@/api'
import { useAuthStore, useGlobalSettingsStore } from '@/stores'
import { getBrowserLocale, setI18nLanguage } from './plugins/i18n'
import { SupportedLocale } from '@/types/i18n'
import { checkAndEmitUnreadMessages } from '@/utils/badge'
import { preloadImage } from './@core/utils/image'
import { globalLoadingStateManager } from '@/utils/loadingStateManager'
import { addBackgroundTimer, removeBackgroundTimer } from '@/utils/backgroundManager'
import PWAInstallPrompt from '@/components/pwa/PWAInstallPrompt.vue'
import SharedDialogHost from '@/components/dialog/SharedDialogHost.vue'
import {
  applyStoredThemeCustomizerAppearance,
  themeCustomizerPrimaryColors,
  useEffectiveGlassSettings,
} from '@/composables/useThemeCustomizer'
import {
  applyStoredTransparencySettings,
  TRANSPARENCY_SETTINGS_CHANGED_EVENT,
  type TransparencyGlassQuality,
  type TransparencySettings,
} from '@/composables/useTransparencySettings'
import { completeLaunchLoading } from '@/composables/useLaunchLoading'
import { usePWA } from '@/composables/usePWA'
import { themeManager } from '@/utils/themeManager'
import { applyDocumentThemeChrome, resolveThemeName } from '@/utils/themePalette'
import { getDisplayImageUrl } from '@/utils/imageUtils'
import { normalizeThemeMaterialAccent } from '@/utils/glassColor'
import { configureApexChartsTheme } from '@/utils/apexCharts'
import { useGlobalOfflineStatus } from '@/composables/useOfflineStatus'
import { useServerConnectionProbe } from '@/composables/useServerConnectionProbe'
import { useSystemRestartStatus } from '@/composables/useSystemRestart'
import { loadMediaSources } from '@/composables/useMediaSources'
import { useAppActivityLifecycle } from '@/composables/useAppActivityLifecycle'
import { useGlassWallpaperTransaction } from '@/composables/useGlassWallpaperTransaction'
import {
  isChromiumFixedShellBackplateBrowser,
  provideGlassFixedShellBackplate,
  shouldUseGlassFixedShellBackplate,
  type GlassFixedShellBackplateLayer,
} from '@/composables/useGlassFixedShellBackplate'
import {
  BACKGROUND_ROTATION_GRACE_MS,
  createBackgroundCandidateOrderResolver,
  findFirstAvailableBackground,
  normalizeBackgroundRotationIntervalSeconds,
  preloadBackgroundRotationImages,
  shouldAllowBackgroundRotation,
} from '@/utils/backgroundRotation'
import {
  activateLoginBackgroundLayer,
  createLoginBackgroundLayers,
  getLoginGlassOpticalSettings,
  getLoginVisualProfile,
  prepareLoginBackgroundLayer,
  settleLoginBackgroundLayers,
  type LoginBackgroundLayer,
} from '@/utils/loginPresentation'
import {
  DEFAULT_GLASS_WALLPAPER_TONE_PROFILE,
  loadGlassWallpaperTone,
  type GlassWallpaperToneProfile,
} from '@/utils/glassWallpaperTone'

const LOGIN_WALLPAPER_ROUTE = '/login'
const BACKGROUND_CROSSFADE_DURATION_MS = 1500
const LAUNCH_MIN_VISIBLE_MS = 320
const LAUNCH_MAX_WAIT_MS = 1200
const LAUNCH_EXIT_DURATION_MS = 180

function getLaunchNow() {
  return globalThis.performance?.now?.() ?? Date.now()
}

const launchStartedAt = Number.parseFloat(document.documentElement.dataset.launchStartedAt || '') || getLaunchNow()

function getRemainingLaunchBudget() {
  return Math.max(0, LAUNCH_MAX_WAIT_MS - (getLaunchNow() - launchStartedAt))
}

async function waitForLaunchTask(task: Promise<unknown>, timeoutMs: number, label: string) {
  if (timeoutMs <= 0) return

  await Promise.race([
    task.catch(error => {
      console.warn(`[Launch] ${label} failed`, error)
    }),
    new Promise<void>(resolve => window.setTimeout(resolve, timeoutMs)),
  ])
}

async function waitForMinimumLaunchVisibility() {
  const remaining = LAUNCH_MIN_VISIBLE_MS - (getLaunchNow() - launchStartedAt)
  if (remaining > 0) {
    await new Promise<void>(resolve => window.setTimeout(resolve, remaining))
  }
}

function getCachedAutoResolvedTheme() {
  const cachedTheme = localStorage.getItem('materio-initial-resolved-theme')

  return cachedTheme === 'dark' || cachedTheme === 'light' ? cachedTheme : null
}

function resolveInitialThemeName(themePreference: string) {
  if (themePreference === 'auto') {
    return getCachedAutoResolvedTheme() || resolveThemeName(themePreference)
  }

  return resolveThemeName(themePreference)
}

function recordGlassLaunchTiming(stage: string, detail?: string) {
  const timingWindow = window as typeof window & {
    __glassPerformanceProbeEnabled?: boolean
    __glassLaunchTimings?: Array<{ detail?: string; stage: string; time: number }>
  }
  if (!import.meta.env.DEV || !timingWindow.__glassPerformanceProbeEnabled) return

  timingWindow.__glassLaunchTimings ??= []
  timingWindow.__glassLaunchTimings.push({ detail, stage, time: performance.now() })
}

// 生效主题
const vuetifyTheme = useTheme()
const { global: globalTheme } = vuetifyTheme
const glassMaterialTintColor = computed(
  () =>
    normalizeThemeMaterialAccent(globalTheme.current.value.colors.primary)?.hex ??
    normalizeThemeMaterialAccent(themeCustomizerPrimaryColors[0].value)!.hex,
)
let themeValue = localStorage.getItem('theme') || 'glass'
let resumeThemeSyncTimer: number | null = null
globalTheme.name.value = resolveInitialThemeName(themeValue)
applyStoredThemeCustomizerAppearance(vuetifyTheme)

// 启动屏和 iOS safe area 在同一层显示，根节点底色需要尽早和当前主题保持一致。
function syncRootLaunchPalette() {
  const { background, primary } = globalTheme.current.value.colors

  applyDocumentThemeChrome(themeValue, {
    background,
    persistLoaderColors: true,
    primary,
    resolvedTheme: globalTheme.name.value,
  })
}

// 生效语言
const localeValue = getBrowserLocale()
setI18nLanguage(localeValue as SupportedLocale)

// 检查是否登录
const authStore = useAuthStore()
const isLogin = computed(() => authStore.token)
const route = useRoute()
const router = useRouter()
const { initializePWA } = usePWA()
const offlineStatus = useGlobalOfflineStatus()
const { isRestarting: isSystemRestarting } = useSystemRestartStatus()
const serverConnectionProbe = useServerConnectionProbe({
  isLoggedIn: isLogin,
  isRestarting: isSystemRestarting,
  offlineStatus,
  request: (path, config) => api.get(path, config),
})

// 全局设置store
const globalSettingsStore = useGlobalSettingsStore()

// 背景图片
const backgroundImages = ref<string[]>([])
const backgroundLayers = ref(createLoginBackgroundLayers())
const backgroundDisplayImages = ref<Record<string, string>>({})
const backgroundCorsReady = ref<Record<string, boolean>>({})
const backgroundToneProfiles = ref<Record<string, GlassWallpaperToneProfile>>({})
const activeImageIndex = ref(0)
const previousImageIndex = ref<number | null>(null)
const isBackgroundCrossfading = ref(false)
const backgroundCrossfadeStartedAt = ref(0)
const {
  acknowledgeActivated: acknowledgeOpticalWallpaperActivated,
  acknowledgePrepared: acknowledgeOpticalWallpaperPrepared,
  activationRevision: activateOpticalWallpaperRevision,
  cancel: cancelOpticalWallpaperTransaction,
  requestedRevision: pendingOpticalWallpaperRevision,
  requestedUrl: pendingOpticalBackgroundImage,
  requestActivation: requestOpticalWallpaperActivation,
  requestPreparation: requestOpticalWallpaperPreparation,
} = useGlassWallpaperTransaction<number>()
const resolveBackgroundCandidateOrder = createBackgroundCandidateOrderResolver()
const { allowsDecorativeMotion, isSuspended: isRenderThrottled, state: appActivityState } = useAppActivityLifecycle()
const preferredMotion = usePreferredReducedMotion()
const backgroundRotationGraceActive = ref(false)
let backgroundRotationGraceTimer: number | null = null
const backgroundRotationIntervalMs = computed(
  () => normalizeBackgroundRotationIntervalSeconds(globalSettingsStore.get('WALLPAPER_ROTATION_INTERVAL')) * 1000,
)
// 壁纸时钟允许短时后台续跑；指针、滚动和流场仍服从更严格的应用活动状态。
const allowsBackgroundRotation = computed(
  () =>
    Boolean(backgroundRotationIntervalMs.value) &&
    shouldAllowBackgroundRotation(
      appActivityState.value,
      backgroundRotationGraceActive.value,
      preferredMotion.value === 'reduce',
    ),
)
const isTransparentTheme = computed(() => globalTheme.name.value === 'transparent')
const isGlassTheme = computed(() => globalTheme.name.value === 'glass')
const effectiveGlassSettings = useEffectiveGlassSettings()
const isInitialRouteReady = ref(false)
const isBackdropTheme = computed(() => isTransparentTheme.value || isGlassTheme.value)
const isLoginWallpaperRoute = computed(() => !isLogin.value && route.path === LOGIN_WALLPAPER_ROUTE)
const loginVisualProfile = computed(() => getLoginVisualProfile(globalTheme.name.value))
const loginGlassSettings = computed(() =>
  getLoginGlassOpticalSettings({
    appearance: effectiveGlassSettings.value.glassAppearance,
    deformationStrength: effectiveGlassSettings.value.glassDeformationStrength,
    flowStrength: effectiveGlassSettings.value.glassFlowStrength,
    preset: effectiveGlassSettings.value.glassPreset,
    reflectionStrength: effectiveGlassSettings.value.glassReflectionStrength,
    transmissionStrength: effectiveGlassSettings.value.glassTransmissionStrength,
    translationStrength: effectiveGlassSettings.value.glassTranslationStrength,
    transparencyStrength: effectiveGlassSettings.value.glassTransparencyStrength,
  }),
)
const opticalDeformationStrength = computed(() =>
  isLoginWallpaperRoute.value
    ? loginGlassSettings.value.deformationStrength
    : effectiveGlassSettings.value.glassDeformationStrength,
)
const opticalFlowStrength = computed(() =>
  isLoginWallpaperRoute.value ? loginGlassSettings.value.flowStrength : effectiveGlassSettings.value.glassFlowStrength,
)
const opticalQuality = computed(() =>
  isLoginWallpaperRoute.value ? loginGlassSettings.value.quality : effectiveGlassSettings.value.glassQuality,
)
const opticalReflectionStrength = computed(() =>
  isLoginWallpaperRoute.value
    ? loginGlassSettings.value.reflectionStrength
    : effectiveGlassSettings.value.glassReflectionStrength,
)
const opticalTransparencyStrength = computed(() =>
  isLoginWallpaperRoute.value
    ? loginGlassSettings.value.transparencyStrength
    : effectiveGlassSettings.value.glassTransparencyStrength,
)
const opticalTranslationStrength = computed(() =>
  isLoginWallpaperRoute.value
    ? loginGlassSettings.value.translationStrength
    : effectiveGlassSettings.value.glassTranslationStrength,
)
const opticalTransmissionStrength = computed(() =>
  isLoginWallpaperRoute.value
    ? loginGlassSettings.value.transmissionStrength
    : effectiveGlassSettings.value.glassTransmissionStrength,
)
const shouldUseTransparentBackgroundTreatment = computed(() => isTransparentTheme.value && Boolean(isLogin.value))
const shouldUseGlassBackgroundTreatment = computed(
  () => isGlassTheme.value && (Boolean(isLogin.value) || isLoginWallpaperRoute.value),
)
const shouldLoadBackgroundImages = computed(
  () => isLoginWallpaperRoute.value || (Boolean(isLogin.value) && isBackdropTheme.value),
)
const activeBackgroundImage = computed(() => backgroundImages.value[activeImageIndex.value] ?? '')
const renderedBackgroundLayers = computed(() => backgroundLayers.value)
const getOpticalBackgroundImage = (imageUrl: string) => imageUrl
const getPreparedBackgroundImage = (imageUrl: string) => backgroundDisplayImages.value[imageUrl] ?? imageUrl
const getPreparedOpticalBackgroundImage = (imageUrl: string) =>
  backgroundDisplayImages.value[imageUrl] ?? getOpticalBackgroundImage(imageUrl)
const activeOpticalBackgroundImage = computed(() => getPreparedOpticalBackgroundImage(activeBackgroundImage.value))
const previousOpticalBackgroundImage = computed(() => {
  const previousIndex = previousImageIndex.value
  if (previousIndex === null) return ''

  return getPreparedOpticalBackgroundImage(backgroundImages.value[previousIndex] ?? '')
})
const shouldRenderGlassOpticalLayer = computed(
  () =>
    isGlassTheme.value &&
    opticalQuality.value !== 'css' &&
    isInitialRouteReady.value &&
    Boolean(activeBackgroundImage.value),
)
const GlassOpticalLayer = defineAsyncComponent(() => import('@/components/theme/GlassOpticalLayer.vue'))
const transparentBackgroundBlur = ref(16)
const transparencyGlassQuality = ref<TransparencyGlassQuality>(
  localStorage.getItem('transparency-glass-quality') === 'realtime' ? 'realtime' : 'lightweight',
)
const shouldRenderGlobalBlurLayer = computed(
  () =>
    shouldUseTransparentBackgroundTreatment.value &&
    transparentBackgroundBlur.value > 0 &&
    transparencyGlassQuality.value === 'realtime',
)
let backgroundRetryTimer: number | null = null
let backgroundRequestController: AbortController | null = null
let backgroundCrossfadeTimer: number | null = null
let authenticatedStateTimer: number | null = null
let backgroundLoadVersion = 0
let backgroundRecoveryAttemptedVersion = -1
let backgroundRotationVersion = 0
let backgroundPreloadIdleHandle: number | null = null
let backgroundPreloadTimer: number | null = null

// 读取并同步透明主题背景设置到根组件响应式状态。
function applyTransparentBackgroundSettings() {
  const settings = applyStoredTransparencySettings()

  transparentBackgroundBlur.value = settings.backgroundBlur
  transparencyGlassQuality.value = settings.glassQuality
}

// 响应透明主题设置变更事件，刷新背景模糊和玻璃质量。
function handleTransparencySettingsChanged(event: Event) {
  const { backgroundBlur, glassQuality } = (event as CustomEvent<TransparencySettings>).detail

  transparentBackgroundBlur.value = backgroundBlur
  transparencyGlassQuality.value = glassQuality
}

/** 让稳定双槽位分别携带当前壁纸的曝光，交叉淡化期间不共享新图参数。 */
function getBackgroundLayerStyle(layer: LoginBackgroundLayer) {
  const profile = backgroundToneProfiles.value[layer.url] ?? DEFAULT_GLASS_WALLPAPER_TONE_PROFILE
  const appearance = effectiveGlassSettings.value.glassAppearance
  const materialExposure = appearance === 'frosted' ? 0.82 : appearance === 'tinted' ? 0.85 : 0.86
  const displayUrl = isGlassTheme.value ? getPreparedBackgroundImage(layer.url) : layer.url
  const usesCorsImageElement = isGlassTheme.value && Object.hasOwn(backgroundDisplayImages.value, layer.url)

  return {
    'backgroundImage': !usesCorsImageElement && displayUrl ? `url(${displayUrl})` : undefined,
    '--glass-wallpaper-brightness': String(materialExposure * profile.exposure),
  }
}

/** 玻璃可见层与 tone/WebGL 使用同一图片请求模式，避免 CSS 再创建无 Origin 的缓存变体。 */
function getBackgroundLayerImageSource(layer: LoginBackgroundLayer) {
  if (!isGlassTheme.value || !Object.hasOwn(backgroundDisplayImages.value, layer.url)) return ''

  return getPreparedBackgroundImage(layer.url)
}

function getBackgroundLayerCrossOrigin(layer: LoginBackgroundLayer) {
  return backgroundCorsReady.value[layer.url] ? 'anonymous' : undefined
}

const needsStableFixedBackdrop = isChromiumFixedShellBackplateBrowser()
const fixedShellBackplateLayers = computed<readonly GlassFixedShellBackplateLayer[]>(() => {
  const hasWallpaper = renderedBackgroundLayers.value.some(layer => Boolean(layer.url))
  if (
    !shouldUseGlassFixedShellBackplate({
      appearance: effectiveGlassSettings.value.glassAppearance,
      hasWallpaper,
      isAuthenticated: Boolean(isLogin.value),
      needsStableFixedBackdrop,
      quality: effectiveGlassSettings.value.glassQuality,
      themeName: globalTheme.name.value,
    })
  ) {
    return []
  }

  return renderedBackgroundLayers.value.map(layer => ({
    ...layer,
    crossOrigin: getBackgroundLayerCrossOrigin(layer),
    src: getBackgroundLayerImageSource(layer),
    style: getBackgroundLayerStyle(layer),
  }))
})

provideGlassFixedShellBackplate({
  layers: fixedShellBackplateLayers,
  transitionDurationMs: BACKGROUND_CROSSFADE_DURATION_MS,
})

applyTransparentBackgroundSettings()

void router.isReady().then(() => {
  isInitialRouteReady.value = true
})

let prefersColorSchemeMediaQuery: MediaQueryList | null = null

watch(
  () => offlineStatus.connectionCheckRequestId.value,
  () => {
    if (isLogin.value) void serverConnectionProbe.probeServerConnection(true)
  },
)

watch(
  () => offlineStatus.connectionStatus.value,
  status => {
    if (status !== 'online') return
    serverConnectionProbe.resetAfterServerOnline()
  },
)

watch(
  () => offlineStatus.browserOnline.value,
  browserIsOnline => {
    if (!isLogin.value) return
    offlineStatus.requestConnectionCheck(browserIsOnline ? undefined : 'browser-offline')
  },
)

// 更新data-theme属性以便CSS选择器能正确匹配
function updateHtmlThemeAttribute(themeName: string) {
  document.documentElement.setAttribute('data-theme', themeName)
  document.body.setAttribute('data-theme', themeName)
  syncRootLaunchPalette()
}

// 从本地存储重新同步主题偏好、DOM 主题属性和相关外观配置。
function syncThemePreferenceFromStorage(preferCachedAuto = false) {
  if (resumeThemeSyncTimer !== null) {
    window.clearTimeout(resumeThemeSyncTimer)
    resumeThemeSyncTimer = null
  }

  themeValue = localStorage.getItem('theme') || 'glass'

  const resolvedTheme =
    themeValue === 'auto' && preferCachedAuto
      ? getCachedAutoResolvedTheme() || resolveThemeName(themeValue)
      : resolveThemeName(themeValue)
  if (globalTheme.name.value !== resolvedTheme) {
    globalTheme.name.value = resolvedTheme
  }

  applyStoredThemeCustomizerAppearance(vuetifyTheme)
  updateHtmlThemeAttribute(resolvedTheme)
  configureApexChartsTheme(resolvedTheme)

  // 前台恢复时重新跑一次主题管理器，补齐 transparent CSS 和 auto 的实际 DOM 主题。
  void themeManager
    .setTheme(themeValue === 'auto' ? resolvedTheme : themeValue)
    .then(() => {
      updateHtmlThemeAttribute(globalTheme.name.value)
    })
    .catch(error => {
      console.error('同步主题管理器失败:', error)
    })

  if (preferCachedAuto && themeValue === 'auto') {
    resumeThemeSyncTimer = window.setTimeout(() => {
      resumeThemeSyncTimer = null
      syncThemePreferenceFromStorage()
    }, 180)
  }
}

// 系统配色变化时，在自动主题模式下刷新当前实际主题。
function handleSystemThemeChange() {
  if ((localStorage.getItem('theme') || 'glass') === 'auto') {
    syncThemePreferenceFromStorage()
  }
}

/** 页面重新可见时同步主题，并在连接异常时立即重新探测服务。 */
function handleVisibilityThemeSync() {
  if (document.visibilityState === 'visible') {
    syncThemePreferenceFromStorage(true)
    if (isLogin.value && !offlineStatus.isOnline.value) offlineStatus.requestConnectionCheck()
  }
}

/** 页面从缓存或重新聚焦恢复时刷新主题偏好和异常连接状态。 */
function handlePageShowThemeSync() {
  if (document.visibilityState === 'visible') {
    if (isLogin.value && !offlineStatus.isOnline.value) offlineStatus.requestConnectionCheck()
  }
  syncThemePreferenceFromStorage(true)
}

// 清理背景图交叉淡入淡出定时器。
function clearBackgroundCrossfadeTimer() {
  if (backgroundCrossfadeTimer) {
    window.clearTimeout(backgroundCrossfadeTimer)
    backgroundCrossfadeTimer = null
  }
}

/** 等待两个 WebGL 呈现 context 完成下一张纹理上传。 */
async function prepareOpticalWallpaper(url: string) {
  if (!shouldRenderGlassOpticalLayer.value || !url || url === activeOpticalBackgroundImage.value) {
    return { ready: true, revision: 0 }
  }

  const ready = requestOpticalWallpaperPreparation(url)
  const revision = pendingOpticalWallpaperRevision.value

  return { ready: await ready, revision }
}

/** 只接受当前待切换 URL 的 renderer 就绪回执。 */
function handleOpticalWallpaperPrepared(url: string, revision: number) {
  acknowledgeOpticalWallpaperPrepared(url, revision)
}

/** 任一 context 无法准备当前候选时取消 revision，禁止后续材质刷新重复加载失效 URL。 */
function handleOpticalWallpaperPreparationFailed(_url: string, revision: number) {
  cancelOpticalWallpaperTransaction(revision)
}

/** 两个 context 均已原子消费 prepared 资源后，以同一时钟提交 DOM 壁纸。 */
function handleOpticalWallpaperActivated(url: string, revision: number, startedAt: number) {
  const activation = acknowledgeOpticalWallpaperActivated(url, revision, startedAt)
  if (!activation) return

  activateBackgroundImage(activation.payload, activation.startedAt)
}

/** 任一 context 提交失败时取消整个 revision，禁止另一 context 继续持有半提交状态。 */
function handleOpticalWallpaperActivationFailed(_url: string, revision: number) {
  cancelOpticalWallpaperTransaction(revision)
}

// 重置背景图交叉淡入淡出状态。
function resetBackgroundCrossfade() {
  clearBackgroundCrossfadeTimer()
  previousImageIndex.value = null
  isBackgroundCrossfading.value = false
  backgroundCrossfadeStartedAt.value = 0
  backgroundLayers.value = createLoginBackgroundLayers(activeBackgroundImage.value)
}

// 切换期保留上一张背景的渲染状态，避免图片合成层重建时露出透明底。
function activateBackgroundImage(nextIndex: number, startedAt = performance.now()) {
  if (nextIndex === activeImageIndex.value) return

  clearBackgroundCrossfadeTimer()
  backgroundLayers.value = prepareLoginBackgroundLayer(backgroundLayers.value, backgroundImages.value[nextIndex] ?? '')
  previousImageIndex.value = activeImageIndex.value
  isBackgroundCrossfading.value = true
  backgroundCrossfadeStartedAt.value = startedAt
  activeImageIndex.value = nextIndex
  backgroundLayers.value = activateLoginBackgroundLayer(backgroundLayers.value)
  const remainingDuration = Math.max(0, BACKGROUND_CROSSFADE_DURATION_MS - (performance.now() - startedAt))
  backgroundCrossfadeTimer = window.setTimeout(() => {
    previousImageIndex.value = null
    isBackgroundCrossfading.value = false
    backgroundLayers.value = settleLoginBackgroundLayers(backgroundLayers.value)
    backgroundCrossfadeTimer = null
  }, remainingDuration)
}

// 获取背景图片列表；只有选出实际可用的首图后才提交到可见状态。
async function fetchBackgroundImages() {
  backgroundRequestController?.abort()
  const controller = new AbortController()
  backgroundRequestController = controller
  try {
    const [images] = await Promise.all([
      api.get<string[], string[]>(`/login/wallpapers`, {
        signal: controller.signal,
      }),
      globalSettingsStore.initialize(),
    ])
    return images
  } finally {
    if (backgroundRequestController === controller) backgroundRequestController = null
  }
}

/** 仅提前加载当前图的下一项，不建立全目录预载队列。 */
function preloadNextBackgroundImage() {
  if (!allowsBackgroundRotation.value || backgroundImages.value.length <= 1) return
  const nextIndex = (activeImageIndex.value + 1) % backgroundImages.value.length
  void preloadBackgroundCandidate(backgroundImages.value[nextIndex])
}

function cancelNextBackgroundPreload() {
  const idleWindow = window as typeof window & {
    cancelIdleCallback?: (handle: number) => void
  }
  if (backgroundPreloadIdleHandle !== null) {
    idleWindow.cancelIdleCallback?.(backgroundPreloadIdleHandle)
    backgroundPreloadIdleHandle = null
  }
  if (backgroundPreloadTimer !== null) {
    window.clearTimeout(backgroundPreloadTimer)
    backgroundPreloadTimer = null
  }
}

/** 首屏稳定后才预备轮播候选，避免第二张完整壁纸与 Dashboard 和首张纹理争抢资源。 */
function scheduleNextBackgroundPreload() {
  cancelNextBackgroundPreload()
  if (!allowsBackgroundRotation.value || backgroundImages.value.length <= 1 || document.getElementById('loading-bg')) {
    return
  }

  const idleWindow = window as typeof window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  }
  if (typeof idleWindow.requestIdleCallback === 'function') {
    backgroundPreloadIdleHandle = idleWindow.requestIdleCallback(
      () => {
        backgroundPreloadIdleHandle = null
        preloadNextBackgroundImage()
      },
      { timeout: 3000 },
    )
    return
  }

  backgroundPreloadTimer = window.setTimeout(() => {
    backgroundPreloadTimer = null
    preloadNextBackgroundImage()
  }, 1200)
}

/** 玻璃壁纸以一次匿名解码同时完成可读性和 tone 分析，失败时仍允许 CSS 回退。 */
async function preloadBackgroundCandidate(imageUrl: string) {
  recordGlassLaunchTiming('wallpaper-source-requested', imageUrl)
  if (!isGlassTheme.value) return preloadImage(imageUrl)

  let opticalUrl = getOpticalBackgroundImage(imageUrl)
  let tone = await loadGlassWallpaperTone(opticalUrl)
  if (!tone.corsReady && isLogin.value) {
    const proxyUrl = getDisplayImageUrl(imageUrl, true)
    if (proxyUrl !== opticalUrl) {
      const proxyTone = await loadGlassWallpaperTone(proxyUrl)
      if (proxyTone.corsReady) {
        opticalUrl = proxyUrl
        tone = proxyTone
      }
    }
  }
  backgroundToneProfiles.value = {
    ...backgroundToneProfiles.value,
    [imageUrl]: tone.profile,
  }
  if (tone.corsReady) {
    // DOM、tone 与 renderer 共享完全相同的像素源，避免首屏重复下载和解码。
    backgroundDisplayImages.value = {
      ...backgroundDisplayImages.value,
      [imageUrl]: opticalUrl,
    }
    backgroundCorsReady.value = {
      ...backgroundCorsReady.value,
      [imageUrl]: true,
    }
    recordGlassLaunchTiming('wallpaper-source-ready', imageUrl)
    return true
  }

  backgroundDisplayImages.value = {
    ...backgroundDisplayImages.value,
    [imageUrl]: imageUrl,
  }
  backgroundCorsReady.value = {
    ...backgroundCorsReady.value,
    [imageUrl]: false,
  }

  const ready = await preloadImage(imageUrl)
  recordGlassLaunchTiming(ready ? 'wallpaper-source-ready' : 'wallpaper-source-failed', imageUrl)
  return ready
}

// 背景图片轮换函数
async function rotateBackgroundImage() {
  if (!allowsBackgroundRotation.value || backgroundImages.value.length <= 1) return

  const requestVersion = ++backgroundRotationVersion
  const activeIndex = activeImageIndex.value
  for (let offset = 1; offset < backgroundImages.value.length; offset += 1) {
    if (!allowsBackgroundRotation.value || requestVersion !== backgroundRotationVersion) return

    const nextIndex = (activeIndex + offset) % backgroundImages.value.length
    const nextImage = backgroundImages.value[nextIndex]
    let opticalRevision = 0
    try {
      if (!(await preloadBackgroundCandidate(nextImage))) continue
      const opticalImage = shouldRenderGlassOpticalLayer.value
        ? getPreparedOpticalBackgroundImage(nextImage)
        : undefined
      if (opticalImage) {
        const preparation = await prepareOpticalWallpaper(opticalImage)
        opticalRevision = preparation.revision
        if (!preparation.ready) continue
      }
      const imagesReady = await preloadBackgroundRotationImages({
        displayUrl: isGlassTheme.value ? getPreparedBackgroundImage(nextImage) : nextImage,
        opticalUrl: opticalImage,
        preload: preloadImage,
      })
      if (!imagesReady) continue
      if (!allowsBackgroundRotation.value || requestVersion !== backgroundRotationVersion) return

      if (opticalImage) {
        if (!(await requestOpticalWallpaperActivation(nextIndex, opticalRevision))) continue
      } else {
        activateBackgroundImage(nextIndex)
      }
      scheduleNextBackgroundPreload()
      return
    } finally {
      if (opticalRevision > 0) cancelOpticalWallpaperTransaction(opticalRevision)
    }
  }

  if (requestVersion === backgroundRotationVersion && backgroundRecoveryAttemptedVersion !== backgroundLoadVersion) {
    stopBackgroundRotation()
    const recoveryVersion = ++backgroundLoadVersion
    backgroundRecoveryAttemptedVersion = recoveryVersion
    void loadBackgroundImages(recoveryVersion)
  }
}

// 停止轮询并使已经发起的下一图准备失效，避免非活动状态收到迟到提交。
function stopBackgroundRotation() {
  backgroundRotationVersion += 1
  cancelNextBackgroundPreload()
  removeBackgroundTimer('background-rotation')
  cancelOpticalWallpaperTransaction()
}

function clearBackgroundRotationGrace() {
  if (backgroundRotationGraceTimer !== null) {
    window.clearTimeout(backgroundRotationGraceTimer)
    backgroundRotationGraceTimer = null
  }
}

function startBackgroundRotationGrace() {
  if (backgroundRotationGraceActive.value) return

  backgroundRotationGraceActive.value = true
  clearBackgroundRotationGrace()
  backgroundRotationGraceTimer = window.setTimeout(() => {
    backgroundRotationGraceTimer = null
    backgroundRotationGraceActive.value = false
  }, BACKGROUND_ROTATION_GRACE_MS)
}

// 开始背景图片轮换
function startBackgroundRotation() {
  stopBackgroundRotation()

  if (allowsBackgroundRotation.value && backgroundImages.value.length > 1) {
    scheduleNextBackgroundPreload()
    // 隐藏页面也允许在有界宽限期内轮换，回调自身会再次核对生命周期。
    addBackgroundTimer('background-rotation', () => void rotateBackgroundImage(), backgroundRotationIntervalMs.value, {
      runInBackground: true,
      skipInitialRun: true, // 不需要立即执行
    })
  }
}

watch(
  appActivityState,
  (state, previousState) => {
    if (state === 'active') {
      clearBackgroundRotationGrace()
      backgroundRotationGraceActive.value = false
      return
    }

    if (state === 'idle') {
      clearBackgroundRotationGrace()
      backgroundRotationGraceActive.value = false
      return
    }

    if (previousState === 'active') startBackgroundRotationGrace()
  },
  { flush: 'sync' },
)

watch(allowsBackgroundRotation, allowsRotation => {
  resetBackgroundCrossfade()

  if (allowsRotation) {
    startBackgroundRotation()
  } else {
    stopBackgroundRotation()
  }
})

watch(backgroundRotationIntervalMs, () => {
  if (backgroundImages.value.length > 1) startBackgroundRotation()
})

// 停止登录页、透明主题或玻璃主题背景图加载、重试和轮播。
function stopBackgroundLoading() {
  backgroundLoadVersion += 1
  backgroundRequestController?.abort()
  backgroundRequestController = null

  if (backgroundRetryTimer) {
    window.clearTimeout(backgroundRetryTimer)
    backgroundRetryTimer = null
  }

  resetBackgroundCrossfade()
  stopBackgroundRotation()
}

// 初始化登录后的全局设置和用户设置状态。
async function initializeAuthenticatedState() {
  if (!isLogin.value) return

  try {
    globalLoadingStateManager.setLoadingState('global-settings', true)
    await globalSettingsStore.initialize()
    await globalSettingsStore.loadUserSettings()
    await loadMediaSources()
  } finally {
    globalLoadingStateManager.setLoadingState('global-settings', false)
  }
}

// 延迟初始化登录态数据，避开登录成功后的即时路由跳转窗口。
function scheduleAuthenticatedStateInitialization() {
  if (authenticatedStateTimer) {
    window.clearTimeout(authenticatedStateTimer)
  }

  // 登录后会立刻发生路由切换，稍后再拉取设置可避开导航中止请求。
  authenticatedStateTimer = window.setTimeout(() => {
    authenticatedStateTimer = null
    initializeAuthenticatedState()
  }, 150)
}

// 添加logo动画效果并延迟移除加载界面
async function animateAndRemoveLoader() {
  const loadingBg = document.querySelector('#loading-bg') as HTMLElement
  if (loadingBg) {
    // 只收掉启动内容，背景层保持实色直到节点被移除，避免底部 safe area 先透出页面内容。
    loadingBg.classList.add('loading-complete')
    await new Promise<void>(resolve => {
      window.setTimeout(() => {
        removeEl('#loading-bg')

        // 启动阶段的根节点锁定只在 loader 存在时生效，移除后恢复正常页面与弹窗布局。
        document.documentElement.removeAttribute('data-launch-loading')
        document.documentElement.style.removeProperty('overflow')
        document.body.style.removeProperty('overflow')
        completeLaunchLoading()
        recordGlassLaunchTiming('loader-removed')
        scheduleNextBackgroundPreload()
        resolve()
      }, LAUNCH_EXIT_DURATION_MS)
    })
  } else {
    completeLaunchLoading()
    recordGlassLaunchTiming('loader-removed')
    scheduleNextBackgroundPreload()
  }
}

// 检查PWA状态并移除加载界面
async function removeLoadingWithStateCheck() {
  try {
    // 设置各个组件的加载状态
    globalLoadingStateManager.setLoadingState('pwa-state', true)

    // 静默检查PWA状态恢复，但不能让恢复异常或慢请求挡住应用外壳。
    const pwaController = (window as any).pwaStateController
    if (pwaController?.waitForStateRestore) {
      await waitForLaunchTask(
        Promise.resolve().then(() => pwaController.waitForStateRestore()),
        getRemainingLaunchBudget(),
        'PWA state restore',
      )
    }
    globalLoadingStateManager.setLoadingState('pwa-state', false)

    // PWA/App 模式会影响布局和底部导航，必须在启动屏退场前稳定下来。
    await waitForLaunchTask(initializePWA(), getRemainingLaunchBudget(), 'PWA detection')

    // 用户设置不影响首帧布局，交给应用外壳出现后继续加载。
    void initializeAuthenticatedState().catch(error => {
      console.warn('[Launch] Authenticated state initialization failed', error)
    })

    // 快速缓存命中时至少保留短暂的稳定画面，避免 iOS 只闪过一帧。
    await waitForMinimumLaunchVisibility()

    // 移除加载界面
    await animateAndRemoveLoader()

    // 检查未读消息
    if (isLogin.value) {
      checkAndEmitUnreadMessages()
    }
  } catch (error) {
    // 即使出错也要移除加载界面
    globalLoadingStateManager.reset()
    await animateAndRemoveLoader()
  }
}

// 加载背景图片
async function loadBackgroundImages(loadVersion: number, retryCount = 0) {
  const maxRetries = 3
  try {
    const images = resolveBackgroundCandidateOrder(await fetchBackgroundImages())
    if (loadVersion !== backgroundLoadVersion) return

    const firstAvailableIndex = await findFirstAvailableBackground({
      urls: images,
      canContinue: () => loadVersion === backgroundLoadVersion,
      preload: preloadBackgroundCandidate,
    })
    if (firstAvailableIndex === null) throw new Error('没有可用的登录壁纸')
    if (loadVersion !== backgroundLoadVersion) return

    const currentImage = activeBackgroundImage.value
    const currentIndex = images.indexOf(currentImage)
    if (currentImage && currentIndex < 0) {
      backgroundImages.value = [currentImage, ...images]
      activeImageIndex.value = 0
    } else {
      backgroundImages.value = images
      activeImageIndex.value = currentIndex >= 0 ? currentIndex : firstAvailableIndex
    }
    backgroundRecoveryAttemptedVersion = -1
    resetBackgroundCrossfade()
    recordGlassLaunchTiming('wallpaper-committed', activeBackgroundImage.value)
    startBackgroundRotation()
  } catch (error: any) {
    if (loadVersion !== backgroundLoadVersion) return
    const isAbortError = error.name === 'AbortError' || error.code === 'ERR_CANCELED'
    if (retryCount < maxRetries) {
      const baseDelay = isAbortError ? 1000 : 3000
      const retryDelay = Math.min(baseDelay * Math.pow(2, retryCount), 10000)
      backgroundRetryTimer = window.setTimeout(() => {
        backgroundRetryTimer = null
        if (loadVersion === backgroundLoadVersion) {
          void loadBackgroundImages(loadVersion, retryCount + 1)
        }
      }, retryDelay)
    }
  }
}

// 登录前后复用同一壁纸列表和活动项；请求与主题样式并行，避免玻璃 CSS 阻塞首张壁纸准备。
watch(
  shouldLoadBackgroundImages,
  shouldLoad => {
    stopBackgroundLoading()
    if (shouldLoad) {
      void loadBackgroundImages(backgroundLoadVersion)
    } else if (!isBackdropTheme.value) {
      backgroundImages.value = []
    }
  },
  { immediate: true },
)

watch(isGlassTheme, enabled => {
  if (!enabled) return

  void Promise.all(
    renderedBackgroundLayers.value.filter(layer => layer.url).map(layer => preloadBackgroundCandidate(layer.url)),
  )
})

onMounted(async () => {
  // 移除URL中的时间戳参数
  const url = new URL(window.location.href)
  if (url.searchParams.has('_t')) {
    url.searchParams.delete('_t')
    const newUrl = url.pathname + url.search + url.hash
    window.history.replaceState(null, '', newUrl)
  }

  // 配置 ApexCharts
  configureApexChartsTheme(globalTheme.name.value)

  // 初始化data-theme属性
  updateHtmlThemeAttribute(globalTheme.name.value)

  // 初始化主题管理器 - 统一处理主题初始化
  await themeManager.setTheme(themeValue === 'auto' ? globalTheme.name.value : themeValue)
  applyStoredThemeCustomizerAppearance(vuetifyTheme)
  updateHtmlThemeAttribute(globalTheme.name.value)

  // 监听主题变化
  watch(
    () => globalTheme.name.value,
    newTheme => {
      // 更新HTML主题属性
      updateHtmlThemeAttribute(newTheme)
      // 重新配置ApexCharts以适应新主题
      configureApexChartsTheme(newTheme)
    },
  )

  prefersColorSchemeMediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null
  prefersColorSchemeMediaQuery?.addEventListener('change', handleSystemThemeChange)
  document.addEventListener('visibilitychange', handleVisibilityThemeSync)
  window.addEventListener('pageshow', handlePageShowThemeSync)
  window.addEventListener('focus', handlePageShowThemeSync)
  window.addEventListener(TRANSPARENCY_SETTINGS_CHANGED_EVENT, handleTransparencySettingsChanged)

  // 使用优化后的加载界面移除逻辑
  ensureRenderComplete(() => {
    nextTick(removeLoadingWithStateCheck)
  })
  // 启动心跳
  if (isLogin.value) {
    serverConnectionProbe.startHeartbeat()
  }

  // 登录状态可能在当前单页会话中变化，这里按需补齐登录后初始化和心跳。
  watch(isLogin, loggedIn => {
    if (loggedIn) {
      serverConnectionProbe.startHeartbeat()
      scheduleAuthenticatedStateInitialization()
    } else {
      if (authenticatedStateTimer) {
        window.clearTimeout(authenticatedStateTimer)
        authenticatedStateTimer = null
      }
      serverConnectionProbe.stopHeartbeat()
      offlineStatus.markServerOnline()
    }
  })
})

onUnmounted(() => {
  // 清除背景轮换定时器
  stopBackgroundLoading()
  clearBackgroundRotationGrace()
  if (authenticatedStateTimer) {
    window.clearTimeout(authenticatedStateTimer)
    authenticatedStateTimer = null
  }
  // 停止心跳
  serverConnectionProbe.stopHeartbeat()
  prefersColorSchemeMediaQuery?.removeEventListener('change', handleSystemThemeChange)
  prefersColorSchemeMediaQuery = null
  document.removeEventListener('visibilitychange', handleVisibilityThemeSync)
  window.removeEventListener('pageshow', handlePageShowThemeSync)
  window.removeEventListener('focus', handlePageShowThemeSync)
  window.removeEventListener(TRANSPARENCY_SETTINGS_CHANGED_EVENT, handleTransparencySettingsChanged)
})
</script>

<template>
  <div
    class="app-wrapper"
    :class="{
      'app-wrapper--background-transition': isBackgroundCrossfading,
      'app-wrapper--decorative-motion-paused': !allowsDecorativeMotion,
      'app-wrapper--login-glass-high': isLoginWallpaperRoute && loginVisualProfile === 'glass',
      'app-wrapper--login-wallpaper': isLoginWallpaperRoute,
      'app-wrapper--render-throttled': isRenderThrottled,
    }"
    :data-app-activity-state="appActivityState"
  >
    <!-- 登录页、透明主题和玻璃主题共用动态壁纸场景。 -->
    <div
      v-if="backgroundImages.length > 0 && (isBackdropTheme || !isLogin)"
      class="background-container"
      :class="{
        'is-transparent-theme': shouldUseTransparentBackgroundTreatment,
        'is-glass-theme': shouldUseGlassBackgroundTreatment,
        'is-transparent-glass-lightweight':
          shouldUseTransparentBackgroundTreatment && transparencyGlassQuality === 'lightweight',
      }"
    >
      <div
        v-for="layer in renderedBackgroundLayers"
        :key="layer.key"
        class="background-image"
        :class="layer.role"
        :style="getBackgroundLayerStyle(layer)"
      >
        <img
          v-if="getBackgroundLayerImageSource(layer)"
          class="background-image__source"
          :crossorigin="getBackgroundLayerCrossOrigin(layer)"
          :src="getBackgroundLayerImageSource(layer)"
          alt=""
          aria-hidden="true"
          draggable="false"
        />
      </div>
      <!-- 全局磨砂层 -->
      <div v-if="shouldRenderGlobalBlurLayer" class="global-blur-layer"></div>
    </div>
    <!-- 页面内容 -->
    <VApp
      :class="{ 'app-shell--login-wallpaper': isLoginWallpaperRoute }"
      :data-login-visual-profile="isLoginWallpaperRoute ? loginVisualProfile : undefined"
    >
      <GlassOpticalLayer
        v-if="shouldRenderGlassOpticalLayer"
        :appearance="effectiveGlassSettings.glassAppearance"
        :deformation-strength="opticalDeformationStrength"
        :dynamics-mode="effectiveGlassSettings.glassDynamicsMode"
        :flow-strength="opticalFlowStrength"
        :quality="opticalQuality === 'high' ? 'high' : 'balanced'"
        :reflection-strength="opticalReflectionStrength"
        :transparency-strength="opticalTransparencyStrength"
        :transmission-strength="opticalTransmissionStrength"
        :translation-strength="opticalTranslationStrength"
        :route-key="route.fullPath"
        :tint-color="glassMaterialTintColor"
        :transition-duration="BACKGROUND_CROSSFADE_DURATION_MS"
        :transition-started-at="backgroundCrossfadeStartedAt"
        :wallpaper-url="activeOpticalBackgroundImage"
        :previous-wallpaper-url="previousOpticalBackgroundImage"
        :pending-wallpaper-url="pendingOpticalBackgroundImage"
        :pending-wallpaper-revision="pendingOpticalWallpaperRevision"
        :activate-wallpaper-revision="activateOpticalWallpaperRevision"
        @wallpaper-activation-failed="handleOpticalWallpaperActivationFailed"
        @wallpaper-activated="handleOpticalWallpaperActivated"
        @wallpaper-preparation-failed="handleOpticalWallpaperPreparationFailed"
        @wallpaper-prepared="handleOpticalWallpaperPrepared"
      />
      <RouterView />
      <!-- 全局共享弹窗入口，列表与卡片按需在这里挂载业务弹窗。 -->
      <SharedDialogHost />
      <!-- PWA安装提示 -->
      <PWAInstallPrompt />
    </VApp>
  </div>
</template>

<style lang="scss">
/* 全局样式 */
.app-wrapper {
  position: relative;
  inline-size: 100%;
  min-block-size: 100vh;
}

.background-container {
  position: fixed;
  z-index: 0;
  overflow: hidden;
  block-size: 100%;
  inline-size: 100%;
  inset-block-start: 0;
  inset-inline-start: 0;
}

// 登录内容与壁纸进入同一文档弹性合成上下文；sticky 仍保持普通滚动时的 viewport 锁定。
.app-wrapper--login-wallpaper .background-container {
  position: sticky;
  block-size: 100dvh;
  margin-block-end: -100dvh;
  inset-block-start: 0;
}

.background-image {
  position: absolute;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  block-size: 100%;
  inline-size: 100%;
  inset-block-start: 0;
  inset-inline-start: 0;
  opacity: 0;
  transition: opacity 1.5s ease;

  &::after {
    position: absolute;
    background: linear-gradient(rgba(0, 0, 0, 30%) 0%, rgba(0, 0, 0, 60%) 100%);
    block-size: 100%;
    content: '';
    inline-size: 100%;
    inset-block-start: 0;
    inset-inline-start: 0;
  }

  &.active {
    z-index: 2;
    opacity: 1;
  }

  &.previous {
    z-index: 1;
  }
}

.background-image__source {
  position: absolute;
  display: block;
  block-size: 100%;
  inline-size: 100%;
  inset: 0;
  object-fit: cover;
  pointer-events: none;
}

.background-container.is-transparent-theme .background-image.active {
  opacity: var(--transparent-background-poster-opacity, 1);
}

.background-container.is-glass-theme .background-image.active,
.background-container.is-glass-theme .background-image.previous {
  filter: brightness(var(--glass-wallpaper-brightness, 0.86)) saturate(0.95) contrast(1.02);
}

.background-container.is-glass-theme .background-image.active {
  opacity: 0.94;
}

.background-container.is-glass-theme .background-image.active::after,
.background-container.is-glass-theme .background-image.previous::after {
  background:
    radial-gradient(circle at 50% 18%, transparent 24%, rgba(6, 10, 19, 12%) 100%),
    linear-gradient(rgba(6, 10, 19, 10%) 0%, rgba(6, 10, 19, 30%) 100%);
}

html[data-glass-appearance='tinted'] .background-container.is-glass-theme .background-image.active,
html[data-glass-appearance='tinted'] .background-container.is-glass-theme .background-image.previous {
  filter: brightness(var(--glass-wallpaper-brightness, 0.85)) saturate(0.97) contrast(1.02);
}

html[data-glass-appearance='tinted'] .background-container.is-glass-theme .background-image.active {
  opacity: 0.93;
}

html[data-glass-appearance='tinted'] .background-container.is-glass-theme .background-image.active::after,
html[data-glass-appearance='tinted'] .background-container.is-glass-theme .background-image.previous::after {
  background:
    radial-gradient(circle at 50% 18%, transparent 22%, rgba(6, 10, 19, 14%) 100%),
    linear-gradient(rgba(6, 10, 19, 10%) 0%, rgba(6, 10, 19, 32%) 100%), rgba(var(--glass-material-accent-rgb), 3%);
}

html[data-glass-appearance='frosted'] .background-container.is-glass-theme .background-image.active,
html[data-glass-appearance='frosted'] .background-container.is-glass-theme .background-image.previous {
  filter: brightness(var(--glass-wallpaper-brightness, 0.82)) saturate(0.9);
}

html[data-glass-appearance='frosted'] .background-container.is-glass-theme .background-image.active {
  opacity: 0.92;
}

html[data-glass-appearance='frosted'] .background-container.is-glass-theme .background-image.active::after,
html[data-glass-appearance='frosted'] .background-container.is-glass-theme .background-image.previous::after {
  background: linear-gradient(rgba(6, 10, 19, 24%) 0%, rgba(6, 10, 19, 48%) 100%), rgba(11, 19, 34, 8%);
}

.background-container.is-transparent-glass-lightweight .background-image.active,
.background-container.is-transparent-glass-lightweight .background-image.previous {
  filter: blur(var(--transparent-background-blur, 16px));
  transform: scale(1.03);
}

.background-container.is-transparent-glass-lightweight .background-image.active::after,
.background-container.is-transparent-glass-lightweight .background-image.previous::after {
  background: linear-gradient(rgba(0, 0, 0, 30%) 0%, rgba(0, 0, 0, 60%) 100%), rgba(128, 128, 128, 30%);
}

/* 全局磨砂层 */
.global-blur-layer {
  position: absolute;
  z-index: 3;
  backdrop-filter: blur(var(--transparent-background-blur, 16px));
  background-color: rgba(128, 128, 128, 30%);
  block-size: 100%;
  inline-size: 100%;
  inset-block-start: 0;
  inset-inline-start: 0;
}

.app-wrapper--render-throttled {
  .global-blur-layer {
    backdrop-filter: none;
  }
}

.app-wrapper--decorative-motion-paused {
  .login-ambient-light *,
  .login-logo,
  .login-logo-wrapper,
  .login-logo-wrapper::before,
  .login-title,
  .login-subtitle {
    animation-play-state: paused !important;
  }
}

/* 登录页壁纸在 VApp 外层渲染，登录页 VApp 需要透明才能露出壁纸。 */
.app-shell--login-wallpaper.v-application {
  background: transparent !important;
}
</style>
