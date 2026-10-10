import type { Directive } from 'vue'

/** 尾部保留段的最大长度；超过时只保留最后一个扩展名，避免尾部挤占文件名主体。 */
const MAX_TAIL_LENGTH = 18

/** 点号两侧都是数字时视为小数点（如 `5.1`、`AAC2.0`），不能作为切分位置。 */
function isDecimalPoint(name: string, index: number) {
  return /\d/.test(name.charAt(index - 1)) && /\d/.test(name.charAt(index + 1))
}

/**
 * 计算文件名在省略时需要固定保留的尾部。
 * 优先保留扩展名加前一个点分段（如 `.chs&eng.ass`、`.5.1-GROUP.mkv`），切分点落在小数中间时继续向前；
 * 过长时只保留扩展名，没有扩展名或扩展名本身过长时返回空串，表示按普通末尾省略处理。
 */
export function getNameTail(name: string): string {
  const lastDot = name.lastIndexOf('.')
  if (lastDot <= 0 || name.length - lastDot > MAX_TAIL_LENGTH) return ''
  let start = name.lastIndexOf('.', lastDot - 1)
  while (start > 0 && isDecimalPoint(name, start)) start = name.lastIndexOf('.', start - 1)
  if (start > 0 && name.length - start <= MAX_TAIL_LENGTH) return name.slice(start)
  return name.slice(lastDot)
}

const observers = new WeakMap<HTMLElement, ResizeObserver>()
const renderedWidths = new WeakMap<HTMLElement, number>()

/** 先完整渲染名称，仅在确实溢出时拆成“可省略主体 + 固定尾部”，未溢出的名称保持原样连续显示。 */
function render(el: HTMLElement, name: string) {
  el.classList.remove('is-split')
  el.replaceChildren(document.createTextNode(name))
  renderedWidths.set(el, el.clientWidth)
  const overflowing = el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1
  const tail = overflowing ? getNameTail(name) : ''
  if (!tail) return

  const head = document.createElement('span')
  head.className = 'tail-ellipsis__head'
  head.textContent = name.slice(0, -tail.length)
  const tailNode = document.createElement('span')
  tailNode.className = 'tail-ellipsis__tail'
  tailNode.textContent = tail
  el.replaceChildren(head, tailNode)
  el.classList.add('is-split')
}

/**
 * 长文件名中间省略、保留扩展名的指令，取值为完整名称。
 * 指令独占元素内容，模板中不要再为该元素渲染子节点；元素宽度变化时重新测量。
 */
export const vTailEllipsis: Directive<HTMLElement, string | undefined> = {
  mounted(el, binding) {
    el.dataset.tailEllipsisName = binding.value ?? ''
    render(el, binding.value ?? '')
    // 测试环境等不支持 ResizeObserver 时只做首次渲染。
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      // 只在宽度变化时重算，拆分本身引起的高度变化不会再次触发渲染。
      if (renderedWidths.get(el) === el.clientWidth) return
      render(el, el.dataset.tailEllipsisName ?? '')
    })
    observer.observe(el)
    observers.set(el, observer)
  },
  updated(el, binding) {
    if (binding.value === binding.oldValue) return
    el.dataset.tailEllipsisName = binding.value ?? ''
    render(el, binding.value ?? '')
  },
  unmounted(el) {
    observers.get(el)?.disconnect()
    observers.delete(el)
  },
}
