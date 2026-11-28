import type { ThemeInstance } from 'vuetify'
import { getGlassThemePalette } from '@/utils/themePalette'
import type { NativeVisualTokens, SafeAreaInsets } from './types'

const DEFAULT_DARK_TOKENS: NativeVisualTokens = {
  mode: 'dark',
  platform: 'ios',
  backgroundPreset: 'cinematic',
  isAmoledBlack: false,
  highContrast: false,
  accentHex: '#9E7AF5',
  onAccentHex: '#FFFFFF',
  textPrimaryHex: '#F5F2FF',
  textSecondaryHex: '#B8B2CC',
  surfaceGlassRgba: 'rgba(255, 255, 255, 0.08)',
  surfaceElevatedRgba: 'rgba(48, 43, 66, 0.84)',
  surfaceBorderRgba: 'rgba(255, 255, 255, 0.14)',
  surfaceBlurPx: 18,
  solidSurfaceHex: '#473B52',
  fieldFillRgba: 'rgba(255, 255, 255, 0.09)',
  fieldBorderRgba: 'rgba(255, 255, 255, 0.14)',
  chipFillRgba: 'rgba(255, 255, 255, 0.09)',
  chipBorderRgba: 'rgba(255, 255, 255, 0.15)',
  dividerRgba: 'rgba(255, 255, 255, 0.11)',
  panelRadiusPx: 24,
  sheetRadiusPx: 28,
  borderWidthPx: 0.7,
  semantic: {
    success: '#75E6A3',
    warning: '#FFCC6B',
    danger: '#FF8A94',
    info: '#75C7FF',
    brand: '#D6BDFF',
  },
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
}

export function getDefaultVisualTokens(): NativeVisualTokens {
  return {
    ...DEFAULT_DARK_TOKENS,
    semantic: { ...DEFAULT_DARK_TOKENS.semantic },
  }
}

