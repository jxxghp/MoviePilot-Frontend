<script lang="ts" setup>
import { useTheme } from 'vuetify'
import { ensureRenderComplete, removeEl } from './@core/utils/dom'
import api, { type ConnectionAwareRequestConfig } from '@/api'
import { useAuthStore, useGlobalSettingsStore } from '@/stores'
import { getBrowserLocale, setI18nLanguage } from './plugins/i18n'
import { SupportedLocale } from '@/types/i18n'
import { checkAndEmitUnreadMessages } from '@/utils/badge'
import { preloadImage } from './@core/utils/image'
import { globalLoadingStateManager } from '@/utils/loadingStateManager'
import { addBackgroundTimer, removeBackgroundTimer } from '@/utils/backgroundManager'
import PWAInstallPrompt from '@/components/pwa/PWAInstallPrompt.vue'
import SharedDialogHost from '@/components/dialog/SharedDialogHost.vue'
import { applyStoredThemeCustomizerAppearance } from '@/composables/useThemeCustomizer'
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
import { configureApexChartsTheme } from '@/utils/apexCharts'
import {
  useGlobalOfflineStatus,
  type ConnectionFailureReason,
} from '@/composables/useOfflineStatus'

const LOGIN_WALLPAPER_ROUTE = '/login'
const BACKGROUND_CROSSFADE_DURATION_MS = 1500
const WINDOW_BLUR_RENDER_THROTTLE_DELAY_MS = 180_000

// 生效主题
const vuetifyTheme = useTheme()
const { global: globalTheme } = vuetifyTheme
let themeValue = localStorage.getItem('theme') || 'auto'
globalTheme.name.value = resolveThemeName(themeValue)
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
const { initializePWA } = usePWA()
const offlineStatus = useGlobalOfflineStatus()

// 全局设置store
const globalSettingsStore = useGlobalSettingsStore()

// 生成背景图片key
const loginStateKey = computed(() => (isLogin.value ? 'logged-in' : 'logged-out'))

// 背景图片
const backgroundImages = ref<string[]>([])
const activeImageIndex = ref(0)
const previousImageIndex = ref<number | null>(null)
const isTransparentTheme = computed(() => globalTheme.name.value === 'transparent')
const isLoginWallpaperRoute = computed(() => !isLogin.value && route.path === LOGIN_WALLPAPER_ROUTE)
const shouldUseTransparentBackgroundTreatment = computed(() => Boolean(isLogin.value) && isTransparentTheme.value)
const shouldLoadBackgroundImages = computed(
  () => isLoginWallpaperRoute.value || (Boolean(isLogin.value) && isTransparentTheme.value),
)
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
const isRenderThrottled = ref(document.visibilityState === 'hidden')
let backgroundRetryTimer: number | null = null
let backgroundRequestController: AbortController | null = null
let backgroundCrossfadeTimer: number | null = null
let authenticatedStateTimer: number | null = null
let windowBlurRenderThrottleTimer: number | null = null

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

applyTransparentBackgroundSettings()

function clearWindowBlurRenderThrottleTimer() {
  if (windowBlurRenderThrottleTimer) {
    window.clearTimeout(windowBlurRenderThrottleTimer)
    windowBlurRenderThrottleTimer = null
  }
}

function restoreForegroundRendering() {
  const wasRenderThrottled = isRenderThrottled.value

  clearWindowBlurRenderThrottleTimer()
  isRenderThrottled.value = false

  if (wasRenderThrottled && backgroundImages.value.length > 1) {
    startBackgroundRotation()
    rotateBackgroundImage()
  }
}

function throttleBackgroundRendering() {
  clearWindowBlurRenderThrottleTimer()
  resetBackgroundCrossfade()
  isRenderThrottled.value = true
}

