/**
 * Agent 助手形象扩展契约 v1。
 *
 * 插件可以通过联邦暴露 `AgentPet` 组件接管助手的外观与动作，宿主保留 Agent 面板、会话、
 * 模型、工具调用、权限、挂载生命周期和回退。所有联邦宿主都会以 `moviepilot:agent` 注入
 * 按插件实例绑定的 {@link MoviePilotAgentHost}，形象组件额外以 `agent` prop 收到同一对象。
 */

/** 视口中的矩形，坐标相对视口左上角，单位为 CSS 像素。 */
export interface AgentHostRect {
  x: number
  y: number
  width: number
  height: number
}

/** 宿主归纳出的会话阶段。 */
export type AgentHostPhase = 'idle' | 'thinking' | 'tool' | 'awaiting' | 'done' | 'error'

/** 宿主对外公布的 Agent 状态快照，每次变化都会生成新对象。 */
export interface AgentHostState {
  /** Agent 是否启用且入口已挂载；为 false 时 open 为空操作。 */
  available: boolean
  /** 原生 Agent 面板是否打开。 */
  panelOpen: boolean
  /** 会话是否正在处理（流式输出、工具执行或断流恢复）。 */
  thinking: boolean
  /** 会话阶段，由面板流事件归纳。 */
  phase: AgentHostPhase
  /** phase 为 tool 时的工具名，可能为空。 */
  toolName: string | null
  /** 页面当前是否可见。 */
  pageVisible: boolean
  /** 宿主动画开关（页面活动、隐藏标签页）与系统减少动态效果合并后的结论。 */
  motionAllowed: boolean
  /** 系统是否要求减少动态效果。 */
  reducedMotion: boolean
  /** 当前主题明暗。 */
  theme: 'light' | 'dark'
  /** 是否处于移动端窄屏布局。 */
  isMobile: boolean
  /** 视口尺寸、软键盘遮挡高度和安全区内边距。 */
  viewport: {
    width: number
    height: number
    keyboardInset: number
    safeArea: { top: number; right: number; bottom: number; left: number }
  }
  /** 面板打开时占据的视口矩形，关闭时为 null。 */
  panelRect: AgentHostRect | null
}

/** 宿主事件总线上传递的事件。 */
export interface AgentHostEvent {
  /** 事件名，宿主事件以 `agent.` 开头，插件自定义事件不得使用该前缀。 */
  name: string
  /** `host` 表示宿主发出，否则为发出事件的插件实例 ID。 */
  source: string
  /** 事件数据，缺省为空对象。 */
  data: Record<string, unknown>
  /** 事件产生时间戳（毫秒）。 */
  at: number
}

/** 打开 Agent 面板的选项。 */
export interface AgentHostOpenOptions {
  /** 只填入输入框的草稿，绝不自动发送。 */
  draft?: string
}

/** 联邦组件可用的 Agent 宿主能力，已按插件实例绑定来源。 */
export interface MoviePilotAgentHost {
  /** 契约版本。 */
  version: 1
  /** 读取当前状态快照。 */
  getState(): AgentHostState
  /** 立即以当前快照回调一次，之后每次变化回调。返回取消函数。 */
  subscribe(listener: (state: AgentHostState) => void): () => void
  /** 打开原生面板，重复调用保持打开。draft 只填入输入框，不发送。 */
  open(options?: AgentHostOpenOptions): void
  /** 关闭原生面板。 */
  close(): void
  /** 订阅事件，返回取消函数。 */
  on(event: string, handler: (payload: AgentHostEvent) => void): () => void
  /** 广播自定义事件给形象。名称不得以 `agent.` 开头，宿主自动附 source=pluginId。不能借此打开或操作会话。 */
  emit(name: string, data?: Record<string, unknown>): void
}

/** 形象模式：stage 由插件拥有角色和整个视口图层，renderer 由宿主负责入口行为、插件只画。 */
export type AgentPetMode = 'stage' | 'renderer'

/** stage 模式的气泡归属：host 由宿主在插件上报的锚点旁画原生气泡，self 由插件自己画。 */
export type AgentPetBubbles = 'host' | 'self'

/** 后端 `GET plugin/agent_pets` 返回的单个形象声明。 */
export interface AgentPetDeclaration {
  /** 插件实例 ID，分身沿用实例 ID。 */
  plugin_id: string
  /** 提供联邦资源的源插件 ID。 */
  source_plugin_id: string
  /** 插件展示名。 */
  plugin_name: string
  /** 插件内唯一的形象 key。 */
  key: string
  /** 形象展示名。 */
  name: string
  /** 一句话说明。 */
  description?: string | null
  /** 形象模式。 */
  mode: AgentPetMode
  /** 联邦暴露名，例如 `AgentPet` 对应 `./AgentPet`。 */
  component: string
  /** 契约版本，宿主只识别 1。 */
  api_version: number
  /** 可直接访问的预览图 URL。 */
  preview_url?: string | null
  /** 可直接访问的方形头像 URL，面板头部、空状态和消息头像优先使用。 */
  avatar_url?: string | null
  /** 插件联邦入口地址，规则与 `plugin/remotes` 的 url 一致；有值时宿主直接注册，不再单独发现。 */
  remote_url?: string | null
  /** 插件版本，用于判断声明是否随插件升级真正更新，可能为空。 */
  plugin_version?: string | null
  /** stage 模式的气泡归属。 */
  bubbles?: AgentPetBubbles | null
  /** renderer 模式下宿主随机动作的可选池。 */
  random_actions?: string[] | null
}

/** 用户保存在 `user/config/AgentPet` 的选择：具体形象、明确内置或 null 跟随默认。 */
export type AgentPetSelection = { plugin_id: string; key: string } | 'builtin' | null

/** 形象组件收到的上下文。 */
export interface AgentPetContext {
  /** 当前模式。 */
  mode: AgentPetMode
  /** 当前形象 key。 */
  key: string
  /** stage 模式且 bubbles=host 时，插件上报角色在视口中的矩形，宿主把原生气泡画在旁边；null 隐藏宿主气泡。 */
  setBubbleAnchor(rect: AgentHostRect | null): void
  /** stage 模式的点击开面板之外，插件可声明当前是否在被拖拽，宿主据此不弹预览。 */
  setInteracting(value: boolean): void
  /** 每用户每形象的小块持久数据，序列化后不超过 16KB。 */
  storage: {
    get<T = unknown>(): Promise<T | null>
    set(value: unknown): Promise<void>
  }
}
