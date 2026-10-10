import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentPetDeclaration } from '@/types/agentHost'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  globalSettings: {} as Record<string, unknown>,
}))

vi.mock('@/api', () => ({
  default: { get: mocks.apiGet, post: mocks.apiPost },
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
      createPet({ key: 'ok', component: './AgentPet', preview_url: '/plugin/file/petplugin/dist/assets/a.png?v=1' }),
      { plugin_id: 'broken' },
    ])

    expect(pets).toHaveLength(1)
    expect(pets[0].component).toBe('AgentPet')
    expect(pets[0].preview_url).toMatch(/\/api\/v1\/plugin\/file\/petplugin\/dist\/assets\/a\.png\?v=1$/)
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
