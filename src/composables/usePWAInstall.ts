import { isPWADisplayMode } from '@/@core/utils/navigator'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}

const INSTALLED_DISPLAY_MODE_QUERIES = [
  '(display-mode: standalone)',
  '(display-mode: fullscreen)',
  '(display-mode: minimal-ui)',
  '(display-mode: window-controls-overlay)',
] as const

export function usePWAInstall() {
  const isInstallable = ref(false)
  const isInstalled = ref(false)
  const installPrompt = ref<BeforeInstallPromptEvent | null>(null)
  const installOutcome = ref<'accepted' | 'dismissed' | null>(null)
  let displayModeMediaQueries: MediaQueryList[] = []

  // 检查是否已安装（通过检查display-mode）
  const checkIfInstalled = () => {
    return isPWADisplayMode()
  }

  const syncInstalledDisplayMode = () => {
    isInstalled.value = checkIfInstalled()
  }

  // 显示安装提示
  const showInstallPrompt = async () => {
    if (!installPrompt.value) {
      console.warn('No install prompt available')
      return false
    }

    try {
      // 显示浏览器的安装提示
      await installPrompt.value.prompt()

      // 等待用户响应
      const { outcome } = await installPrompt.value.userChoice
      installOutcome.value = outcome

      // 如果用户接受安装，清除安装提示
      if (outcome === 'accepted') {
        isInstallable.value = false
        installPrompt.value = null
        isInstalled.value = true
      }

      return outcome === 'accepted'
    } catch (error) {
      console.error('Failed to show install prompt:', error)
      return false
    }
  }

  // 处理安装事件
  const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
    // 阻止默认行为
    e.preventDefault()

    // 保存安装提示
    installPrompt.value = e
    isInstallable.value = true
  }

  // 处理应用安装成功事件
  const handleAppInstalled = () => {
    isInstalled.value = true
    isInstallable.value = false
    installPrompt.value = null
  }

  // 检查是否支持 PWA 安装
  // 使用 "onbeforeinstallprompt" 事件的存在性来判断，而不是检查
  // BeforeInstallPromptEvent 构造函数（在运行时并不存在）。
  // 对于不触发 beforeinstallprompt 的 iOS Safari，同样允许通过
  // "添加到主屏幕" 的方式安装，因此这里也认为是支持的。
  const isPWASupported = computed(() => {
    const hasServiceWorker = 'serviceWorker' in navigator
    const supportsInstallPromptEvent = 'onbeforeinstallprompt' in window
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream

    return hasServiceWorker && (supportsInstallPromptEvent || isIOS)
  })

  // 获取安装指南（针对不同平台）
  const getInstallInstructions = () => {
    const ua = navigator.userAgent
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream
    const isAndroid = /Android/.test(ua)
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/Edg/.test(ua)
    const isChrome = /Chrome/.test(ua) && !/Edg/.test(ua)
    const isEdge = /Edg/.test(ua)
    const isFirefox = /Firefox/.test(ua)

    if (isEdge) {
      return {
        platform: 'Microsoft Edge',
        platformKey: 'edge',
      }
    } else if (isIOS && isSafari) {
      return {
        platform: 'iOS Safari',
        platformKey: 'ios',
      }
    } else if (isAndroid && isChrome) {
      return {
        platform: 'Android Chrome',
        platformKey: 'android',
      }
    } else if (isFirefox && isAndroid) {
      return {
        platform: 'Android Firefox',
        platformKey: 'android',
      }
    } else if (isFirefox) {
      return {
        platform: 'Firefox',
        platformKey: 'firefox',
      }
    } else if (isChrome) {
      return {
        platform: 'Chrome',
        platformKey: 'chrome',
      }
    } else if (isSafari) {
      return {
        platform: 'Safari',
        platformKey: 'safari',
      }
    } else if (isAndroid) {
      return {
        platform: 'Mobile Browser',
        platformKey: 'mobile',
      }
    } else {
      return {
        platform: 'Desktop Browser',
        platformKey: 'desktop',
      }
    }
  }

  onMounted(() => {
    // 检查是否已安装
    isInstalled.value = checkIfInstalled()

    // 监听安装提示事件
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // 监听安装成功事件
    window.addEventListener('appinstalled', handleAppInstalled)

    // 任一安装态 display-mode 变化后都重新聚合检测，避免一个 query 退出时覆盖另一个仍生效的模式。
    displayModeMediaQueries = INSTALLED_DISPLAY_MODE_QUERIES.map(query => window.matchMedia(query))
    displayModeMediaQueries.forEach(mediaQuery => mediaQuery.addEventListener('change', syncInstalledDisplayMode))
  })

  onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.removeEventListener('appinstalled', handleAppInstalled)
    displayModeMediaQueries.forEach(mediaQuery => mediaQuery.removeEventListener('change', syncInstalledDisplayMode))
    displayModeMediaQueries = []
  })

  return {
    isInstallable,
    isInstalled,
    isPWASupported,
    installOutcome,
    showInstallPrompt,
    getInstallInstructions,
  }
}
