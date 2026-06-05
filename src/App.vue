<script lang="ts" setup>
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
import PWAInstallPrompt from '@/components/PWAInstallPrompt.vue'
import SharedDialogHost from '@/components/dialog/SharedDialogHost.vue'
import { applyStoredThemeCustomizerAppearance } from '@/composables/useThemeCustomizer'
import { themeManager } from '@/utils/themeManager'
import { applyDocumentThemeChrome, resolveThemeName } from '@/utils/themePalette'
import { configureApexChartsTheme } from '@/utils/apexCharts'

const LOGIN_WALLPAPER_ROUTE = '/login'

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

// 全局设置store
const globalSettingsStore = useGlobalSettingsStore()

// 生成背景图片key
const loginStateKey = computed(() => (isLogin.value ? 'logged-in' : 'logged-out'))

// 背景图片
const backgroundImages = ref<string[]>([])
const activeImageIndex = ref(0)
const isTransparentTheme = computed(() => globalTheme.name.value === 'transparent')
const shouldLoadBackgroundImages = computed(
  () => (!isLogin.value && route.path === LOGIN_WALLPAPER_ROUTE) || (Boolean(isLogin.value) && isTransparentTheme.value),
)
let backgroundRetryTimer: number | null = null
let backgroundRequestController: AbortController | null = null
let authenticatedStateTimer: number | null = null

function getStoredNumber(key: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseFloat(localStorage.getItem(key) || '')
  if (!Number.isFinite(parsed)) return fallback

  return Math.min(max, Math.max(min, parsed))
}

function applyTransparentBackgroundSettings() {
  document.documentElement.style.setProperty(
    '--transparent-background-poster-opacity',
    (1 - getStoredNumber('transparency-background-poster-opacity', 0, 0, 1)).toString(),
  )
  document.documentElement.style.setProperty(
    '--transparent-background-blur',
    `${getStoredNumber('transparency-background-blur', 16, 0, 30)}px`,
  )
}

applyTransparentBackgroundSettings()

// 心跳检测
let heartbeatInterval: number | null = null
let prefersColorSchemeMediaQuery: MediaQueryList | null = null

// 启动心跳
const startHeartbeat = () => {
  // 如果已经有心跳，则先停止
  if (heartbeatInterval) {
    stopHeartbeat()
  }

  // 开始心跳任务
  heartbeatInterval = window.setInterval(async () => {
    try {
      if (isLogin.value) {
        await api.get('dashboard/cpu')
      }
    } catch (error) {
      console.warn('Heartbeat request failed:', error)
    }
  }, 5 * 60 * 1000)
}

// 停止心跳
const stopHeartbeat = () => {
  if (heartbeatInterval) {
    window.clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
}

// 更新data-theme属性以便CSS选择器能正确匹配
function updateHtmlThemeAttribute(themeName: string) {
  document.documentElement.setAttribute('data-theme', themeName)
  document.body.setAttribute('data-theme', themeName)
  syncRootLaunchPalette()
}

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

function handleSystemThemeChange() {
  if ((localStorage.getItem('theme') || 'auto') === 'auto') {
    syncThemePreferenceFromStorage()
  }
}

function handleVisibilityThemeSync() {
  if (document.visibilityState === 'visible') {
    syncThemePreferenceFromStorage()
  }
}

function handlePageShowThemeSync() {
  syncThemePreferenceFromStorage()
}

// 获取背景图片
async function fetchBackgroundImages() {
  try {
    backgroundRequestController?.abort()
    backgroundRequestController = new AbortController()
    backgroundImages.value = await api.get(`/login/wallpapers`, {
      signal: backgroundRequestController.signal,
    })
    activeImageIndex.value = 0
  } catch (e) {
    throw e
  }
}

// 背景图片轮换函数
function rotateBackgroundImage() {
  if (backgroundImages.value.length > 1) {
    // 计算下一个图片索引
    const nextIndex = (activeImageIndex.value + 1) % backgroundImages.value.length
    // 预加载下一张图片
    preloadImage(backgroundImages.value[nextIndex]).then(success => {
      // 只有图片成功加载才切换
      if (success) {
        activeImageIndex.value = nextIndex
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

function stopBackgroundLoading() {
  backgroundRequestController?.abort()
  backgroundRequestController = null

  if (backgroundRetryTimer) {
    window.clearTimeout(backgroundRetryTimer)
    backgroundRetryTimer = null
  }

  removeBackgroundTimer('background-rotation')
}

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
function animateAndRemoveLoader() {
  const loadingBg = document.querySelector('#loading-bg') as HTMLElement
  if (loadingBg) {
    // 只收掉启动内容，背景层保持实色直到节点被移除，避免底部 safe area 先透出页面内容。
    loadingBg.classList.add('loading-complete')
    window.setTimeout(() => {
      removeEl('#loading-bg')

      // 启动阶段的根节点锁定只在 loader 存在时生效，移除后恢复正常页面与弹窗布局。
      document.documentElement.removeAttribute('data-launch-loading')
      document.documentElement.style.removeProperty('overflow')
      document.body.style.removeProperty('overflow')
    }, 120)
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

    await initializeAuthenticatedState()

    // 等待所有加载完成
    await globalLoadingStateManager.waitForAllComplete()

    // 移除加载界面
    animateAndRemoveLoader()

    // 检查未读消息
    if (isLogin.value) {
      checkAndEmitUnreadMessages()
    }
  } catch (error) {
    // 即使出错也要移除加载界面
    globalLoadingStateManager.reset()
    animateAndRemoveLoader()
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
  // 停止心跳
  stopHeartbeat()
  prefersColorSchemeMediaQuery?.removeEventListener('change', handleSystemThemeChange)
  prefersColorSchemeMediaQuery = null
  document.removeEventListener('visibilitychange', handleVisibilityThemeSync)
  window.removeEventListener('pageshow', handlePageShowThemeSync)
  window.removeEventListener('focus', handlePageShowThemeSync)
})
</script>

<template>
  <div class="app-wrapper">
    <!-- 透明主题背景 -->
    <div
      v-if="backgroundImages.length > 0 && (isTransparentTheme || !isLogin)"
      class="background-container"
      :class="{ 'is-transparent-theme': isTransparentTheme && isLogin }"
    >
      <div
        v-for="(imageUrl, index) in backgroundImages"
        :key="`bg-${index}-${loginStateKey}`"
        class="background-image"
        :class="{ 'active': index === activeImageIndex }"
        :style="{ 'backgroundImage': `url(${imageUrl})` }"
      />
      <!-- 全局磨砂层 -->
      <div v-if="isLogin && isTransparentTheme" class="global-blur-layer"></div>
    </div>
    <!-- 页面内容 -->
    <VApp>
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
    opacity: 1;
  }
}

.background-container.is-transparent-theme .background-image.active {
  opacity: var(--transparent-background-poster-opacity, 1);
}

/* 全局磨砂层 */
.global-blur-layer {
  position: absolute;
  z-index: 1;
  backdrop-filter: blur(var(--transparent-background-blur, 16px));
  background-color: rgba(128, 128, 128, 30%);
  block-size: 100%;
  inline-size: 100%;
  inset-block-start: 0;
  inset-inline-start: 0;
}
</style>
