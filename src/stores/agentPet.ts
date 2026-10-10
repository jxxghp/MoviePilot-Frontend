import { defineStore } from 'pinia'
import { computed, effectScope, ref, shallowRef, watch, type EffectScope } from 'vue'
import api from '@/api'
import { useGlobalSettingsStore } from '@/stores/global'
import { usePluginRuntimeStore } from '@/stores/pluginRuntime'
import { useUserStore } from '@/stores/user'
import { useAuthStore } from '@/stores/auth'
import { readAgentPetCache, writeAgentPetCache } from '@/utils/agentPetCache'
import { preloadAgentPetComponent } from '@/utils/agentPetLoader'
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
 * 把后端返回的预览图或头像地址解析为可访问 URL。
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
      avatar_url: resolveAgentPetPreviewUrl(pet.avatar_url),
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
  // 路由切换会统一中断页面请求；形象属于应用外壳，读取不能因此被中断。
  const response = await api.get<unknown>('plugin/agent_pets', { feedback: 'silent', skipNavigationCancellation: true })
  return normalizeAgentPetDeclarations(response)
}

/** 无本地缓存时等待声明与选择接口的最长时间（毫秒）。 */
export const AGENT_PET_RESOLVE_WAIT = 3000

/** 非管理员会话在切回页面时重新读取声明的最短间隔（毫秒）。 */
export const AGENT_PET_FOCUS_REFRESH_INTERVAL = 30_000

/** 从资源地址中取出版本参数 `v`，没有时用完整地址代替，用于判断插件素材是否随版本更新。 */
function getAssetVersion(url: string | null | undefined) {
  if (!url) return ''
  try {
    return new URL(url, 'http://localhost').searchParams.get('v') ?? url
  } catch {
    return url
  }
}

/**
 * 判断形象声明是否真正更新过：消失后再出现，或插件版本变化。
 * 两边都有 `plugin_version` 时比较版本；缺少版本时退回比较预览图、头像地址里的版本参数。
 * 只有这些情况才允许本会话里加载失败过的形象重新尝试。
 */
export function hasAgentPetDeclarationChanged(previous: AgentPetDeclaration | undefined, next: AgentPetDeclaration) {
  if (!previous) return true
  if (previous.plugin_version && next.plugin_version) return previous.plugin_version !== next.plugin_version
  return (
    getAssetVersion(previous.preview_url) !== getAssetVersion(next.preview_url) ||
    getAssetVersion(previous.avatar_url) !== getAssetVersion(next.avatar_url)
  )
}

/**
 * 登录后的布局一建立就按本地缓存提前注册并预加载上次的形象，不等 Agent 入口挂载。
 *
 * 只在已登录（有 token 和用户名）且缓存记的是插件形象时生效，未登录页面不会调用。
 * 这只是加速提示，入口挂载后的 store 仍以服务端结果为准；预加载失败由挂载后的形象组件处理。
 */
export function primeAgentPetFromCache() {
  const userStore = useUserStore()
  if (!useAuthStore().token || !userStore.userName) return
  const cached = readAgentPetCache(userStore.userName)
  if (!cached || !('pet' in cached)) return
  preloadAgentPetComponent(normalizeAgentPetDeclarations([cached.pet])[0] ?? null)
}

/**
 * 维护当前登录会话的 Agent 形象声明、用户选择和生效形象。
 *
 * 由 AgentAssistantWidget 在 Agent 入口挂载时 start、卸载时 stop。管理员会话随插件运行态代际变化重新读取声明；
 * 其他用户无权访问运行态接口，在页面重新可见或窗口获得焦点时重新读取（30 秒内最多一次），不做定时轮询。
 * 设置页写入选择后状态即时更新，挂载中的形象随之切换，无需刷新。
 */
