import { nativeChromeActive } from './layout'
import { isNativeIdentifier, type NativeOperationItem, type NativeOperationMenu } from './protocol'

/** 菜单项目只在网页内保留原回调；标识必须源自业务语义，不能使用列表位置。 */
export interface NativeMenuEntry extends Omit<NativeOperationItem, 'items'> {
  visible?: boolean
  items?: NativeMenuEntry[]
  /** 在展示交接完成、权限与当前声明再次核对后，执行原页面动作。 */
  invoke?(): void | Promise<unknown>
}

/** 提供者每次读取当前 Vue 状态；禁用的父菜单同时禁止其所有子动作。 */
export interface NativeMenuSource {
  ownerId: string
  menuId: string
  kind: NativeOperationMenu['kind']
  title?: string
  /** 路由、选中模式或权限使整个来源不可用时，撤销展示与执行。 */
  available?(): boolean
  /** 返回原顺序的可见性、图标、样式和回调，不发起第二套业务请求。 */
  items(): NativeMenuEntry[]
}

/** 只有完成协商的前台文档可以登记来源；切换该范围后必须重新登记当前页面。 */
export interface NativeMenuContext {
  sessionId: string
  routeRevision: number
}

/** 注册代次以对象身份隔离同名替换，不让旧组件卸载清除新组件。 */
interface Registration {
  source: NativeMenuSource
  ownerId: string
  menuId: string
}

/** 单次展示和待执行选择共用撤销标识，回调与纯 JSON 声明分开保存。 */
interface Presentation {
  registration: Registration
  id: string
  signature: string
  consumed: boolean
}

const encoder = new TextEncoder()
const colors = new Set(['primary', 'secondary', 'success', 'info', 'warning', 'error'])
// 关联票据不是认证凭据；模块内递增可兼容局域网 HTTP，且跨注册表及前后台都不重复。
let menuSequence = 0

/** 文案不截断或夹带控制字符；无法完整展示时整份声明交回原入口处理。 */
function menuText(value: unknown, required = false, bytes = 2048): string | undefined {
  if (value === undefined && !required) return
  if (
    typeof value !== 'string' ||
    (required && !value.trim()) ||
    /[\p{Cc}\p{Cf}]/u.test(value) ||
    encoder.encode(value).length > bytes
  )
    throw new Error('invalid_menu_text')
  return value
}

/** 投影完整的当前菜单；重复标识、坏项目、过深或过大的树整体拒绝，避免丢失尾部动作。 */
function projectMenu(registration: Registration) {
  const { source, ownerId, menuId } = registration
  if (source.available?.() === false) return
  if (!['card', 'standalone'].includes(source.kind)) return
  const ids = new Set<string>()
  const callbacks = new Map<string, { entry: NativeMenuEntry; enabled: boolean }>()
  let count = 0
  /** 最多三层、96 项；父菜单的禁用和加载状态向下继承。 */
  function items(entries: NativeMenuEntry[], depth = 0, parentEnabled = true): NativeOperationItem[] {
    if (!Array.isArray(entries) || depth > 2) throw new Error('invalid_menu_tree')
    const result: NativeOperationItem[] = []
    for (const entry of entries) {
      if (entry.visible === false) continue
      if (!isNativeIdentifier(entry.id) || ids.has(entry.id) || ++count > 96) throw new Error('invalid_menu_item')
      ids.add(entry.id)
      if (entry.kind === 'separator') {
        if (entry.items !== undefined || entry.invoke !== undefined) throw new Error('invalid_menu_separator')
        result.push({ id: entry.id, kind: 'separator' })
        continue
      }
      if (!['action', 'submenu', 'group'].includes(entry.kind)) throw new Error('invalid_menu_kind')
      const title = menuText(entry.title, entry.kind !== 'group')
      const subtitle = menuText(entry.subtitle)
      const icon = menuText(entry.icon, false, 256)
      if (entry.color !== undefined && !colors.has(entry.color)) throw new Error('invalid_menu_color')
      const enabled = parentEnabled && entry.enabled !== false && entry.loading !== true
      const row: NativeOperationItem = {
        id: entry.id,
        kind: entry.kind,
        ...(title !== undefined ? { title } : {}),
        ...(subtitle !== undefined ? { subtitle } : {}),
        ...(icon !== undefined ? { icon } : {}),
        ...(entry.color !== undefined ? { color: entry.color } : {}),
        enabled,
        selected: entry.selected === true,
        loading: entry.loading === true,
        destructive: entry.destructive === true || entry.color === 'error',
        keepOpen: entry.keepOpen === true,
      }
      if (entry.kind === 'action') {
        if (typeof entry.invoke !== 'function' || entry.items !== undefined) throw new Error('invalid_menu_action')
        callbacks.set(entry.id, { entry, enabled })
      } else {
        if (entry.invoke !== undefined) throw new Error('invalid_menu_container')
        row.items = items(entry.items ?? [], depth + 1, enabled)
        if (!row.items.some(child => child.kind !== 'separator')) continue
      }
      result.push(row)
    }
    return result
  }
  const title = menuText(source.title)
  const menu = {
    ownerId,
    menuId,
    kind: source.kind,
    ...(title !== undefined ? { title } : {}),
    items: items(source.items()),
  }
  const signature = JSON.stringify(menu)
  if (!callbacks.size || encoder.encode(signature).length > 24000) return
  return { menu, signature, callbacks }
}

