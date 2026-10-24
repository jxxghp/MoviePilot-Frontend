import { readonly, ref } from 'vue'
import type { useTheme } from 'vuetify'
import { checkPrefersColorSchemeIsDark } from '@/@core/utils'

/** 玻璃主题的明暗偏好；auto 始终读取当前系统配色。 */
export type ThemePreference = 'auto' | 'dark' | 'light'
export type ThemeColorScheme = 'light' | 'dark'

/** 文档根节点与启动层的配色同步选项。 */
interface ApplyDocumentThemeChromeOptions {
  background?: string
  persistLoaderColors?: boolean
  primary?: string
}

/** 将历史主题迁移为玻璃明暗偏好，不再加载旧主题实现。 */
export function normalizeThemePreference(value: unknown): ThemePreference {
  if (value === 'light' || value === 'default') return 'light'
  if (value === 'dark' || value === 'purple' || value === 'transparent') return 'dark'
  return 'auto'
}

/** 读取已保存的明暗偏好，首次使用默认跟随系统。 */
export function readThemePreference(): ThemePreference {
  return normalizeThemePreference(typeof localStorage === 'undefined' ? null : localStorage.getItem('theme'))
}

const appearancePreference = ref<ThemePreference>(readThemePreference())
/** 向原生导航发布用户偏好，区分手动明暗与跟随系统。 */
export const glassAppearancePreference = readonly(appearancePreference)

/** 返回玻璃主题和浏览器原生控件当前应使用的明暗配色。 */
export function getThemeColorScheme(preference: unknown = readThemePreference()): ThemeColorScheme {
  const normalized = normalizeThemePreference(preference)
  return normalized === 'auto' ? (checkPrefersColorSchemeIsDark() ? 'dark' : 'light') : normalized
}

/** 玻璃主题的背景与语义色；系统变化时不修改用户的主题主色。 */
export function getGlassThemePalette(colorScheme: ThemeColorScheme = getThemeColorScheme()) {
  const darkPalette = {
    dark: true,
    colors: {
      'primary': '#8D51F9',
      'secondary': '#7C9CC4',
      'on-secondary': '#07101C',
      'success': '#69C59A',
      'info': '#7C9CC4',
      'warning': '#E4B863',
      'error': '#FF7B7B',
      'on-primary': '#FFFFFF',
      'on-success': '#07150F',
      'on-warning': '#171106',
      // 对齐 iOS 暗色的基础、次级和三级背景；主题主色继续由用户选择。
      'background': '#000000',
      'on-background': '#F2F2F7',
      'surface': '#1C1C1E',
      'on-surface': '#F2F2F7',
      'surface-variant': '#2C2C2E',
      'on-surface-variant': 'rgba(242, 242, 247, 0.72)',
      'grey-50': '#1C1C1E',
      'grey-100': '#2C2C2E',
      'grey-200': '#3A3A3C',
      'grey-300': '#48484A',
      'grey-400': '#636366',
      'grey-500': '#8E8E93',
      'grey-600': '#AEAEB2',
      'grey-700': '#C7C7CC',
      'grey-800': '#D1D1D6',
      'grey-900': '#F2F2F7',
      'perfect-scrollbar-thumb': 'rgba(255, 255, 255, 0.24)',
      'skin-bordered-background': '#000000',
      'skin-bordered-surface': '#1C1C1E',
      'card-background': '#1C1C1E',
    },
    variables: {
      'code-color': '#F3DCA8',
      'overlay-scrim-background': '#000000',
      'overlay-scrim-opacity': 0.66,
      'hover-opacity': 0.08,
      'focus-opacity': 0.14,
      'selected-opacity': 0.16,
      'activated-opacity': 0.14,
      'pressed-opacity': 0.18,
      'dragged-opacity': 0.14,
      'border-color': '#FFFFFF',
      'table-header-background': 'rgba(255, 255, 255, 0.06)',
      'custom-background': 'rgba(255, 255, 255, 0.06)',
      'card-background': '#1C1C1E',

      // Shadows
      'shadow-key-umbra-opacity': 'rgba(0, 0, 0, 0.34)',
      'shadow-key-penumbra-opacity': 'rgba(0, 0, 0, 0.24)',
      'shadow-key-ambient-opacity': 'rgba(0, 0, 0, 0.16)',
    },
  }
  if (colorScheme === 'dark') return darkPalette

  return {
    dark: false,
    colors: {
      ...darkPalette.colors,
      'background': '#F2F2F7',
      'on-background': '#000000',
      'surface': '#FFFFFF',
      'on-surface': '#000000',
      'surface-variant': '#E5E5EA',
      'on-surface-variant': 'rgba(60, 60, 67, 0.72)',
      'secondary': '#636366',
      'on-secondary': '#FFFFFF',
      'success': '#248A3D',
      'info': '#007AFF',
      'warning': '#FF9500',
      'error': '#FF3B30',
      'on-success': '#FFFFFF',
      'on-warning': '#000000',
      'grey-50': '#F2F2F7',
      'grey-100': '#E5E5EA',
      'grey-200': '#D1D1D6',
      'grey-300': '#C7C7CC',
      'grey-400': '#AEAEB2',
      'grey-500': '#8E8E93',
      'grey-600': '#636366',
      'grey-700': '#48484A',
      'grey-800': '#3A3A3C',
      'grey-900': '#1C1C1E',
      'perfect-scrollbar-thumb': 'rgba(60, 60, 67, 0.24)',
      'skin-bordered-background': '#F2F2F7',
      'skin-bordered-surface': '#FFFFFF',
      'card-background': '#FFFFFF',
    },
    variables: {
      ...darkPalette.variables,
      'border-color': '#3C3C43',
      'card-background': '#FFFFFF',
      'shadow-key-umbra-opacity': 'rgba(0, 0, 0, 0.1)',
      'shadow-key-penumbra-opacity': 'rgba(0, 0, 0, 0.07)',
      'shadow-key-ambient-opacity': 'rgba(0, 0, 0, 0.04)',
    },
  }
}

