import type { AgentPetActionDefinition, AgentPetActionName } from './types'

export const AGENT_PET_RANDOM_ACTION_MIN_DELAY = 8000
export const AGENT_PET_RANDOM_ACTION_MAX_DELAY = 18000

export const AGENT_PET_RANDOM_ACTIONS = [
  'wave',
  'sit',
  'eye-roll',
  'faint',
  'disassemble',
  'happy-jump',
  'sleep',
  'stretch',
  'peek',
  'scan',
  'charge',
  'spin-cheer',
  'shy',
  'confused',
] as const

export const AGENT_PET_ACTIONS: Record<AgentPetActionName, AgentPetActionDefinition> = {
  wave: {
    name: 'wave',
    intent: 'reaction',
    clip: 'agent-fab-action-wave',
    duration: 2450,
    priority: 1,
    interruptible: true,
  },
  sit: {
    name: 'sit',
    intent: 'idle',
    clip: 'agent-fab-action-sit',
    duration: 4200,
    priority: 1,
    interruptible: true,
  },
  'eye-roll': {
    name: 'eye-roll',
    intent: 'reaction',
    clip: 'agent-fab-action-eye-roll',
    duration: 1900,
    priority: 1,
    interruptible: true,
  },
  faint: {
    name: 'faint',
    intent: 'reaction',
    clip: 'agent-fab-action-faint',
    duration: 4800,
    priority: 1,
    interruptible: true,
  },
  disassemble: {
    name: 'disassemble',
    intent: 'reaction',
    clip: 'agent-fab-action-disassemble',
    duration: 6200,
    priority: 1,
    interruptible: true,
  },
  'happy-jump': {
    name: 'happy-jump',
    intent: 'success',
    clip: 'agent-fab-action-happy-jump',
    duration: 5200,
    priority: 1,
    interruptible: true,
  },
  sleep: {
    name: 'sleep',
    intent: 'sleeping',
    clip: 'agent-fab-action-sleep',
    duration: 5800,
    priority: 1,
    interruptible: true,
  },
  stretch: {
    name: 'stretch',
    intent: 'idle',
    clip: 'agent-fab-action-stretch',
    duration: 4400,
    priority: 1,
    interruptible: true,
  },
  peek: {
    name: 'peek',
    intent: 'reaction',
    clip: 'agent-fab-action-peek',
    duration: 2800,
    priority: 1,
    interruptible: true,
  },
  scan: {
    name: 'scan',
    intent: 'thinking',
    clip: 'agent-fab-action-scan',
    duration: 3200,
    priority: 1,
    interruptible: true,
  },
  charge: {
    name: 'charge',
    intent: 'thinking',
    clip: 'agent-fab-action-charge',
    duration: 4800,
    priority: 1,
    interruptible: true,
  },
  'spin-cheer': {
    name: 'spin-cheer',
    intent: 'success',
    clip: 'agent-fab-action-spin-cheer',
    duration: 3600,
    priority: 1,
    interruptible: true,
  },
  shy: {
    name: 'shy',
    intent: 'reaction',
    clip: 'agent-fab-action-shy',
    duration: 3000,
    priority: 1,
    interruptible: true,
  },
  confused: {
    name: 'confused',
    intent: 'reaction',
    clip: 'agent-fab-action-confused',
    duration: 3400,
    priority: 1,
    interruptible: true,
  },
}

/** 获取指定宠物动作的播放时长。 */
export function getAgentPetActionDuration(action: AgentPetActionName) {
  return AGENT_PET_ACTIONS[action].duration
}

/** 生成下一次空闲趣味动作的随机等待时间。 */
export function getAgentPetRandomActionDelay() {
  return (
    AGENT_PET_RANDOM_ACTION_MIN_DELAY +
    Math.round(Math.random() * (AGENT_PET_RANDOM_ACTION_MAX_DELAY - AGENT_PET_RANDOM_ACTION_MIN_DELAY))
  )
}

/** 从动作池中选择一个不同于上一次的趣味动作。 */
export function pickAgentPetRandomAction(lastAction: AgentPetActionName | null): AgentPetActionName {
  const candidates = AGENT_PET_RANDOM_ACTIONS.filter(action => action !== lastAction)

  return candidates[Math.floor(Math.random() * candidates.length)] || AGENT_PET_RANDOM_ACTIONS[0]
}
