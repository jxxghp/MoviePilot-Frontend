import type { Component } from 'vue'
import type { AgentPetDeclaration } from '@/types/agentHost'
import { ensureRemoteRegistered, loadRegisteredRemoteComponent } from '@/utils/federationLoader'

/** remoteEntry 与形象组件模块本身的加载上限（毫秒），不含 remote 发现与注册。 */
export const AGENT_PET_LOAD_TIMEOUT = 8000

/** 加载超时的错误标记，调用方据此区分“超时”与“加载失败”。 */
export class AgentPetLoadTimeoutError extends Error {
  constructor() {
    super('timeout')
    this.name = 'AgentPetLoadTimeoutError'
  }
}

// 同一形象组件只加载一次：store 在得知生效形象时就开始预加载，形象组件挂载后复用同一次加载。
const loadFlights = new Map<string, Promise<Component>>()

function getFlightKey(pet: AgentPetDeclaration) {
  return `${pet.plugin_id}\u0000${pet.component || 'AgentPet'}`
}

/** 在限定时间内等待加载，超时后以 {@link AgentPetLoadTimeoutError} 拒绝。 */
function withLoadTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new AgentPetLoadTimeoutError()), AGENT_PET_LOAD_TIMEOUT)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

/**
 * 加载形象的联邦组件。
 *
 * 先立即发现并注册该插件的 remote（不经过一次必然失败的加载），注册完成后才开始 8 秒计时，
 * 计时只覆盖 remoteEntry 与组件模块的加载。失败的加载不缓存，之后可以重试。
 */
export function loadAgentPetComponent(pet: AgentPetDeclaration): Promise<Component> {
  const key = getFlightKey(pet)
  const existing = loadFlights.get(key)
  if (existing) return existing

  const flight = (async () => {
    if (!(await ensureRemoteRegistered(pet.plugin_id))) throw new Error(`未找到插件 ${pet.plugin_id} 的联邦入口`)
    const component = (await withLoadTimeout(
      loadRegisteredRemoteComponent(pet.plugin_id, pet.component || 'AgentPet'),
    )) as Component | null
    if (!component) throw new Error('empty component')
    return component
  })()
  loadFlights.set(key, flight)
  flight.catch(() => {
    if (loadFlights.get(key) === flight) loadFlights.delete(key)
  })
  return flight
}

/** 提前开始加载生效形象，失败交给挂载后的形象组件处理与回退。 */
export function preloadAgentPetComponent(pet: AgentPetDeclaration | null) {
  if (!pet) return
  loadAgentPetComponent(pet).catch(() => {})
}

/** 清空加载记录，供测试或插件升级后重新加载使用。 */
export function resetAgentPetComponentLoads() {
  loadFlights.clear()
}