/** 在既有 glass 主题内切换系统明暗，保留主题名、主色和已加载材质。 */
export function applyGlassThemePalette(
  themeApi: ReturnType<typeof useTheme>,
  preference: ThemePreference = readThemePreference(),
) {
  appearancePreference.value = preference
  const glass = themeApi.themes.value.glass
  if (!glass) return
  const palette = getGlassThemePalette(getThemeColorScheme(preference))
  const primary = glass.colors.primary
  const onPrimary = glass.colors['on-primary']
  glass.dark = palette.dark
  Object.assign(glass.colors, palette.colors, { primary, 'on-primary': onPrimary })
  Object.assign(glass.variables, palette.variables)
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
  const preference = normalizeThemePreference(themePreference)
  appearancePreference.value = preference
  const resolvedTheme = 'glass'
  const colorScheme = getThemeColorScheme(preference)
  const palette = getGlassThemePalette(colorScheme).colors
  const background = options.background || palette.background
  const primary = options.primary || palette.primary

  document.documentElement.setAttribute('data-glass-color-scheme', colorScheme)
  document.documentElement.setAttribute('data-theme', resolvedTheme)
  document.documentElement.setAttribute('data-theme-preference', preference)
  document.documentElement.style.setProperty('--initial-loader-bg', background)
  document.documentElement.style.setProperty('--initial-loader-color', primary)
  document.documentElement.style.backgroundColor = background
  document.documentElement.style.colorScheme = colorScheme

  if (document.body) {
    document.body.setAttribute('data-theme', resolvedTheme)
    document.body.setAttribute('data-theme-preference', preference)
    document.body.style.backgroundColor = background
    document.body.style.colorScheme = colorScheme
  }

  setMetaContent('meta[name="color-scheme"]', colorScheme === 'dark' ? 'dark light' : 'light dark')
  ensureThemeColorMeta(background)
  syncThemeFavicon(primary)

  if (options.persistLoaderColors) {
    localStorage.setItem('materio-initial-loader-bg', background)
    localStorage.setItem('materio-initial-loader-color', primary)
    localStorage.setItem('materio-initial-resolved-theme', colorScheme)
  }

  return {
    background,
    colorScheme,
    primary,
    resolvedTheme,
  }
}
