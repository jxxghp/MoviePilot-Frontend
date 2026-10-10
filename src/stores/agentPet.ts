import { defineStore } from 'pinia'
import { computed, effectScope, ref, watch, type EffectScope } from 'vue'
import api from '@/api'
import { useGlobalSettingsStore } from '@/stores/global'
import { usePluginRuntimeStore } from '@/stores/pluginRuntime'
import type { AgentPetDeclaration, AgentPetSelection } from '@/types/agentHost'
import { resolveFederationRemoteUrl } from '@/utils/federationUrl'

/** 宿主识别的形象契约版本。 */
export const AGENT_PET_API_VERSION = 1

/** 用户形象选择的 user config key。 */
export const AGENT_PET_USER_CONFIG_KEY = 'AgentPet'

/** 管理员默认形象的系统设置 key，值为 `<plugin_id>:<key>`，空为内置机器人。 */
export const AGENT_PET_SYSTEM_SETTING_KEY = 'AI_AGENT_PET'

/** 用户选择“明确使用内置机器人”时保存的值。 */
export const AGENT_PET_BUILTIN = 'builtin'

/** 生成形象的全局唯一标识，与 `AI_AGENT_PET` 的取值格式一致。 */
export function getAgentPetId(pet: { plugin_id: string; key: string }) {
  return `${pet.plugin_id}:${pet.key}`
}

/**
 * 把后端返回的预览图地址解析为可访问 URL。
 * 插件文件路径与 remoteEntry 遵循同一部署路径规则；http(s) 与 data: URL 原样使用。
 */
export function resolveAgentPetPreviewUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const url = value.trim()
  if (/^(https?:|data:)/i.test(url)) return url
  if (typeof document === 'undefined') return url

  return resolveFederationRemoteUrl(url, import.meta.env.VITE_API_BASE_URL || '/api/v1', document.baseURI)
}

/** 规整后端返回的声明列表，丢弃宿主不认识的契约版本和缺字段项。 */
export function normalizeAgentPetDeclarations(value: unknown): AgentPetDeclaration[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is AgentPetDeclaration => {
      if (!item || typeof item !== 'object') return false
      const pet = item as Partial<AgentPetDeclaration>
      return (
        typeof pet.plugin_id === 'string' &&
        typeof pet.key === 'string' &&
        (pet.mode === 'stage' || pet.mode === 'renderer') &&
        (pet.api_version ?? AGENT_PET_API_VERSION) === AGENT_PET_API_VERSION
      )
    })
    .map(pet => ({
      ...pet,
      source_plugin_id: pet.source_plugin_id || pet.plugin_id,
      plugin_name: pet.plugin_name || pet.plugin_id,
      name: pet.name || pet.key,
      // 后端给出裸暴露名，兼容误带 `./` 前缀的写法。
      component: (pet.component || 'AgentPet').replace(/^\.\//, ''),
      preview_url: resolveAgentPetPreviewUrl(pet.preview_url),
    }))
}

/** 规整 user config 中保存的选择值，非法值按“跟随默认”处理。 */
export function normalizeAgentPetSelection(value: unknown): AgentPetSelection {
  if (value === AGENT_PET_BUILTIN) return AGENT_PET_BUILTIN
  if (value && typeof value === 'object') {
    const { plugin_id: pluginId, key } = value as Record<string, unknown>
    if (typeof pluginId === 'string' && pluginId && typeof key === 'string' && key) return { plugin_id: pluginId, key }
  }
  return null
}

/** 生效形象的解析结果，pet 为 null 表示使用内置机器人。 */
export interface AgentPetResolution {
  pet: AgentPetDeclaration | null
  /** 选择指向了某个形象但未能使用时的原因，用于一次性告警。 */
  fallbackReason?: string
  /** 未能使用的形象标识。 */
  requestedId?: string
}

/**
 * 解析生效形象：用户选择优先，null 跟随管理员默认，`builtin` 明确内置；
 * 目标不存在、已停用（不在声明列表）、版本不认识或本会话加载失败时回退内置机器人。
 */
export function resolveAgentPet(
  declarations: AgentPetDeclaration[],
  userSelection: AgentPetSelection,
  adminDefault: unknown,
  failedIds: ReadonlySet<string> = new Set(),
): AgentPetResolution {
  let requestedId = ''
  if (userSelection === AGENT_PET_BUILTIN) return { pet: null }
  if (userSelection) requestedId = getAgentPetId(userSelection)
  else if (typeof adminDefault === 'string' && adminDefault.trim()) requestedId = adminDefault.trim()

  if (!requestedId) return { pet: null }

  const pet = declarations.find(item => getAgentPetId(item) === requestedId)
  if (!pet) return { pet: null, fallbackReason: 'unavailable', requestedId }
  if (failedIds.has(requestedId)) return { pet: null, fallbackReason: 'failed', requestedId }

  return { pet }
}

/** 读取全部可用形象声明。 */
export async function fetchAgentPetDeclarations(): Promise<AgentPetDeclaration[]> {
  const response = await api.get<unknown>('plugin/agent_pets', { feedback: 'silent' })
  return normalizeAgentPetDeclarations(response)
}

