import { ref, h } from 'vue'
import { useToast } from 'vue-toastification'
import { Workbox } from 'workbox-window'
import i18n from '@/plugins/i18n'
import VersionUpdateToast from '@/components/toast/VersionUpdateToast.vue'
import {
  createServiceWorkerCoordinator,
  resolveServiceWorkerRegistration,
  type ServiceWorkerRegistrationConfig,
} from '@/utils/serviceWorkerCoordinator'

// 全局状态
const currentVersion = ref(__APP_VERSION__)
let isUpdateToastShown = false

const serviceWorkerRegistration =
  'serviceWorker' in navigator
    ? resolveServiceWorkerRegistration(
        import.meta.env.BASE_URL,
        document.baseURI,
        import.meta.env.DEV,
        __PWA_DEVELOPMENT__,
      )
    : null

/** 显示全局唯一的版本更新通知。 */
function showUpdateNotification(message: string, refreshText?: string, onRefresh?: () => void): void {
  if (isUpdateToastShown) return
  isUpdateToastShown = true
  const component = h(VersionUpdateToast, {
    message,
    refreshText,
    onRefresh,
  })

  useToast().info(component, {
    timeout: false,
    closeButton: false,
    closeOnClick: false,
    draggable: false,
  })
}

const serviceWorkerCoordinator = createServiceWorkerCoordinator({
  registration: serviceWorkerRegistration,
  createClient: (registration: ServiceWorkerRegistrationConfig) =>
    new Workbox(registration.scriptUrl, {
      scope: registration.scope,
      type: registration.type,
    }),
  onUpdateActivated: () => {
    console.log('[VersionChecker] Service Worker 更新已就绪，等待用户刷新')
    showUpdateNotification(i18n.global.t('common.swUpdateReady'), i18n.global.t('common.refresh'), reloadPage)
  },
  onError: error => console.error('[VersionChecker] Service Worker 注册失败:', error),
})

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
    await Promise.race([clearCachesAndServiceWorker(), new Promise(resolve => window.setTimeout(resolve, 2500))])
  } finally {
    window.clearTimeout(reloadTimer)
    reload()
  }
}

/**
 * 初始化应用唯一的 Service Worker coordinator。
 * 普通 dev 不注册；production 与显式 dev:pwa 复用同一个注册 Promise。
 */
export const initializeServiceWorker = (): Promise<ServiceWorkerRegistration | undefined> =>
  serviceWorkerCoordinator.initialize()

/**
 * 版本检查 Composable
 *
 * 功能：
 * - 使用 Workbox 监听 Service Worker 更新
 * - 检查浏览器版本与服务端版本是否一致
 * - 显示持久化更新通知
 */
export function useVersionChecker() {
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
    const registration = await initializeServiceWorker()
    if (registration && navigator.serviceWorker.controller) {
      try {
        console.log('[VersionChecker] 触发 Service Worker 更新检查...')

        let updateFound = false
        const onUpdateFound = () => {
          updateFound = true
        }
        registration.addEventListener('updatefound', onUpdateFound, { once: true })

        await serviceWorkerCoordinator.update()

        // 更新生命周期由同一个 Workbox 实例继续监听，避免检查和提示使用不同 owner。
        if (updateFound || registration.installing || registration.waiting) {
          console.log('[VersionChecker] Service Worker 更新中...')
          return
        }

        console.log('[VersionChecker] SW 无更新，但版本号不一致，可能是缓存问题')
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