function handleWindowBlurRenderThrottle() {
  clearWindowBlurRenderThrottleTimer()
  if (document.visibilityState === 'hidden') {
    throttleBackgroundRendering()
    return
  }

  windowBlurRenderThrottleTimer = window.setTimeout(() => {
    if (document.visibilityState === 'visible' && !document.hasFocus()) {
      isRenderThrottled.value = true
    }
    windowBlurRenderThrottleTimer = null
  }, WINDOW_BLUR_RENDER_THROTTLE_DELAY_MS)
}

function handleWindowFocusRenderThrottle() {
  if (document.visibilityState === 'visible') {
    restoreForegroundRendering()
  }
}

let heartbeatInterval: number | null = null
let connectionRetryTimer: number | null = null
let connectionProbePromise: Promise<boolean> | null = null
let connectionProbeFailures = 0
let prefersColorSchemeMediaQuery: MediaQueryList | null = null

const SERVER_PROBE_TIMEOUT_MS = 8_000
const SERVER_PROBE_FAILURE_THRESHOLD = 2
const SERVER_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000] as const

/** 清除等待中的服务重连任务。 */
function clearConnectionRetryTimer() {
  if (!connectionRetryTimer) return

  window.clearTimeout(connectionRetryTimer)
  connectionRetryTimer = null
}

/** 根据浏览器状态和请求错误判断本次探测失败原因。 */
function resolveProbeFailureReason(error: unknown): ConnectionFailureReason {
  if (!offlineStatus.browserOnline.value) return 'browser-offline'

  const errorCode = (error as { code?: string } | null)?.code
  if (errorCode === 'ECONNABORTED' || errorCode === 'ETIMEDOUT') return 'timeout'

  return 'server-unreachable'
}

/** 按退避间隔安排下一次 MoviePilot 服务探测。 */
function scheduleConnectionRetry() {
  clearConnectionRetryTimer()

  const retryIndex = Math.min(Math.max(connectionProbeFailures - 1, 0), SERVER_RETRY_DELAYS_MS.length - 1)
  connectionRetryTimer = window.setTimeout(() => {
    connectionRetryTimer = null
    void probeServerConnection()
  }, SERVER_RETRY_DELAYS_MS[retryIndex])
}

/** 使用后端 ping 接口执行去重后的权威服务连通性探测。 */
async function probeServerConnection(showChecking = false): Promise<boolean> {
  if (!isLogin.value) return false
  if (connectionProbePromise) return connectionProbePromise

  clearConnectionRetryTimer()
  if (showChecking) offlineStatus.markConnectionChecking(offlineStatus.connectionReason.value ?? undefined)

  const successSequenceAtProbeStart = offlineStatus.serverSuccessSequence.value
  const probePromise = (async () => {
    try {
      await api.get(
        'system/ping',
        {
          skipConnectionTracking: true,
          timeout: SERVER_PROBE_TIMEOUT_MS,
        } as ConnectionAwareRequestConfig,
      )
      connectionProbeFailures = 0
      return true
    } catch (error) {
      if (!isLogin.value) {
        offlineStatus.markServerOnline()
        return false
      }

      // 探测期间若已有其他接口成功，则以更新的成功响应为准，避免旧失败覆盖新状态。
      if (offlineStatus.serverSuccessSequence.value > successSequenceAtProbeStart) {
        connectionProbeFailures = 0
        return true
      }

      connectionProbeFailures += 1
      const failureReason = resolveProbeFailureReason(error)

      if (connectionProbeFailures >= SERVER_PROBE_FAILURE_THRESHOLD) {
        offlineStatus.markServerOffline(failureReason)
      } else {
        offlineStatus.markConnectionChecking(failureReason)
      }

      scheduleConnectionRetry()
      return false
    }
  })()

  connectionProbePromise = probePromise
  try {
    return await probePromise
  } finally {
    if (connectionProbePromise === probePromise) connectionProbePromise = null
  }
}

/** 启动即时服务探测和五分钟在线心跳。 */
function startHeartbeat() {
  if (heartbeatInterval) window.clearInterval(heartbeatInterval)

  void probeServerConnection()

  heartbeatInterval = window.setInterval(async () => {
    if (isLogin.value) await probeServerConnection()
  }, 5 * 60 * 1000)
}

