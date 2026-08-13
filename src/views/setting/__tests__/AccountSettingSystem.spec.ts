import AccountSettingSystem from '@/views/setting/AccountSettingSystem.vue'
import type { LlmModel, LlmProvider, LlmProviderAuthSession } from '@/composables/useLlmProviderDirectory'
import { useGlobalSettingsStore } from '@/stores'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  useLlmProviderDirectory: vi.fn(),
  useSilentSettingRefresh: vi.fn(),
}))

vi.mock('colorthief', () => ({
  default: class ColorThief {
    /** 返回稳定测试色，避免设置页子组件加载原生图像依赖。 */
    getColor() {
      return [40, 169, 225]
    }
  },
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: mocks.apiGet,
    post: mocks.apiPost,
  }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  }),
}))

vi.mock('@/composables/useLlmProviderDirectory', () => ({
  useLlmProviderDirectory: mocks.useLlmProviderDirectory,
}))

vi.mock('@/composables/useSilentSettingRefresh', () => ({
  useSilentSettingRefresh: mocks.useSilentSettingRefresh,
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: mocks.openSharedDialog,
}))

/** 构造系统设置页所需的最小 LLM 目录状态。 */
function createLlmDirectoryState(overrides: Record<string, unknown> = {}) {
  return {
    providerItems: ref([]),
    baseUrlPresetItems: ref([]),
    models: ref([]),
    selectedProvider: ref<LlmProvider | null>(null),
    selectedModel: ref<LlmModel | null>(null),
    loadingProviders: ref(false),
    loadingModels: ref(false),
    providerConnected: ref(false),
    showBaseUrlField: ref(false),
    showApiKeyField: ref(false),
    showApiProtocolField: ref(false),
    supportsBuiltinWebSearch: ref(false),
    canRefreshModels: ref(false),
    setBaseUrlPreset: vi.fn(),
    authDialogVisible: ref(false),
    authPolling: ref(false),
    authPopupBlocked: ref(false),
    authSession: ref<LlmProviderAuthSession | null>(null),
    handleProviderSelection: vi.fn(),
    applyModelMetadata: vi.fn(),
    loadProviders: vi.fn().mockResolvedValue(undefined),
    loadModels: vi.fn(),
    openAuthPage: vi.fn(),
    startAuth: vi.fn(),
    pollAuthSession: vi.fn(),
    disconnectAuth: vi.fn(),
    closeAuthDialog: vi.fn(),
    ...overrides,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function createDialogController() {
  return { close: vi.fn(), id: 1, updateProps: vi.fn() }
}

let systemEnv: Record<string, unknown>

const BASIC_SETTING_KEYS = [
  'AI_AGENT_ENABLE',
  'AI_AGENT_GLOBAL',
  'AI_AGENT_HIDE_ENTRY',
  'AI_AGENT_JOB_INTERVAL',
  'AI_AGENT_RETRY_TRANSFER',
  'AI_AGENT_VERBOSE',
  'AI_RECOMMEND_ENABLED',
  'AI_RECOMMEND_MAX_ITEMS',
  'AI_RECOMMEND_USER_PREFERENCE',
  'API_TOKEN',
  'APP_DOMAIN',
  'AUDIO_INPUT_API_KEY',
  'AUDIO_INPUT_BASE_URL',
  'AUDIO_INPUT_LANGUAGE',
  'AUDIO_INPUT_MODEL',
  'AUDIO_INPUT_PROVIDER',
  'AUDIO_OUTPUT_API_KEY',
  'AUDIO_OUTPUT_BASE_URL',
  'AUDIO_OUTPUT_INCLUDE_TEXT',
  'AUDIO_OUTPUT_MODEL',
  'AUDIO_OUTPUT_PROVIDER',
  'AUDIO_OUTPUT_VOICE',
  'CUSTOMIZE_WALLPAPER_API_URL',
  'DB_TYPE',
  'GITHUB_TOKEN',
  'LLM_API_KEY',
  'LLM_API_PROTOCOL',
  'LLM_BASE_URL',
  'LLM_BASE_URL_PRESET',
  'LLM_MAX_CONTEXT_TOKENS',
  'LLM_MODEL',
  'LLM_PROVIDER',
  'LLM_SUPPORT_AUDIO_INPUT',
  'LLM_SUPPORT_AUDIO_OUTPUT',
  'LLM_SUPPORT_IMAGE_INPUT',
  'LLM_TEMPERATURE',
  'LLM_THINKING_LEVEL',
  'LLM_USER_AGENT',
  'LLM_USE_PROXY',
  'LLM_WEB_SEARCH_MODE',
  'WALLPAPER',
]

function mockLoadedSettings() {
  mocks.apiGet.mockImplementation((endpoint: string) => {
    if (endpoint === 'system/env') return { success: true, data: systemEnv }
    if (endpoint === 'message/agent/mcp/servers') return { success: true, data: { servers: [] } }
    if (
      endpoint === 'system/setting/Downloaders' ||
      endpoint === 'system/setting/MediaServers' ||
      endpoint === 'system/setting/ScrapingSwitchs'
    ) {
      return { success: true, data: { value: [] } }
    }
    throw new Error(`Unexpected GET ${endpoint}`)
  })
}

function enableLlmSettings() {
  systemEnv = {
    ...systemEnv,
    AI_AGENT_ENABLE: true,
    LLM_PROVIDER: '  openai  ',
    LLM_MODEL: '  gpt-5  ',
    LLM_THINKING_LEVEL: 'high',
    LLM_API_PROTOCOL: 'responses',
    LLM_WEB_SEARCH_MODE: 'builtin',
    LLM_API_KEY: '  secret-key  ',
    LLM_BASE_URL: '  https://llm.example/v1  ',
    LLM_USE_PROXY: false,
    LLM_BASE_URL_PRESET: '  custom  ',
    LLM_USER_AGENT: '  MoviePilot-Test  ',
    LLM_TEMPERATURE: 0.7,
  }
  mocks.useLlmProviderDirectory.mockReturnValue(
    createLlmDirectoryState({
      showApiKeyField: ref(true),
      showBaseUrlField: ref(true),
      showApiProtocolField: ref(true),
    }),
  )
}

async function renderSettings(props: { active?: boolean } = {}) {
  return renderWithProviders(AccountSettingSystem, {
    props,
    global: { stubs: { VDialogCloseBtn: true } },
    stubActions: false,
  })
}

function getBasicCard() {
  const card = screen.getByText('基础设置').closest('.v-card')
  expect(card).not.toBeNull()
  return within(card as HTMLElement)
}

async function expandLlmSettings() {
  await fireEvent.click(screen.getByRole('button', { name: '展开' }))
  return screen.findByRole('button', { name: '测试调用' })
}

describe('AccountSettingSystem', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.toastError.mockReset()
    mocks.toastInfo.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.useLlmProviderDirectory.mockReset()
    mocks.useSilentSettingRefresh.mockReset()
    systemEnv = {
      ACOUSTID_API_KEY: 'b1auxfOzAg',
      APP_DOMAIN: 'https://moviepilot.example',
      API_TOKEN: '1234567890abcdef',
      DB_TYPE: 'sqlite',
      RUST_ACCEL_AVAILABLE: false,
    }
    mocks.useLlmProviderDirectory.mockReturnValue(createLlmDirectoryState())
    mocks.openSharedDialog.mockImplementation(() => createDialogController())
    mocks.apiPost.mockResolvedValue({ success: true })
    mockLoadedSettings()
  })

  it('loads and saves the AcoustID key from advanced media settings', async () => {
    await renderSettings()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('system/env'))

    await fireEvent.click(screen.getByRole('button', { name: /高级设置/ }))
    await fireEvent.click(await screen.findByRole('tab', { name: '媒体' }))

    const dialog = within(screen.getByRole('dialog'))
    const input = await dialog.findByLabelText('AcoustID API Key')
    expect(input).toHaveValue('b1auxfOzAg')
    await fireEvent.update(input, 'custom-acoustid-key')
    await fireEvent.click(dialog.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith(
        'system/env',
        expect.objectContaining({ ACOUSTID_API_KEY: 'custom-acoustid-key' }),
      )
    })
  })

  it('loads declared basic values, preserves defaults, and follows active refresh state', async () => {
    const { rerender } = await renderSettings()

    expect(await screen.findByLabelText('访问域名')).toHaveValue('https://moviepilot.example')
    expect(screen.getByLabelText('API令牌')).toHaveValue('1234567890abcdef')
    expect(screen.getByLabelText('背景壁纸')).toHaveValue('tmdb')

    const refreshOptions = mocks.useSilentSettingRefresh.mock.calls[0]?.[1]
    expect(refreshOptions.active.value).toBe(true)
    await rerender({ active: false })
    expect(refreshOptions.active.value).toBe(false)
  })

  it('saves the current basic payload and updates the global settings store', async () => {
    const { pinia } = await renderSettings()
    await screen.findByDisplayValue('https://moviepilot.example')
    await fireEvent.update(screen.getByLabelText('访问域名'), 'https://new.example')

    await fireEvent.click(getBasicCard().getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith('system/env', expect.any(Object)))
    const payload = mocks.apiPost.mock.calls.find(call => call[0] === 'system/env')?.[1]
    expect(Object.keys(payload).sort()).toEqual([...BASIC_SETTING_KEYS].sort())
    expect(payload).toEqual(
      expect.objectContaining({
        AI_AGENT_ENABLE: false,
        AI_RECOMMEND_MAX_ITEMS: 50,
        APP_DOMAIN: 'https://new.example',
        API_TOKEN: '1234567890abcdef',
        AUDIO_OUTPUT_MODEL: 'gpt-4o-mini-tts',
        DB_TYPE: 'sqlite',
        GITHUB_TOKEN: null,
        LLM_TEMPERATURE: 0.3,
        WALLPAPER: 'tmdb',
      }),
    )
    expect(useGlobalSettingsStore(pinia).getData).toEqual(
      expect.objectContaining({ APP_DOMAIN: 'https://new.example' }),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('基础设置保存成功')
  })

  it('recovers after business and HTTP failures while preserving the edited value', async () => {
    mocks.apiPost
      .mockResolvedValueOnce({ success: false, message: 'save denied' })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ success: true })
    await renderSettings()
    await screen.findByDisplayValue('https://moviepilot.example')
    const domain = screen.getByLabelText('访问域名')
    const save = getBasicCard().getByRole('button', { name: '保存' })
    await fireEvent.update(domain, 'https://kept.example')

    await fireEvent.click(save)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('设置保存失败：请求失败！'))
    expect(domain).toHaveValue('https://kept.example')
    expect(save).toBeEnabled()

    await fireEvent.click(save)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(2))
    expect(domain).toHaveValue('https://kept.example')
    expect(mocks.toastSuccess).not.toHaveBeenCalled()

    await fireEvent.click(save)
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('基础设置保存成功'))
  })

  it('posts a normalized LLM snapshot and reports business failure before a successful retry', async () => {
    enableLlmSettings()
    mocks.apiPost
      .mockResolvedValueOnce({ success: false, message: 'provider rejected' })
      .mockResolvedValueOnce({ success: true })
    await renderSettings()
    const testLlm = await expandLlmSettings()

    await fireEvent.click(testLlm)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('LLM 调用测试失败：provider rejected'))
    const firstCall = mocks.apiPost.mock.calls[0]
    expect(firstCall?.[0]).toBe('llm/test')
    expect(firstCall?.[1]).toEqual({
      api_key: 'secret-key',
      api_protocol: 'responses',
      base_url: 'https://llm.example/v1',
      base_url_preset: 'custom',
      enabled: true,
      model: 'gpt-5',
      provider: 'openai',
      thinking_level: 'high',
      temperature: 0.7,
      use_proxy: false,
      user_agent: 'MoviePilot-Test',
      web_search_mode: 'builtin',
    })
    expect(firstCall?.[2]).toEqual({ signal: expect.any(AbortSignal) })
    expect(testLlm).toBeEnabled()

    await fireEvent.click(testLlm)
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('LLM 调用测试成功'))
  })

  it('aborts stale LLM tests and ignores both late success and late failure', async () => {
    enableLlmSettings()
    const lateSuccess = createDeferred<{ success: boolean }>()
    const lateFailure = createDeferred<{ success: boolean }>()
    mocks.apiPost
      .mockImplementationOnce(() => lateSuccess.promise)
      .mockImplementationOnce(() => lateFailure.promise)
      .mockResolvedValueOnce({ success: true })
    await renderSettings()
    const testLlm = await expandLlmSettings()
    const apiKey = screen.getByLabelText('LLM API密钥')
    const save = getBasicCard().getByRole('button', { name: '保存' })
    const refresh = mocks.useSilentSettingRefresh.mock.calls[0]?.[0] as () => Promise<void>
    mocks.apiGet.mockClear()

    await fireEvent.click(testLlm)
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(1))
    expect(save).toBeDisabled()
    await refresh()
    expect(mocks.apiGet).not.toHaveBeenCalled()
    const firstSignal = (mocks.apiPost.mock.calls[0]?.[2] as { signal: AbortSignal }).signal
    await fireEvent.update(apiKey, 'changed-key')
    await waitFor(() => expect(firstSignal.aborted).toBe(true))
    lateSuccess.resolve({ success: true })
    await nextTick()
    expect(apiKey).toHaveValue('changed-key')
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()

    await fireEvent.click(testLlm)
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(2))
    const secondSignal = (mocks.apiPost.mock.calls[1]?.[2] as { signal: AbortSignal }).signal
    await fireEvent.update(apiKey, 'latest-key')
    await waitFor(() => expect(secondSignal.aborted).toBe(true))
    lateFailure.reject(new Error('late failure'))
    await nextTick()
    expect(apiKey).toHaveValue('latest-key')
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()

    await fireEvent.click(testLlm)
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('LLM 调用测试成功'))
  })

  it('suppresses silent refresh while basic settings are being saved', async () => {
    enableLlmSettings()
    const pendingSave = createDeferred<{ success: boolean }>()
    mocks.apiPost.mockImplementationOnce(() => pendingSave.promise)
    await renderSettings()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('system/env'))
    const testLlm = await expandLlmSettings()
    const refresh = mocks.useSilentSettingRefresh.mock.calls[0]?.[0] as () => Promise<void>
    mocks.apiGet.mockClear()

    await fireEvent.click(getBasicCard().getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith('system/env', expect.any(Object)))
    expect(testLlm).toBeDisabled()
    await refresh()
    expect(mocks.apiGet).not.toHaveBeenCalled()

    pendingSave.resolve({ success: true })
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('基础设置保存成功'))
    expect(testLlm).toBeEnabled()
    await refresh()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('system/env'))
  })

  it('opens provider auth after a retry and routes shared dialog events', async () => {
    enableLlmSettings()
    const authDialogVisible = ref(false)
    const authPolling = ref(false)
    const authPopupBlocked = ref(false)
    const authSession = ref<LlmProviderAuthSession | null>(null)
    const openAuthPage = vi.fn()
    const pollAuthSession = vi.fn()
    const closeAuthDialog = vi.fn()
    const startAuth = vi
      .fn()
      .mockRejectedValueOnce(new Error('auth failed'))
      .mockImplementationOnce(async () => {
        authSession.value = {
          flow_type: 'device_code',
          provider_id: 'openai',
          session_id: 'session-1',
          status: 'pending',
        }
        authDialogVisible.value = true
      })
    mocks.useLlmProviderDirectory.mockReturnValue(
      createLlmDirectoryState({
        authDialogVisible,
        authPolling,
        authPopupBlocked,
        authSession,
        closeAuthDialog,
        openAuthPage,
        pollAuthSession,
        selectedProvider: ref({
          api_key_hint: '',
          api_key_label: 'API key',
          auth_status: { connected: false },
          base_url_editable: true,
          default_base_url: 'https://llm.example/v1',
          id: 'openai',
          name: 'OpenAI',
          oauth_methods: [{ id: 'device', label: '使用账号登录', type: 'device_code' }],
          requires_base_url: false,
          runtime: 'openai',
          supports_api_key: true,
          supports_model_refresh: true,
        }),
        showApiKeyField: ref(true),
        startAuth,
      }),
    )
    const controller = createDialogController()
    mocks.openSharedDialog.mockReturnValue(controller)
    await renderSettings()
    await expandLlmSettings()
    const start = screen.getByRole('button', { name: '使用账号登录' })

    await fireEvent.click(start)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('auth failed'))
    expect(startAuth).toHaveBeenNthCalledWith(1, 'device')
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()

    await fireEvent.click(start)
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    expect(startAuth).toHaveBeenNthCalledWith(2, 'device')
    const [, dialogProps, dialogEvents, dialogOptions] = mocks.openSharedDialog.mock.calls[0]
    expect(dialogProps).toEqual({
      authSession: expect.objectContaining({ session_id: 'session-1' }),
      polling: false,
      popupBlocked: false,
    })
    expect(dialogOptions).toEqual({ closeOn: ['close', 'update:modelValue'] })

    dialogEvents.openAuthPage()
    dialogEvents.poll()
    expect(openAuthPage).toHaveBeenCalledOnce()
    expect(pollAuthSession).toHaveBeenCalledOnce()

    authPolling.value = true
    authPopupBlocked.value = true
    await nextTick()
    expect(controller.updateProps).toHaveBeenLastCalledWith({
      authSession: expect.objectContaining({ session_id: 'session-1' }),
      polling: true,
      popupBlocked: true,
    })

    dialogEvents['update:modelValue'](false)
    expect(closeAuthDialog).toHaveBeenCalledOnce()
  })
})
