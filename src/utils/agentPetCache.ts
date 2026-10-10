import type { AgentPetDeclaration } from '@/types/agentHost'

/** 本地缓存 key 前缀，后接用户名，按用户区分。 */
const AGENT_PET_CACHE_PREFIX = 'agentAssistant.lastPet.'

/**
 * 上次实际生效的形象。只用于刷新后在接口返回前提前加载形象、避免先闪内置机器人，
 * 不是事实源：声明与选择接口返回后一律以服务端结果为准。
 */
export type AgentPetCacheEntry = { id: 'builtin' } | { id: string; pet: AgentPetDeclaration }

function getCacheKey(username: string) {
  return `${AGENT_PET_CACHE_PREFIX}${username}`
}

/** 读取缓存；无用户、存储不可用或内容损坏时返回 null，调用方退化为直接显示内置机器人。 */
export function readAgentPetCache(username: string | null | undefined): AgentPetCacheEntry | null {
  if (!username) return null
  try {
    const raw = window.localStorage.getItem(getCacheKey(username))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<{ id: unknown; pet: unknown }>
    if (value?.id === 'builtin') return { id: 'builtin' }
    const pet = value?.pet as AgentPetDeclaration | undefined
    if (
      typeof value?.id === 'string' &&
      pet &&
      typeof pet.plugin_id === 'string' &&
      typeof pet.key === 'string' &&
      `${pet.plugin_id}:${pet.key}` === value.id &&
      (pet.mode === 'stage' || pet.mode === 'renderer')
    ) {
      return { id: value.id, pet }
    }
  } catch {
    // 存储被禁用或内容损坏时按无缓存处理。
  }
  return null
}

/** 写入缓存，pet 为 null 表示内置机器人；存储不可用时静默放弃。 */
export function writeAgentPetCache(username: string | null | undefined, pet: AgentPetDeclaration | null) {
  if (!username) return
  try {
    const entry: AgentPetCacheEntry = pet ? { id: `${pet.plugin_id}:${pet.key}`, pet } : { id: 'builtin' }
    window.localStorage.setItem(getCacheKey(username), JSON.stringify(entry))
  } catch {
    // 本地空间不足或存储被禁用时只是失去加速提示，不影响形象本身。
  }
}

/** 退出登录时清除该用户的缓存，避免同一浏览器的下一个账号看到上一个账号的形象。 */
export function clearAgentPetCache(username: string | null | undefined) {
  if (!username) return
  try {
    window.localStorage.removeItem(getCacheKey(username))
  } catch {
    // 存储不可用时没有可清除的内容。
  }
}
