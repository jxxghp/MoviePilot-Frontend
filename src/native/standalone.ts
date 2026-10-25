import { nativeCardAction, type NativeCardAction } from './card'
import { NativeMenuRegistry, type NativeMenuContext, type NativeMenuEntry } from './menu'
import { isNativeIdentifier } from './protocol'
import { shallowRef } from 'vue'

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
  activator?: () => HTMLElement | undefined
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
  readonly revision = shallowRef(0)
  private readonly sources = new Map<object, StandaloneRegistration>()
  private readonly listeners = new Set<() => void>()
  private context?: NativeMenuContext

  /** 更新同一个菜单实例；业务范围更换时先注销旧回调及动作映射。 */
  bind(token: object, binding: NativeStandaloneMenuBinding | undefined, activator?: () => HTMLElement | undefined) {
    let source = this.sources.get(token)
    if (!binding || !validKey(binding.key)) {
      this.unbind(token)
      return
    }
    const element = activator ?? source?.activator
    if (source && source.key !== binding.key) {
      this.unbind(token)
      source = undefined
    }
    if (source) {
      source.binding = binding
      source.activator = element
    } else {
      source = {
        binding,
        key: binding.key,
        ownerId: `standalone-${++ownerSequence}`,
        ids: new Map(),
        activator: element,
      }
      this.sources.set(token, source)
    }
    this.register(token, source)
    this.changed()
  }

  /** 组件卸载即撤销该代次，不让迟到注销影响相同页面的新实例。 */
  unbind(token: object) {
    this.sources.get(token)?.unregister?.()
    this.sources.delete(token)
    this.changed()
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
    this.revision.value += 1
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

  /** Vue 只在当前原生范围追踪原列表依赖，原菜单状态变化后通知展示层复核。 */
  track(token: object) {
    if (!this.context) return
    const source = this.sources.get(token)
    if (source) {
      this.register(token, source)
      this.menus.canPresent(source.ownerId, 'operations')
    }
    this.changed()
  }

  /** 展示层只在启用期间订阅变化，释放时不遗留全局刷新任务。 */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 只沿真实点击的祖先查找显式激活器，不猜测 DOM 文案或按钮位置。 */
  targetForElement(element: Element | null) {
    for (let node = element; node; node = node.parentElement)
      for (const [token, source] of this.sources)
        if (source.activator?.() === node) {
          const target = this.targetFor(token)
          if (target) return target
        }
  }

  /** 选择前读取当前实例的激活器，组件复用或 KeepAlive 离场不能执行旧动作。 */
  elementFor(ownerId: string): HTMLElement | undefined {
    for (const source of this.sources.values()) if (source.ownerId === ownerId) return source.activator?.()
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
      available: () => this.available(token, source),
      items: () => this.items(source),
    })
  }

  /** 隐藏、离场、禁用、被 inert 封闭或离开视口的按钮都不是当前可执行来源。 */
  private available(token: object, source: StandaloneRegistration) {
    const element = source.activator?.()
    if (!element?.isConnected || this.sources.get(token) !== source || source.binding.available?.() === false)
      return false
    if (element.closest('[inert], [hidden], [disabled], [aria-disabled="true"]')) return false
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (
        ['none'].includes(style.display) ||
        ['hidden', 'collapse'].includes(style.visibility) ||
        style.opacity === '0'
      )
        return false
    }
    const rect = element.getBoundingClientRect()
    return (
      [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < innerWidth &&
      rect.top < innerHeight
    )
  }

  /** 只通知当前启用的接管者，不在普通网页读取菜单项目。 */
  private changed() {
    if (this.context) for (const listener of this.listeners) listener()
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