export const useAgentPetStore = defineStore('agentPet', () => {
  const globalSettingsStore = useGlobalSettingsStore()
  const pluginRuntimeStore = usePluginRuntimeStore()
  const userStore = useUserStore()

  /** 可用形象声明。 */
  const declarations = ref<AgentPetDeclaration[]>([])
  /** 当前用户的选择。 */
  const userSelection = ref<AgentPetSelection>(null)
  /** 声明与用户选择是否都已读取过一次；未就绪时使用本地缓存的上次形象，没有缓存则用内置机器人。 */
  const ready = ref(false)
  /** 本地缓存的上次生效形象，只在接口返回前用于提前加载，避免刷新后先闪内置机器人。 */
  const cachedPet = shallowRef<AgentPetDeclaration | null>(null)
  /** 本地是否有任何缓存（含明确的内置机器人）；没有缓存时在接口返回前无从得知该显示什么。 */
  const hasCache = ref(false)
  /** 无缓存时等待接口的上限；超过后先显示内置机器人，避免接口挂起时入口一直空白。 */
  const resolveWaitExpired = ref(false)
  let resolveWaitTimer: ReturnType<typeof setTimeout> | undefined
  /** 入口挂载后、接口返回前且没有本地缓存，此时既不能显示机器人也不能加载形象，入口应保持空白。 */
  const resolving = computed(() => active.value && !ready.value && !hasCache.value && !resolveWaitExpired.value)
  /** 缓存所属用户，退出登录后由 auth store 清除。 */
  let cacheUser = ''
  /** 本会话加载或运行失败的形象，不再重试直到切换选择或刷新声明。 */
  const failedIds = ref<Set<string>>(new Set())
  const active = ref(false)

  let scope: EffectScope | null = null
  let declarationGeneration = 0
  /** 最近一次开始读取声明的时间，用于节流切回页面时的补读。 */
  let lastDeclarationRefreshAt = 0
  /** 本次启动后是否成功读取过声明。 */
  const declarationsLoaded = ref(false)
  /** 本次启动后是否成功读取过用户选择。 */
  const selectionLoaded = ref(false)
  let selectionGeneration = 0
  let confirming: Promise<void> | null = null
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

  /** 按服务端声明与选择应生效的形象，不计本会话的加载失败；只用于写刷新缓存。 */
  const intendedPet = computed(() =>
    ready.value
      ? resolveAgentPet(
          declarations.value,
          userSelection.value,
          globalSettingsStore.get(AGENT_PET_SYSTEM_SETTING_KEY),
          new Set<string>(),
        ).pet
      : null,
  )

  /** 当前生效形象，null 为内置机器人；接口返回前沿用缓存，返回后一律以服务端结果为准。 */
  const effectivePet = computed(() => {
    if (ready.value) return resolution.value.pet
    const cached = cachedPet.value
    return cached && !failedIds.value.has(getAgentPetId(cached)) ? cached : null
  })

  /** 每个回退原因只告警一次，不弹 toast。 */
  function warnOnce(key: string, message: string, detail?: unknown) {
    if (warnedKeys.has(key)) return
    warnedKeys.add(key)
    console.warn(`[agent-pet] ${message}`, detail ?? '')
  }

  /**
   * 读取声明。失败或被中断时保留上一份声明，不把一次读取失败当成“插件都没了”。
   * @returns 本次是否真正读到了服务端结果
   */
  async function refreshDeclarations(): Promise<boolean> {
    const generation = ++declarationGeneration
    lastDeclarationRefreshAt = Date.now()
    try {
      const items = await fetchAgentPetDeclarations()
      if (generation !== declarationGeneration) return false
      // 首次读取没有可比较的旧声明，接口返回前（例如用缓存预加载时）记下的失败保持有效。
      if (declarationsLoaded.value) clearFailuresForChangedDeclarations(declarations.value, items)
      declarationsLoaded.value = true
      declarations.value = items
      return true
    } catch (error) {
      if (generation === declarationGeneration) warnOnce('declarations', '读取形象声明失败，保留上一份声明', error)
      return false
    }
  }

  /**
   * 读取用户选择。失败或被中断时保留上一份选择，不把读取失败当成“用户改用内置机器人”。
   * @returns 本次是否真正读到了服务端结果
   */
  async function loadUserSelection(): Promise<boolean> {
    const generation = ++selectionGeneration
    try {
      const response = await api.get<{ value?: unknown }>(`user/config/${AGENT_PET_USER_CONFIG_KEY}`, {
        feedback: 'silent',
        skipNavigationCancellation: true,
      })
      if (generation !== selectionGeneration) return false
      userSelection.value = normalizeAgentPetSelection(response?.value)
      selectionLoaded.value = true
      return true
    } catch (error) {
      if (generation === selectionGeneration) warnOnce('selection', '读取用户形象选择失败，保留上一份选择', error)
      return false
    }
  }

  /**
   * 向服务端确认声明与选择。只有两者都至少成功读取过一次才算确认（ready），之后才写刷新缓存；
   * 确认前沿用缓存的形象，没有缓存时显示内置机器人，并在切回页面或下一个插件代次时重试。
   */
  async function confirmFromServer() {
    if (confirming) return confirming
    confirming = (async () => {
      const tasks: Promise<boolean>[] = []
      if (!declarationsLoaded.value) tasks.push(refreshDeclarations())
      if (!selectionLoaded.value) tasks.push(loadUserSelection())
      await Promise.all(tasks)
      if (active.value && declarationsLoaded.value && selectionLoaded.value) {
        clearTimeout(resolveWaitTimer)
        ready.value = true
      }
    })()
    try {
      await confirming
    } finally {
      confirming = null
    }
  }

  /** 保存用户选择并即时生效。 */
  async function setUserSelection(selection: AgentPetSelection) {
    const normalized = normalizeAgentPetSelection(selection)
    await api.post(`user/config/${AGENT_PET_USER_CONFIG_KEY}`, normalized, { feedback: 'silent' })
    // 用户刚明确保存的选择即服务端结果，旧的选择读取请求作废。
    selectionGeneration++
    selectionLoaded.value = true
    if (normalized && normalized !== AGENT_PET_BUILTIN) {
      const id = getAgentPetId(normalized)
      clearFailure(id)
      // 声明只在入口挂载和插件代际变化时读取；设置页列出的新启用形象可能尚未进入本地声明，先补读再切换。
      if (!declarations.value.some(item => getAgentPetId(item) === id)) {
        warnedKeys.delete(`unavailable:${id}`)
        await refreshDeclarations()
      }
    }
    userSelection.value = normalized
    if (active.value && !ready.value) void confirmFromServer()
  }

  /** 记录形象加载或运行失败，生效形象随之回退内置机器人。 */
  function markFailed(pet: AgentPetDeclaration, reason: string, detail?: unknown) {
    const id = getAgentPetId(pet)
    warnOnce(`failed:${id}`, `形象 ${id} ${reason}，回退内置机器人`, detail)
    // 缓存记录的是用户想要的形象而不是本次加载结果：一次超时多半是服务刚启动或网络抖动，
    // 若改写成内置机器人，下次刷新又会先闪机器人再切回形象。
    if (failedIds.value.has(id)) return
    failedIds.value = new Set([...failedIds.value, id])
  }

  /** 只有声明真正更新过的形象才清除失败记录，其余失败形象本会话内继续回退。 */
  function clearFailuresForChangedDeclarations(previous: AgentPetDeclaration[], next: AgentPetDeclaration[]) {
    if (!failedIds.value.size) return
    const previousById = new Map(previous.map(pet => [getAgentPetId(pet), pet]))
    next.forEach(pet => {
      const id = getAgentPetId(pet)
      if (failedIds.value.has(id) && hasAgentPetDeclarationChanged(previousById.get(id), pet)) clearFailure(id)
    })
  }

  /**
   * 切回页面时的补读：尚未确认的会话（任何用户）重试确认；已确认的非管理员会话补读声明，
   * 后者 30 秒内最多一次。管理员会话已随插件运行态代际刷新。
   */
  function handlePageReturn() {
    if (!active.value) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (!ready.value) {
      void confirmFromServer()
      return
    }
    if (userStore.superUser) return
    if (Date.now() - lastDeclarationRefreshAt < AGENT_PET_FOCUS_REFRESH_INTERVAL) return
    void refreshDeclarations()
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
    cacheUser = userStore.userName
    const cached = readAgentPetCache(cacheUser)
    hasCache.value = cached !== null
    resolveWaitExpired.value = false
    clearTimeout(resolveWaitTimer)
    if (!hasCache.value) {
      resolveWaitTimer = setTimeout(() => {
        resolveWaitExpired.value = true
      }, AGENT_PET_RESOLVE_WAIT)
    }
    cachedPet.value = cached && 'pet' in cached ? (normalizeAgentPetDeclarations([cached.pet])[0] ?? null) : null
    scope = effectScope(true)
    scope.run(() => {
      // 服务端结果就绪后记住用户想要的形象（不计本会话的加载失败），供下次刷新提前加载。
      watch([ready, intendedPet], ([isReady, pet]) => {
        if (isReady) writeAgentPetCache(cacheUser, pet)
      })
      // 一知道生效形象就开始发现 remote 并加载组件，不等形象组件挂载。
      watch(effectivePet, pet => preloadAgentPetComponent(pet), { immediate: true })
      watch(
        () => pluginRuntimeStore.reconciliation,
        (value, previous) => {
          if (value === previous || value <= 0) return
          // 尚未确认时借新代次重试确认；已确认时插件启停或升级后重新读取声明，失败记录只在对应声明真正更新时清除。
          if (!ready.value) void confirmFromServer()
          else void refreshDeclarations()
        },
      )
      watch(resolution, value => {
        if (value.fallbackReason === 'unavailable' && value.requestedId) {
          warnOnce(`unavailable:${value.requestedId}`, `形象 ${value.requestedId} 不可用，回退内置机器人`)
        }
      })
    })
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', handlePageReturn)
      window.addEventListener('focus', handlePageReturn)
    }
    await confirmFromServer()
  }

  function stop() {
    if (active.value && typeof window !== 'undefined') {
      document.removeEventListener('visibilitychange', handlePageReturn)
      window.removeEventListener('focus', handlePageReturn)
    }
    active.value = false
    scope?.stop()
    scope = null
    declarationGeneration++
    selectionGeneration++
    declarationsLoaded.value = false
    selectionLoaded.value = false
    confirming = null
    lastDeclarationRefreshAt = 0
    declarations.value = []
    userSelection.value = null
    failedIds.value = new Set()
    ready.value = false
    cachedPet.value = null
    hasCache.value = false
    clearTimeout(resolveWaitTimer)
    resolveWaitExpired.value = false
    cacheUser = ''
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
    resolving,
    setUserSelection,
    start,
    stop,
    userSelection,
  }
})
