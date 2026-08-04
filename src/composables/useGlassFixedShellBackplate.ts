import { inject, provide, shallowRef, type InjectionKey, type Ref, type StyleValue } from 'vue'
import type { ThemeCustomizerGlassAppearance, ThemeCustomizerGlassQuality } from '@/composables/useThemeCustomizer'
import type { LoginBackgroundLayer } from '@/utils/loginPresentation'

export interface GlassFixedShellBackplateLayer extends LoginBackgroundLayer {
  /** 与 tone/WebGL 一致的图片请求模式；CORS 不可用时省略并使用普通图片回退。 */
  crossOrigin?: 'anonymous'
  /** 已完成首图准备、可直接进入稳定背板槽位的图片地址。 */
  src: string
  /** 当前槽位直接采样壁纸时叠加的色调变量。 */
  style: StyleValue
}

export interface GlassFixedShellBackplateContext {
  /** App 持有的稳定双槽位；布局只消费，不建立第二套壁纸生命周期。 */
  layers: Readonly<Ref<readonly GlassFixedShellBackplateLayer[]>>
  /** 双槽位角色交换时使用的统一交叉淡化时长。 */
  transitionDurationMs: number
}

interface GlassFixedShellBackplateEligibility {
  /** 当前玻璃材质。 */
  appearance: ThemeCustomizerGlassAppearance
  /** 稳定双槽位中是否已经存在可显示的壁纸。 */
  hasWallpaper: boolean
  /** 当前页面是否处于认证后的主布局。 */
  isAuthenticated: boolean
  /** 当前浏览器是否需要绕开 Chromium fixed document backdrop 的重合成路径。 */
  needsStableFixedBackdrop: boolean
  /** 当前玻璃渲染质量。 */
  quality: ThemeCustomizerGlassQuality
  /** Vuetify 当前解析后的主题名。 */
  themeName: string
}

interface GlassFixedShellBrowserIdentity {
  /** User-Agent Client Hints 暴露的浏览器品牌。 */
  userAgentData?: {
    brands?: readonly {
      brand: string
    }[]
  }
  /** Client Hints 不可用时使用的传统浏览器标识。 */
  userAgent: string
}

const GLASS_FIXED_SHELL_BACKPLATE_KEY: InjectionKey<GlassFixedShellBackplateContext> =
  Symbol('glass-fixed-shell-backplate')
const EMPTY_FIXED_SHELL_LAYERS = shallowRef<readonly GlassFixedShellBackplateLayer[]>([])
const EMPTY_FIXED_SHELL_CONTEXT: GlassFixedShellBackplateContext = {
  layers: EMPTY_FIXED_SHELL_LAYERS,
  transitionDurationMs: 0,
}

/** Chromium 使用独立 fixed 背板规避 document backdrop 重合成；WebKit 保留原生采样路径。 */
export function isChromiumFixedShellBackplateBrowser(browserIdentity: GlassFixedShellBrowserIdentity = navigator) {
  const brands = browserIdentity.userAgentData?.brands
  if (brands?.length) return brands.some(({ brand }) => brand === 'Chromium')

  return /\b(?:Chrome|Chromium)\/\d+/u.test(browserIdentity.userAgent)
}

/** Chromium 磨砂 fixed 层使用稳定壁纸背板，避免读取随页面重绘的 document backdrop。 */
export function shouldUseGlassFixedShellBackplate(options: GlassFixedShellBackplateEligibility) {
  return (
    options.isAuthenticated &&
    options.needsStableFixedBackdrop &&
    options.themeName === 'glass' &&
    options.appearance === 'frosted' &&
    options.hasWallpaper
  )
}

/** 从 App 向认证后布局提供唯一的 fixed-shell 壁纸双槽位。 */
export function provideGlassFixedShellBackplate(context: GlassFixedShellBackplateContext) {
  provide(GLASS_FIXED_SHELL_BACKPLATE_KEY, context)
}

/** 读取 fixed-shell 双槽位；不在 App 树下时返回稳定空上下文。 */
export function useGlassFixedShellBackplate() {
  return inject(GLASS_FIXED_SHELL_BACKPLATE_KEY, EMPTY_FIXED_SHELL_CONTEXT)
}
