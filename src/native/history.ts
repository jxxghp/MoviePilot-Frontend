import { shallowRef } from 'vue'
import type { Router } from 'vue-router'
import { isNativeRoute, type NativeSnapshot } from './protocol'
import { readNativePresentation } from './presentation'

/** 每个入口的逻辑路径由网页 Router 完成钩子维护，原生不保存第二份业务栈。
 */
export class NativeRouteHistory {
  readonly revision = shallowRef(0)
  private readonly trails = new Map<string, string[]>()
  private currentRoot: string | null = null
  private lastPosition?: number
  private intent?: { target: string; kind: 'root' | 'back'; rootId: string }
  private readonly removeHook: () => void

  /** 使用当前 Vue Router 的公开 history.state.position 识别 push/replace/pop，并以实际成功路由为准。
   */
  constructor(
    private readonly router: Router,
    private readonly roots: () => NativeSnapshot['roots'],
  ) {
    this.record()
    this.removeHook = router.afterEach((_to, _from, failure) => {
      if (!failure) this.record()
    })
  }

  /** 身份或权限代次变化立即撤销旧动作和路径缓存。
   */
  reset() {
    this.trails.clear()
    this.currentRoot = null
    this.lastPosition = undefined
    this.intent = undefined
    this.record()
  }

  /** 读取已确认的根入口与返回目标；直接深链接也能回到所属入口。
   */
  get navigation() {
    const trail = this.currentRoot ? this.trails.get(this.currentRoot) : undefined
    const backTarget = trail && trail.length > 1 ? trail[trail.length - 2] : undefined
    return { rootId: this.currentRoot, canGoBack: Boolean(backTarget), ...(backTarget ? { backTarget } : {}) }
  }

  /** Tab 使用 replace 恢复该入口最后位置，取消守卫不会提前改变栈或选中项。
   */
  selectRoot(id: string) {
    const root = this.roots().find(item => item.id === id)
    if (!root || this.intent) return false
    // “更多”是目录入口，每次点击都回到目录，其他 Tab 保留最近业务位置。
    const target = root.path === '/apps' ? root.path : (this.trails.get(id)?.at(-1) ?? root.path)
    this.navigate(target, 'root', id)
    return true
  }

  /** 先结束键盘编辑或交给当前 HTML 弹层处理返回，再请求 Router 通过业务守卫。
   */
  back(document: Document, targetWindow: Window) {
    const focused = document.activeElement
    if (focused instanceof HTMLElement && focused.matches('input,textarea,[contenteditable="true"]')) {
      focused.blur()
      return true
    }
    if (readNativePresentation(document).overlayOpen) {
      targetWindow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
      return true
    }
    const target = this.navigation.backTarget
    if (!target || !this.currentRoot || this.intent) return false
    this.navigate(target, 'back', this.currentRoot)
    return true
  }

  /** 宿主卸载后清理钩子，避免重复记录一次路由。
   */
  stop() {
    this.removeHook()
    this.trails.clear()
  }

  /** 只为一次当前意图保留关联；确认后才处理路径栈，失败不重放。
   */
  private navigate(target: string, kind: 'root' | 'back', rootId: string) {
    if (!isNativeRoute(target)) return
    const normalized = this.canonicalPath(target)
    const intent = { target: normalized, kind, rootId }
    this.intent = intent
    void this.router
      .replace(normalized)
      .finally(() => {
        if (this.intent === intent) this.intent = undefined
      })
      .catch(() => {
        /* Router 保留当前已确认页面，失败意图不重放。 */
      })
  }

  /** Router 对象形式统一编码 query/hash，避免中文 URL 恢复后被误记到当前其它入口。 */
  private canonicalPath(path: string) {
    const resolved = this.router.resolve(path)
    return this.router.resolve({ path: resolved.path, query: resolved.query, hash: resolved.hash }).fullPath
  }

  /** 匹配实际入口；详情页沿用来源入口，普通业务页面归属更多。
   */
  private rootFor(path: string) {
    const roots = this.roots()
    if (!this.router.currentRoute.value.meta.requiresAuth) return null
    const explicit = roots.find(root => path === root.path || path.startsWith(`${root.path}/`))
    if (explicit) return explicit.id
    if (/^\/(media|person|browse|credits)(\/|$)/.test(path) && roots.some(root => root.id === this.currentRoot))
      return this.currentRoot
    return roots.find(root => root.path === '/apps')?.id ?? roots[0]?.id ?? null
  }

  /** 完成钩子同时覆盖页面自身导航、外部 hash 和原生意图；失败钩子不写入。
   */
  private record() {
    const route = this.router.currentRoute.value
    const path = this.canonicalPath(route.fullPath)
    const position = this.router.options.history.state.position
    const numericPosition = typeof position === 'number' ? position : undefined
    const intent = this.intent?.target === path ? this.intent : undefined
    const rootId = intent?.rootId ?? this.rootFor(route.path)
    if (rootId) {
      const root = this.roots().find(item => item.id === rootId)
      let trail = this.trails.get(rootId) ?? (root && path !== root.path ? [root.path] : [])
      if (intent?.kind === 'back') {
        const index = trail.lastIndexOf(path)
        trail = index >= 0 ? trail.slice(0, index + 1) : [...trail, path]
      } else if (intent?.kind !== 'root') {
        const index = trail.lastIndexOf(path)
        if (
          numericPosition !== undefined &&
          this.lastPosition !== undefined &&
          numericPosition < this.lastPosition &&
          index >= 0
        )
          trail = trail.slice(0, index + 1)
        else if (numericPosition === this.lastPosition && rootId === this.currentRoot && trail.length)
          trail = [...trail.slice(0, -1), path]
        else if (trail.at(-1) !== path) trail = [...trail, path]
      } else if (root?.path === '/apps' && path === root.path) trail = [root.path]
      else if (!trail.length) trail = [path]
      this.trails.set(rootId, trail.slice(-128))
    }
    this.currentRoot = rootId
    this.lastPosition = numericPosition
    this.revision.value += 1
  }
}
