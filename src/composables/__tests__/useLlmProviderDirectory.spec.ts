import {
  useLlmProviderDirectory,
  type LlmModel,
  type LlmProvider,
  type LlmProviderAuthSession,
} from '@/composables/useLlmProviderDirectory'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  manageLlmProvider: vi.fn(),
}))

vi.mock('@/api/manage', () => ({
  manageLlmProvider: (...args: unknown[]) => mocks.manageLlmProvider(...args),
}))

const wrappers: VueWrapper[] = []

function createProvider(id: string, overrides: Partial<LlmProvider> = {}): LlmProvider {
  return {
    id,
    name: id,
    runtime: 'openai_compatible',
    default_base_url: '',
    base_url_presets: [],
    base_url_editable: true,
    requires_base_url: false,
    supports_api_key: true,
    api_key_label: 'API Key',
    api_key_hint: '',
    supports_model_refresh: true,
    oauth_methods: [],
    auth_status: { connected: false },
    ...overrides,
  }
}

function createModel(id: string, overrides: Partial<LlmModel> = {}): LlmModel {
  return {
    id,
    name: id,
    ...overrides,
  }
}

function mountDirectory(
  initial: Partial<{
    provider: string
    apiKey: string
    baseUrl: string
    baseUrlPreset: string
    useProxy: boolean
    userAgent: string
    apiProtocol: string
    model: string
    maxContextTokens: number
    authConnected: boolean
  }> = {},
) {
  const provider = ref(initial.provider ?? '')
  const apiKey = ref(initial.apiKey ?? '')
  const baseUrl = ref(initial.baseUrl ?? '')
  const baseUrlPreset = ref(initial.baseUrlPreset ?? '')
  const useProxy = ref(initial.useProxy ?? false)
  const userAgent = ref(initial.userAgent ?? '')
  const apiProtocol = ref(initial.apiProtocol ?? 'auto')
  const model = ref(initial.model ?? '')
  const maxContextTokens = ref(initial.maxContextTokens ?? 0)
  const authConnected = ref(initial.authConnected ?? false)
  let directory!: ReturnType<typeof useLlmProviderDirectory>

  const wrapper = mount(
    defineComponent({
      setup() {
        directory = useLlmProviderDirectory({
          provider,
          apiKey,
          baseUrl,
          baseUrlPreset,
          useProxy,
          userAgent,
          apiProtocol,
          model,
          maxContextTokens,
          authConnected,
        })
        return () => h('div')
      },
    }),
  )
  wrappers.push(wrapper)

  return {
    wrapper,
    directory,
    provider,
    apiKey,
    baseUrl,
    baseUrlPreset,
    useProxy,
    userAgent,
    apiProtocol,
    model,
    maxContextTokens,
    authConnected,
  }
}

