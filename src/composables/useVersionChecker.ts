import { ref, computed, h } from 'vue'
import { useToast } from 'vue-toastification'
import i18n from '@/plugins/i18n'
import VersionUpdateToast from '@/components/toast/VersionUpdateToast.vue'

// 全局状态
const currentVersion = ref(__APP_VERSION__)
let isListenerAdded = false
let notificationShowTime = 0
const serverVersion = ref<string | null>(null)
const versionChecked = ref(false)
const needsUpdate = computed(() => {
  return serverVersion.value !== null && serverVersion.value !== currentVersion.value
})

/**
 * 刷新页面并添加时间戳
 */
export const reloadWithTimestamp = (): void => {
  const url = new URL(window.location.href)
  url.searchParams.set('_t', Date.now().toString())
  window.location.replace(url.pathname + url.search + url.hash)
}

/**
 * 清除所有缓存和 Service Worker
 */
export const clearCachesAndServiceWorker = async (): Promise<void> => {
  try {
    // 1. 清除所有缓存
    if ('caches' in window) {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map(name => caches.delete(name)))
      console.log('[VersionChecker] 已清除所有缓存')
    }

    // 2. 注销 Service Worker
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map(registration => registration.unregister()))
      console.log('[VersionChecker] 已注销所有 Service Worker')
    }
  } catch (error) {
    console.error('[VersionChecker] 清除缓存失败:', error)
  }
}

/**
 * 版本检查 Composable
 *
 * 功能：
 * - 检查前端版本与服务端版本是否一致
 * - 检测到版本更新时清除缓存和 Service Worker
 * - 显示持久化更新通知
 */
export function useVersionChecker() {
  const toast = useToast()

  /**
   * 显示版本更新通知（带刷新按钮）
   */
  const showUpdateNotification = (): void => {
    // 使用自定义 Vue 组件作为 toast 内容，传递翻译后的文本作为 props
    const component = h(VersionUpdateToast, {
      message: i18n.global.t('common.newVersionAvailable'),
      refreshText: i18n.global.t('common.refresh'),
      onRefresh: reloadWithTimestamp,
    })

    toast.info(component, {
      timeout: false, // 不自动消失
      closeButton: false,
      closeOnClick: false,
      draggable: false,
      toastClassName: 'version-update-toast-container',
    })
  }

  /**
   * 检查版本并在需要时显示更新通知
   * @param latestVersion 服务端返回的最新版本号
   */
  const checkVersion = async (latestVersion: string): Promise<void> => {
    // 如果已经检查过，则跳过
    if (versionChecked.value) {
      return
    }

    // 更新服务端版本
    serverVersion.value = latestVersion

    // 执行版本不一致时的处理逻辑
    const handleVersionMismatch = async () => {
      if (needsUpdate.value) {
        versionChecked.value = true
        console.log(`[VersionChecker] 检测到版本更新: ${currentVersion.value} -> ${latestVersion}`)

        // 清除缓存和 Service Worker
        await clearCachesAndServiceWorker()

        // 显示持久化通知
        showUpdateNotification()
      }
    }

    // 优先尝试通过 Service Worker 检查更新
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      console.log('[VersionChecker] 正在请求 Service Worker 检查更新...')

      const registration = await navigator.serviceWorker.getRegistration()

      // 如果已经有等待中的更新，直接处理
      if (registration?.waiting) {
        console.log('[VersionChecker] Service Worker 发现新版本，跳过版本号对比')
        handleVersionMismatch()
        return
      }

      const messageChannel = new MessageChannel()

      messageChannel.port1.onmessage = event => {
        if (event.data && event.data.type === 'SW_NO_UPDATE_DETECTED') {
          console.log('[VersionChecker] Service Worker 报告无更新, 进行版本号检查...')
          handleVersionMismatch()
        }
      }

      navigator.serviceWorker.controller.postMessage({ type: 'CHECK_SW_UPDATE' }, [messageChannel.port2])
    } else {
      // 如果没有 Service Worker 控制，直接进行版本比较
      await handleVersionMismatch()
    }
  }

  /**
   * 重置版本检查状态（用于测试或特殊场景）
   */
  const resetVersionCheck = (): void => {
    versionChecked.value = false
    serverVersion.value = null
  }

  // 监听 Service Worker 版本更新消息
  if (!isListenerAdded && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
      // 1. 发现新版本 -> 弹出通知
      if (event.data && event.data.type === 'SW_VERSION_DETECTED') {
        console.log('[VersionChecker] 发现新版本:', event.data.version)
        notificationShowTime = Date.now()

        const component = h(VersionUpdateToast, {
          message: i18n.global.t('common.newVersionFound'),
        })

        toast.info(component, {
          timeout: false,
          hideProgressBar: true,
          closeButton: false,
          toastClassName: 'version-update-toast-container',
        })
      }
      // 2. 安装完成 -> 刷新页面
      else if (event.data && event.data.type === 'SW_RELOAD_PAGE') {
        const elapsed = Date.now() - notificationShowTime
        const delay = Math.max(0, 1500 - elapsed)
        console.log(`[VersionChecker] 更新已安装, 延迟 ${delay}ms 后刷新...`)
        setTimeout(() => {
          reloadWithTimestamp()
        }, delay)
      }
    })
    isListenerAdded = true
  }

  return {
    // 状态
    currentVersion: computed(() => currentVersion.value),
    serverVersion: computed(() => serverVersion.value),
    needsUpdate,
    versionChecked: computed(() => versionChecked.value),
    // 方法
    checkVersion,
    resetVersionCheck,
  }
}
