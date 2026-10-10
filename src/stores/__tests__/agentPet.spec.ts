import { createPinia, getActivePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentPetDeclaration } from '@/types/agentHost'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  preload: vi.fn(),
  globalSettings: {} as Record<string, unknown>,
}))

vi.mock('@/api', () => ({
  default: { get: mocks.apiGet, post: mocks.apiPost },
}))

vi.mock('@/utils/agentPetLoader', () => ({
  preloadAgentPetComponent: (...args: unknown[]) => mocks.preload(...args),
}))

vi.mock('@/stores/global', () => ({
  useGlobalSettingsStore: () => ({ get: (key: string) => mocks.globalSettings[key] }),
}))

const {
  normalizeAgentPetDeclarations,
  normalizeAgentPetSelection,
  resolveAgentPet,
  resolveAgentPetPreviewUrl,
  useAgentPetStore,
} = await import('@/stores/agentPet')
const { usePluginRuntimeStore } = await import('@/stores/pluginRuntime')

// 每个用例结束后停止当前 store，移除它注册的页面可见性与焦点监听，避免影响后续用例的计数。
afterEach(() => {
  if (getActivePinia()) useAgentPetStore().stop()
})

function createPet(overrides: Partial<AgentPetDeclaration> = {}): AgentPetDeclaration {
  return {
    plugin_id: 'PetPlugin',
    source_plugin_id: 'PetPlugin',
    plugin_name: '桌宠',
    key: 'girl',
    name: '看板娘',
    mode: 'stage',
    component: 'AgentPet',
    api_version: 1,
    bubbles: 'host',
    random_actions: null,
    ...overrides,
  }
}

