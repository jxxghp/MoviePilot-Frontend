import type { SystemNotification } from '@/api/types'

const AGENT_ASSISTANT_BUBBLE_EVENT = 'agentAssistantBubble'

export interface AgentAssistantNotificationBubblePayload {
  id: string
  title?: string
  text?: string
  type?: string
  mtype?: string
  source?: string
  date?: string
  reg_time?: string
}

interface AgentAssistantBubbleEvent extends CustomEvent<AgentAssistantNotificationBubblePayload> {}

function createNotificationBubbleId(notification: SystemNotification) {
  if (notification.id) return `notification-${notification.id}`

  return `notification-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// 通知中心和智能助手入口没有父子关系，通过全局事件传递实时通知气泡数据。
export function emitAgentAssistantNotificationBubble(notification: SystemNotification) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(
    new CustomEvent<AgentAssistantNotificationBubblePayload>(AGENT_ASSISTANT_BUBBLE_EVENT, {
      detail: {
        id: createNotificationBubbleId(notification),
        title: notification.title,
        text: notification.text,
        type: notification.type,
        mtype: notification.mtype,
        source: notification.source,
        date: notification.date,
        reg_time: notification.reg_time,
      },
    }),
  )
}

export function onAgentAssistantNotificationBubble(
  callback: (payload: AgentAssistantNotificationBubblePayload) => void,
) {
  if (typeof window === 'undefined') return () => {}

  const handler = (event: Event) => {
    callback((event as AgentAssistantBubbleEvent).detail)
  }

  window.addEventListener(AGENT_ASSISTANT_BUBBLE_EVENT, handler)

  return () => window.removeEventListener(AGENT_ASSISTANT_BUBBLE_EVENT, handler)
}