/**
 * 维护当前登录会话的 Agent 形象声明、用户选择和生效形象。
 *
 * 由 AgentAssistantWidget 在 Agent 入口挂载时 start、卸载时 stop；插件运行态代际变化时重新读取声明，
 * 插件不需要轮询。设置页写入选择后状态即时更新，挂载中的形象随之切换，无需刷新。
 */
export const useAgentPetStore = defineStore('agentPet', () => {
  const globalSettingsStore = useGlobalSettingsStore()
  const pluginRuntimeStore = usePluginRuntimeStore()

  /** 可用形象声明。 */
  const declarations = ref<AgentPetDeclaration[]>([])
  /** 当前用户的选择。 */
  const userSelection = ref<AgentPetSelection>(null)
  /** 声明与用户选择是否都已读取过一次；未就绪时使用内置机器人。 */
  const ready = ref(false)
  /** 本会话加载或运行失败的形象，不再重试直到切换选择或刷新声明。 */
  const failedIds = ref<Set<string>>(new Set())
  const active = ref(false)

  let scope: EffectScope | null = null
  let declarationGeneration = 0
  const warnedKeys = new Set<string>()

  const resolution = computed(() =>
    ready.value
      ? resolveAgentPet(
          declarations.value,
          userSelection.value,
          globalSettingsStore.get(AGENT_PET_SYSTEM_SETTING_KEY),
          failedIds.value,
        )
      : { pet: null },
  )

  /** 当前生效形象，null 为内置机器人。 */
  const effectivePet = computed(() => resolution.value.pet)

  /** 每个回退原因只告警一次，不弹 toast。 */
  function warnOnce(key: string, message: string, detail?: unknown) {
    if (warnedKeys.has(key)) return
    warnedKeys.add(key)
    console.warn(`[agent-pet] ${message}`, detail ?? '')
  }

  async function refreshDeclarations() {
    const generation = ++declarationGeneration
    try {
      const items = await fetchAgentPetDeclarations()
      if (generation !== declarationGeneration) return
      declarations.value = items
    } catch (error) {
      if (generation !== declarationGeneration) return
      declarations.value = []
      warnOnce('declarations', '读取形象声明失败，使用内置机器人', error)
    }
  }

  async function loadUserSelection() {
    try {
      const response = await api.get<{ value?: unknown }>(`user/config/${AGENT_PET_USER_CONFIG_KEY}`, {
        feedback: 'silent',
      })
      userSelection.value = normalizeAgentPetSelection(response?.value)
    } catch (error) {
      userSelection.value = null
      warnOnce('selection', '读取用户形象选择失败，跟随系统默认', error)
    }
  }

  /** 保存用户选择并即时生效。 */
  async function setUserSelection(selection: AgentPetSelection) {
    const normalized = normalizeAgentPetSelection(selection)
    await api.post(`user/config/${AGENT_PET_USER_CONFIG_KEY}`, normalized, { feedback: 'silent' })
    userSelection.value = normalized
    if (normalized && normalized !== AGENT_PET_BUILTIN) clearFailure(getAgentPetId(normalized))
  }

  /** 记录形象加载或运行失败，生效形象随之回退内置机器人。 */
  function markFailed(pet: AgentPetDeclaration, reason: string, detail?: unknown) {
    const id = getAgentPetId(pet)
    warnOnce(`failed:${id}`, `形象 ${id} ${reason}，回退内置机器人`, detail)
    if (failedIds.value.has(id)) return
    failedIds.value = new Set([...failedIds.value, id])
  }

  function clearFailure(id: string) {
    if (!failedIds.value.has(id)) return
    const next = new Set(failedIds.value)
    next.delete(id)
    failedIds.value = next
    warnedKeys.delete(`failed:${id}`)
  }

  async function start() {
    if (active.value) return
    active.value = true
    scope = effectScope(true)
    scope.run(() => {
      watch(
        () => pluginRuntimeStore.reconciliation,
        (value, previous) => {
          if (value === previous || value <= 0) return
          // 插件启停或升级后重新读取声明，并允许之前失败的形象重新尝试加载。
          failedIds.value = new Set()
          void refreshDeclarations()
        },
      )
      watch(resolution, value => {
        if (value.fallbackReason === 'unavailable' && value.requestedId) {
          warnOnce(`unavailable:${value.requestedId}`, `形象 ${value.requestedId} 不可用，回退内置机器人`)
        }
      })
    })
    await Promise.all([refreshDeclarations(), loadUserSelection()])
    if (active.value) ready.value = true
  }

  function stop() {
    active.value = false
    scope?.stop()
    scope = null
    declarationGeneration++
    declarations.value = []
    userSelection.value = null
    failedIds.value = new Set()
    ready.value = false
    warnedKeys.clear()
  }

  return {
    active,
    declarations,
    effectivePet,
    failedIds,
    markFailed,
    ready,
    refreshDeclarations,
    resolution,
    setUserSelection,
    start,
    stop,
    userSelection,
  }
})