describe('agent pet resolution', () => {
  const stage = createPet()
  const renderer = createPet({ key: 'sprite', mode: 'renderer', bubbles: null })

  it('prefers the user selection, follows the admin default when unset and honours explicit builtin', () => {
    expect(resolveAgentPet([stage, renderer], { plugin_id: 'PetPlugin', key: 'sprite' }, 'PetPlugin:girl').pet).toBe(
      renderer,
    )
    expect(resolveAgentPet([stage, renderer], null, 'PetPlugin:girl').pet).toBe(stage)
    expect(resolveAgentPet([stage, renderer], 'builtin', 'PetPlugin:girl').pet).toBeNull()
    expect(resolveAgentPet([stage, renderer], null, '').pet).toBeNull()
  })

  it('falls back to the builtin robot when the pet is missing, disabled or failed in this session', () => {
    expect(resolveAgentPet([stage], { plugin_id: 'Gone', key: 'x' }, '')).toEqual({
      pet: null,
      fallbackReason: 'unavailable',
      requestedId: 'Gone:x',
    })
    expect(resolveAgentPet([stage], null, 'PetPlugin:girl', new Set(['PetPlugin:girl']))).toEqual({
      pet: null,
      fallbackReason: 'failed',
      requestedId: 'PetPlugin:girl',
    })
  })

  it('ignores unknown contract versions and resolves relative preview paths like remote entries', () => {
    const pets = normalizeAgentPetDeclarations([
      createPet({ api_version: 2 }),
      createPet({
        key: 'ok',
        component: './AgentPet',
        preview_url: '/plugin/file/petplugin/dist/assets/a.png?v=1',
        avatar_url: 'plugin/file/petplugin/dist/assets/avatar.png',
      }),
      { plugin_id: 'broken' },
    ])

    expect(pets).toHaveLength(1)
    expect(pets[0].component).toBe('AgentPet')
    expect(pets[0].preview_url).toMatch(/\/api\/v1\/plugin\/file\/petplugin\/dist\/assets\/a\.png\?v=1$/)
    expect(pets[0].avatar_url).toMatch(/\/api\/v1\/plugin\/file\/petplugin\/dist\/assets\/avatar\.png$/)
    expect(resolveAgentPetPreviewUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA')
    expect(resolveAgentPetPreviewUrl('https://cdn.example/a.png')).toBe('https://cdn.example/a.png')
  })

  it('normalizes stored selections', () => {
    expect(normalizeAgentPetSelection('builtin')).toBe('builtin')
    expect(normalizeAgentPetSelection({ plugin_id: 'A', key: 'b' })).toEqual({ plugin_id: 'A', key: 'b' })
    expect(normalizeAgentPetSelection({ plugin_id: 'A' })).toBeNull()
    expect(normalizeAgentPetSelection('other')).toBeNull()
  })
})

describe('useAgentPetStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.globalSettings = {}
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mockBackend(pets: unknown[], selection: unknown) {
    mocks.apiGet.mockImplementation(async (path: string) => {
      if (path === 'plugin/agent_pets') return pets
      if (path === 'user/config/AgentPet') return { value: selection }
      throw new Error(`unexpected ${path}`)
    })
  }

  it('resolves the effective pet after start and switches immediately when the user selects another', async () => {
    mockBackend([createPet(), createPet({ key: 'sprite', mode: 'renderer' })], null)
    mocks.globalSettings.AI_AGENT_PET = 'PetPlugin:girl'
    mocks.apiPost.mockResolvedValue(undefined)
    const store = useAgentPetStore()

    expect(store.effectivePet).toBeNull()
    await store.start()
    expect(store.effectivePet?.key).toBe('girl')

    await store.setUserSelection('builtin')
    expect(mocks.apiPost).toHaveBeenCalledWith('user/config/AgentPet', 'builtin', { feedback: 'silent' })
    expect(store.effectivePet).toBeNull()

    await store.setUserSelection({ plugin_id: 'PetPlugin', key: 'sprite' })
    expect(store.effectivePet?.key).toBe('sprite')
  })

  it('falls back and warns once when a pet fails to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockBackend([createPet()], { plugin_id: 'PetPlugin', key: 'girl' })
    const store = useAgentPetStore()
    await store.start()
    const pet = store.effectivePet!

    store.markFailed(pet, '加载超时')
    store.markFailed(pet, '加载超时')

    expect(store.effectivePet).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('re-reads declarations when the user selects a pet enabled after the entry mounted', async () => {
    mockBackend([], null)
    mocks.apiPost.mockResolvedValue(undefined)
    const store = useAgentPetStore()
    await store.start()

    mockBackend([createPet()], null)
    await store.setUserSelection({ plugin_id: 'PetPlugin', key: 'girl' })

    expect(store.effectivePet?.key).toBe('girl')
  })

  it('re-reads declarations when the plugin runtime reconciles', async () => {
    mockBackend([], { plugin_id: 'PetPlugin', key: 'girl' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = useAgentPetStore()
    const runtime = usePluginRuntimeStore()
    await store.start()
    expect(store.effectivePet).toBeNull()

    mockBackend([createPet()], { plugin_id: 'PetPlugin', key: 'girl' })
    runtime.reconciliation++
    await vi.waitFor(() => expect(store.effectivePet?.key).toBe('girl'))

    store.stop()
    expect(store.effectivePet).toBeNull()
  })
})

describe('useAgentPetStore refresh cache', () => {
  const CACHE_KEY = 'agentAssistant.lastPet.alice'

  beforeEach(async () => {
    setActivePinia(createPinia())
    mocks.globalSettings = {}
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    localStorage.clear()
    const { useUserStore } = await import('@/stores/user')
    useUserStore().setUserName('alice')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  /** 让接口挂起，直到测试手动放行，用来观察接口返回前的状态。 */
  function deferBackend() {
    let release!: (pets: AgentPetDeclaration[], selection: unknown) => void
    const gate = new Promise<{ pets: AgentPetDeclaration[]; selection: unknown }>(resolve => {
      release = (pets, selection) => resolve({ pets, selection })
    })
    mocks.apiGet.mockImplementation(async (path: string) => {
      const { pets, selection } = await gate
      if (path === 'plugin/agent_pets') return pets
      if (path === 'user/config/AgentPet') return { value: selection }
      return null
    })
    return release
  }

  it('uses the cached plugin pet before the server answers so the builtin robot never shows', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ id: 'PetPlugin:girl', pet: createPet() }))
    const release = deferBackend()
    const store = useAgentPetStore()

    const starting = store.start()
    expect(store.ready).toBe(false)
    expect(store.effectivePet?.key).toBe('girl')

    release([createPet()], { plugin_id: 'PetPlugin', key: 'girl' })
    await starting
    expect(store.effectivePet?.key).toBe('girl')
  })

  it('switches to the server result when it differs from the cache and records it', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ id: 'PetPlugin:girl', pet: createPet() }))
    const release = deferBackend()
    const store = useAgentPetStore()

    const starting = store.start()
    release([createPet(), createPet({ key: 'sprite', mode: 'renderer' })], { plugin_id: 'PetPlugin', key: 'sprite' })
    await starting
    expect(store.effectivePet?.key).toBe('sprite')
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem(CACHE_KEY) || '{}').id).toBe('PetPlugin:sprite'))

    await store.setUserSelection('builtin')
    expect(store.effectivePet).toBeNull()
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')).toEqual({ id: 'builtin' }))
  })

  it('reports resolving without any cache until the server answers so the entry stays blank', async () => {
    const release = deferBackend()
    const store = useAgentPetStore()

    const starting = store.start()
    expect(store.resolving).toBe(true)

    release([createPet()], { plugin_id: 'PetPlugin', key: 'girl' })
    await starting
    expect(store.resolving).toBe(false)
    expect(store.effectivePet?.key).toBe('girl')
  })

  it('does not report resolving when the cache already says builtin', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ id: 'builtin' }))
    deferBackend()
    const store = useAgentPetStore()

    void store.start()

    expect(store.resolving).toBe(false)
    expect(store.effectivePet).toBeNull()
  })

  it('shows the builtin robot immediately when the server says builtin', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ id: 'PetPlugin:girl', pet: createPet() }))
    mockBackendFor([createPet()], 'builtin')
    const store = useAgentPetStore()

    await store.start()
    expect(store.effectivePet).toBeNull()
  })

  it('falls back on a load failure but keeps caching the chosen pet so the next refresh does not flash the robot', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(CACHE_KEY, JSON.stringify({ id: 'PetPlugin:girl', pet: createPet() }))
    const release = deferBackend()
    const store = useAgentPetStore()
    const starting = store.start()

    store.markFailed(store.effectivePet!, '加载超时')
    expect(store.effectivePet).toBeNull()

    release([createPet()], { plugin_id: 'PetPlugin', key: 'girl' })
    await starting
    expect(store.effectivePet).toBeNull()
    await vi.waitFor(() => expect(JSON.parse(localStorage.getItem(CACHE_KEY) || '{}').id).toBe('PetPlugin:girl'))
  })

  it('degrades to the builtin robot when the cache is missing, corrupt or storage is unavailable', async () => {
    deferBackend()
    localStorage.setItem(CACHE_KEY, '{broken')
    const store = useAgentPetStore()
    void store.start()
    expect(store.effectivePet).toBeNull()
    store.stop()

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    void store.start()
    expect(store.effectivePet).toBeNull()
    store.stop()
  })

  it('clears the cache of the signed-out user on logout', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ id: 'builtin' }))
    localStorage.setItem('agentAssistant.lastPet.bob', JSON.stringify({ id: 'builtin' }))
    const { useAuthStore } = await import('@/stores/auth')

    useAuthStore().logout()

    expect(localStorage.getItem(CACHE_KEY)).toBeNull()
    expect(localStorage.getItem('agentAssistant.lastPet.bob')).not.toBeNull()
  })

  function mockBackendFor(pets: AgentPetDeclaration[], selection: unknown) {
    mocks.apiGet.mockImplementation(async (path: string) => {
      if (path === 'plugin/agent_pets') return pets
      if (path === 'user/config/AgentPet') return { value: selection }
      return null
    })
  }
})

