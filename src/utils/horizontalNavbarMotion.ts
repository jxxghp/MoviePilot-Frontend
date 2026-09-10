/** 浮动外壳距离视口边缘的最终 CSS 像素间距。 */
export const FLOATING_NAVBAR_INSET_PX = 16
/** 超宽屏上导航内部布局的最大 CSS 像素宽度，包含控件区两侧留白。 */
export const HORIZONTAL_NAVBAR_CONTENT_MAX_WIDTH_PX = 2560

export interface HorizontalNavbarGeometry {
  /** 页顶内容区距离视口单侧边缘的距离，不包含控件内边距。 */
  topGutter: number
  /** 完全展开后内部布局距离视口单侧边缘的距离。 */
  floatingGutter: number
  /** 完成展开所需的滚动距离；不使用动画时长。 */
  scrollDistance: number
}

/** 按实际内容宽度确定横向行程，限宽后不再按整块超宽屏计算展开速度。 */
export function getHorizontalNavbarGeometry(viewportWidth: number, contentWidth: number): HorizontalNavbarGeometry {
  const topGutter = Math.max(0, (viewportWidth - contentWidth) / 2)
  const floatingGutter = Math.max(
    FLOATING_NAVBAR_INSET_PX,
    (viewportWidth - HORIZONTAL_NAVBAR_CONTENT_MAX_WIDTH_PX) / 2,
  )

  return {
    topGutter,
    floatingGutter,
    scrollDistance: Math.min(600, Math.max(200, topGutter - floatingGutter)),
  }
}

/** 单调、可逆的 smoothstep；起止速度归零，停滚即停，不引入时间追赶或弹跳。 */
export function getHorizontalNavbarProgress(scrollY: number, scrollDistance: number): number {
  const progress = Math.min(1, Math.max(0, scrollY / scrollDistance))

  return progress * progress * (3 - 2 * progress)
}