function hexToRgbTriplet(hex: string | undefined, fallback: string): string {
  if (!hex) return fallback
  const cleaned = hex.trim().replace(/^#/, '')
  const normalized =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map(ch => ch + ch)
          .join('')
      : cleaned.length === 8
        ? cleaned.slice(2)
        : cleaned
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return fallback
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

/**
 * 将原生实时下发的 NativeVisualTokens 全量写入 Vuetify 主题与 CSS 变量：
 * - 接管 Vuetify 3 主题色板（primary/success/warning/error/info/surface/on-surface）
 * - 同步 --mp-* / --app-* / --transparent-* 语义与几何变量，零改动对齐主站插件与 App 视觉风格
 * - 支持 Android AMOLED 纯黑与高对比度降级模式
 */
export function applyNativeVisualTokens(theme: ThemeInstance, tokens: NativeVisualTokens): void {
  const mode = tokens.mode === 'light' ? 'light' : 'dark'
  const basePalette = getGlassThemePalette(mode)
  const themeKey = 'glass'
  const targetTheme = theme.themes.value[themeKey]

  if (targetTheme) {
    targetTheme.dark = mode === 'dark'
    targetTheme.colors = {
      ...basePalette.colors,
      'primary': tokens.accentHex || basePalette.colors.primary,
      'on-primary': tokens.onAccentHex || basePalette.colors['on-primary'],
      'success': tokens.semantic?.success || basePalette.colors.success,
      'warning': tokens.semantic?.warning || basePalette.colors.warning,
      'error': tokens.semantic?.danger || basePalette.colors.error,
      'info': tokens.semantic?.info || basePalette.colors.info,
      'background': tokens.isAmoledBlack ? '#000000' : basePalette.colors.background,
      'on-background': tokens.textPrimaryHex || basePalette.colors['on-background'],
      'surface': tokens.isAmoledBlack ? '#121216' : tokens.solidSurfaceHex || basePalette.colors.surface,
      'surface-bright': '#FFFFFF',
      'surface-light': mode === 'dark' ? '#2A273D' : '#F4F4F5',
      'on-surface': tokens.textPrimaryHex || basePalette.colors['on-surface'],
      'on-surface-bright': '#18181B',
      'on-surface-variant': tokens.textSecondaryHex || basePalette.colors['on-surface-variant'],
    }
    targetTheme.variables = {
      ...basePalette.variables,
      'border-color': mode === 'dark' ? '#FFFFFF' : '#000000',
    }
  }
  theme.global.name.value = themeKey

  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-theme', 'glass')
  root.setAttribute('data-glass-color-scheme', mode)
  root.dataset.mpShellTheme = mode
  root.dataset.mpShellPlatform = tokens.platform || 'ios'
  root.dataset.mpShellAmoled = tokens.isAmoledBlack ? 'true' : 'false'
  root.dataset.mpShellHighContrast = tokens.highContrast ? 'true' : 'false'
  root.style.colorScheme = mode

  const blurPx = tokens.isAmoledBlack ? 0 : Math.max(0, Math.min(36, Number(tokens.surfaceBlurPx) || 18))
  const panelRadiusPx = Math.max(12, Math.min(28, Number(tokens.panelRadiusPx) || 24))
  const sheetRadiusPx = Math.max(16, Math.min(32, Number(tokens.sheetRadiusPx) || 28))
  const controlRadiusPx = Math.max(10, Math.min(14, Math.round(panelRadiusPx * 0.65)))
  const fieldRadiusPx = Math.max(12, Math.min(16, Math.round(panelRadiusPx * 0.72)))
  const borderWidthPx = Math.max(0.5, Number(tokens.borderWidthPx) || 0.7)
  const surfaceGlass = tokens.isAmoledBlack ? 'rgba(20, 20, 24, 0.96)' : tokens.surfaceGlassRgba
  const surfaceElevated = tokens.isAmoledBlack ? 'rgba(24, 24, 30, 0.98)' : tokens.surfaceElevatedRgba
  const surfaceBorder = `${borderWidthPx}px solid ${tokens.surfaceBorderRgba}`
  const isDark = mode === 'dark'

  const vars: Record<string, string> = {
    '--mp-accent': tokens.accentHex,
    '--mp-on-accent': tokens.onAccentHex || '#FFFFFF',
    '--mp-text-primary': tokens.textPrimaryHex,
    '--mp-text-secondary': tokens.textSecondaryHex,
    '--mp-surface-glass': surfaceGlass,
    '--mp-surface-elevated': surfaceElevated,
    '--mp-surface-border': tokens.surfaceBorderRgba,
    '--mp-surface-blur': `${blurPx}px`,
    '--mp-solid-surface': tokens.solidSurfaceHex,
    '--mp-field-fill': tokens.fieldFillRgba,
    '--mp-field-border': tokens.fieldBorderRgba,
    '--mp-chip-fill': tokens.chipFillRgba,
    '--mp-chip-border': tokens.chipBorderRgba,
    '--mp-divider': tokens.dividerRgba,
    '--mp-panel-radius': `${panelRadiusPx}px`,
    '--mp-sheet-radius': `${sheetRadiusPx}px`,
    '--mp-border-width': `${borderWidthPx}px`,
    '--mp-semantic-success': tokens.semantic.success,
    '--mp-semantic-warning': tokens.semantic.warning,
    '--mp-semantic-danger': tokens.semantic.danger,
    '--mp-semantic-info': tokens.semantic.info,
    '--mp-semantic-brand': tokens.semantic.brand,
    '--mp-font-family': tokens.fontFamily || DEFAULT_DARK_TOKENS.fontFamily || 'system-ui, sans-serif',
    // 桥接主站语义令牌（src/styles/tokens.scss & common.scss），让存量/社区联邦插件自动对齐 App 视觉系统
    '--mp-fg-rgb': hexToRgbTriplet(tokens.textPrimaryHex, isDark ? '245, 242, 255' : '24, 24, 27'),
    '--mp-surface-rgb': hexToRgbTriplet(tokens.solidSurfaceHex, isDark ? '24, 34, 53' : '255, 255, 255'),
    '--mp-primary-rgb': hexToRgbTriplet(tokens.accentHex, '141, 81, 249'),
    '--mp-bg': 'transparent',
    '--mp-surface': surfaceGlass,
    '--mp-card': surfaceGlass,
    '--mp-popover': surfaceElevated,
    '--mp-fg': tokens.textPrimaryHex,
    '--mp-muted-fg': tokens.textSecondaryHex,
    '--mp-faint': isDark ? 'rgba(255, 255, 255, 0.46)' : 'rgba(24, 24, 27, 0.46)',
    '--mp-muted': isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(24, 24, 27, 0.045)',
    '--mp-reading-surface': isDark ? 'rgba(15, 23, 42, 0.52)' : 'rgba(255, 255, 255, 0.78)',
    '--mp-reading-border': tokens.surfaceBorderRgba,
    '--mp-border': tokens.surfaceBorderRgba,
    '--mp-border-subtle': tokens.dividerRgba,
    '--mp-input': tokens.fieldBorderRgba,
    '--mp-list-group-bg': isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(24, 24, 27, 0.028)',
    '--mp-list-row-divider': tokens.dividerRgba,
    '--mp-list-row-hover': isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(24, 24, 27, 0.045)',
    '--app-theme-surface-radius': `${panelRadiusPx}px`,
    '--app-surface-radius': `${panelRadiusPx}px`,
    '--app-overlay-radius': `${sheetRadiusPx}px`,
    '--app-field-radius': `${fieldRadiusPx}px`,
    '--app-control-radius': `${controlRadiusPx}px`,
    '--app-surface-border-width': `${borderWidthPx}px`,
    '--app-surface-border': surfaceBorder,
    '--app-card-light-border': surfaceBorder,
    '--app-overlay-border': surfaceBorder,
    '--app-surface-shadow': 'none',
    '--app-surface-hover-shadow': 'none',
    '--app-card-rest-shadow': 'none',
    '--app-card-hover-shadow': 'none',
    '--mp-motion-duration-page': '180ms',
    '--mp-motion-duration-overlay': '160ms',
    '--mp-motion-ease-standard': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    '--mp-motion-ease-exit': 'cubic-bezier(0.4, 0, 1, 1)',
    // 对齐 MoviePilot 官方透明插件变量约定（如 BrushFlowWorkbench.vue）
    '--transparent-blur': `${blurPx}px`,
    '--transparent-opacity': isDark ? '0.14' : '0.68',
    '--transparent-opacity-heavy': isDark ? '0.84' : '0.90',
    '--v-border-opacity': isDark ? '0.14' : '0.12',
  }

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
}

export function applySafeAreaInsets(insets?: SafeAreaInsets): void {
  if (typeof document === 'undefined' || !insets) return
  const root = document.documentElement
  root.style.setProperty('--mp-safe-top', `${Math.max(0, Number(insets.top) || 0)}px`)
  root.style.setProperty('--mp-safe-bottom', `${Math.max(0, Number(insets.bottom) || 0)}px`)
  root.style.setProperty('--mp-safe-left', `${Math.max(0, Number(insets.left) || 0)}px`)
  root.style.setProperty('--mp-safe-right', `${Math.max(0, Number(insets.right) || 0)}px`)
}

const SKIP_CLEAN_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SVG', 'CANVAS', 'IMG', 'VIDEO'])

function isOpaqueCssColor(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized || normalized === 'transparent' || normalized === 'rgba(0, 0, 0, 0)') return false
  const rgbaMatch = normalized.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)$/)
  if (rgbaMatch) {
    return Number(rgbaMatch[1]) >= 0.85
  }
  return normalized.startsWith('rgb(') || normalized.startsWith('#')
}

