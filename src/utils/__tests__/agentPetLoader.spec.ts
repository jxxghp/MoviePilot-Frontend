import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentPetDeclaration } from '@/types/agentHost'
import {
  AGENT_PET_LOAD_TIMEOUT,
  AgentPetLoadTimeoutError,
  loadAgentPetComponent,
  resetAgentPetComponentLoads,
} from '@/utils/agentPetLoader'

const mocks = vi.hoisted(() => ({
  ensureRemoteRegistered: vi.fn(),
  loadRegisteredRemoteComponent: vi.fn(),
}))

vi.mock('@/utils/federationLoader', () => ({
  ensureRemoteRegistered: (...args: unknown[]) => mocks.ensureRemoteRegistered(...args),
  loadRegisteredRemoteComponent: (...args: unknown[]) => mocks.loadRegisteredRemoteComponent(...args),
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
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not count remote discovery toward the 8 second load timeout', async () => {
    const component = { name: 'Pet' }
    mocks.ensureRemoteRegistered.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(true), AGENT_PET_LOAD_TIMEOUT + 2000)),
    )
    mocks.loadRegisteredRemoteComponent.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(component), 500)),
    )

    const loading = loadAgentPetComponent(createPet())
    await vi.advanceTimersByTimeAsync(AGENT_PET_LOAD_TIMEOUT + 2500)

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