describe('useAgentPetStore refresh and failure rules', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    mocks.globalSettings = {}
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.preload.mockReset()
    localStorage.clear()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  function serve(pets: AgentPetDeclaration[], selection: unknown = { plugin_id: 'PetPlugin', key: 'girl' }) {
    mocks.apiGet.mockImplementation(async (path: string) => {
      if (path === 'plugin/agent_pets') return pets
      if (path === 'user/config/AgentPet') return { value: selection }
      return null
    })
  }

  function declarationCalls() {
    return mocks.apiGet.mock.calls.filter(([path]) => path === 'plugin/agent_pets').length
  }

  it('starts loading the cached pet component as soon as the store starts', async () => {
    const { useUserStore } = await import('@/stores/user')
    useUserStore().setUserName('alice')
    localStorage.setItem('agentAssistant.lastPet.alice', JSON.stringify({ id: 'PetPlugin:girl', pet: createPet() }))
    mocks.apiGet.mockImplementation(() => new Promise(() => {}))

    void useAgentPetStore().start()

    expect(mocks.preload).toHaveBeenCalledWith(expect.objectContaining({ plugin_id: 'PetPlugin', key: 'girl' }))
  })

  it('keeps a failure across reconciliations until that pet declaration really changes', async () => {
    serve([createPet({ preview_url: 'https://cdn.example/p.png?v=1.0.0' })])
    const store = useAgentPetStore()
    const runtime = usePluginRuntimeStore()
    await store.start()
    store.markFailed(store.effectivePet!, '加载失败')
    expect(store.effectivePet).toBeNull()

    // 其他插件引起的代际变化，本形象声明未变，失败记录保留。
    runtime.reconciliation++
    await vi.waitFor(() => expect(declarationCalls()).toBe(2))
    await Promise.resolve()
    expect(store.effectivePet).toBeNull()

    // 插件升级后预览图版本参数变化，允许重新尝试。
    serve([createPet({ preview_url: 'https://cdn.example/p.png?v=1.1.0' })])
    runtime.reconciliation++
    await vi.waitFor(() => expect(store.effectivePet?.key).toBe('girl'))
  })

  it('retries a failed pet after its declaration disappears and comes back', async () => {
    serve([createPet()])
    const store = useAgentPetStore()
    const runtime = usePluginRuntimeStore()
    await store.start()
    store.markFailed(store.effectivePet!, '加载失败')

    serve([])
    runtime.reconciliation++
    await vi.waitFor(() => expect(store.declarations).toHaveLength(0))

    serve([createPet()])
    runtime.reconciliation++
    await vi.waitFor(() => expect(store.effectivePet?.key).toBe('girl'))
  })

  it('re-reads declarations for non-admin users when the page becomes visible or focused, at most every 30 seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    serve([createPet()])
    const store = useAgentPetStore()
    await store.start()
    expect(declarationCalls()).toBe(1)

    window.dispatchEvent(new Event('focus'))
    expect(declarationCalls()).toBe(1)

    vi.advanceTimersByTime(30_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(declarationCalls()).toBe(2)
    window.dispatchEvent(new Event('focus'))
    expect(declarationCalls()).toBe(2)

    store.stop()
    vi.advanceTimersByTime(30_000)
    window.dispatchEvent(new Event('focus'))
    expect(declarationCalls()).toBe(2)
  })

  it('leaves admin sessions to the plugin runtime reconciliation', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    const { useUserStore } = await import('@/stores/user')
    useUserStore().superUser = true
    serve([createPet()])
    const store = useAgentPetStore()
    await store.start()

    vi.advanceTimersByTime(30_000)
    window.dispatchEvent(new Event('focus'))
    expect(declarationCalls()).toBe(1)
  })
})

