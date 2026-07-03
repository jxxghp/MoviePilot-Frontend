export type AgentPetActionName =
  | 'wave'
  | 'sit'
  | 'eye-roll'
  | 'faint'
  | 'disassemble'
  | 'happy-jump'
  | 'sleep'
  | 'stretch'
  | 'peek'
  | 'scan'
  | 'charge'
  | 'spin-cheer'
  | 'shy'
  | 'confused'

export type AgentPetIntent =
  | 'idle'
  | 'thinking'
  | 'speaking'
  | 'notify'
  | 'success'
  | 'warning'
  | 'error'
  | 'dragging'
  | 'docked'
  | 'sleeping'
  | 'reaction'

export type AgentPetRendererKind = 'css-robot'

export interface AgentPetActionDefinition {
  name: AgentPetActionName
  intent: AgentPetIntent
  clip: string
  duration: number
  priority: number
  interruptible: boolean
  cooldown?: number
  next?: AgentPetActionName
}
