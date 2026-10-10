import { onBeforeUnmount, onMounted } from 'vue'

/** 与样式中悬停展开操作栈的条件保持一致；满足时由 CSS :hover 处理，脚本不介入。 */
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)'
const STACK_SELECTOR = '.compact-fab-stack'
const EXPANDED_CLASS = 'is-expanded'

/** 当前环境是否由悬停展开操作栈。 */
function usesHoverExpansion() {
  return typeof window.matchMedia === 'function' && window.matchMedia(FINE_POINTER_QUERY).matches
}

/**
 * 触屏下的折叠操作栈点按处理，在捕获阶段先于按钮自身的点击逻辑执行。
 * 折叠时第一次点按只展开，不触发按钮功能；展开后正常执行被点的按钮；点按操作栈以外的位置收起。
 * 单按钮操作栈不折叠，点按直接执行。
 */
export function handleCompactFabStackClick(event: MouseEvent) {
  if (usesHoverExpansion()) return

  const target = event.target instanceof Element ? event.target : null
  const stack = target?.closest<HTMLElement>(STACK_SELECTOR) ?? null

  document.querySelectorAll<HTMLElement>(`${STACK_SELECTOR}.${EXPANDED_CLASS}`).forEach(element => {
    if (element !== stack) element.classList.remove(EXPANDED_CLASS)
  })

  if (!stack || stack.children.length < 2 || stack.classList.contains(EXPANDED_CLASS)) return

  event.preventDefault()
  event.stopPropagation()
  stack.classList.add(EXPANDED_CLASS)
}

/** 在布局生命周期内安装触屏操作栈点按处理；操作栈只在非 App 模式渲染，App 模式不受影响。 */
export function useCompactFabStackTouch() {
  onMounted(() => document.addEventListener('click', handleCompactFabStackClick, true))
  onBeforeUnmount(() => document.removeEventListener('click', handleCompactFabStackClick, true))
}