/** 停止心跳和等待中的自动重连任务。 */
function stopHeartbeat() {
  if (heartbeatInterval) {
    window.clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }

  clearConnectionRetryTimer()
  connectionProbeFailures = 0
}

watch(
  () => offlineStatus.connectionCheckRequestId.value,
  () => {
    if (isLogin.value) void probeServerConnection(true)
  },
)

watch(
  () => offlineStatus.connectionStatus.value,
  status => {
    if (status !== 'online') return
    connectionProbeFailures = 0
    clearConnectionRetryTimer()
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
function syncThemePreferenceFromStorage() {
  themeValue = localStorage.getItem('theme') || 'auto'

  const resolvedTheme = resolveThemeName(themeValue)
  if (globalTheme.name.value !== resolvedTheme) {
    globalTheme.name.value = resolvedTheme
  }

  applyStoredThemeCustomizerAppearance(vuetifyTheme)
  updateHtmlThemeAttribute(resolvedTheme)
  configureApexChartsTheme(resolvedTheme)

  // 前台恢复时重新跑一次主题管理器，补齐 transparent CSS 和 auto 的实际 DOM 主题。
  void themeManager
    .setTheme(themeValue)
    .then(() => {
      updateHtmlThemeAttribute(globalTheme.name.value)
    })
    .catch(error => {
      console.error('同步主题管理器失败:', error)
    })
}

// 系统配色变化时，在自动主题模式下刷新当前实际主题。
function handleSystemThemeChange() {
  if ((localStorage.getItem('theme') || 'auto') === 'auto') {
    syncThemePreferenceFromStorage()
  }
}

/** 页面重新可见时同步主题，并在连接异常时立即重新探测服务。 */
function handleVisibilityThemeSync() {
  if (document.visibilityState === 'visible') {
    restoreForegroundRendering()
    syncThemePreferenceFromStorage()
    if (isLogin.value && !offlineStatus.isOnline.value) offlineStatus.requestConnectionCheck()
  } else {
    throttleBackgroundRendering()
  }
}

/** 页面从缓存或重新聚焦恢复时刷新主题偏好和异常连接状态。 */
function handlePageShowThemeSync() {
  if (document.visibilityState === 'visible') {
    restoreForegroundRendering()
    if (isLogin.value && !offlineStatus.isOnline.value) offlineStatus.requestConnectionCheck()
  }
  syncThemePreferenceFromStorage()
}

// 清理背景图交叉淡入淡出定时器。
function clearBackgroundCrossfadeTimer() {
  if (backgroundCrossfadeTimer) {
    window.clearTimeout(backgroundCrossfadeTimer)
    backgroundCrossfadeTimer = null
  }
}

// 重置背景图交叉淡入淡出状态。
function resetBackgroundCrossfade() {
  clearBackgroundCrossfadeTimer()
  previousImageIndex.value = null
}

// 切换期保留上一张背景的渲染状态，避免图片合成层重建时露出透明底。
function activateBackgroundImage(nextIndex: number) {
  if (nextIndex === activeImageIndex.value) return

  clearBackgroundCrossfadeTimer()
  previousImageIndex.value = activeImageIndex.value
  activeImageIndex.value = nextIndex
  backgroundCrossfadeTimer = window.setTimeout(() => {
    previousImageIndex.value = null
    backgroundCrossfadeTimer = null
  }, BACKGROUND_CROSSFADE_DURATION_MS)
}

// 获取背景图片
async function fetchBackgroundImages() {
  try {
    backgroundRequestController?.abort()
    backgroundRequestController = new AbortController()
    backgroundImages.value = await api.get(`/login/wallpapers`, {
      signal: backgroundRequestController.signal,
    })
    resetBackgroundCrossfade()
    activeImageIndex.value = 0
  } catch (e) {
    throw e
  }
}

// 背景图片轮换函数
function rotateBackgroundImage() {
  if (isRenderThrottled.value) return

  if (backgroundImages.value.length > 1) {
    // 计算下一个图片索引
    const nextIndex = (activeImageIndex.value + 1) % backgroundImages.value.length
    // 预加载下一张图片
    preloadImage(backgroundImages.value[nextIndex]).then(success => {
      // 只有图片成功加载才切换
      if (success) {
        activateBackgroundImage(nextIndex)
      }
    })
  }
}

// 开始背景图片轮换
function startBackgroundRotation() {
  // 清除现有定时器
  removeBackgroundTimer('background-rotation')

  if (backgroundImages.value.length > 1) {
    // 使用优化的定时器管理器，后台时自动暂停
    addBackgroundTimer(
      'background-rotation',
      rotateBackgroundImage,
      10000, // 每10秒切换一次
      {
        runInBackground: false, // 后台时不运行
        skipInitialRun: true, // 不需要立即执行
      },
    )
  }
}

// 停止登录页或透明主题背景图加载、重试和轮播。
function stopBackgroundLoading() {
  backgroundRequestController?.abort()
  backgroundRequestController = null

  if (backgroundRetryTimer) {
    window.clearTimeout(backgroundRetryTimer)
    backgroundRetryTimer = null
  }

  resetBackgroundCrossfade()
  removeBackgroundTimer('background-rotation')
}

// 初始化登录后的全局设置和用户设置状态。
async function initializeAuthenticatedState() {
  if (!isLogin.value) return

  try {
    globalLoadingStateManager.setLoadingState('global-settings', true)
    await globalSettingsStore.initialize()
    await globalSettingsStore.loadUserSettings()
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
        resolve()
      }, 120)
    })
  } else {
    completeLaunchLoading()
  }
}

