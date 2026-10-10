import type { Component } from 'vue'
import type { AgentPetDeclaration } from '@/types/agentHost'
import { ensureRemoteRegistered, loadRegisteredRemoteComponent, registerRemoteModule } from '@/utils/federationLoader'

/** remoteEntry 与形象组件模块本身的加载上限（毫秒），不含 remote 发现与注册。 */
export const AGENT_PET_LOAD_TIMEOUT = 8000

/** 声明没有 `remote_url` 时回退到发现接口，这一步单独设上限（毫秒），超时按加载失败处理。 */
export const AGENT_PET_DISCOVER_TIMEOUT = 5000

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

/** 在限定时间内等待，超时后以 createError 生成的错误拒绝。 */
function withTimeout<T>(promise: Promise<T>, ms: number, createError: () => Error): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(createError()), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

/**
 * 让形象所属插件的 remote 可用：声明带 `remote_url` 时直接注册，不发请求；
 * 否则回退到发现接口，最多等 {@link AGENT_PET_DISCOVER_TIMEOUT}，避免接口卡住时入口一直空白。
 */
async function ensurePetRemote(pet: AgentPetDeclaration): Promise<void> {
  if (pet.remote_url) {
    registerRemoteModule({ id: pet.plugin_id, url: pet.remote_url, source_plugin_id: pet.source_plugin_id })
    return
  }
  const found = await withTimeout(
    ensureRemoteRegistered(pet.plugin_id),
    AGENT_PET_DISCOVER_TIMEOUT,
    () => new Error(`发现插件 ${pet.plugin_id} 的联邦入口超时`),
  )
  if (!found) throw new Error(`未找到插件 ${pet.plugin_id} 的联邦入口`)
}

/**
 * 加载形象的联邦组件。
 *
 * 先让该插件的 remote 可用（有 `remote_url` 直接注册，否则限时发现，不经过一次必然失败的加载），
 * 之后才开始 8 秒计时，计时只覆盖 remoteEntry 与组件模块的加载。失败的加载不缓存，之后可以重试。
 */
export function loadAgentPetComponent(pet: AgentPetDeclaration): Promise<Component> {
  const key = getFlightKey(pet)
  const existing = loadFlights.get(key)
  if (existing) return existing

  const flight = (async () => {
    await ensurePetRemote(pet)
    const component = (await withTimeout(
      loadRegisteredRemoteComponent(pet.plugin_id, pet.component || 'AgentPet'),
      AGENT_PET_LOAD_TIMEOUT,
      () => new AgentPetLoadTimeoutError(),
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
