import { ref, computed, onMounted, onBeforeUnmount, readonly, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { usePWA } from './usePWA'

// 下拉手势配置类型
export interface PullDownConfig {
  START_THRESHOLD: number // 开始下拉的最小距离
  SHOW_INDICATOR: number // 显示指示器的距离
  TRIGGER_THRESHOLD: number // 触发回调的距离
  MAX_PULL_DISTANCE: number // 最大下拉距离
  PULL_RESISTANCE: number // 下拉阻力系数
  CONTENT_FOLLOW_RATIO: number // 页面内容跟随比例
  TOLERANCE: number // 手指抖动容忍度
}

// 下拉手势选项
export interface PullDownOptions {
  config?: Partial<PullDownConfig>
  // 检查是否可以使用下拉手势的函数
  canUsePullGesture?: () => boolean
  // 触发回调
  onTrigger?: () => void
  // 是否启用（默认true）
  enabled?: boolean
}

// 默认配置
const DEFAULT_CONFIG: PullDownConfig = {
  START_THRESHOLD: 20,
  SHOW_INDICATOR: 60,
  TRIGGER_THRESHOLD: 100,
  MAX_PULL_DISTANCE: 200,
  PULL_RESISTANCE: 0.75,
  CONTENT_FOLLOW_RATIO: 0.4,
  TOLERANCE: 80,
}

export function usePullDownGesture(options: PullDownOptions = {}) {
  const display = useDisplay()
  const { appMode } = usePWA()

  // 合并配置
  const config = { ...DEFAULT_CONFIG, ...options.config }

  // 状态管理
  const isPulling = ref(false)
  const startY = ref(0)
  const pullDistance = ref(0)
  const initialScrollTop = ref(0)
  const hasDialogOpen = ref(false)
  const lastDialogCheckTime = ref(0)
  const DIALOG_CHECK_INTERVAL = 500

  // 计算属性
  const contentTransform = computed(() => {
    if (!isPulling.value || pullDistance.value <= 0) return 'translateY(0)'
    const moveDistance = pullDistance.value * config.CONTENT_FOLLOW_RATIO
    return `translateY(${moveDistance}px)`
  })

  const contentTransition = computed(() => {
    return isPulling.value ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
  })

  const showPullIndicator = computed(() => {
    return isPulling.value && pullDistance.value >= config.SHOW_INDICATOR
  })

  const indicatorRotation = computed(() => {
    if (!isPulling.value) return 0
    const progress = Math.min(
      (pullDistance.value - config.SHOW_INDICATOR) / (config.TRIGGER_THRESHOLD - config.SHOW_INDICATOR),
      1,
    )
    return progress * 180
  })

  const indicatorOpacity = computed(() => {
    if (!isPulling.value) return 0
    const progress = Math.min(
      (pullDistance.value - config.SHOW_INDICATOR) / (config.TRIGGER_THRESHOLD - config.SHOW_INDICATOR),
      1,
    )
    return 0.7 + progress * 0.3
  })

  const indicatorTransform = computed(() => {
    // 顶部基准位置由布局 CSS 负责，这里只让指示器跟随下拉手势轻微移动。
    const followOffset = Math.min(Math.max(pullDistance.value - config.SHOW_INDICATOR, 0), 16)

    return `translate3d(-50%, ${followOffset}px, 0)`
  })

  // 弹窗检测函数
  const hasOpenDialog = (excludeSelector?: string) => {
    try {
      const dialogSelectors = [
        '.v-overlay--active:not(.v-overlay--scroll-blocked)',
        '.v-dialog--active',
        '.v-menu--active',
        '.v-bottom-sheet--active',
        '.v-snackbar--active',
        '[role="dialog"]:not([style*="display: none"])',
        '.modal:not(.d-none):not([style*="display: none"])',
        '[aria-modal="true"]:not([style*="display: none"])',
      ]

      for (const selector of dialogSelectors) {
        const elements = document.querySelectorAll(selector)
        if (elements.length > 0) {
          // 如果需要排除特定元素（如QuickAccess面板）
          if (excludeSelector && elements.length === 1) {
            const element = elements[0]
            if (element.closest(excludeSelector)) {
              continue
            }
          }
          return true
        }
      }

      return false
    } catch (error) {
      console.warn('检测弹窗状态时出错:', error)
      return true
    }
  }

  // 事件处理函数
  const handleTouchStart = (event: TouchEvent) => {
    if (!appMode.value || !display.mdAndDown.value || !options.enabled) return

    // 检查是否可以使用下拉手势
    if (options.canUsePullGesture && !options.canUsePullGesture()) return

    // 检查是否有弹窗打开
    hasDialogOpen.value = hasOpenDialog('.quick-access-panel')
    lastDialogCheckTime.value = Date.now()

    if (hasDialogOpen.value) return

    const touch = event.touches[0]
    startY.value = touch.clientY

    // 重置下拉状态
    isPulling.value = false
    pullDistance.value = 0

    // 记录开始时的滚动位置
    initialScrollTop.value = window.scrollY || document.documentElement.scrollTop || 0
  }

  const handleTouchMove = (event: TouchEvent) => {
    if (!appMode.value || !display.mdAndDown.value || !options.enabled) return

    // 检查是否可以使用下拉手势
    if (options.canUsePullGesture && !options.canUsePullGesture()) return

    // 只在必要时重新检测弹窗
    const currentTime = Date.now()
    if (currentTime - lastDialogCheckTime.value > DIALOG_CHECK_INTERVAL) {
      hasDialogOpen.value = hasOpenDialog('.quick-access-panel')
      lastDialogCheckTime.value = currentTime
    }

    if (hasDialogOpen.value) {
      isPulling.value = false
      pullDistance.value = 0
      return
    }

    const touch = event.touches[0]
    const deltaY = touch.clientY - startY.value

    if (isPulling.value) {
      if (deltaY > -config.TOLERANCE) {
        pullDistance.value = Math.max(0, Math.min(deltaY * config.PULL_RESISTANCE, config.MAX_PULL_DISTANCE))
        event.preventDefault()
      } else {
        isPulling.value = false
        pullDistance.value = 0
      }
    } else {
      if (deltaY > config.START_THRESHOLD) {
        const currentScrollTop = window.scrollY || document.documentElement.scrollTop || 0

        if (currentScrollTop <= 100 && initialScrollTop.value <= 100) {
          isPulling.value = true
          pullDistance.value = Math.min(deltaY * config.PULL_RESISTANCE, config.MAX_PULL_DISTANCE)
          event.preventDefault()
        }
      }
    }
  }

  const handleTouchEnd = () => {
    if (!appMode.value || !display.mdAndDown.value || !options.enabled) return

    // 检查是否可以使用下拉手势
    if (options.canUsePullGesture && !options.canUsePullGesture()) return

    // 重置弹窗检测标志
    hasDialogOpen.value = false
    lastDialogCheckTime.value = 0

    if (isPulling.value && pullDistance.value >= config.TRIGGER_THRESHOLD) {
      // 达到触发阈值，执行回调
      options.onTrigger?.()
    }

    // 停止拖拽状态
    isPulling.value = false

    // 延迟重置其他状态
    setTimeout(() => {
      pullDistance.value = 0
      startY.value = 0
    }, 300)
  }

  // 生命周期管理
  let eventsAdded = false

  const addEventListeners = () => {
    if (!eventsAdded && appMode.value) {
      document.addEventListener('touchstart', handleTouchStart, { passive: false })
      document.addEventListener('touchmove', handleTouchMove, { passive: false })
      document.addEventListener('touchend', handleTouchEnd, { passive: true })
      eventsAdded = true
    }
  }

  const removeEventListeners = () => {
    if (eventsAdded) {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
      eventsAdded = false
    }
  }

  // 监听 appMode 变化动态添加/移除事件监听器
  onMounted(() => {
    watch(
      appMode,
      newValue => {
        if (newValue) {
          addEventListeners()
        } else {
          removeEventListeners()
        }
      },
      { immediate: true },
    )
  })

  onBeforeUnmount(() => {
    removeEventListeners()
  })

  return {
    // 状态
    isPulling: readonly(isPulling),
    pullDistance: readonly(pullDistance),

    // 计算属性
    contentTransform,
    contentTransition,
    showPullIndicator,
    indicatorRotation,
    indicatorOpacity,
    indicatorTransform,

    // 配置
    config,

    // 工具函数
    hasOpenDialog,
  }
}