// 检查PWA状态并移除加载界面
async function removeLoadingWithStateCheck() {
  try {
    // 设置各个组件的加载状态
    globalLoadingStateManager.setLoadingState('pwa-state', true)

    // 静默检查PWA状态恢复
    const pwaController = (window as any).pwaStateController
    if (pwaController) {
      await pwaController.waitForStateRestore()
    }
    globalLoadingStateManager.setLoadingState('pwa-state', false)

    // PWA/App 模式会影响布局和底部导航，必须在启动屏退场前稳定下来。
    await initializePWA()
    await initializeAuthenticatedState()

    // 等待所有加载完成
    await globalLoadingStateManager.waitForAllComplete()

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
async function loadBackgroundImages(retryCount = 0) {
  const maxRetries = 3
  try {
    await fetchBackgroundImages()
    startBackgroundRotation()
  } catch (error: any) {
    const isAbortError = error.name === 'AbortError' || error.code === 'ERR_CANCELED'
    if (retryCount < maxRetries) {
      const baseDelay = isAbortError ? 1000 : 3000
      const retryDelay = Math.min(baseDelay * Math.pow(2, retryCount), 10000)
      backgroundRetryTimer = window.setTimeout(() => {
        backgroundRetryTimer = null
        loadBackgroundImages(retryCount + 1)
      }, retryDelay)
    }
  }
}

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
  await themeManager.setTheme(themeValue)
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
  window.addEventListener('focus', handleWindowFocusRenderThrottle)
  window.addEventListener('blur', handleWindowBlurRenderThrottle)
  window.addEventListener(TRANSPARENCY_SETTINGS_CHANGED_EVENT, handleTransparencySettingsChanged)

  // 登录页壁纸仅在未登录登录页需要，避免其他首屏额外发起图片列表请求。
  watch(
    shouldLoadBackgroundImages,
    shouldLoad => {
      stopBackgroundLoading()
      if (shouldLoad) {
        loadBackgroundImages()
      } else if (!isTransparentTheme.value) {
        backgroundImages.value = []
      }
    },
    { immediate: true },
  )

  // 使用优化后的加载界面移除逻辑
  ensureRenderComplete(() => {
    nextTick(removeLoadingWithStateCheck)
  })
  // 启动心跳
  if (isLogin.value) {
    startHeartbeat()
  }

  // 登录状态可能在当前单页会话中变化，这里按需补齐登录后初始化和心跳。
  watch(isLogin, loggedIn => {
    if (loggedIn) {
      startHeartbeat()
      scheduleAuthenticatedStateInitialization()
    } else {
      if (authenticatedStateTimer) {
        window.clearTimeout(authenticatedStateTimer)
        authenticatedStateTimer = null
      }
      stopHeartbeat()
      offlineStatus.markServerOnline()
    }
  })
})

