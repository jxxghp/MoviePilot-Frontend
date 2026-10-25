import type { ObjectDirective } from 'vue'
import { NativeMenuRegistry, type NativeMenuContext, type NativeMenuEntry } from './menu'
import { isNativeIdentifier, type NativeMenuColor } from './protocol'

/** 读取现有菜单的语义颜色及原回调；未知颜色交由完整性校验拒绝，不悄悄替换样式。 */
export interface NativeCardAction extends Omit<NativeMenuEntry, 'id' | 'kind' | 'color' | 'invoke' | 'items'> {
  color?: string
  /** 调用原动作并等待其既有异步行为，不复制 API 或业务状态。 */
  invoke(): unknown
}

/** 业务枚举生成稳定动作标识；空色沿用系统默认，危险色由共享契约统一处理。 */
export function nativeCardAction(id: string | number, action: NativeCardAction): NativeMenuEntry {
  const { color, invoke, ...state } = action
  return {
    ...state,
    id: `action-${id}`,
    kind: 'action',
    ...(color ? { color: color as NativeMenuColor } : {}),
    invoke: async () => {
      await invoke()
    },
  }
}

/** 显式绑定业务卡片根；实体 key 只留在本地，不用 DOM 位置或菜单文案识别业务对象。 */
export interface NativeCardMenuBinding {
  key: string | number | undefined
  title?: string
  /** 排序、批量模式或权限不允许操作时，保留原入口并撤销旧选择。 */
  available?(): boolean
  /** 每次投影读取原菜单的名称、图标、顺序、状态和业务回调。 */
  items(): NativeMenuEntry[]
}

/** 位置始终来自当前卡片，不缓存滚动、响应式布局或虚拟列表复用前的矩形。 */
export interface NativeCardMenuTarget {
  ownerId: string
  menuId: string
  rect: { x: number; y: number; width: number; height: number }
}

/** 注册代次跟随元素及业务实体；普通进度更新只替换声明，不打断同一张卡片的菜单。 */
interface CardRegistration {
  binding: NativeCardMenuBinding | undefined
  key: NativeCardMenuBinding['key']
  ownerId: string
  unregister?: () => void
}

let cardSequence = 0

/** 空标识不接管入口；文件路径等业务 key 不跨桥，也不受传输标识格式限制。 */
function validKey(key: NativeCardMenuBinding['key']) {
  return typeof key === 'string' ? key.trim().length > 0 : typeof key === 'number' && Number.isFinite(key)
}

/** 仅显式标记的卡片参与后续原生接管；默认不读菜单、不加 DOM 样式、监听器或手势。 */
export class NativeCardMenuRegistry {
  readonly menus = new NativeMenuRegistry()
  private readonly cards = new Map<HTMLElement, CardRegistration>()
  private context?: NativeMenuContext

  /** 挂载或更新同一元素；实体更换先注销旧菜单，避免虚拟列表的旧回调作用于新卡片。 */
  bind(element: HTMLElement, binding: NativeCardMenuBinding | undefined) {
    let card = this.cards.get(element)
    if (card && card.key !== binding?.key) {
      card.unregister?.()
      this.cards.delete(element)
      card = undefined
    }
    if (card) {
      card.binding = binding
    } else {
      card = { binding, key: binding?.key, ownerId: `card-${++cardSequence}` }
      this.cards.set(element, card)
    }
    this.register(element, card)
  }

  /** 卸载立即撤销该代次；注销后不保留元素、业务对象或回调。 */
  unbind(element: HTMLElement) {
    this.cards.get(element)?.unregister?.()
    this.cards.delete(element)
  }

  /** 文档、路由、前后台或协商范围变化先清空来源，不自动把旧页面卡片带入新上下文。 */
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
    for (const card of this.cards.values()) {
      card.unregister?.()
      card.unregister = undefined
    }
  }

  /** 宿主须在新页面 DOM 提交后显式同步；已登记的同实体刷新不替换其注册代次。 */
  synchronize() {
    for (const [element, card] of this.cards) this.register(element, card)
  }

  /** 只返回完整且当前可见的菜单位置；不隐藏按钮，也不创建展示票据。 */
  targets(): NativeCardMenuTarget[] {
    const targets: NativeCardMenuTarget[] = []
    for (const [element, card] of this.cards) {
      if (!this.menus.canPresent(card.ownerId, 'operations')) continue
      const { x, y, width, height } = element.getBoundingClientRect()
      targets.push({ ownerId: card.ownerId, menuId: 'operations', rect: { x, y, width, height } })
    }
    return targets
  }

  /** 触摸只沿实际 DOM 祖先寻找显式来源，不通过卡片下标或文案推断业务对象。 */
  targetFor(element: Element | null): NativeCardMenuTarget | undefined {
    for (let node = element; node; node = node.parentElement) {
      const card = this.cards.get(node as HTMLElement)
      if (!card || !this.menus.canPresent(card.ownerId, 'operations')) continue
      const { x, y, width, height } = node.getBoundingClientRect()
      return { ownerId: card.ownerId, menuId: 'operations', rect: { x, y, width, height } }
    }
  }

  /** 仅返回仍属当前注册代次的根，供接管层维护局部样式及无障碍入口。 */
  elementFor(ownerId: string): HTMLElement | undefined {
    for (const [element, card] of this.cards) if (card.ownerId === ownerId) return element
  }

  /** 无障碍入口关联原卡片名称，避免同页多个“操作菜单”无法区分来源。 */
  titleFor(ownerId: string): string | undefined {
    for (const card of this.cards.values()) if (card.ownerId === ownerId) return card.binding?.title
  }

  /** 来源 getter 始终读取最新绑定；无协商时 register 不保留回调，且不读取生产者。 */
  private register(element: HTMLElement, card: CardRegistration) {
    if (card.unregister || !validKey(card.key)) return
    // 默认关闭时返回的注销器无状态；不能标记成已登记，后续协商同步才真正注册。
    if (!this.context) return
    card.unregister = this.menus.register({
      ownerId: card.ownerId,
      menuId: 'operations',
      kind: 'card',
      get title() {
        return card.binding?.title
      },
      available: () => this.available(element, card),
      items: () => card.binding?.items() ?? [],
    })
  }

  /** 只信任实际连接且显示在当前视口内的卡片；未挂载、隐藏或禁用的来源不可执行。 */
  private available(element: HTMLElement, card: CardRegistration) {
    if (!element.isConnected || !card.binding || this.cards.get(element) !== card) return false
    if (card.binding.available?.() === false) return false
    if (element.closest('[inert], [hidden]')) return false
    for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor)
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.visibility === 'collapse' ||
        style.opacity === '0'
      )
        return false
    }
    const rect = element.getBoundingClientRect()
    return (
      [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < innerHeight &&
      rect.left < innerWidth
    )
  }
}

/** 由可选宿主通道启用；Web、PWA 与旧 App 只保留原菜单交互。 */
export const nativeCardMenus = new NativeCardMenuRegistry()

/** 局部指令绑定卡片根，不通过最近 VCard 或惰性菜单 DOM 推断动作。 */
export const vNativeCardMenu: ObjectDirective<HTMLElement, NativeCardMenuBinding | undefined> = {
  mounted: (element, binding) => nativeCardMenus.bind(element, binding.value),
  updated: (element, binding) => nativeCardMenus.bind(element, binding.value),
  unmounted: element => nativeCardMenus.unbind(element),
}
