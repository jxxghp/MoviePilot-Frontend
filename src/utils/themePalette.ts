import { checkPrefersColorSchemeIsDark } from '@/@core/utils'

export type ThemePreference = 'auto' | 'default' | 'light' | 'dark' | 'purple' | 'transparent'
export type ResolvedThemeName = 'light' | 'dark' | 'purple' | 'transparent'
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
    primary: '#9155FD',
  },
  dark: {
    background: '#0E1116',
    primary: '#6E66ED',
  },
  purple: {
    background: '#28243D',
    primary: '#9155FD',
  },
  transparent: {
    background: '#1C1C1C',
    primary: '#A370F7',
  },
}

const validResolvedThemes = new Set<string>(Object.keys(themeRootPalettes))

function normalizeResolvedThemeName(themeName: string | null | undefined): ResolvedThemeName {
  return validResolvedThemes.has(themeName || '') ? (themeName as ResolvedThemeName) : 'light'
}

export function resolveThemeName(themePreference: string | null | undefined): ResolvedThemeName {
  if (themePreference === 'auto') {
    return checkPrefersColorSchemeIsDark() ? 'dark' : 'light'
  }

  if (themePreference === 'default') {
    return 'light'
  }

  return normalizeResolvedThemeName(themePreference)
}

export function getThemeColorScheme(themeName: string | null | undefined): ThemeColorScheme {
  return ['dark', 'purple', 'transparent'].includes(themeName || '') ? 'dark' : 'light'
}

function setMetaContent(selector: string, content: string) {
  document.querySelectorAll<HTMLMetaElement>(selector).forEach(meta => {
    meta.content = content
  })
}

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

  if (options.persistLoaderColors) {
    localStorage.setItem('materio-initial-loader-bg', background)
    localStorage.setItem('materio-initial-loader-color', primary)
  }

  return {
    background,
    colorScheme,
    primary,
    resolvedTheme,
  }
}