onUnmounted(() => {
  // 清除背景轮换定时器
  stopBackgroundLoading()
  if (authenticatedStateTimer) {
    window.clearTimeout(authenticatedStateTimer)
    authenticatedStateTimer = null
  }
  clearWindowBlurRenderThrottleTimer()
  // 停止心跳
  stopHeartbeat()
  prefersColorSchemeMediaQuery?.removeEventListener('change', handleSystemThemeChange)
  prefersColorSchemeMediaQuery = null
  document.removeEventListener('visibilitychange', handleVisibilityThemeSync)
  window.removeEventListener('pageshow', handlePageShowThemeSync)
  window.removeEventListener('focus', handlePageShowThemeSync)
  window.removeEventListener('focus', handleWindowFocusRenderThrottle)
  window.removeEventListener('blur', handleWindowBlurRenderThrottle)
  window.removeEventListener(TRANSPARENCY_SETTINGS_CHANGED_EVENT, handleTransparencySettingsChanged)
})
</script>

<template>
  <div class="app-wrapper" :class="{ 'app-wrapper--render-throttled': isRenderThrottled }">
    <!-- 透明主题背景 -->
    <div
      v-if="backgroundImages.length > 0 && (isTransparentTheme || !isLogin)"
      class="background-container"
      :class="{
        'is-transparent-theme': shouldUseTransparentBackgroundTreatment,
        'is-transparent-glass-lightweight':
          shouldUseTransparentBackgroundTreatment && transparencyGlassQuality === 'lightweight',
      }"
    >
      <div
        v-for="(imageUrl, index) in backgroundImages"
        :key="`bg-${index}-${loginStateKey}`"
        class="background-image"
        :class="{ 'active': index === activeImageIndex, 'previous': index === previousImageIndex }"
        :style="{ 'backgroundImage': `url(${imageUrl})` }"
      />
      <!-- 全局磨砂层 -->
      <div v-if="shouldRenderGlobalBlurLayer" class="global-blur-layer"></div>
    </div>
    <!-- 页面内容 -->
    <VApp :class="{ 'app-shell--login-wallpaper': isLoginWallpaperRoute }">
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

.background-container.is-transparent-theme .background-image.active {
  opacity: var(--transparent-background-poster-opacity, 1);
}

.background-container.is-transparent-glass-lightweight .background-image.active,
.background-container.is-transparent-glass-lightweight .background-image.previous {
  filter: blur(var(--transparent-background-blur, 16px));
  transform: scale(1.03);
}

.background-container.is-transparent-glass-lightweight .background-image.active::after,
.background-container.is-transparent-glass-lightweight .background-image.previous::after {
  background:
    linear-gradient(rgba(0, 0, 0, 30%) 0%, rgba(0, 0, 0, 60%) 100%),
    rgba(128, 128, 128, 30%);
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

  .login-bg-decor *,
  .login-logo,
  .login-logo-wrapper,
  .login-logo-wrapper::before,
  .login-title,
  .login-subtitle,
  .agent-assistant-fab * {
    animation-play-state: paused !important;
  }
}

/* 登录页壁纸在 VApp 外层渲染，登录页 VApp 需要透明才能露出壁纸。 */
.app-shell--login-wallpaper.v-application {
  background: transparent !important;
}
</style>
