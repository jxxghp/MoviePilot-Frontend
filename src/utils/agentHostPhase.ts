import type { AgentHostPhase } from '@/types/agentHost'
import type { AgentHostCore } from './agentHost'

/** AgentAssistantPanel 从流事件中提取的阶段信号。 */
export type AgentStreamPhaseEvent =
  /** 工具生命周期；无 tool_id 的旧式工具事件只有 running，由下一个工具或终止事件隐式结束。 */
  | { type: 'tool'; id: string; name: string | null; status: 'running' | 'done' | 'error' }
  /** 收到需要用户选择或确认的卡片。 */
  | { type: 'choice' }
  | { type: 'done' }
  | { type: 'error'; message?: string }

interface ActiveTool {
  id: string
  name: string | null
}

/**
 * 把面板的 thinking 变化和流阶段信号归纳成宿主 phase，并广播 `agent.*` 阶段事件。
 *
 * 归纳规则：thinking 开始进入 thinking；工具运行中为 tool，工具结束回到 thinking；
 * 收到选择卡片为 awaiting，本轮后续 done 不覆盖 awaiting；done/error 为终态，直到下一轮 thinking 开始。
 */
export function createAgentPhaseTracker(host: AgentHostCore) {
  let thinking = false
  let awaiting = false
  let activeTool: ActiveTool | null = null

  function setPhase(phase: AgentHostPhase, toolName: string | null = null) {
    host.setState({ phase, toolName })
  }

  function endActiveTool() {
    if (!activeTool) return
    const tool = activeTool
    activeTool = null
    host.emitHostEvent('agent.tool.end', { name: tool.name })
  }

  /** 面板 busy 状态变化。 */
  function handleThinkingChange(value: boolean) {
    if (value === thinking) return
    thinking = value
    host.setState({ thinking: value })

    if (value) {
      awaiting = false
      host.emitHostEvent('agent.thinking.start')
      setPhase('thinking')
      return
    }

    endActiveTool()
    host.emitHostEvent('agent.thinking.end')
    const phase = host.getState().phase
    // 没有收到终止事件就结束（例如取消或断流放弃）时回到 idle，保留 awaiting/done/error 终态。
    if (phase === 'thinking' || phase === 'tool') setPhase(awaiting ? 'awaiting' : 'idle')
  }

  /** 面板流阶段信号。 */
  function handleStreamPhase(event: AgentStreamPhaseEvent) {
    switch (event.type) {
      case 'tool': {
        if (event.status === 'running') {
          if (activeTool && (!event.id || activeTool.id !== event.id)) endActiveTool()
          if (activeTool) return
          activeTool = { id: event.id, name: event.name }
          host.emitHostEvent('agent.tool.start', { name: event.name })
          setPhase('tool', event.name)
          return
        }
        if (activeTool && (!event.id || activeTool.id === event.id)) {
          endActiveTool()
          setPhase(thinking ? 'thinking' : 'idle')
        }
        return
      }
      case 'choice':
        endActiveTool()
        awaiting = true
        host.emitHostEvent('agent.awaiting')
        setPhase('awaiting')
        return
      case 'done':
        endActiveTool()
        host.emitHostEvent('agent.done', {})
        setPhase(awaiting ? 'awaiting' : 'done')
        return
      case 'error':
        endActiveTool()
        awaiting = false
        host.emitHostEvent('agent.error', event.message ? { message: event.message } : {})
        setPhase('error')
        return
      default:
        return
    }
  }

  /** Widget 卸载时清理内部状态。 */
  function reset() {
    thinking = false
    awaiting = false
    activeTool = null
  }

  return { handleStreamPhase, handleThinkingChange, reset }
}
