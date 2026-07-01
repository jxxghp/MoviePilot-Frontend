import { defineComponent, h } from 'vue'
import { useDisplay } from 'vuetify'
import { VDialog as VuetifyDialog } from 'vuetify/components/VDialog'

const DEFAULT_ROOT_FONT_SIZE = 16

/**
 * 判断传入的 fullscreen 属性是否已请求全屏展示。
 */
function isFullscreenRequested(value: unknown) {
  return value !== undefined && value !== null && value !== false
}

/**
 * 获取文档根字号，用于把 rem/em 宽度限制换算成像素。
 */
function getRootFontSize() {
  if (typeof window === 'undefined') return DEFAULT_ROOT_FONT_SIZE

  const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(rootFontSize) ? rootFontSize : DEFAULT_ROOT_FONT_SIZE
}

/**
 * 将弹窗宽度限制换算成像素，无法可靠解析的复杂表达式返回空值。
 */
function parseDialogWidthLimit(value: unknown, viewportWidth: number) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string') return undefined

  const trimmedValue = value.trim()
  if (!trimmedValue) return undefined

  const numericValue = Number(trimmedValue)
  if (Number.isFinite(numericValue)) return numericValue

  const lengthMatch = trimmedValue.match(/^(-?\d*\.?\d+)(px|rem|em|vw|%)$/i)
  if (!lengthMatch) return undefined

  const [, rawAmount, rawUnit] = lengthMatch
  const amount = Number(rawAmount)
  if (!Number.isFinite(amount)) return undefined

  const unit = rawUnit.toLowerCase()
  if (unit === 'px') return amount
  if (unit === 'rem' || unit === 'em') return amount * getRootFontSize()
  if (unit === 'vw') return (viewportWidth * amount) / 100
  if (unit === '%') return (viewportWidth * amount) / 100

  return undefined
}

/**
 * 根据 maxWidth 与 width 的有效上限，收窄 fullscreen 的生效宽度。
 */
function resolveFullscreen(
  fullscreen: unknown,
  maxWidth: unknown,
  width: unknown,
  viewportWidth: number,
) {
  if (!isFullscreenRequested(fullscreen)) return false

  const widthLimits = [maxWidth, width]
    .map(value => parseDialogWidthLimit(value, viewportWidth))
    .filter((value): value is number => value !== undefined)

  if (!widthLimits.length) return true

  return viewportWidth <= Math.min(...widthLimits)
}

export default defineComponent({
  name: 'AppDialog',
  inheritAttrs: false,
  /**
   * 渲染项目统一弹窗，并在宽度上限小于移动全屏断点时收窄 fullscreen 条件。
   */
  setup(_, { attrs, slots }) {
    const display = useDisplay()

    return () => {
      const maxWidth = attrs.maxWidth ?? attrs['max-width']
      const resolvedFullscreen = resolveFullscreen(attrs.fullscreen, maxWidth, attrs.width, display.width.value)

      return h(VuetifyDialog, { ...attrs, fullscreen: resolvedFullscreen }, slots)
    }
  },
})
