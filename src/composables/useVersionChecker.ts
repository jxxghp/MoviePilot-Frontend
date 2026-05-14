import { ref, h } from 'vue'
import { useToast } from 'vue-toastification'
import { Workbox } from 'workbox-window'
import i18n from '@/plugins/i18n'
import VersionUpdateToast from '@/components/toast/VersionUpdateToast.vue'

// 全局状态
const currentVersion = ref(__APP_VERSION__)
let isUpdateToastShown = false
let wb: Workbox | null = null

/**
 * 普通刷新页面
 */
export const reloadPage = (): void => {
  window.location.reload()
}

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
 * 清除缓存并刷新
 */
export const clearCacheAndReload = async (): Promise<void> => {
  let isReloading = false
  const reload = () => {
    if (isReloading) return
    isReloading = true
    reloadWithTimestamp()
  }

  const reloadTimer = window.setTimeout(reload, 3000)

  try {
    await Promise.race([
      clearCachesAndServiceWorker(),
      new Promise(resolve => window.setTimeout(resolve, 2500)),
    ])
  } finally {
    window.clearTimeout(reloadTimer)
    reload()
  }
}

/**
 * 版本检查 Composable
 *
 * 功能：
 * - 使用 Workbox 监听 Service Worker 更新
 * - 检查浏览器版本与服务端版本是否一致
 * - 显示持久化更新通知
 */
export function useVersionChecker() {
  const toast = useToast()

  /**
   * 显示版本更新通知
   * @param message 通知消息文本
   * @param refreshText 按钮文本,不传则不显示按钮
   * @param onRefresh 按钮点击事件
   */
  const showUpdateNotification = (message: string, refreshText?: string, onRefresh?: () => void): void => {
    if (isUpdateToastShown) return
    isUpdateToastShown = true
    const component = h(VersionUpdateToast, {
      message,
      refreshText,
      onRefresh,
    })

    toast.info(component, {
      timeout: false, // 不自动消失
      closeButton: false,
      closeOnClick: false,
      draggable: false,
    })
  }

  // 初始化 Workbox
  if (!wb && 'serviceWorker' in navigator) {
    wb = new Workbox('/service-worker.js')

    // Service Worker 激活事件 (install -> activate)
    wb.addEventListener('activated', event => {
      // 只有在更新时才显示通知
      if (event.isUpdate) {
        console.log('[VersionChecker] Service Worker 更新已就绪，等待用户刷新')

        showUpdateNotification(i18n.global.t('common.swUpdateReady'), i18n.global.t('common.refresh'), reloadPage)
      }
    })

    // 注册 Service Worker
    wb.register()
  }

  /**
   * 检查版本并在需要时显示更新通知
   * @param latestVersion 服务端返回的最新版本号
   */
  const checkVersion = async (latestVersion: string): Promise<void> => {
    // 如果已经显示过通知,说明已经检查过了
    if (isUpdateToastShown) return

    // 版本一致，无需操作
    if (latestVersion === currentVersion.value) {
      console.log('[VersionChecker] 版本号一致，无需操作')
      return
    }

    console.log(`[VersionChecker] 检测到版本不一致: ${currentVersion.value} -> ${latestVersion}`)

    // 尝试触发 Service Worker 更新检查
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        if (registration) {
          console.log('[VersionChecker] 触发 Service Worker 更新检查...')

          // 标记是否发现更新
          let updateFound = false
          const onUpdateFound = () => {
            updateFound = true
          }

          // 监听 updatefound 事件
          registration.addEventListener('updatefound', onUpdateFound, { once: true })

          // 等待检查完成
          await registration.update()

          // 检查是否有更新正在进行
          // 如果发现更新，或者正在安装/等待中，则直接返回（交由 SW activated 事件处理）
          if (updateFound || registration.installing || registration.waiting) {
            console.log('[VersionChecker] Service Worker 更新中...')
            return
          }

          console.log('[VersionChecker] SW 无更新，但版本号不一致，可能是缓存问题')
        }
      } catch (error) {
        console.log('[VersionChecker] Service Worker 更新检查失败:', error)
        // 失败继续向下执行，显示通知
      }
    } else {
      console.log('[VersionChecker] 无 Service Worker, 直接显示通知')
    }

    // 最终兜底：显示版本不一致通知（清除缓存）
    showUpdateNotification(
      i18n.global.t('common.versionMismatch'),
      i18n.global.t('common.clearCache'),
      clearCacheAndReload,
    )
  }

  return {
    checkVersion,
  }
}
