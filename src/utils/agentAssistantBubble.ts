import type { SystemNotification } from '@/api/types'

const AGENT_ASSISTANT_BUBBLE_EVENT = 'agentAssistantBubble'
let agentAssistantBubbleListenerCount = 0
let agentAssistantBubbleEntryActive = false

export type AgentAssistantBubbleKind = 'assistant' | 'custom' | 'notification' | 'toast'
export type AgentAssistantBubbleVariant = 'default' | 'info' | 'success' | 'warning' | 'error'

export interface AgentAssistantBubblePayload {
  id: string
  kind?: AgentAssistantBubbleKind
  variant?: AgentAssistantBubbleVariant
  title?: string
  text?: string
  duration?: number
  keepOpen?: boolean
  type?: string
  mtype?: string
  source?: string
  date?: string
  reg_time?: string
}

export interface AgentAssistantNotificationBubblePayload extends AgentAssistantBubblePayload {
  kind?: 'notification'
}

export interface AgentAssistantToastBubblePayload extends AgentAssistantBubblePayload {
  kind: 'toast'
  variant: AgentAssistantBubbleVariant
}

interface AgentAssistantBubbleEvent extends CustomEvent<AgentAssistantBubblePayload> {}

function createNotificationBubbleId(notification: SystemNotification) {
  if (notification.id) return `notification-${notification.id}`

  return `notification-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function emitAgentAssistantBubble(payload: AgentAssistantBubblePayload) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(
    new CustomEvent<AgentAssistantBubblePayload>(AGENT_ASSISTANT_BUBBLE_EVENT, {
      detail: payload,
    }),
  )
}

// 通知中心、toast 和智能助手入口没有父子关系，通过全局事件传递实时气泡数据。
export function emitAgentAssistantNotificationBubble(notification: SystemNotification) {
  emitAgentAssistantBubble({
    id: createNotificationBubbleId(notification),
    kind: 'notification',
    title: notification.title,
    text: notification.text,
    type: notification.type,
    mtype: notification.mtype,
    source: notification.source,
    date: notification.date,
    reg_time: notification.reg_time,
  })
}

export function emitAgentAssistantToastBubble(payload: AgentAssistantToastBubblePayload) {
  emitAgentAssistantBubble(payload)
}

export function setAgentAssistantBubbleEntryActive(active: boolean) {
  agentAssistantBubbleEntryActive = active
}

export function canUseAgentAssistantBubble() {
  return agentAssistantBubbleEntryActive && agentAssistantBubbleListenerCount > 0
}

export function onAgentAssistantBubble(callback: (payload: AgentAssistantBubblePayload) => void) {
  if (typeof window === 'undefined') return () => {}

  const handler = (event: Event) => {
    callback((event as AgentAssistantBubbleEvent).detail)
  }

  window.addEventListener(AGENT_ASSISTANT_BUBBLE_EVENT, handler)
  agentAssistantBubbleListenerCount += 1

  return () => {
    window.removeEventListener(AGENT_ASSISTANT_BUBBLE_EVENT, handler)
    agentAssistantBubbleListenerCount = Math.max(0, agentAssistantBubbleListenerCount - 1)
  }
}

export function onAgentAssistantNotificationBubble(
  callback: (payload: AgentAssistantNotificationBubblePayload) => void,
) {
  return onAgentAssistantBubble(payload => {
    if ((payload.kind || 'notification') === 'notification') callback(payload as AgentAssistantNotificationBubblePayload)
  })
}
