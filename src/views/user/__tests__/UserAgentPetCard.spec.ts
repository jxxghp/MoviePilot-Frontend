import UserAgentPetCard from '@/views/user/UserAgentPetCard.vue'
import { renderWithProviders } from '@tests/support/render'
import { screen, within } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentPetDeclaration } from '@/types/agentHost'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: { get: (...args: unknown[]) => mocks.apiGet(...args), post: (...args: unknown[]) => mocks.apiPost(...args) },
  getApiErrorMessage: () => undefined,
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
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
    bubbles: 'host',
    random_actions: null,
    preview_url: 'https://cdn.example/preview.png',
    avatar_url: 'https://cdn.example/avatar.png',
    ...overrides,
  }
}

function mockBackend(pets: AgentPetDeclaration[], selection: unknown = null) {
  mocks.apiGet.mockImplementation(async (path: string) => {
    if (path === 'plugin/agent_pets') return pets
    if (path === 'user/config/AgentPet') return { value: selection }
    return null
  })
}

/** 按卡片标题找到对应的选项卡片。 */
async function findOption(title: string) {
  const radios = await screen.findAllByRole('radio')
  const option = radios.find(radio => within(radio).queryByText(title))
  if (!option) throw new Error(`option ${title} not found`)
  return option
}

describe('UserAgentPetCard', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
  })

  it('renders the real builtin robot for the builtin option and for a builtin system default', async () => {
    mockBackend([createPet()])

    await renderWithProviders(UserAgentPetCard, { initialState: { globalSettings: { data: {} } }, stubActions: false })

    const followDefault = await findOption('跟随系统默认')
    const builtin = await findOption('内置机器人')
    expect(followDefault.querySelector('.agent-assistant-fab__bot')).not.toBeNull()
    expect(within(followDefault).getByText('当前默认：内置机器人')).toBeInTheDocument()
    expect(within(followDefault).getByText('管理员更换默认形象后会自动跟随')).toBeInTheDocument()
    expect(builtin.querySelector('.agent-assistant-fab__bot')).not.toBeNull()
    expect(within(builtin).getByText('固定使用，不随系统默认变化')).toBeInTheDocument()
    expect(builtin.querySelector('.v-icon')).toBeNull()
  })

  it('previews the plugin avatar that the system default actually resolves to', async () => {
    mockBackend([createPet()])

    await renderWithProviders(UserAgentPetCard, {
      initialState: { globalSettings: { data: { AI_AGENT_PET: 'PetPlugin:girl' } } },
      stubActions: false,
    })

    const followDefault = await findOption('跟随系统默认')
    expect(within(followDefault).getByText('当前默认：小映')).toBeInTheDocument()
    expect(followDefault.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/preview.png')
    expect(followDefault.querySelector('.agent-assistant-fab__bot')).toBeNull()
  })
})
