<script lang="ts" setup>
import { useTheme } from 'vuetify'
import { checkPrefersColorSchemeIsDark } from '@/@core/utils'
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
import { themeManager } from '@/utils/themeManager'
import { configureApexChartsTheme } from '@/utils/apexCharts'

// 生效主题
const { global: globalTheme } = useTheme()
let themeValue = localStorage.getItem('theme') || 'auto'
const autoTheme = checkPrefersColorSchemeIsDark() ? 'dark' : 'light'
globalTheme.name.value = themeValue === 'auto' ? autoTheme : themeValue

// 启动屏和 iOS safe area 在同一层显示，根节点底色需要尽早和当前主题保持一致。
function syncRootLaunchPalette() {
  const { background, primary } = globalTheme.current.value.colors

  document.documentElement.style.setProperty('--initial-loader-bg', background)
  document.documentElement.style.setProperty('--initial-loader-color', primary)
  document.documentElement.style.backgroundColor = background
  document.body.style.backgroundColor = background
}

// 生效语言
const localeValue = getBrowserLocale()
setI18nLanguage(localeValue as SupportedLocale)

// 检查是否登录
const authStore = useAuthStore()
const isLogin = computed(() => authStore.token)

// 全局设置store
const globalSettingsStore = useGlobalSettingsStore()

// 生成背景图片key
const loginStateKey = computed(() => (isLogin.value ? 'logged-in' : 'logged-out'))

// 背景图片
const backgroundImages = ref<string[]>([])
const activeImageIndex = ref(0)
const isTransparentTheme = computed(() => globalTheme.name.value === 'transparent')

// 心跳检测
let heartbeatInterval: number | null = null

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

// 获取背景图片
async function fetchBackgroundImages() {
  try {
    const controller = new AbortController()
    backgroundImages.value = await api.get(`/login/wallpapers`, {
      signal: controller.signal,
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

// 添加logo动画效果并延迟移除加载界面
function animateAndRemoveLoader() {
  const loadingBg = document.querySelector('#loading-bg') as HTMLElement
  if (loadingBg) {
    // 先淡出启动层，再移除节点，避免 iOS 在主题容器完全接管前露出底部空白。
    loadingBg.classList.add('loading-complete')
    window.setTimeout(() => {
      removeEl('#loading-bg')

      // 启动阶段会锁定根节点滚动，待应用布局接管后再恢复，避免首屏出现瞬时纵向滚动条。
      document.documentElement.style.removeProperty('overflow')
      document.body.style.removeProperty('overflow')
    }, 180)
  }
}

// 检查PWA状态并移除加载界面
async function removeLoadingWithStateCheck() {
  try {
    // 设置各个组件的加载状态
    globalLoadingStateManager.setLoadingState('pwa-state', true)
    globalLoadingStateManager.setLoadingState('global-settings', true)
    globalLoadingStateManager.setLoadingState('background-images', true)

    // 静默检查PWA状态恢复
    const pwaController = (window as any).pwaStateController
    if (pwaController) {
      await pwaController.waitForStateRestore()
    }
    globalLoadingStateManager.setLoadingState('pwa-state', false)

    // 并行加载关键资源
    await Promise.all([
      globalSettingsStore.initialize().then(async () => {
        // 如果已登录，加载用户相关设置
        if (isLogin.value) {
          await globalSettingsStore.loadUserSettings()
        }
        globalLoadingStateManager.setLoadingState('global-settings', false)
      }),
      new Promise(resolve => {
        setTimeout(() => {
          globalLoadingStateManager.setLoadingState('background-images', false)
          resolve(void 0)
        }, 50)
      }),
    ])

    // 等待所有加载完成
    await globalLoadingStateManager.waitForAllComplete()

    // 移除加载界面
    animateAndRemoveLoader()

    // 检查未读消息
    checkAndEmitUnreadMessages()
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
      setTimeout(() => {
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

  // 加载背景图片
  loadBackgroundImages()

  // 使用优化后的加载界面移除逻辑
  ensureRenderComplete(() => {
    nextTick(removeLoadingWithStateCheck)
  })
  // 启动心跳
  startHeartbeat()
})

onUnmounted(() => {
  // 清除背景轮换定时器
  removeBackgroundTimer('background-rotation')
  // 停止心跳
  stopHeartbeat()
})
</script>

<template>
  <div class="app-wrapper">
    <!-- 透明主题背景 -->
    <div v-if="backgroundImages.length > 0 && (isTransparentTheme || !isLogin)" class="background-container">
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

/* 全局磨砂层 */
.global-blur-layer {
  position: absolute;
  z-index: 1;
  backdrop-filter: blur(16px);
  background-color: rgba(128, 128, 128, 30%);
  block-size: 100%;
  inline-size: 100%;
  inset-block-start: 0;
  inset-inline-start: 0;
}
</style>
