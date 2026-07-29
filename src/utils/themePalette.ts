import { checkPrefersColorSchemeIsDark } from '@/@core/utils'

export type ThemePreference = 'auto' | 'dark' | 'default' | 'glass' | 'light' | 'purple' | 'transparent'
export type ResolvedThemeName = 'dark' | 'glass' | 'light' | 'purple' | 'transparent'
export type ThemeColorScheme = 'light' | 'dark'

interface ThemeRootPalette {
  background: string
  primary: string
}

interface ApplyDocumentThemeChromeOptions {
  background?: string
  persistLoaderColors?: boolean
  primary?: string
  resolvedTheme?: string
}

export const themeRootPalettes: Record<ResolvedThemeName, ThemeRootPalette> = {
  light: {
    background: '#F4F5FA',
    primary: '#8D51F9',
  },
  dark: {
    background: '#0E1116',
    primary: '#6E66ED',
  },
  purple: {
    background: '#28243D',
    primary: '#8D51F9',
  },
  transparent: {
    background: '#1C1C1C',
    primary: '#A370F7',
  },
  glass: {
    background: '#0B1322',
    primary: '#8D51F9',
  },
}

const validResolvedThemes = new Set<string>(Object.keys(themeRootPalettes))

/** 将任意主题名称收敛为应用支持的实际主题。 */
function normalizeResolvedThemeName(themeName: string | null | undefined): ResolvedThemeName {
  return validResolvedThemes.has(themeName || '') ? (themeName as ResolvedThemeName) : 'light'
}

/** 将用户主题偏好解析为当前实际主题。 */
export function resolveThemeName(themePreference: string | null | undefined): ResolvedThemeName {
  if (themePreference === 'auto') {
    return checkPrefersColorSchemeIsDark() ? 'dark' : 'light'
  }

  if (themePreference === 'default') {
    return 'light'
  }

  return normalizeResolvedThemeName(themePreference)
}

/** 返回浏览器原生控件应使用的明暗配色。 */
export function getThemeColorScheme(themeName: string | null | undefined): ThemeColorScheme {
  return ['dark', 'glass', 'purple', 'transparent'].includes(themeName || '') ? 'dark' : 'light'
}

/** 批量同步匹配选择器的 meta 内容。 */
function setMetaContent(selector: string, content: string) {
  document.querySelectorAll<HTMLMetaElement>(selector).forEach(meta => {
    meta.content = content
  })
}

/** 更新或创建浏览器主题色 meta 标签。 */
function ensureThemeColorMeta(themeColor: string) {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')

  if (metas.length) {
    metas.forEach(meta => {
      meta.content = themeColor
    })

    return
  }

  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  meta.content = themeColor
  document.head.appendChild(meta)
}

/** 通知启动层刷新浏览器 Tab 图标，图标颜色与当前主题主色保持一致。 */
export function syncThemeFavicon(primaryColor: string) {
  window.dispatchEvent(
    new CustomEvent('moviepilot-theme-primary-color-change', {
      detail: { color: primaryColor },
    }),
  )
}

/**
 * 同步浏览器首帧会使用的根节点底色和系统控件配色。
 * iOS PWA 从后台恢复时可能先绘制 WebView 外壳，再等 Vue 响应式主题更新。
 */
export function applyDocumentThemeChrome(
  themePreference: string | null | undefined,
  options: ApplyDocumentThemeChromeOptions = {},
) {
  const resolvedTheme = normalizeResolvedThemeName(options.resolvedTheme || resolveThemeName(themePreference))
  const colorScheme = getThemeColorScheme(resolvedTheme)
  const palette = themeRootPalettes[resolvedTheme]
  const background = options.background || palette.background
  const primary = options.primary || palette.primary

  document.documentElement.setAttribute('data-theme', resolvedTheme)
  document.documentElement.setAttribute('data-theme-preference', themePreference || resolvedTheme)
  document.documentElement.style.setProperty('--initial-loader-bg', background)
  document.documentElement.style.setProperty('--initial-loader-color', primary)
  document.documentElement.style.backgroundColor = background
  document.documentElement.style.colorScheme = colorScheme

  if (document.body) {
    document.body.setAttribute('data-theme', resolvedTheme)
    document.body.setAttribute('data-theme-preference', themePreference || resolvedTheme)
    document.body.style.backgroundColor = background
    document.body.style.colorScheme = colorScheme
  }

  setMetaContent('meta[name="color-scheme"]', colorScheme === 'dark' ? 'dark light' : 'light dark')
  ensureThemeColorMeta(background)
  syncThemeFavicon(primary)

  if (options.persistLoaderColors) {
    localStorage.setItem('materio-initial-loader-bg', background)
    localStorage.setItem('materio-initial-loader-color', primary)
    localStorage.setItem('materio-initial-resolved-theme', resolvedTheme)
  }

  return {
    background,
    colorScheme,
    primary,
    resolvedTheme,
  }
}
