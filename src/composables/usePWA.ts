import { ref, computed, onBeforeUnmount, onMounted } from 'vue'
import { useDisplay } from 'vuetify'
import {
  checkPWAStatus,
  getPWADisplayEnvironment,
  isMobileDevice,
  isMobilePlatform,
  type PWADisplayEnvironment,
} from '@/@core/utils/navigator'

/** PWA 能力与显示环境的全局快照。 */
export interface PWAStatus {
  /** 浏览器当前采用的安装态显示环境。 */
  displayEnvironment: PWADisplayEnvironment
  /** 是否存在可用的 Service Worker 注册。 */
  hasPWAFeatures: boolean
  /** 是否采用标准 standalone/fullscreen/minimal-ui 显示。 */
  isStandaloneMode: boolean
  /** 是否处于可提供 App 体验的 PWA 或移动运行环境。 */
  isPWAEnvironment: boolean
  /** 是否同时具备 Service Worker 与安装态显示。 */
  isFullPWA: boolean
  /** 是否采用桌面 PWA 的窗口控件覆盖层。 */
  isWindowControlsOverlayMode: boolean
}

// 全局PWA状态，确保只初始化一次
const globalPwaStatus = ref<PWAStatus | null>(null)
const globalDisplayEnvironment = ref<PWADisplayEnvironment>(
  typeof window === 'undefined' ? 'browser' : getPWADisplayEnvironment(),
)
const globalLoading = ref(false)
let initPromise: Promise<void> | null = null
let displayEnvironmentSubscribers = 0
let displayEnvironmentMediaQueries: MediaQueryList[] = []

const DISPLAY_ENVIRONMENT_QUERIES = [
  '(display-mode: standalone)',
  '(display-mode: fullscreen)',
  '(display-mode: minimal-ui)',
  '(display-mode: window-controls-overlay)',
] as const

/** 显示环境变化必须同步更新 Shell 安全区与安装态能力，导航偏好保持独立。 */
function syncDisplayEnvironment() {
  const displayEnvironment = getPWADisplayEnvironment()

  globalDisplayEnvironment.value = displayEnvironment
  if (!globalPwaStatus.value) return

  globalPwaStatus.value = {
    ...globalPwaStatus.value,
    displayEnvironment,
    isStandaloneMode: displayEnvironment === 'standalone',
    isWindowControlsOverlayMode: displayEnvironment === 'window-controls-overlay',
    isPWAEnvironment: globalPwaStatus.value.hasPWAFeatures || displayEnvironment !== 'browser' || isMobileDevice(),
    isFullPWA: globalPwaStatus.value.hasPWAFeatures && displayEnvironment !== 'browser',
  }
}

function retainDisplayEnvironmentObserver() {
  displayEnvironmentSubscribers += 1
  syncDisplayEnvironment()
  if (displayEnvironmentSubscribers !== 1) return

  displayEnvironmentMediaQueries = DISPLAY_ENVIRONMENT_QUERIES.map(query => window.matchMedia(query))
  displayEnvironmentMediaQueries.forEach(mediaQuery => mediaQuery.addEventListener('change', syncDisplayEnvironment))
}

function releaseDisplayEnvironmentObserver() {
  displayEnvironmentSubscribers = Math.max(0, displayEnvironmentSubscribers - 1)
  if (displayEnvironmentSubscribers > 0) return

  displayEnvironmentMediaQueries.forEach(mediaQuery => mediaQuery.removeEventListener('change', syncDisplayEnvironment))
  displayEnvironmentMediaQueries = []
}

// UI模式设置
export type UIMode = 'auto' | 'desktop' | 'app'

/** 旧版本和外部脚本可能写入任意字符串；非法值回落自动模式，避免菜单与实际 Shell 脱节。 */
function readUIMode(): UIMode {
  const storedMode = localStorage.getItem('ui-mode')

  return storedMode === 'desktop' || storedMode === 'app' ? storedMode : 'auto'
}

const uiMode = ref<UIMode>(readUIMode())

// 设置UI模式
function setUIMode(mode: UIMode) {
  uiMode.value = mode
  localStorage.setItem('ui-mode', mode)
}

// 全局初始化函数
async function initializePWAGlobally() {
  if (initPromise) return initPromise

  if (globalPwaStatus.value !== null || globalLoading.value) return Promise.resolve()

  initPromise = new Promise(async resolve => {
    globalLoading.value = true
    try {
      const status = await checkPWAStatus()
      const displayEnvironment = getPWADisplayEnvironment()

      globalDisplayEnvironment.value = displayEnvironment
      globalPwaStatus.value = {
        ...status,
        displayEnvironment,
        isStandaloneMode: displayEnvironment === 'standalone',
        isWindowControlsOverlayMode: displayEnvironment === 'window-controls-overlay',
        isPWAEnvironment: status.hasPWAFeatures || displayEnvironment !== 'browser' || isMobileDevice(),
        isFullPWA: status.hasPWAFeatures && displayEnvironment !== 'browser',
      }
    } catch (error) {
      console.error('Failed to detect PWA status', error)
      const displayEnvironment = getPWADisplayEnvironment()

      // 即使检测失败，也设置一个合理的默认值
      globalPwaStatus.value = {
        displayEnvironment,
        hasPWAFeatures: false,
        isStandaloneMode: displayEnvironment === 'standalone',
        isWindowControlsOverlayMode: displayEnvironment === 'window-controls-overlay',
        // iOS Safari 浏览器模式可能取不到 Service Worker 注册信息，但移动端仍应使用 App 交互。
        isPWAEnvironment: displayEnvironment !== 'browser' || isMobileDevice(),
        isFullPWA: false,
      }
    } finally {
      globalLoading.value = false
      // 无论成功还是失败，都解决Promise
      resolve()
    }
  })

  return initPromise
}

export function usePWA() {
  if (typeof window !== 'undefined') syncDisplayEnvironment()

  const display = useDisplay()

  // PWA 能力状态供安装和功能入口使用，不参与自动导航族选择。
  const pwaMode = computed(() => {
    return globalPwaStatus.value?.isPWAEnvironment ?? (getPWADisplayEnvironment() !== 'browser' || isMobileDevice())
  })

  const autoAppNavigation = computed(() => isMobilePlatform() && display.mdAndDown.value)

  const appMode = computed(() => {
    if (uiMode.value === 'app') return true
    if (uiMode.value === 'desktop') return false

    return autoAppNavigation.value
  })

  // 详细的PWA状态信息
  const pwaStatus = computed(() => globalPwaStatus.value)
  // display-mode 可同步读取，避免异步能力探测期间把安装态首帧误判为普通浏览器。
  const displayEnvironment = computed(() => globalDisplayEnvironment.value)
  const isStandaloneMode = computed(() => displayEnvironment.value === 'standalone')
  const isWindowControlsOverlayMode = computed(() => displayEnvironment.value === 'window-controls-overlay')

  // 自动初始化PWA检测
  onMounted(() => {
    retainDisplayEnvironmentObserver()
    initializePWAGlobally().catch(console.error)
  })

  onBeforeUnmount(releaseDisplayEnvironmentObserver)

  // 如果是在服务端或首次调用，立即开始初始化
  if (typeof window !== 'undefined' && globalPwaStatus.value === null && !globalLoading.value) {
    initializePWAGlobally().catch(console.error)
  }

  return {
    pwaMode,
    appMode,
    pwaStatus,
    displayEnvironment,
    isStandaloneMode,
    isWindowControlsOverlayMode,
    uiMode,
    setUIMode,
    loading: globalLoading,
    initializePWA: initializePWAGlobally,
  }
}
