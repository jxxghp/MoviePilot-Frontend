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

/**
 * 将原生实时下发的 NativeVisualTokens 全量写入 Vuetify 主题与 CSS 变量：
 * - 接管 Vuetify 3 主题色板（primary/success/warning/error/info/surface/on-surface）
 * - 同步 --transparent-blur / --mp-* 透明玻璃材质变量
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
      'on-surface': tokens.textPrimaryHex || basePalette.colors['on-surface'],
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
  root.dataset.mpShellTheme = mode
  root.dataset.mpShellPlatform = tokens.platform || 'ios'
  root.dataset.mpShellAmoled = tokens.isAmoledBlack ? 'true' : 'false'
  root.dataset.mpShellHighContrast = tokens.highContrast ? 'true' : 'false'
  root.style.colorScheme = mode

  const blurPx = tokens.isAmoledBlack ? 0 : Math.max(0, Math.min(36, Number(tokens.surfaceBlurPx) || 18))
  const vars: Record<string, string> = {
    '--mp-accent': tokens.accentHex,
    '--mp-on-accent': tokens.onAccentHex || '#FFFFFF',
    '--mp-text-primary': tokens.textPrimaryHex,
    '--mp-text-secondary': tokens.textSecondaryHex,
    '--mp-surface-glass': tokens.isAmoledBlack ? 'rgba(20, 20, 24, 0.96)' : tokens.surfaceGlassRgba,
    '--mp-surface-elevated': tokens.isAmoledBlack ? 'rgba(24, 24, 30, 0.98)' : tokens.surfaceElevatedRgba,
    '--mp-surface-border': tokens.surfaceBorderRgba,
    '--mp-surface-blur': `${blurPx}px`,
    '--mp-solid-surface': tokens.solidSurfaceHex,
    '--mp-field-fill': tokens.fieldFillRgba,
    '--mp-field-border': tokens.fieldBorderRgba,
    '--mp-chip-fill': tokens.chipFillRgba,
    '--mp-chip-border': tokens.chipBorderRgba,
    '--mp-divider': tokens.dividerRgba,
    '--mp-panel-radius': `${Math.max(8, Number(tokens.panelRadiusPx) || 24)}px`,
    '--mp-sheet-radius': `${Math.max(12, Number(tokens.sheetRadiusPx) || 28)}px`,
    '--mp-border-width': `${Math.max(0.5, Number(tokens.borderWidthPx) || 0.7)}px`,
    '--mp-semantic-success': tokens.semantic.success,
    '--mp-semantic-warning': tokens.semantic.warning,
    '--mp-semantic-danger': tokens.semantic.danger,
    '--mp-semantic-info': tokens.semantic.info,
    '--mp-semantic-brand': tokens.semantic.brand,
    '--mp-font-family': tokens.fontFamily || DEFAULT_DARK_TOKENS.fontFamily || 'system-ui, sans-serif',
    // 对齐 MoviePilot 官方透明插件变量约定（如 BrushFlowWorkbench.vue）
    '--transparent-blur': `${blurPx}px`,
    '--transparent-opacity': mode === 'dark' ? '0.14' : '0.68',
    '--transparent-opacity-heavy': mode === 'dark' ? '0.84' : '0.90',
    '--v-border-opacity': mode === 'dark' ? '0.14' : '0.12',
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
  if (
    /\b(v-card|v-btn|v-chip|v-alert|v-badge|v-progress|v-dialog|v-menu|v-field|v-avatar|v-snackbar)\b/.test(cls)
  ) {
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
