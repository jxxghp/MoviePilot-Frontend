import copy from 'copy-to-clipboard'

// 请求和获取剪贴板内容
export async function getClipboardContent() {
  if (navigator.clipboard && window.isSecureContext) {
    return await navigator.clipboard.readText()
  } else {
    const input = document.createElement('textarea')
    document.body.appendChild(input)
    input.select()
    document.execCommand('paste')
    const content = input.value
    document.body.removeChild(input)
    return content
  }
}

// 将内容复制到剪贴板
export async function copyToClipboard(content: string) {
  const success = copy(content)
  return success
}

// VAPID公钥转Uint8Array
export function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// Uint8Array 转 Base64URL
export function bufferToBase64Url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// Base64URL 转 Uint8Array
export function base64UrlToUint8Array(base64Url: string): Uint8Array {
  return Uint8Array.from(atob(base64Url.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
}

// 判断是否为PWA
export const isPWA = async (): Promise<boolean> => {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    return registrations.length > 0
  }
  return (window.navigator as any).standalone === true
}

/** PWA 显示环境决定窗口安全区，不能与响应式视口或导航模式混为一谈。 */
export type PWADisplayEnvironment = 'browser' | 'standalone' | 'window-controls-overlay'

/** 同步解析当前 PWA 显示环境，供首帧 Shell 在异步 Service Worker 探测前使用。 */
export const getPWADisplayEnvironment = (): PWADisplayEnvironment => {
  if (window.matchMedia('(display-mode: window-controls-overlay)').matches) return 'window-controls-overlay'

  if (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as any).standalone ||
    document.referrer.includes('android-app://')
  ) {
    return 'standalone'
  }

  return 'browser'
}

// 同步检测是否运行在任一安装态显示模式。
export const isPWADisplayMode = (): boolean => getPWADisplayEnvironment() !== 'browser'

/**
 * 判断浏览器是否运行在移动平台。窗口宽度和通用触摸能力不参与判断，避免窄桌面窗口或触屏电脑误选 App 导航。
 */
export const isMobilePlatform = (): boolean => {
  const userAgent = navigator.userAgent || ''
  const userAgentData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
  const isIPadDesktopUserAgent = /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1

  return (
    userAgentData?.mobile === true ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|CriOS/i.test(userAgent) ||
    isIPadDesktopUserAgent
  )
}

// 全面的PWA检测（推荐使用）
export const checkPWAStatus = async () => {
  const hasServiceWorker = await isPWA()
  const displayEnvironment = getPWADisplayEnvironment()
  const isStandaloneMode = displayEnvironment === 'standalone'
  const isWindowControlsOverlayMode = displayEnvironment === 'window-controls-overlay'

  return {
    // 显示环境负责系统安全区，不负责推断输入能力。
    displayEnvironment,
    // 是否有PWA功能（Service Worker）
    hasPWAFeatures: hasServiceWorker,
    // 是否在独立显示模式下运行
    isStandaloneMode,
    // 是否由桌面 PWA 窗口控件覆盖层提供标题栏。
    isWindowControlsOverlayMode,
    // 综合判断：更宽松的检测，在移动设备上默认启用PWA功能
    isPWAEnvironment: hasServiceWorker || displayEnvironment !== 'browser' || isMobileDevice(),
    // 完整的PWA体验：既有功能又在独立模式下运行
    isFullPWA: hasServiceWorker && displayEnvironment !== 'browser',
  }
}

// 检测是否为移动设备
export const isMobileDevice = (): boolean => {
  // 检查用户代理字符串
  const userAgent = navigator.userAgent || ''
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i

  // 检查触摸屏支持
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0

  // 检查屏幕尺寸（小于768px认为是移动设备）
  const isMobileSize = window.innerWidth < 768

  return isMobilePlatform() || mobileRegex.test(userAgent) || hasTouchScreen || isMobileSize
}

// 检测是否为iOS设备
export const isIOSDevice = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase()
  return /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream
}

// 检测是否为Android设备
export const isAndroidDevice = (): boolean => {
  const userAgent = navigator.userAgent.toLowerCase()
  return /android/.test(userAgent)
}