describe('useAgentPetStore server confirmation', () => {
  const CACHE_KEY = 'agentAssistant.lastPet.alice'

  beforeEach(async () => {
    setActivePinia(createPinia())
    mocks.globalSettings = {}
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.preload.mockReset()
    localStorage.clear()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { useUserStore } = await import('@/stores/user')
    useUserStore().setUserName('alice')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  /** 按路径给出结果；值为 Error 时该请求失败。 */
  function serve(routes: { pets: AgentPetDeclaration[] | Error; selection: unknown }) {
    mocks.apiGet.mockImplementation(async (path: string) => {
      if (path === 'plugin/agent_pets') {
        if (routes.pets instanceof Error) throw routes.pets
        return routes.pets
      }
      if (path === 'user/config/AgentPet') {
        if (routes.selection instanceof Error) throw routes.selection
        return { value: routes.selection }
      }
      return null
    })
  }

  function cancelled() {
    const error = new Error('canceled')
    error.name = 'CanceledError'
    return error
  }

  function readCache() {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
  }

  it('exempts both reads from navigation cancellation', async () => {
    serve({ pets: [createPet()], selection: null })
    await useAgentPetStore().start()

    for (const [, config] of mocks.apiGet.mock.calls) {
      expect(config).toMatchObject({ skipNavigationCancellation: true })
    }
  })

  it('keeps the cached pet and does not touch the cache when both reads are interrupted, then retries on page return', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ id: 'PetPlugin:girl', pet: createPet() }))
    serve({ pets: cancelled(), selection: cancelled() })
    const store = useAgentPetStore()

    await store.start()
    expect(store.ready).toBe(false)
    expect(store.effectivePet?.key).toBe('girl')
    expect(readCache().id).toBe('PetPlugin:girl')

    serve({ pets: [createPet()], selection: 'builtin' })
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(store.ready).toBe(true))
    expect(store.effectivePet).toBeNull()
    await vi.waitFor(() => expect(readCache()).toEqual({ id: 'builtin' }))
  })

  it('shows the builtin robot without writing a cache when a network failure hits the first start without a cache', async () => {
    serve({ pets: new Error('Network Error'), selection: new Error('Network Error') })
    const store = useAgentPetStore()

    await store.start()

    expect(store.ready).toBe(false)
    expect(store.effectivePet).toBeNull()
    expect(localStorage.getItem(CACHE_KEY)).toBeNull()

    // 下一个插件代次时重试。
    serve({ pets: [createPet()], selection: { plugin_id: 'PetPlugin', key: 'girl' } })
    usePluginRuntimeStore().reconciliation++
    await vi.waitFor(() => expect(store.effectivePet?.key).toBe('girl'))
    await vi.waitFor(() => expect(readCache().id).toBe('PetPlugin:girl'))
  })

  it('treats a partial success as unconfirmed and only retries the read that failed', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ id: 'PetPlugin:girl', pet: createPet() }))
    serve({ pets: [createPet(), createPet({ key: 'cat', name: '小猫' })], selection: new Error('Network Error') })
    const store = useAgentPetStore()

    await store.start()
    expect(store.ready).toBe(false)
    expect(store.declarations).toHaveLength(2)
    expect(store.effectivePet?.key).toBe('girl')
    expect(readCache().id).toBe('PetPlugin:girl')

    mocks.apiGet.mockClear()
    serve({ pets: [createPet()], selection: { plugin_id: 'PetPlugin', key: 'cat' } })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(store.ready).toBe(true))
    expect(mocks.apiGet.mock.calls.map(([path]) => path)).toEqual(['user/config/AgentPet'])
    expect(store.effectivePet?.key).toBe('cat')
  })

  it('keeps the previous declarations and selection when a later refresh fails', async () => {
    serve({ pets: [createPet()], selection: { plugin_id: 'PetPlugin', key: 'girl' } })
    const store = useAgentPetStore()
    await store.start()
    expect(store.effectivePet?.key).toBe('girl')

    serve({ pets: cancelled(), selection: cancelled() })
    usePluginRuntimeStore().reconciliation++
    await vi.waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(3))
    await Promise.resolve()

    expect(store.declarations).toHaveLength(1)
    expect(store.effectivePet?.key).toBe('girl')
    expect(readCache().id).toBe('PetPlugin:girl')
  })

  it('compares plugin_version to decide whether a failed pet may retry', async () => {
    serve({
      pets: [createPet({ plugin_version: '1.0.0', preview_url: '/p.png?v=1' })],
      selection: { plugin_id: 'PetPlugin', key: 'girl' },
    })
    const store = useAgentPetStore()
    const runtime = usePluginRuntimeStore()
    await store.start()
    store.markFailed(store.effectivePet!, '加载失败')

    // 版本不变时，即使图片地址变了也不重试。
    serve({
      pets: [createPet({ plugin_version: '1.0.0', preview_url: '/p.png?v=2' })],
      selection: { plugin_id: 'PetPlugin', key: 'girl' },
    })
    runtime.reconciliation++
    await vi.waitFor(() => expect(store.declarations[0]?.preview_url).toContain('v=2'))
    expect(store.effectivePet).toBeNull()

    serve({
      pets: [createPet({ plugin_version: '1.1.0', preview_url: '/p.png?v=2' })],
      selection: { plugin_id: 'PetPlugin', key: 'girl' },
    })
    runtime.reconciliation++
    await vi.waitFor(() => expect(store.effectivePet?.key).toBe('girl'))
  })
})

describe('primeAgentPetFromCache', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.preload.mockReset()
    localStorage.clear()
  })

  it('preloads the cached plugin pet only for a signed-in user', async () => {
    const { primeAgentPetFromCache } = await import('@/stores/agentPet')
    const { useUserStore } = await import('@/stores/user')
    const { useAuthStore } = await import('@/stores/auth')
    useUserStore().setUserName('alice')
    localStorage.setItem('agentAssistant.lastPet.alice', JSON.stringify({ id: 'PetPlugin:girl', pet: createPet() }))

    primeAgentPetFromCache()
    expect(mocks.preload).not.toHaveBeenCalled()

    useAuthStore().setToken('token')
    primeAgentPetFromCache()
    expect(mocks.preload).toHaveBeenCalledWith(expect.objectContaining({ plugin_id: 'PetPlugin', key: 'girl' }))

    mocks.preload.mockClear()
    localStorage.setItem('agentAssistant.lastPet.alice', JSON.stringify({ id: 'builtin' }))
    primeAgentPetFromCache()
    expect(mocks.preload).not.toHaveBeenCalled()
  })
})
