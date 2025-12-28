import api from '@/api'
import { useToast } from 'vue-toastification'
import i18n from '@/plugins/i18n'

// 创建一个专用的AbortController，用于globalSetting请求
const globalSettingController = new AbortController()

// 声明全局变量类型
declare const __APP_VERSION__: string

// 当前前端版本号（由 Vite 在编译时注入）
const CURRENT_FRONTEND_VERSION = __APP_VERSION__
console.log(`[VersionChecker] 当前前端版本: ${CURRENT_FRONTEND_VERSION}`)

// 标记是否已经显示过版本更新通知
let versionNotificationShown = false

/**
 * 检查版本并在需要时显示更新通知
 */
async function checkVersionAndNotify(serverVersion: string): Promise<void> {
  // 版本不同，且尚未显示通知
  if (serverVersion !== CURRENT_FRONTEND_VERSION && !versionNotificationShown) {
    versionNotificationShown = true
    console.log(`[VersionChecker] 检测到版本更新: ${CURRENT_FRONTEND_VERSION} -> ${serverVersion}`)

    try {
      // 1. 清除所有缓存
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map(name => caches.delete(name)))
        console.log('[VersionChecker] 已清除所有缓存')
      }

      // 2. 注销Service Worker
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map(registration => registration.unregister()))
        console.log('[VersionChecker] 已注销所有 Service Worker')
      }
    } catch (error) {
      console.error('[VersionChecker] 清除缓存失败:', error)
    }

    // 3. 显示持久化通知，提示用户刷新
    const toast = useToast()
    toast.info(i18n.global.t('common.newVersionAvailable'), {
      timeout: false, // 不自动消失
      closeButton: false,
      closeOnClick: false,
      draggable: false,
    })
  }
}

export async function fetchGlobalSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/global', {
      params: {
        token: 'moviepilot',
      },
      // 手动设置signal，防止reqestOptimizer添加可中断的controller
      signal: globalSettingController.signal,
    })

    const data = result.data || {}

    // 检查版本更新
    if (data.FRONTEND_VERSION) {
      await checkVersionAndNotify(data.FRONTEND_VERSION)
    }

    return data
  } catch (error) {
    console.error('Failed to fetch global settings', error)
    throw error
  }
}