describe('useLlmProviderDirectory', () => {
  beforeEach(() => {
    mocks.manageLlmProvider.mockReset()
  })

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) {
      if (wrapper.exists()) wrapper.unmount()
    }
  })

  it('选择首个 Provider，并回填默认 URL、预设和认证状态', async () => {
    const provider = createProvider('openai', {
      default_base_url: 'https://api.example.com/v1',
      base_url_presets: [{ id: 'official', label: '官方', value: 'https://api.example.com/v1' }],
      auth_status: { connected: true, label: 'demo@example.com' },
    })
    mocks.manageLlmProvider.mockResolvedValue([provider])
    const state = mountDirectory({ provider: 'missing' })

    await expect(state.directory.loadProviders()).resolves.toEqual([provider])

    expect(mocks.manageLlmProvider).toHaveBeenCalledWith('', 'list_providers')
    expect(state.provider.value).toBe('openai')
    expect(state.baseUrl.value).toBe('https://api.example.com/v1')
    expect(state.baseUrlPreset.value).toBe('official')
    expect(state.authConnected.value).toBe(true)
    expect(state.directory.providerItems.value).toEqual([{ title: 'openai', value: 'openai' }])
    expect(state.directory.loadingProviders.value).toBe(false)
  })

  it('默认保留已有 URL 和预设，并可显式恢复 Provider 默认值', async () => {
    const provider = createProvider('openai', {
      default_base_url: 'https://default.example.com/v1',
      base_url_presets: [{ id: 'official', label: '官方', value: 'https://default.example.com/v1' }],
    })
    mocks.manageLlmProvider.mockResolvedValue([provider])
    const state = mountDirectory({
      provider: 'openai',
      baseUrl: 'https://custom.example.com/v1',
      baseUrlPreset: 'custom',
    })

    await state.directory.loadProviders()
    expect(state.baseUrl.value).toBe('https://custom.example.com/v1')
    expect(state.baseUrlPreset.value).toBe('custom')

    await state.directory.loadProviders(false)
    expect(state.baseUrl.value).toBe('https://default.example.com/v1')
    expect(state.baseUrlPreset.value).toBe('official')
  })

  it('将非数组 Provider 响应规整为空列表，并在失败后恢复 loading', async () => {
    const state = mountDirectory()
    mocks.manageLlmProvider.mockResolvedValueOnce({ providers: [] })

    await expect(state.directory.loadProviders()).resolves.toEqual([])
    expect(state.directory.providers.value).toEqual([])

    mocks.manageLlmProvider.mockRejectedValueOnce(new Error('provider unavailable'))
    await expect(state.directory.loadProviders()).rejects.toThrow('provider unavailable')
    expect(state.directory.loadingProviders.value).toBe(false)
  })

  it('切换 Provider 时重置从属凭据、模型和协议状态', () => {
    const state = mountDirectory({
      provider: 'oauth',
      apiKey: 'secret',
      baseUrl: 'https://custom.example.com',
      baseUrlPreset: 'custom',
      apiProtocol: 'responses',
      model: 'old-model',
      maxContextTokens: 256,
      authConnected: false,
    })
    state.directory.providers.value = [
      createProvider('oauth', {
        default_base_url: 'https://oauth.example.com',
        base_url_presets: [{ id: 'oauth-default', label: '默认', value: 'https://oauth.example.com' }],
        auth_status: { connected: true },
      }),
    ]
    state.directory.models.value = [createModel('old-model')]

    state.directory.handleProviderSelection()

    expect(state.baseUrl.value).toBe('https://oauth.example.com')
    expect(state.baseUrlPreset.value).toBe('oauth-default')
    expect(state.apiKey.value).toBe('')
    expect(state.apiProtocol.value).toBe('auto')
    expect(state.model.value).toBe('')
    expect(state.maxContextTokens.value).toBe(64)
    expect(state.authConnected.value).toBe(true)
    expect(state.directory.models.value).toEqual([])
  })

  it('同步 URL 预设值，并为界面生成带说明的选项', () => {
    const state = mountDirectory({ provider: 'openai' })
    state.directory.providers.value = [
      createProvider('openai', {
        base_url_presets: [{ id: 'proxy', label: '代理', value: 'https://proxy.example.com' }],
      }),
    ]

    expect(state.directory.baseUrlPresetItems.value).toEqual([
      {
        id: 'proxy',
        title: 'https://proxy.example.com',
        value: 'https://proxy.example.com',
        subtitle: '代理',
      },
    ])

    state.directory.setBaseUrlPreset(' proxy ', 'https://proxy.example.com')
    expect(state.baseUrlPreset.value).toBe('proxy')
    expect(state.baseUrl.value).toBe('https://proxy.example.com')

    state.directory.setBaseUrlPreset(undefined, '')
    expect(state.baseUrlPreset.value).toBe('')
    expect(state.baseUrl.value).toBe('')
  })

  it('按 Provider 能力、凭据和必填 URL 判断模型刷新资格', () => {
    const state = mountDirectory({ provider: 'custom' })
    state.directory.providers.value = [
      createProvider('custom', {
        requires_base_url: true,
        oauth_methods: [{ id: 'device', type: 'device', label: '设备授权' }],
        supports_api_key: false,
      }),
    ]

    expect(state.directory.showBaseUrlField.value).toBe(false)
    expect(state.directory.showApiKeyField.value).toBe(false)
    expect(state.directory.hasUsableCredential.value).toBe(false)
    expect(state.directory.canRefreshModels.value).toBe(false)

    state.apiKey.value = ' key '
    expect(state.directory.canRefreshModels.value).toBe(false)

    state.baseUrl.value = ' https://custom.example.com '
    expect(state.directory.canRefreshModels.value).toBe(true)

    state.apiKey.value = ''
    state.directory.providers.value[0] = {
      ...state.directory.providers.value[0],
      auth_status: { connected: true },
    }
    expect(state.directory.hasUsableCredential.value).toBe(true)
    expect(state.directory.canRefreshModels.value).toBe(true)

    state.directory.providers.value[0] = {
      ...state.directory.providers.value[0],
      supports_model_refresh: false,
    }
    expect(state.directory.canRefreshModels.value).toBe(false)
  })

  it('没有选中 Provider 时不请求模型', async () => {
    const state = mountDirectory()

    await expect(state.directory.loadModels(true)).resolves.toEqual([])
    expect(mocks.manageLlmProvider).not.toHaveBeenCalled()
    expect(state.directory.loadingModels.value).toBe(false)
  })

  it('规范化模型刷新 payload，选择首个模型并同步认证与上下文元数据', async () => {
    const state = mountDirectory({
      provider: ' openai ',
      apiKey: ' secret ',
      baseUrl: ' https://api.example.com/v1 ',
      baseUrlPreset: ' official ',
      useProxy: false,
      userAgent: ' MoviePilot-Test ',
      maxContextTokens: 64,
    })
    state.directory.providers.value = [createProvider('openai')]
    mocks.manageLlmProvider.mockResolvedValue({
      auth_status: { connected: true, label: 'demo@example.com' },
      models: [createModel('gpt-test', { context_tokens_k: 128 })],
    })

    await expect(state.directory.loadModels(true)).resolves.toEqual([
      createModel('gpt-test', { context_tokens_k: 128 }),
    ])

    expect(mocks.manageLlmProvider).toHaveBeenCalledWith('openai', 'list_models', {
      api_key: 'secret',
      base_url: 'https://api.example.com/v1',
      base_url_preset: 'official',
      use_proxy: false,
      user_agent: 'MoviePilot-Test',
      force_refresh: true,
    })
    expect(state.model.value).toBe('gpt-test')
    expect(state.maxContextTokens.value).toBe(128)
    expect(state.authConnected.value).toBe(true)
    expect(state.directory.selectedModel.value?.id).toBe('gpt-test')
    expect(state.directory.loadingModels.value).toBe(false)
  })

  it('保留仍存在的模型选择，并仅从匹配模型回填上下文', async () => {
    const state = mountDirectory({ provider: 'openai', model: 'model-b', maxContextTokens: 32 })
    state.directory.providers.value = [createProvider('openai')]
    mocks.manageLlmProvider.mockResolvedValue({
      models: [createModel('model-a', { context_tokens_k: 64 }), createModel('model-b', { context_tokens_k: 256 })],
    })

    await state.directory.loadModels()

    expect(state.model.value).toBe('model-b')
    expect(state.maxContextTokens.value).toBe(256)
    expect(state.directory.applyModelMetadata('missing')).toBeNull()
  })

  it('将非数组模型响应规整为空列表，并在失败后恢复 loading', async () => {
    const state = mountDirectory({ provider: 'openai' })
    state.directory.providers.value = [createProvider('openai')]
    mocks.manageLlmProvider.mockResolvedValueOnce({ models: { id: 'invalid' } })

    await expect(state.directory.loadModels()).resolves.toEqual([])
    expect(state.directory.models.value).toEqual([])

    mocks.manageLlmProvider.mockRejectedValueOnce(new Error('model unavailable'))
    await expect(state.directory.loadModels()).rejects.toThrow('model unavailable')
    expect(state.directory.loadingModels.value).toBe(false)
  })

  it('只为 OpenAI 兼容 runtime 或要求 Responses 的工具模型显示协议字段', async () => {
    const state = mountDirectory({ provider: 'openai' })
    state.directory.providers.value = [
      createProvider('openai'),
      createProvider('deepseek', { runtime: 'deepseek' }),
      createProvider('google', { runtime: 'google' }),
    ]

    expect(state.directory.showApiProtocolField.value).toBe(true)

    state.provider.value = 'deepseek'
    state.directory.models.value = [
      createModel('deepseek-v4-flash', {
        server_tools: [
          {
            id: 'web_search',
            required_api_protocol: 'responses',
            client_adapter: 'openai_responses',
          },
        ],
      }),
    ]
    state.model.value = 'deepseek-v4-flash'
    await nextTick()
    expect(state.directory.supportsBuiltinWebSearch.value).toBe(true)
    expect(state.directory.showApiProtocolField.value).toBe(true)

    state.provider.value = 'google'
    state.directory.models.value = [
      createModel('gemini-test', {
        server_tools: [{ id: 'web_search', required_api_protocol: 'native', client_adapter: 'google_native' }],
      }),
    ]
    state.model.value = 'gemini-test'
    await nextTick()
    expect(state.directory.supportsBuiltinWebSearch.value).toBe(true)
    expect(state.directory.showApiProtocolField.value).toBe(false)
  })

  it('没有 Provider 时拒绝开始 OAuth 授权', async () => {
    const state = mountDirectory()

    await expect(state.directory.startAuth('device')).rejects.toThrow('LLM provider is required')
    expect(mocks.manageLlmProvider).not.toHaveBeenCalled()
  })

  it('开始 OAuth 授权后打开页面、显示弹窗并安排首次轮询', async () => {
    vi.useFakeTimers()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const state = mountDirectory({ provider: 'openai' })
    state.directory.providers.value = [createProvider('openai')]
    const session: LlmProviderAuthSession = {
      session_id: 'session-1',
      provider_id: 'openai',
      flow_type: 'device',
      status: 'pending',
      authorize_url: 'https://auth.example.com/device',
    }
    mocks.manageLlmProvider.mockResolvedValue(session)

    await expect(state.directory.startAuth('device')).resolves.toEqual(session)

    expect(mocks.manageLlmProvider).toHaveBeenCalledWith('openai', 'start_auth', { method: 'device' })
    expect(open).toHaveBeenCalledWith(
      'https://auth.example.com/device',
      '_blank',
      'noopener,noreferrer,width=960,height=780',
    )
    expect(state.directory.authDialogVisible.value).toBe(true)
    expect(state.directory.authPopupBlocked.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('优先打开 authorize URL，并回退到 verification URL', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    const state = mountDirectory({ provider: 'openai' })

    state.directory.openAuthPage()
    expect(open).not.toHaveBeenCalled()

    state.directory.authSession.value = {
      session_id: 'session-1',
      provider_id: 'openai',
      flow_type: 'device',
      status: 'pending',
      verification_url: 'https://auth.example.com/verify',
    }
    state.directory.openAuthPage()

    expect(open).toHaveBeenCalledWith(
      'https://auth.example.com/verify',
      '_blank',
      'noopener,noreferrer,width=960,height=780',
    )
    expect(state.directory.authPopupBlocked.value).toBe(false)
  })

  it('待授权时合并会话状态，并按服务端间隔安排下一次静默轮询', async () => {
    vi.useFakeTimers()
    const state = mountDirectory({ provider: 'openai' })
    state.directory.authSession.value = {
      session_id: 'session-1',
      provider_id: 'openai',
      flow_type: 'device',
      status: 'pending',
      interval_seconds: 5,
    }
    mocks.manageLlmProvider.mockResolvedValue({ status: 'pending', interval_seconds: 0.5, message: 'waiting' })

    await expect(state.directory.pollAuthSession()).resolves.toMatchObject({
      status: 'pending',
      interval_seconds: 0.5,
      message: 'waiting',
    })

    expect(mocks.manageLlmProvider).toHaveBeenCalledWith(
      'openai',
      'poll_auth',
      { session_id: 'session-1' },
      { feedback: 'silent' },
    )
    expect(state.directory.authPolling.value).toBe(false)
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(999)
    expect(mocks.manageLlmProvider).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.manageLlmProvider).toHaveBeenNthCalledWith(
      2,
      'openai',
      'poll_auth',
      { session_id: 'session-1' },
      { feedback: 'silent' },
    )
  })

  it('授权成功后刷新 Provider 与模型，并将模型请求标记为强制刷新', async () => {
    const state = mountDirectory({ provider: 'openai' })
    state.directory.providers.value = [createProvider('openai')]
    state.directory.authSession.value = {
      session_id: 'session-1',
      provider_id: 'openai',
      flow_type: 'device',
      status: 'pending',
    }
    mocks.manageLlmProvider.mockImplementation((_provider: string, action: string) => {
      if (action === 'poll_auth') return Promise.resolve({ status: 'authorized' })
      if (action === 'list_providers') {
        return Promise.resolve([createProvider('openai', { auth_status: { connected: true } })])
      }
      if (action === 'list_models') return Promise.resolve({ models: [createModel('gpt-test')] })
      return Promise.reject(new Error(`unexpected action: ${action}`))
    })

    await expect(state.directory.pollAuthSession()).resolves.toMatchObject({ status: 'authorized' })

    expect(mocks.manageLlmProvider).toHaveBeenNthCalledWith(
      1,
      'openai',
      'poll_auth',
      { session_id: 'session-1' },
      { feedback: 'silent' },
    )
    expect(mocks.manageLlmProvider).toHaveBeenNthCalledWith(2, '', 'list_providers')
    expect(mocks.manageLlmProvider).toHaveBeenNthCalledWith(3, 'openai', 'list_models', {
      api_key: undefined,
      base_url: undefined,
      base_url_preset: undefined,
      use_proxy: false,
      user_agent: undefined,
      force_refresh: true,
    })
    expect(state.authConnected.value).toBe(true)
    expect(state.model.value).toBe('gpt-test')
    expect(state.directory.authPolling.value).toBe(false)
  })

  it('轮询失败后恢复 polling 状态且不安排下一次请求', async () => {
    vi.useFakeTimers()
    const state = mountDirectory({ provider: 'openai' })
    state.directory.authSession.value = {
      session_id: 'session-1',
      provider_id: 'openai',
      flow_type: 'device',
      status: 'pending',
    }
    mocks.manageLlmProvider.mockRejectedValue(new Error('poll failed'))

    await expect(state.directory.pollAuthSession()).rejects.toThrow('poll failed')
    expect(state.directory.authPolling.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('断开认证后刷新 Provider，并在没有 Provider 时直接返回', async () => {
    const emptyState = mountDirectory()
    await expect(emptyState.directory.disconnectAuth()).resolves.toBe(false)

    const state = mountDirectory({ provider: 'openai' })
    state.directory.providers.value = [createProvider('openai', { auth_status: { connected: true } })]
    mocks.manageLlmProvider.mockImplementation((_provider: string, action: string) => {
      if (action === 'disconnect') return Promise.resolve(undefined)
      if (action === 'list_providers') return Promise.resolve([createProvider('openai')])
      return Promise.reject(new Error(`unexpected action: ${action}`))
    })

    await expect(state.directory.disconnectAuth()).resolves.toBe(true)
    expect(mocks.manageLlmProvider).toHaveBeenNthCalledWith(1, 'openai', 'disconnect')
    expect(mocks.manageLlmProvider).toHaveBeenNthCalledWith(2, '', 'list_providers')
    expect(state.authConnected.value).toBe(false)
  })

  it('关闭授权弹窗和组件卸载都会清理轮询 timer', async () => {
    vi.useFakeTimers()
    const state = mountDirectory({ provider: 'openai' })
    state.directory.providers.value = [createProvider('openai')]
    mocks.manageLlmProvider.mockResolvedValue({
      session_id: 'session-1',
      provider_id: 'openai',
      flow_type: 'device',
      status: 'pending',
    })

    await state.directory.startAuth('device')
    expect(vi.getTimerCount()).toBe(1)

    state.directory.closeAuthDialog()
    expect(state.directory.authDialogVisible.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)

    await state.directory.startAuth('device')
    expect(vi.getTimerCount()).toBe(1)
    state.wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
