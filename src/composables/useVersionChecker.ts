import { ref, computed, h } from 'vue'
import { useToast } from 'vue-toastification'
import i18n from '@/plugins/i18n'
import VersionUpdateToast from '@/components/toast/VersionUpdateToast.vue'

// 声明全局变量类型
declare const __APP_VERSION__: string

// 全局状态
const currentVersion = ref(__APP_VERSION__)
const serverVersion = ref<string | null>(null)
const versionChecked = ref(false)
const needsUpdate = computed(() => {
  return serverVersion.value !== null && serverVersion.value !== currentVersion.value
})

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
    })

    toast.info(component, {
      timeout: false, // 不自动消失
      closeButton: false,
      closeOnClick: false,
      draggable: false,
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

    // 版本不同，且尚未显示通知
    if (needsUpdate.value) {
      versionChecked.value = true
      console.log(`[VersionChecker] 检测到版本更新: ${currentVersion.value} -> ${latestVersion}`)

      // 清除缓存和 Service Worker
      await clearCachesAndServiceWorker()

      // 显示持久化通知
      showUpdateNotification()
    }
  }

  /**
   * 重置版本检查状态（用于测试或特殊场景）
   */
  const resetVersionCheck = (): void => {
    versionChecked.value = false
    serverVersion.value = null
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
