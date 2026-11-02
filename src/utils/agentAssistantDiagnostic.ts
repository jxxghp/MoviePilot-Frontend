const AGENT_ASSISTANT_DIAGNOSTIC_EVENT = 'agentAssistantDiagnostic'

export interface AgentAssistantDiagnosticRequest {
  /** 发给只读诊断会话的分析提示词。 */
  prompt: string
}

/**
 * 日志页与智能助手面板没有父子关系，通过全局事件发起只读诊断请求。
 * 面板只在空闲时发送，避免运行中的补充输入被后端并入可写会话。
 */
export function requestAgentAssistantDiagnostic(prompt: string) {
  if (typeof window === 'undefined') return

  const detail: AgentAssistantDiagnosticRequest = { prompt }
  window.dispatchEvent(new CustomEvent<AgentAssistantDiagnosticRequest>(AGENT_ASSISTANT_DIAGNOSTIC_EVENT, { detail }))
}

export function onAgentAssistantDiagnostic(callback: (request: AgentAssistantDiagnosticRequest) => void) {
  if (typeof window === 'undefined') return () => {}

  const handler = (event: Event) => {
    callback((event as CustomEvent<AgentAssistantDiagnosticRequest>).detail)
  }

  window.addEventListener(AGENT_ASSISTANT_DIAGNOSTIC_EVENT, handler)

  return () => {
    window.removeEventListener(AGENT_ASSISTANT_DIAGNOSTIC_EVENT, handler)
  }
}
