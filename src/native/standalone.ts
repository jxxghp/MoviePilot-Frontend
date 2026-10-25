import { nativeCardAction, type NativeCardAction } from './card'
import { NativeMenuRegistry, type NativeMenuContext, type NativeMenuEntry } from './menu'
import { isNativeIdentifier } from './protocol'

/** 业务键仅用于本地稳定映射；路径、账号及服务配置不作为桥接项目标识。 */
export type NativeMenuKey = string | number

/** 动作标识跟随业务语义，排序或增删不会把旧选择套到另一个位置。 */
export type NativeStandaloneAction = (key: NativeMenuKey, action: NativeCardAction) => NativeMenuEntry

/** 独立菜单显式读取原列表及回调；未协商的 Web、PWA 和旧 App 不读取声明。 */
export interface NativeStandaloneMenuBinding {
  key: NativeMenuKey
  title?: string
  available?(): boolean
  items(action: NativeStandaloneAction): NativeMenuEntry[]
}

/** 每个 VMenu 实例独立持有代次与动作映射，不能通过菜单文案猜测来源。 */
interface StandaloneRegistration {
  binding: NativeStandaloneMenuBinding
  key: NativeMenuKey
  ownerId: string
  ids: Map<string, string>
  unregister?: () => void
}

let ownerSequence = 0
let actionSequence = 0

/** 空业务键不登记；有限数值允许沿用原页面枚举。 */
function validKey(key: unknown): key is NativeMenuKey {
  return typeof key === 'string' ? key.trim().length > 0 : typeof key === 'number' && Number.isFinite(key)
}

/** 默认关闭的独立菜单来源；本层不拦截点击、不隐藏菜单，也不创建任何原生展示。 */
export class NativeStandaloneMenuRegistry {
  readonly menus = new NativeMenuRegistry()
  private readonly sources = new Map<object, StandaloneRegistration>()
  private context?: NativeMenuContext

  /** 更新同一个菜单实例；业务范围更换时先注销旧回调及动作映射。 */
  bind(token: object, binding: NativeStandaloneMenuBinding | undefined) {
    let source = this.sources.get(token)
    if (!binding || !validKey(binding.key)) {
      this.unbind(token)
      return
    }
    if (source && source.key !== binding.key) {
      this.unbind(token)
      source = undefined
    }
    if (source) source.binding = binding
    else {
      source = { binding, key: binding.key, ownerId: `standalone-${++ownerSequence}`, ids: new Map() }
      this.sources.set(token, source)
    }
    this.register(token, source)
  }

  /** 组件卸载即撤销该代次，不让迟到注销影响相同页面的新实例。 */
  unbind(token: object) {
    this.sources.get(token)?.unregister?.()
    this.sources.delete(token)
  }

  /** 文档、身份、路由或前后台变化清除选择票据，宿主须在新 DOM 就绪后重新同步。 */
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
    this.menus.setContext(next)
    for (const source of this.sources.values()) {
      source.unregister?.()
      source.unregister = undefined
      source.ids.clear()
    }
  }

  /** 只有显式同步才为当前页面登记来源；关闭状态不读取或保存执行菜单。 */
  synchronize() {
    for (const [token, source] of this.sources) this.register(token, source)
  }

  /** 完整性预检不创建展示票据，未来接管层只能使用当前真实菜单实例的标识。 */
  targetFor(token: object): { ownerId: string; menuId: string } | undefined {
    const source = this.sources.get(token)
    if (source && this.menus.canPresent(source.ownerId, 'operations'))
      return { ownerId: source.ownerId, menuId: 'operations' }
  }

  /** 读取最新绑定；同业务范围刷新保持注册代次，执行前仍由共享注册表复核完整声明。 */
  private register(token: object, source: StandaloneRegistration) {
    if (!this.context || source.unregister) return
    source.unregister = this.menus.register({
      ownerId: source.ownerId,
      menuId: 'operations',
      kind: 'standalone',
      get title() {
        return source.binding.title
      },
      available: () => this.sources.get(token) === source && source.binding.available?.() !== false,
      items: () => this.items(source),
    })
  }

  /** 原业务键映射为短 ID；删除项目释放本地键，重加项目也不会复用过期选择标识。 */
  private items(source: StandaloneRegistration): NativeMenuEntry[] {
    const seen = new Set<string>()
    try {
      return source.binding.items((key, action) => {
        if (!validKey(key)) throw new Error('invalid_standalone_action_key')
        const localKey = JSON.stringify([typeof key, key])
        seen.add(localKey)
        if (seen.size > 96) throw new Error('too_many_standalone_actions')
        let id = source.ids.get(localKey)
        if (!id) {
          id = `item-${++actionSequence}`
          source.ids.set(localKey, id)
        }
        return nativeCardAction(id, action)
      })
    } finally {
      for (const key of source.ids.keys()) if (!seen.has(key)) source.ids.delete(key)
    }
  }
}

/** 直到后续可选原生通道确认范围才启用，普通网页保留原有 VMenu 行为。 */
export const nativeStandaloneMenus = new NativeStandaloneMenuRegistry()
