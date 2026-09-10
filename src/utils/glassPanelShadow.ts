/** 与卡片同尺寸的独立外投影，不参与卡片自身的 backdrop 输入。 */
const SHADOW_CLASS = 'glass-panel-shadow'
const RECT_TOLERANCE = 0.25
const SHADOW_RADIUS = 'var(--app-theme-surface-radius, 20px)'

function sameRect(left: DOMRect, right: DOMRect) {
  return (['left', 'top', 'width', 'height'] as const).every(key => Math.abs(left[key] - right[key]) <= RECT_TOLERANCE)
}

function splitComputedList(value: string) {
  const values: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1
    else if (value[index] === ')') depth -= 1
    else if (value[index] === ',' && depth === 0) {
      values.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  values.push(value.slice(start).trim())
  return values
}

function shadowTransition(style: CSSStyleDeclaration) {
  const properties = splitComputedList(style.transitionProperty)
  const projected = [
    'box-shadow',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
  ]
  const indices = projected.map(target => {
    // 同一属性匹配多条 transition 时，CSS 使用最后一条匹配项。
    let index = -1
    properties.forEach((property, position) => {
      if (property === 'all' || property === target || (property === 'border-radius' && target !== 'box-shadow'))
        index = position
    })
    return index
  })
  const parts = (value: string, fallback: string) => {
    const values = splitComputedList(value)
    return indices.map(index => (index < 0 ? fallback : values[index % values.length])).join(', ')
  }
  return {
    transitionProperty: projected.join(', '),
    transitionDuration: parts(style.transitionDuration, '0s'),
    transitionTimingFunction: parts(style.transitionTimingFunction, 'ease'),
    transitionDelay: parts(style.transitionDelay, '0s'),
  }
}

/** 投影在两个绘制层之间交接时原子切换，未来的 hover 过渡仍由原 CSS 控制。 */
export function withInstantGlassShadow(element: HTMLElement, apply: () => void) {
  const computed = getComputedStyle(element)
  if (
    computed.transitionProperty === 'none' ||
    splitComputedList(computed.transitionDuration).every(value => Number.parseFloat(value) === 0)
  ) {
    apply()
    return
  }
  const previous = element.style.getPropertyValue('transition')
  const priority = element.style.getPropertyPriority('transition')
  element.style.setProperty('transition', `${computed.transition}, box-shadow 0s`, 'important')
  try {
    apply()
    // 在恢复过渡声明前提交阴影样式，避免旧外投影淡出时与新层短暂叠加。
    void getComputedStyle(element).boxShadow
  } finally {
    if (previous) element.style.setProperty('transition', previous, priority)
    else element.style.removeProperty('transition')
  }
}

/**
 * 在同一定位上下文中分离外投影，保持真实 border box 和圆角。
 * 无法准确对齐的变换或特殊定位保留原绘制方式，不用整数近似替代几何。
 */
export function syncGlassPanelShadow(element: HTMLElement, existing: HTMLElement | null): HTMLElement | null {
  const style = getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  const inlineShadow = element.style.getPropertyValue('box-shadow')
  // 业务显式设置的投影不属于统一材质；后续覆写也不能被分层重新接管。
  if (inlineShadow && (!existing || inlineShadow !== 'var(--glass-v3-surface-edge)')) {
    existing?.remove()
    return null
  }
  if (!element.isConnected || !rect.width || !rect.height || style.position === 'fixed' || style.transform !== 'none') {
    existing?.remove()
    return null
  }

  const layer = existing ?? document.createElement('div')
  if (!existing) {
    layer.className = SHADOW_CLASS
    layer.setAttribute('aria-hidden', 'true')
    layer.style.position = 'absolute'
    layer.style.pointerEvents = 'none'
    layer.style.boxSizing = 'border-box'
    layer.style.margin = '0'
    layer.style.border = '0'
    layer.style.padding = '0'
  }
  // 放在卡片之后，既保留 first-child 业务选择器，也避免卡片折射自己的外投影。
  if (element.nextElementSibling !== layer) element.after(layer)
  if (element.offsetParent !== layer.offsetParent) {
    layer.remove()
    return null
  }
  const transition = shadowTransition(style)
  // 同一表面会因旁边的内容更新而再次绑定；几何未变时不制造额外的 style invalidation。
  if (
    existing &&
    sameRect(layer.getBoundingClientRect(), rect) &&
    layer.style.borderRadius === SHADOW_RADIUS &&
    layer.style.zIndex === style.zIndex &&
    Object.entries(transition).every(([property, value]) => layer.style[property as keyof typeof transition] === value)
  )
    return layer
  layer.style.width = `${rect.width}px`
  layer.style.height = `${rect.height}px`
  layer.style.borderRadius = SHADOW_RADIUS
  layer.style.zIndex = style.zIndex
  Object.assign(layer.style, transition)
  layer.style.left = '0'
  layer.style.top = '0'
  // 原点由实际定位层测得，避免父级边框、滚动偏移和页面入场位移被重复计入。
  const origin = layer.getBoundingClientRect()
  layer.style.left = `${rect.left - origin.left}px`
  layer.style.top = `${rect.top - origin.top}px`
  const aligned = layer.getBoundingClientRect()
  if (!sameRect(aligned, rect) || getComputedStyle(layer).borderRadius !== style.borderRadius) {
    layer.remove()
    return null
  }
  return layer
}