/** 默认关闭的操作菜单注册表；尚未接入传输、DOM、手势或能力开关，不改变现有菜单。 */
export class NativeMenuRegistry {
  private context?: NativeMenuContext
  private readonly sources = new Map<string, Registration>()
  private presentation?: Presentation

  /** 前台、文档、路由或能力失效时撤销所有旧来源；适配层重新登记当前可见组件。 */
  setContext(context: NativeMenuContext | undefined) {
    const next =
      context &&
      isNativeIdentifier(context.sessionId) &&
      Number.isSafeInteger(context.routeRevision) &&
      context.routeRevision >= 0
        ? { ...context }
        : undefined
    if (this.context?.sessionId === next?.sessionId && this.context?.routeRevision === next?.routeRevision) return
    this.context = next
    this.sources.clear()
    this.presentation = undefined
  }

  /** 登记当前范围的业务来源；关闭状态不保留回调，注销只影响对应注册代次。 */
  register(source: NativeMenuSource): () => void {
    if (!this.context) return () => {}
    if (!isNativeIdentifier(source.ownerId) || !isNativeIdentifier(source.menuId))
      throw new Error('invalid_menu_identifier')
    const key = JSON.stringify([source.ownerId, source.menuId])
    const previous = this.sources.get(key)
    const registration = { source, ownerId: source.ownerId, menuId: source.menuId }
    this.sources.set(key, registration)
    if (this.presentation?.registration === previous) this.presentation = undefined
    return () => {
      if (this.sources.get(key) !== registration) return
      this.sources.delete(key)
      if (this.presentation?.registration === registration) this.presentation = undefined
    }
  }

  /** 只为完整可投影的当前来源创建单次声明，不截掉菜单项，也不信任调用方缓存。 */
  open(ownerId: string, menuId: string): NativeOperationMenu | undefined {
    this.presentation = undefined
    const registration = this.sources.get(JSON.stringify([ownerId, menuId]))
    if (!this.context || !registration) return
    const current = this.read(registration)
    if (!current || !this.context || this.sources.get(JSON.stringify([ownerId, menuId])) !== registration) return
    const id = `menu-${++menuSequence}`
    this.presentation = { registration, id, signature: current.signature, consumed: false }
    return { ...current.menu, presentationId: id }
  }

  /** 取消或菜单退出只撤销其自身，不让迟到的关闭消息打断下一份菜单。 */
  dismiss(presentationId: string) {
    if (this.presentation?.id === presentationId) this.presentation = undefined
  }

  /** 消费单次选择，等待原网页菜单和原生动画交接，再重新读取并复核整个原菜单。 */
  async select(presentationId: string, itemId: string, beforeInvoke: () => void | Promise<void>): Promise<boolean> {
    const presentation = this.presentation
    if (!presentation || presentation.id !== presentationId || presentation.consumed) return false
    const current = this.selection(presentation, itemId)
    if (!current) {
      this.presentation = undefined
      return false
    }
    presentation.consumed = true
    try {
      await beforeInvoke()
      const entry = this.selection(presentation, itemId)
      if (!entry) return false
      // 执行业务前清除展示票据；原回调打开的新菜单不受 finally 的旧票据清理影响。
      this.presentation = undefined
      await entry.invoke!()
      return true
    } finally {
      if (this.presentation === presentation) this.presentation = undefined
    }
  }

  /** 不完整的动态插件声明不能接管入口，执行中的原业务异常则由原调用路径处理。 */
  private read(registration: Registration) {
    try {
      return projectMenu(registration)
    } catch {
      return undefined
    }
  }

  /** 可见项目、样式或父层状态发生变化即使 ID 相同也拒绝旧选择，回调始终取最新声明。 */
  private selection(presentation: Presentation, itemId: string): NativeMenuEntry | undefined {
    if (!this.context || this.presentation !== presentation || !isNativeIdentifier(itemId)) return
    const current = this.read(presentation.registration)
    if (!current || this.presentation !== presentation || current.signature !== presentation.signature) return
    const callback = current.callbacks.get(itemId)
    return callback?.enabled ? callback.entry : undefined
  }
}

const closers = new Set<() => void>()

/** 菜单注册原有关闭回调；组件卸载时释放，不跨桥传递 Vue 状态。 */
export function registerNativeMenuClose(close: () => void) {
  closers.add(close)
  return () => closers.delete(close)
}

/** 新 Sheet 出现时先结束网页菜单状态；普通网页与旧容器不受影响。 */
export function closeNativeMenus() {
  if (!nativeChromeActive.value || window.MoviePilotNative?.sheetsVersion !== 1) return
  for (const close of closers) close()
}