function shouldSkipTransparentClean(el: HTMLElement): boolean {
  if (SKIP_CLEAN_TAGS.has(el.tagName)) return true
  const cls = typeof el.className === 'string' ? el.className : ''
  if (/\b(v-card|v-btn|v-chip|v-alert|v-badge|v-progress|v-dialog|v-menu|v-field|v-avatar|v-snackbar)\b/.test(cls)) {
    return true
  }
  return false
}

/**
 * 第三层：插件硬编码不透明全页背景的轻量智能清洗（仅检查挂载点向下 1~2 层占满视口宽度的根包装元素）。
 * 明确带自定义视觉背景图（background-image: url(...)）或局部组件（卡片/按钮/徽章/图表）完整保留。
 */
export function cleanOpaquePluginRoots(mountRoot: HTMLElement | null): number {
  if (!mountRoot || typeof window === 'undefined') return 0
  const viewportWidth = Math.max(window.innerWidth || 0, mountRoot.getBoundingClientRect().width || 0)
  let cleaned = 0

  const inspectElement = (el: HTMLElement, depth: number) => {
    if (depth > 2) return
    if (!shouldSkipTransparentClean(el)) {
      const style = window.getComputedStyle(el)
      const bgImage = (style.backgroundImage || '').trim().toLowerCase()
      const hasImageUrl = bgImage.includes('url(')
      const rect = el.getBoundingClientRect()
      const spansFullWidth = viewportWidth <= 0 || rect.width === 0 || rect.width >= viewportWidth * 0.88
      if (!hasImageUrl && spansFullWidth && isOpaqueCssColor(style.backgroundColor || '')) {
        el.setAttribute('data-mp-shell-transparent-root', 'true')
        cleaned += 1
      }
    }
    if (depth < 2) {
      for (const child of Array.from(el.children)) {
        if (child instanceof HTMLElement) {
          inspectElement(child, depth + 1)
        }
      }
    }
  }

  for (const child of Array.from(mountRoot.children)) {
    if (child instanceof HTMLElement) {
      inspectElement(child, 1)
    }
  }
  return cleaned
}
