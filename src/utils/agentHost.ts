import type { AgentHostEvent, AgentHostOpenOptions, AgentHostState, MoviePilotAgentHost } from '@/types/agentHost'

/** 宿主事件的保留前缀，插件自定义事件不得使用。 */
export const AGENT_HOST_EVENT_PREFIX = 'agent.'

/** 宿主自身发出事件时使用的来源标记。 */
export const AGENT_HOST_SOURCE = 'host'

/** Agent 面板控制器，由挂载中的 AgentAssistantWidget 绑定；未绑定时 open/close 为空操作。 */
export interface AgentHostController {
  open(options?: AgentHostOpenOptions): void
  close(): void
}

/** 按插件实例绑定的宿主视图，额外提供清理该实例全部订阅的能力。 */
export interface ScopedAgentHost extends MoviePilotAgentHost {
  /** 取消该视图注册的全部状态订阅和事件监听。 */
  dispose(): void
}

type StateListener = (state: AgentHostState) => void
type EventHandler = (payload: AgentHostEvent) => void

/** 生成 Agent 不可用时的默认快照，视口信息取自当前窗口。 */
function createDefaultState(): AgentHostState {
  const width = typeof window === 'undefined' ? 0 : window.innerWidth
  const height = typeof window === 'undefined' ? 0 : window.innerHeight

  return {
    available: false,
    panelOpen: false,
    thinking: false,
    phase: 'idle',
    toolName: null,
    pageVisible: typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
    motionAllowed: true,
    reducedMotion: false,
    theme: 'light',
    isMobile: width > 0 && width <= 600,
    viewport: { width, height, keyboardInset: 0, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
    panelRect: null,
  }
}

/** 浅比较两个快照字段，避免无变化时重复通知订阅者。 */
function isSameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const keys = Object.keys(leftRecord)
  if (keys.length !== Object.keys(rightRecord).length) return false

  return keys.every(key => isSameValue(leftRecord[key], rightRecord[key]))
}

/**
 * Agent 宿主核心：持有唯一状态快照和唯一事件总线。
 *
 * 所有联邦宿主（Page、Config、Dashboard、AppPage）和形象组件拿到的 scoped 视图都共享这一条总线，
 * 因此插件设置页 emit 的自定义事件可被同插件或其他插件的形象 on 收到，用于设置的实时预览。
 */
export class AgentHostCore {
  private state: AgentHostState = createDefaultState()
  private readonly stateListeners = new Set<StateListener>()
  private readonly eventHandlers = new Map<string, Set<EventHandler>>()
  private controller: AgentHostController | null = null

  /** 读取当前快照。 */
  getState(): AgentHostState {
    return this.state
  }

  /** 合并部分状态；只有字段真正变化时才生成新快照并通知订阅者。 */
  setState(patch: Partial<AgentHostState>) {
    const changed = (Object.keys(patch) as Array<keyof AgentHostState>).some(
      key => !isSameValue(this.state[key], patch[key]),
    )
    if (!changed) return

    this.state = { ...this.state, ...patch }
    const snapshot = this.state
    this.stateListeners.forEach(listener => this.safeCall(() => listener(snapshot)))
  }

  /** 恢复为 Agent 不可用的默认快照，Widget 卸载时调用。 */
  resetState() {
    this.setState({ ...createDefaultState() })
  }

  /** 注册状态订阅，立即回调一次当前快照。 */
  subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener)
    this.safeCall(() => listener(this.state))
    return () => {
      this.stateListeners.delete(listener)
    }
  }

  /** 注册事件监听。 */
  on(event: string, handler: EventHandler): () => void {
    let handlers = this.eventHandlers.get(event)
    if (!handlers) {
      handlers = new Set()
      this.eventHandlers.set(event, handlers)
    }
    handlers.add(handler)
    return () => {
      const current = this.eventHandlers.get(event)
      current?.delete(handler)
      if (current && current.size === 0) this.eventHandlers.delete(event)
    }
  }

  /** 向总线派发事件；名称前缀校验由调用方负责。 */
  dispatch(name: string, source: string, data: Record<string, unknown> = {}) {
    const handlers = this.eventHandlers.get(name)
    if (!handlers?.size) return

    const payload: AgentHostEvent = { name, source, data, at: Date.now() }
    ;[...handlers].forEach(handler => this.safeCall(() => handler(payload)))
  }

  /** 宿主发出 `agent.*` 事件。 */
  emitHostEvent(name: string, data: Record<string, unknown> = {}) {
    this.dispatch(name, AGENT_HOST_SOURCE, data)
  }

  /** 绑定面板控制器，返回解绑函数；解绑只在控制器仍是自己时生效。 */
  bindController(controller: AgentHostController): () => void {
    this.controller = controller
    return () => {
      if (this.controller === controller) this.controller = null
    }
  }

  /** 打开面板；Agent 不可用时为空操作。 */
  open(options?: AgentHostOpenOptions) {
    if (!this.state.available) return
    this.controller?.open(options)
  }

  /** 关闭面板。 */
  close() {
    this.controller?.close()
  }

  /**
   * 创建按插件实例绑定的视图。
   * @param resolveSource 返回发出事件的插件实例 ID；用 getter 以便宿主在异步取得身份后仍能正确标记来源。
   */
  createScoped(resolveSource: () => string): ScopedAgentHost {
    const disposers = new Set<() => void>()
    const track = (dispose: () => void) => {
      let disposed = false
      const wrapped = () => {
        if (disposed) return
        disposed = true
        disposers.delete(wrapped)
        dispose()
      }
      disposers.add(wrapped)
      return wrapped
    }

    return {
      version: 1,
      getState: () => this.getState(),
      subscribe: listener => track(this.subscribe(listener)),
      open: options => this.open(options),
      close: () => this.close(),
      on: (event, handler) => track(this.on(event, handler)),
      emit: (name, data) => {
        if (typeof name !== 'string' || !name || name.startsWith(AGENT_HOST_EVENT_PREFIX)) {
          console.warn(`[agent] 插件事件名不能为空或以 "${AGENT_HOST_EVENT_PREFIX}" 开头: ${String(name)}`)
          return
        }
        const source = resolveSource() || 'unknown'
        this.dispatch(name, source, data && typeof data === 'object' ? { ...data } : {})
      },
      dispose: () => {
        ;[...disposers].forEach(dispose => dispose())
      },
    }
  }

  /** 插件回调抛错不能影响其他订阅者或宿主流程。 */
  private safeCall(callback: () => void) {
    try {
      callback()
    } catch (error) {
      console.error('[agent] 插件回调执行失败', error)
    }
  }
}

/** 页面会话内唯一的 Agent 宿主核心。 */
export const agentHost = new AgentHostCore()
