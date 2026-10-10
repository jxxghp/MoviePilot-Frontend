import type { AgentPetActionDefinition, AgentPetActionName } from './types'

export const AGENT_PET_RANDOM_ACTION_MIN_DELAY = 12000
export const AGENT_PET_RANDOM_ACTION_MAX_DELAY = 24000

// 日常只播放温和的人类小动作；夸张的机器人特技仍可由 playAction 显式触发。
export const AGENT_PET_RANDOM_ACTIONS = ['wave', 'sit', 'sleep', 'stretch', 'peek', 'shy', 'confused'] as const

// 打盹和舒展更常见，避免刚睡醒的小助手频繁热情招手。
const RANDOM_ACTION_WEIGHTS: Partial<Record<AgentPetActionName, number>> = { sleep: 3, stretch: 2, sit: 2 }

export const AGENT_PET_ACTIONS: Record<AgentPetActionName, AgentPetActionDefinition> = {
  nod: {
    name: 'nod',
    intent: 'reaction',
    clip: 'agent-fab-action-nod',
    duration: 1500,
    priority: 1,
    interruptible: true,
  },
  wake: {
    name: 'wake',
    intent: 'reaction',
    clip: 'agent-fab-action-wake',
    duration: 1800,
    priority: 1,
    interruptible: true,
  },
  wave: {
    name: 'wave',
    intent: 'reaction',
    clip: 'agent-fab-action-wave',
    duration: 2800,
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
    duration: 2600,
    priority: 1,
    interruptible: true,
  },
  sleep: {
    name: 'sleep',
    intent: 'sleeping',
    clip: 'agent-fab-action-sleep',
    duration: 6800,
    priority: 1,
    interruptible: true,
  },
  stretch: {
    name: 'stretch',
    intent: 'idle',
    clip: 'agent-fab-action-stretch',
    duration: 5200,
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

/**
 * 计算随机动作池：未声明时使用宿主日常动作全集；renderer 形象声明了 `random_actions` 时
 * 只保留其中宿主认识的动作名，显式声明空列表表示不播放随机动作。
 */
export function resolveAgentPetRandomPool(allowed?: readonly string[] | null): readonly AgentPetActionName[] {
  if (!Array.isArray(allowed)) return AGENT_PET_RANDOM_ACTIONS

  return allowed.filter(
    (action, index): action is AgentPetActionName =>
      Object.prototype.hasOwnProperty.call(AGENT_PET_ACTIONS, action) && allowed.indexOf(action) === index,
  )
}

/** 按安静动作优先的权重抽取，且不会连续重复同一个动作。 */
export function pickAgentPetRandomAction(
  lastAction: AgentPetActionName | null,
  pool: readonly AgentPetActionName[] = AGENT_PET_RANDOM_ACTIONS,
): AgentPetActionName {
  const candidates = pool
    .filter(action => action !== lastAction)
    .flatMap(action => Array<AgentPetActionName>(RANDOM_ACTION_WEIGHTS[action] ?? 1).fill(action))

  return candidates[Math.floor(Math.random() * candidates.length)] || pool[0] || AGENT_PET_RANDOM_ACTIONS[0]
}
