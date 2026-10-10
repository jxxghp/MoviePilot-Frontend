import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentPetDeclaration } from '@/types/agentHost'
import {
  AGENT_PET_DISCOVER_TIMEOUT,
  AGENT_PET_LOAD_TIMEOUT,
  AgentPetLoadTimeoutError,
  loadAgentPetComponent,
  resetAgentPetComponentLoads,
} from '@/utils/agentPetLoader'

const mocks = vi.hoisted(() => ({
  ensureRemoteRegistered: vi.fn(),
  loadRegisteredRemoteComponent: vi.fn(),
  registerRemoteModule: vi.fn(),
}))

vi.mock('@/utils/federationLoader', () => ({
  ensureRemoteRegistered: (...args: unknown[]) => mocks.ensureRemoteRegistered(...args),
  loadRegisteredRemoteComponent: (...args: unknown[]) => mocks.loadRegisteredRemoteComponent(...args),
  registerRemoteModule: (...args: unknown[]) => mocks.registerRemoteModule(...args),
}))

function createPet(overrides: Partial<AgentPetDeclaration> = {}): AgentPetDeclaration {
  return {
    plugin_id: 'PetPlugin',
    source_plugin_id: 'PetPlugin',
    plugin_name: '桌宠',
    key: 'girl',
    name: '小映',
    mode: 'stage',
    component: 'AgentPet',
    api_version: 1,
    ...overrides,
  }
}

describe('loadAgentPetComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetAgentPetComponentLoads()
    mocks.ensureRemoteRegistered.mockReset()
    mocks.loadRegisteredRemoteComponent.mockReset()
    mocks.registerRemoteModule.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers the remote from remote_url directly without discovery', async () => {
    const component = { name: 'Pet' }
    mocks.loadRegisteredRemoteComponent.mockResolvedValue(component)

    await expect(
      loadAgentPetComponent(createPet({ remote_url: '/plugin/file/petplugin/dist/assets/remoteEntry.js?v=1' })),
    ).resolves.toBe(component)

    expect(mocks.registerRemoteModule).toHaveBeenCalledWith({
      id: 'PetPlugin',
      url: '/plugin/file/petplugin/dist/assets/remoteEntry.js?v=1',
      source_plugin_id: 'PetPlugin',
    })
    expect(mocks.ensureRemoteRegistered).not.toHaveBeenCalled()
  })

  it('fails as a load failure when fallback discovery exceeds 5 seconds', async () => {
    mocks.ensureRemoteRegistered.mockImplementation(() => new Promise(() => {}))

    const loading = loadAgentPetComponent(createPet())
    const assertion = expect(loading).rejects.toThrow('发现插件 PetPlugin 的联邦入口超时')
    await vi.advanceTimersByTimeAsync(AGENT_PET_DISCOVER_TIMEOUT)
    await assertion
    await expect(loading).rejects.not.toBeInstanceOf(AgentPetLoadTimeoutError)
    expect(mocks.loadRegisteredRemoteComponent).not.toHaveBeenCalled()
  })

  it('does not count remote discovery toward the 8 second load timeout', async () => {
    const component = { name: 'Pet' }
    mocks.ensureRemoteRegistered.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(true), AGENT_PET_DISCOVER_TIMEOUT - 500)),
    )
    mocks.loadRegisteredRemoteComponent.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(component), AGENT_PET_LOAD_TIMEOUT - 500)),
    )

    const loading = loadAgentPetComponent(createPet())
    await vi.advanceTimersByTimeAsync(AGENT_PET_DISCOVER_TIMEOUT + AGENT_PET_LOAD_TIMEOUT)

    await expect(loading).resolves.toBe(component)
    expect(mocks.loadRegisteredRemoteComponent).toHaveBeenCalledWith('PetPlugin', 'AgentPet')
  })

  it('times out when remoteEntry and the component take longer than 8 seconds', async () => {
    mocks.ensureRemoteRegistered.mockResolvedValue(true)
    mocks.loadRegisteredRemoteComponent.mockImplementation(() => new Promise(() => {}))

    const loading = loadAgentPetComponent(createPet())
    const assertion = expect(loading).rejects.toBeInstanceOf(AgentPetLoadTimeoutError)
    await vi.advanceTimersByTimeAsync(AGENT_PET_LOAD_TIMEOUT)
    await assertion
  })

  it('shares one load between the store preload and the mounted pet, and retries after a failure', async () => {
    const component = { name: 'Pet' }
    mocks.ensureRemoteRegistered.mockResolvedValueOnce(false).mockResolvedValue(true)
    mocks.loadRegisteredRemoteComponent.mockResolvedValue(component)

    await expect(loadAgentPetComponent(createPet())).rejects.toThrow('PetPlugin')

    const first = loadAgentPetComponent(createPet())
    const second = loadAgentPetComponent(createPet({ key: 'other' }))
    expect(first).toBe(second)
    await expect(first).resolves.toBe(component)
    expect(mocks.loadRegisteredRemoteComponent).toHaveBeenCalledTimes(1)
  })
})
