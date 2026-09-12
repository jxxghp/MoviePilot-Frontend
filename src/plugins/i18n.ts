import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import { SUPPORTED_LOCALES, SupportedLocale } from '@/types/i18n'

// 导入语言文件
import zhCN from '@/locales/zh-CN'
import zhTW from '@/locales/zh-TW'
import enUS from '@/locales/en-US'

/**
 * 获取浏览器语言设置
 */
export function getBrowserLocale(): SupportedLocale | null {
  // 从本地存储获取
  const storedLocale = localStorage.getItem('MP_LOCALE')
  if (storedLocale && Object.keys(SUPPORTED_LOCALES).includes(storedLocale)) {
    return storedLocale as SupportedLocale
  }

  // 从浏览器获取
  const navigatorLocale = navigator.languages?.[0] || navigator.language || 'zh-CN'

  // 检查是否为支持的语言
  const locale = Object.keys(SUPPORTED_LOCALES).find(locale => {
    return navigatorLocale.includes(locale.split('-')[0])
  })

  return (locale as SupportedLocale) || 'zh-CN'
}

// 创建 i18n 实例
const i18n = createI18n({
  legacy: false, // 使用组合式API
  locale: getBrowserLocale() || 'zh-CN', // 默认语言
  fallbackLocale: 'zh-CN', // 回退语言
  messages: {
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    'en-US': enUS,
  },
  silentTranslationWarn: true,
  silentFallbackWarn: true,
})

/**
 * 设置i18n语言环境
 */
export async function setI18nLanguage(locale: SupportedLocale) {
  // 更新 i18n 实例语言
  i18n.global.locale.value = locale as any as any

  // 保存到本地存储
  localStorage.setItem('MP_LOCALE', locale)

  // 更新 HTML 标签 lang 属性
  document.querySelector('html')?.setAttribute('lang', locale)
}

/**
 * 获取当前语言
 */
export function getCurrentLocale(): SupportedLocale {
  return i18n.global.locale.value as SupportedLocale
}

export default i18n
