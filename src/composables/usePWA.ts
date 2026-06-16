import { ref, computed, onMounted } from 'vue'
import { useDisplay } from 'vuetify'
import { checkPWAStatus, isMobileDevice, isPWADisplayMode } from '@/@core/utils/navigator'

// 全局PWA状态，确保只初始化一次
const globalPwaStatus = ref<{
  hasPWAFeatures: boolean
  isStandaloneMode: boolean
  isPWAEnvironment: boolean
  isFullPWA: boolean
} | null>(null)
const globalLoading = ref(false)
let initPromise: Promise<void> | null = null

// UI模式设置
export type UIMode = 'auto' | 'desktop' | 'app'
const uiMode = ref<UIMode>((localStorage.getItem('ui-mode') as UIMode) || 'auto')

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
      globalPwaStatus.value = await checkPWAStatus()
    } catch (error) {
      console.error('Failed to detect PWA status', error)
      const isStandaloneMode = isPWADisplayMode()

      // 即使检测失败，也设置一个合理的默认值
      globalPwaStatus.value = {
        hasPWAFeatures: false,
        isStandaloneMode,
        // iOS Safari 浏览器模式可能取不到 Service Worker 注册信息，但移动端仍应使用 App 交互。
        isPWAEnvironment: isStandaloneMode || isMobileDevice(),
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
  const display = useDisplay()

  // 基于新的PWA状态结构
  const pwaMode = computed(() => {
    // PWA 状态异步恢复前先用移动端特征兜底，避免 Safari 浏览器首屏阶段缺少移动端交互。
    return globalPwaStatus.value?.isPWAEnvironment ?? isMobileDevice()
  })

  const appMode = computed(() => {
    if (uiMode.value === 'app') return true
    if (uiMode.value === 'desktop') return false
    return pwaMode.value && display.mdAndDown.value
  })

  // 详细的PWA状态信息
  const pwaStatus = computed(() => globalPwaStatus.value)

  // 自动初始化PWA检测
  onMounted(() => {
    initializePWAGlobally().catch(console.error)
  })

  // 如果是在服务端或首次调用，立即开始初始化
  if (typeof window !== 'undefined' && globalPwaStatus.value === null && !globalLoading.value) {
    initializePWAGlobally().catch(console.error)
  }

  return {
    pwaMode,
    appMode,
    pwaStatus,
    uiMode,
    setUIMode,
    loading: globalLoading,
    initializePWA: initializePWAGlobally,
  }
}
