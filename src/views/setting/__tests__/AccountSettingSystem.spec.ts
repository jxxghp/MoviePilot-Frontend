import AccountSettingSystem from '@/views/setting/AccountSettingSystem.vue'
import type { LlmModel, LlmProvider, LlmProviderAuthSession } from '@/composables/useLlmProviderDirectory'
import { useGlobalSettingsStore } from '@/stores'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, nextTick, ref } from 'vue'
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

vi.mock('@/components/cards/DownloaderCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'DownloaderCardStub',
      props: {
        downloader: { type: Object, required: true },
        downloaders: { type: Array, required: true },
        allowRefresh: { type: Boolean, default: true },
      },
      emits: ['change', 'close'],
      template: `
        <section :aria-label="'downloader-' + downloader.name">
          <span>{{ downloader.name }} / {{ downloader.type }} / {{ allowRefresh }}</span>
          <button
            :aria-label="'change-' + downloader.name"
            @click="$emit('change', { ...downloader, name: downloader.name + '-edited', enabled: true }, downloader.name)"
          >change</button>
          <button :aria-label="'remove-' + downloader.name" @click="$emit('close')">remove</button>
        </section>
      `,
    }),
  }
})

vi.mock('@/components/cards/MediaServerCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'MediaServerCardStub',
      props: {
        mediaserver: { type: Object, required: true },
        mediaservers: { type: Array, required: true },
        defaultSyncInterval: { type: Number, default: undefined },
      },
      emits: ['change', 'close'],
      template: `
        <section :aria-label="'mediaserver-' + mediaserver.name">
          <span>{{ mediaserver.name }} / {{ mediaserver.type }} / {{ defaultSyncInterval ?? 'none' }}</span>
          <button
            :aria-label="'change-' + mediaserver.name"
            @click="$emit('change', { ...mediaserver, name: mediaserver.name + '-edited', enabled: true }, mediaserver.name)"
          >change</button>
          <button :aria-label="'remove-' + mediaserver.name" @click="$emit('close')">remove</button>
        </section>
      `,
    }),
  }
})

vi.mock('vuedraggable', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'DraggableStub',
      props: { modelValue: { type: Array, default: () => [] } },
      emits: ['update:modelValue'],
      setup(props, { emit, slots }) {
        return () => {
          const items = props.modelValue as Array<{ name?: string }>
          return h('div', [
            h(
              'button',
              {
                'aria-label': `reverse-${items[0]?.name ?? 'empty'}`,
                onClick: () => emit('update:modelValue', [...items].reverse()),
              },
              'reverse',
            ),
            ...items.map(element => slots.item?.({ element })),
          ])
        }
      },
    }),
  }
})

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

const downloadersFixture = [
  { name: '下载器1', type: 'qbittorrent', default: false, enabled: true, config: { host: 'qb.example' } },
  { name: '下载器3', type: 'transmission', default: false, enabled: false, config: { host: 'tr.example' } },
]

const mediaServersFixture = [
  { name: '服务器1', type: 'emby', enabled: true, config: { host: 'emby.example' } },
  { name: '服务器3', type: 'plex', enabled: false, config: { host: 'plex.example' } },
]

let downloadersSetting: Array<Record<string, unknown>>
let mediaServersSetting: Array<Record<string, unknown>>
let scrapingSetting: Record<string, boolean | string>

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
    if (endpoint === 'system/setting/Downloaders')
      return { success: true, data: { value: structuredClone(downloadersSetting) } }
    if (endpoint === 'system/setting/MediaServers')
      return { success: true, data: { value: structuredClone(mediaServersSetting) } }
    if (endpoint === 'system/setting/ScrapingSwitchs')
      return { success: true, data: { value: structuredClone(scrapingSetting) } }
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

/** 为异步表单字段提供可真实回写 v-model 的测试边界。 */
function createModelFieldStub(name: string) {
  return defineComponent({
    name,
    inheritAttrs: false,
    props: {
      label: { type: String, default: '' },
      modelValue: { default: '' },
      placeholder: { type: String, default: '' },
      storage: { type: String, default: undefined },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('label', [
          h('span', props.label),
          h('input', {
            'aria-label': props.label,
            'data-storage': props.storage,
            placeholder: props.placeholder,
            value: props.modelValue ?? '',
            onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
          }),
        ])
    },
  })
}

/** 保留选择值契约，排除 Vuetify 菜单动画和定位对设置业务测试的影响。 */
const SelectFieldStub = defineComponent({
  name: 'VSelectStub',
  props: {
    disabled: { type: Boolean, default: false },
    itemTitle: { type: String, default: 'title' },
    itemValue: { type: String, default: 'value' },
    items: { type: Array, default: () => [] },
    label: { type: String, default: '' },
    modelValue: { default: null },
    multiple: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const itemValue = (item: unknown) => {
      if (!item || typeof item !== 'object') return item
      return (item as Record<string, unknown>)[props.itemValue]
    }
    const itemTitle = (item: unknown) => {
      if (!item || typeof item !== 'object') return String(item ?? '')
      return String((item as Record<string, unknown>)[props.itemTitle] ?? '')
    }
    const findItemValue = (value: string) => props.items.map(itemValue).find(item => String(item) === value)

    return () =>
      h('label', [
        h('span', props.label),
        h(
          'select',
          {
            'aria-label': props.label,
            disabled: props.disabled,
            multiple: props.multiple,
            onChange: (event: Event) => {
              const select = event.target as HTMLSelectElement
              if (props.multiple) {
                const selectedValues = Array.from(select.selectedOptions, option => findItemValue(option.value))
                emit('update:modelValue', selectedValues)
                return
              }
              emit('update:modelValue', findItemValue(select.value))
            },
            ...(props.multiple ? {} : { value: String(props.modelValue ?? '') }),
          },
          props.items.map(item => {
            const value = itemValue(item)
            const selected = props.multiple
              ? (props.modelValue as unknown[] | null)?.some(modelValue => String(modelValue) === String(value))
              : String(props.modelValue ?? '') === String(value)
            return h('option', { selected, value: String(value) }, itemTitle(item))
          }),
        ),
      ])
  },
})

const CronFieldStub = createModelFieldStub('VCronFieldStub')
const PathFieldStub = createModelFieldStub('VPathFieldStub')

async function renderSettings(props: { active?: boolean } = {}) {
  return renderWithProviders(AccountSettingSystem, {
    props,
    global: {
      components: { VCronField: CronFieldStub, VPathField: PathFieldStub },
      stubs: { VDialogCloseBtn: true, VSelect: SelectFieldStub },
    },
    stubActions: false,
  })
}

function getBasicCard() {
  const card = screen.getByText('基础设置').closest('.v-card')
  expect(card).not.toBeNull()
  return within(card as HTMLElement)
}

function getSettingsCard(title: string) {
  const card = screen.getByText(title, { selector: '.v-card-title' }).closest('.v-card')
  expect(card).not.toBeNull()
  return within(card as HTMLElement)
}

async function openAdvancedTab(tab: string) {
  await fireEvent.click(screen.getByRole('button', { name: /高级设置/ }))
  await fireEvent.click(await screen.findByRole('tab', { name: tab }))
  return within(screen.getByRole('dialog'))
}

async function selectOption(label: string, option: string) {
  const user = userEvent.setup()
  const control = screen.getByLabelText(label)
  if (control instanceof HTMLSelectElement) {
    if (control.multiple) {
      const nextOption = within(control).getByRole('option', { name: option }) as HTMLOptionElement
      await user.selectOptions(control, nextOption.value)
    } else {
      await user.selectOptions(control, option)
    }
    return
  }
  await user.click(control)
  await user.click(await screen.findByRole('option', { name: option }))
}

function findPost(path: string) {
  return mocks.apiPost.mock.calls.find(call => call[0] === path)
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
    downloadersSetting = structuredClone(downloadersFixture)
    mediaServersSetting = structuredClone(mediaServersFixture)
    scrapingSetting = {}
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
    expect(firstCall?.[0]).toBe('llm/manage')
    expect(firstCall?.[1]).toEqual({
      target: 'openai',
      action: 'test',
      params: {
        api_key: 'secret-key',
        api_protocol: 'responses',
        base_url: 'https://llm.example/v1',
        base_url_preset: 'custom',
        enabled: true,
        model: 'gpt-5',
        thinking_level: 'high',
        temperature: 0.7,
        use_proxy: false,
        user_agent: 'MoviePilot-Test',
        web_search_mode: 'builtin',
      },
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

  it('round-trips the user-editable application and wallpaper settings', async () => {
    await renderSettings()
    await screen.findByDisplayValue('https://moviepilot.example')
    await fireEvent.update(screen.getByLabelText('Github Token'), 'github-token')
    await selectOption('背景壁纸', '自定义')
    await fireEvent.update(screen.getByLabelText('自定义壁纸API地址'), 'https://wallpaper.example/api')

    await fireEvent.click(getBasicCard().getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('基础设置保存成功'))
    expect(findPost('system/env')?.[1]).toEqual(
      expect.objectContaining({
        CUSTOMIZE_WALLPAPER_API_URL: 'https://wallpaper.example/api',
        GITHUB_TOKEN: 'github-token',
        WALLPAPER: 'customize',
      }),
    )
  })

  it('round-trips the user-editable LLM connection and inference settings', async () => {
    const handleProviderSelection = vi.fn()
    const applyModelMetadata = vi.fn()
    const loadModels = vi.fn().mockResolvedValue(undefined)
    const setBaseUrlPreset = vi.fn()
    systemEnv = {
      ...systemEnv,
      AI_AGENT_ENABLE: true,
      LLM_API_KEY: 'old-key',
      LLM_PROVIDER: 'deepseek',
      LLM_MODEL: 'deepseek-chat',
      LLM_USE_PROXY: true,
    }
    mocks.useLlmProviderDirectory.mockReturnValue(
      createLlmDirectoryState({
        applyModelMetadata,
        canRefreshModels: ref(true),
        handleProviderSelection,
        loadModels,
        models: ref([{ id: 'gpt-5', name: 'GPT-5' }]),
        providerItems: ref([{ title: 'OpenAI', value: 'openai' }]),
        setBaseUrlPreset,
        showApiKeyField: ref(true),
        showApiProtocolField: ref(true),
        showBaseUrlField: ref(true),
      }),
    )
    await renderSettings()
    await expandLlmSettings()
    await selectOption('LLM提供商', 'OpenAI')
    await waitFor(() => expect(handleProviderSelection).toHaveBeenCalledWith(true))
    await selectOption('API 协议', 'Responses')
    await fireEvent.update(screen.getByLabelText('LLM基础URL'), 'https://llm.example/v1')
    expect(setBaseUrlPreset).toHaveBeenLastCalledWith('', 'https://llm.example/v1')
    await fireEvent.update(screen.getByLabelText('LLM API密钥'), 'new-key')
    await selectOption('LLM模型名称', 'GPT-5')
    expect(applyModelMetadata).toHaveBeenCalled()
    await selectOption('联网搜索', '关闭联网搜索')
    await fireEvent.update(screen.getByLabelText('LLM 最大上下文 Token 数量 (K)'), '256')
    await fireEvent.update(screen.getByLabelText('温度参数'), '0.6')
    await fireEvent.update(screen.getByLabelText('User-Agent'), 'MoviePilot-Test')
    await selectOption('思考模式 / 深度', '高 (high)')
    for (const label of ['使用系统代理', '模型支持图片输入']) {
      await fireEvent.click(screen.getByLabelText(label))
    }

    await fireEvent.click(getBasicCard().getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('基础设置保存成功'))
    expect(findPost('system/env')?.[1]).toEqual(
      expect.objectContaining({
        LLM_API_KEY: 'new-key',
        LLM_API_PROTOCOL: 'responses',
        LLM_BASE_URL: 'https://api.deepseek.com',
        LLM_MAX_CONTEXT_TOKENS: 256,
        LLM_MODEL: 'gpt-5',
        LLM_PROVIDER: 'openai',
        LLM_SUPPORT_IMAGE_INPUT: true,
        LLM_TEMPERATURE: 0.6,
        LLM_THINKING_LEVEL: 'high',
        LLM_USER_AGENT: 'MoviePilot-Test',
        LLM_USE_PROXY: false,
        LLM_WEB_SEARCH_MODE: 'disabled',
      }),
    )
  })

  it('round-trips assistant, audio, and recommendation settings', async () => {
    systemEnv = { ...systemEnv, AI_AGENT_ENABLE: true }
    await renderSettings()
    await expandLlmSettings()
    for (const label of ['全局智能助手', '啰嗦模式', '隐藏全局入口']) {
      await fireEvent.click(screen.getByLabelText(label))
    }
    await selectOption('定时唤醒', '6小时')
    for (const label of ['支持音频输入', '支持音频输出', '文件整理失败智能接管', '搜索结果智能推荐']) {
      await fireEvent.click(screen.getByLabelText(label))
    }
    await selectOption('音频输入提供商', '小米 MiMo')
    await fireEvent.update(screen.getByLabelText('音频输入模型'), 'mimo-stt')
    await fireEvent.update(screen.getByLabelText('音频输入 API密钥'), 'audio-input-key')
    await fireEvent.update(screen.getByLabelText('音频输入基础URL'), 'https://audio-input.example/v1')
    await fireEvent.update(screen.getByLabelText('识别语言'), 'en')
    await selectOption('音频输出提供商', 'MiniMax')
    await fireEvent.update(screen.getByLabelText('音频输出模型'), 'speech-02-hd')
    await fireEvent.update(screen.getByLabelText('音频输出 API密钥'), 'audio-output-key')
    await fireEvent.update(screen.getByLabelText('音频输出基础URL'), 'https://audio-output.example/v1')
    await fireEvent.update(screen.getByLabelText('语音音色'), 'female-shaonv')
    await fireEvent.click(screen.getByLabelText('语音回复附带文字'))
    await fireEvent.update(screen.getByLabelText('用户偏好'), '4K HDR')
    await fireEvent.update(screen.getByLabelText('智能推荐分析条目上限'), '25')

    await fireEvent.click(getBasicCard().getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('基础设置保存成功'))
    expect(findPost('system/env')?.[1]).toEqual(
      expect.objectContaining({
        AI_AGENT_GLOBAL: true,
        AI_AGENT_HIDE_ENTRY: true,
        AI_AGENT_JOB_INTERVAL: 6,
        AI_AGENT_RETRY_TRANSFER: true,
        AI_AGENT_VERBOSE: true,
        AI_RECOMMEND_ENABLED: true,
        AI_RECOMMEND_MAX_ITEMS: 25,
        AI_RECOMMEND_USER_PREFERENCE: '4K HDR',
        AUDIO_INPUT_API_KEY: 'audio-input-key',
        AUDIO_INPUT_BASE_URL: 'https://audio-input.example/v1',
        AUDIO_INPUT_LANGUAGE: 'en',
        AUDIO_INPUT_MODEL: 'mimo-stt',
        AUDIO_INPUT_PROVIDER: 'mimo',
        AUDIO_OUTPUT_API_KEY: 'audio-output-key',
        AUDIO_OUTPUT_BASE_URL: 'https://audio-output.example/v1',
        AUDIO_OUTPUT_INCLUDE_TEXT: true,
        AUDIO_OUTPUT_MODEL: 'speech-02-hd',
        AUDIO_OUTPUT_PROVIDER: 'minimax',
        AUDIO_OUTPUT_VOICE: 'female-shaonv',
        LLM_SUPPORT_AUDIO_INPUT: true,
        LLM_SUPPORT_AUDIO_OUTPUT: true,
      }),
    )
  })

  it('owns downloader creation, card changes, removal, ordering, default correction, and reload', async () => {
    const user = userEvent.setup()
    await renderSettings()
    expect(await screen.findByText('下载器1 / qbittorrent / true')).toBeInTheDocument()
    const card = getSettingsCard('下载器')

    await user.click(card.getAllByRole('button').at(-1)!)
    await user.click(await screen.findByText('Qbittorrent', { selector: '.v-list-item-title' }))
    expect(screen.getByText('下载器4 / qbittorrent / true')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'reverse-下载器1' }))
    await user.click(screen.getByRole('button', { name: 'change-下载器3' }))
    await user.click(screen.getByRole('button', { name: 'remove-下载器1' }))
    expect(screen.getByText('下载器3-edited / transmission / true')).toBeInTheDocument()
    expect(screen.queryByLabelText('downloader-下载器1')).not.toBeInTheDocument()

    await user.click(card.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('下载器设置保存成功'))
    expect(findPost('system/setting/Downloaders')?.[1]).toEqual([
      expect.objectContaining({ default: false, enabled: false, name: '下载器4', type: 'qbittorrent' }),
      expect.objectContaining({ default: true, enabled: true, name: '下载器3-edited', type: 'transmission' }),
    ])
    expect(mocks.toastInfo).toHaveBeenCalledWith('未设置默认下载器，已将【下载器3-edited】作为默认下载器')
    await waitFor(() => expect(screen.getByText('下载器1 / qbittorrent / true')).toBeInTheDocument())
    expect(screen.queryByText('下载器3-edited / transmission / true')).not.toBeInTheDocument()
  })

  it('owns media server creation, card changes, removal, ordering, legacy interval, and reload', async () => {
    const user = userEvent.setup()
    systemEnv.MEDIASERVER_SYNC_INTERVAL = 12
    await renderSettings()
    expect(await screen.findByText('服务器1 / emby / 12')).toBeInTheDocument()
    const card = getSettingsCard('媒体服务器')

    await user.click(card.getAllByRole('button').at(-1)!)
    await user.click(await screen.findByText('Emby', { selector: '.v-list-item-title' }))
    expect(screen.getByText('服务器4 / emby / 12')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'reverse-服务器1' }))
    await user.click(screen.getByRole('button', { name: 'change-服务器3' }))
    await user.click(screen.getByRole('button', { name: 'remove-服务器1' }))
    expect(screen.getByText('服务器3-edited / plex / 12')).toBeInTheDocument()

    await user.click(card.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('媒体服务器设置保存成功'))
    expect(findPost('system/setting/MediaServers')?.[1]).toEqual([
      expect.objectContaining({ enabled: false, name: '服务器4', type: 'emby' }),
      expect.objectContaining({ enabled: true, name: '服务器3-edited', type: 'plex' }),
    ])
    await waitFor(() => expect(screen.getByText('服务器1 / emby / 12')).toBeInTheDocument())
    expect(screen.queryByText('服务器3-edited / plex / 12')).not.toBeInTheDocument()
  })

  it('round-trips representative advanced tabs and normalizes scraping and empty log values', async () => {
    systemEnv = {
      ...systemEnv,
      AUXILIARY_AUTH_ENABLE: true,
      TMDB_API_KEY: 'old-tmdb-key',
      LOG_FILE_FORMAT: '',
      PLUGIN_LOCAL_REPO_PATHS: '/plugins/old',
      RUST_ACCEL_AVAILABLE: true,
      RUST_ACCEL: true,
    }
    scrapingSetting = { movie_nfo: true, movie_poster: false, movie_backdrop: 'overwrite' }
    await renderSettings()

    const dialog = await openAdvancedTab('系统')
    expect(dialog.getByLabelText('用户辅助认证')).toBeChecked()
    await fireEvent.click(dialog.getByLabelText('用户辅助认证'))

    await fireEvent.click(dialog.getByRole('tab', { name: '媒体' }))
    expect(dialog.getByLabelText('TMDB API Key')).toHaveValue('old-tmdb-key')
    await fireEvent.update(dialog.getByLabelText('TMDB API Key'), 'new-tmdb-key')

    await fireEvent.click(dialog.getByRole('tab', { name: '日志' }))
    expect(dialog.getByLabelText('日志文件格式')).toHaveValue('')

    await fireEvent.click(dialog.getByRole('tab', { name: '实验室' }))
    expect(dialog.getByLabelText('Rust 加速')).toBeChecked()
    expect(dialog.getByLabelText('Rust 加速')).toHaveAttribute('aria-disabled', 'false')
    await fireEvent.update(dialog.getByLabelText('本地插件仓库路径'), '/plugins/new')

    await fireEvent.click(dialog.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(findPost('system/env')?.[1]).toEqual(
      expect.objectContaining({
        AUXILIARY_AUTH_ENABLE: false,
        LOG_FILE_FORMAT: null,
        PLUGIN_LOCAL_REPO_PATHS: '/plugins/new',
        RUST_ACCEL: true,
        TMDB_API_KEY: 'new-tmdb-key',
      }),
    )
    expect(findPost('system/setting/ScrapingSwitchs')?.[1]).toEqual(
      expect.objectContaining({ movie_backdrop: 'overwrite', movie_nfo: 'missingOnly', movie_poster: 'skip' }),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('高级设置保存成功')
  })

  it('round-trips all advanced system switches and enables only the Dev update mode', async () => {
    await renderSettings()
    const dialog = await openAdvancedTab('系统')
    for (const label of [
      '用户辅助认证',
      '全局图片缓存',
      '分享订阅数据',
      '上报插件安装数据',
      '上报安装版本统计',
      '分享工作流数据',
      '大内存模式',
      '数据库WAL模式',
      '跟踪 Dev 开发版',
      '自动更新站点资源',
    ]) {
      await fireEvent.click(dialog.getByLabelText(label))
    }
    await fireEvent.click(dialog.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(findPost('system/env')?.[1]).toEqual(
      expect.objectContaining({
        AUXILIARY_AUTH_ENABLE: true,
        AUTO_UPDATE_RESOURCE: false,
        BIG_MEMORY_MODE: true,
        DB_WAL_ENABLE: true,
        GLOBAL_IMAGE_CACHE: true,
        MOVIEPILOT_AUTO_UPDATE: 'dev',
        PLUGIN_STATISTIC_SHARE: false,
        SUBSCRIBE_STATISTIC_SHARE: false,
        USAGE_STATISTIC_SHARE: false,
        WORKFLOW_STATISTIC_SHARE: false,
      }),
    )
  })

  it('round-trips advanced media metadata, recognition, and Fanart settings', async () => {
    const user = userEvent.setup()
    await renderSettings()
    const dialog = await openAdvancedTab('媒体')
    expect(dialog.getByLabelText('音乐媒体信息转简体中文')).toBeChecked()
    await fireEvent.update(dialog.getByLabelText('TMDB API服务地址'), 'api.tmdb.org')
    await fireEvent.update(dialog.getByLabelText('TMDB API Key'), 'tmdb-key')
    await fireEvent.update(dialog.getByLabelText('AcoustID API Key'), 'acoustid-key')
    await fireEvent.update(dialog.getByLabelText('TMDB 图片服务地址'), 'image.tmdb.org')
    await fireEvent.update(dialog.getByLabelText('音乐封面代理地址'), 'https://music.example')
    await selectOption('TMDB 元数据语言', '繁体中文')
    await fireEvent.update(dialog.getByLabelText('单条媒体元数据缓存有效期'), '48')
    for (const label of [
      '跟随TMDB识别整理',
      'TMDB 刮削原语种图片',
      '音乐媒体信息转简体中文',
      '优先使用插件识别',
      '共享使用媒体识别数据',
      'Fanart图片数据源',
    ]) {
      await fireEvent.click(dialog.getByLabelText(label))
    }
    const fanartLanguages = dialog.getByLabelText('Fanart语言')
    expect(fanartLanguages).toHaveValue(['zh', 'en'])
    await selectOption('Fanart语言', '日文')
    await waitFor(() => expect(fanartLanguages).toHaveValue(['zh', 'en', 'ja']))
    await user.deselectOptions(fanartLanguages, 'en')
    await waitFor(() => expect(fanartLanguages).toHaveValue(['zh', 'ja']))
    await fireEvent.click(dialog.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(findPost('system/env')?.[1]).toEqual(
      expect.objectContaining({
        ACOUSTID_API_KEY: 'acoustid-key',
        FANART_ENABLE: true,
        FANART_LANG: 'zh,ja',
        MEDIA_RECOGNIZE_SHARE: false,
        META_CACHE_EXPIRE: '48',
        MUSIC_COVER_PROXY: 'https://music.example',
        MUSIC_METADATA_TO_SIMPLIFIED: false,
        RECOGNIZE_PLUGIN_FIRST: true,
        SCRAP_FOLLOW_TMDB: false,
        TMDB_API_DOMAIN: 'api.tmdb.org',
        TMDB_API_KEY: 'tmdb-key',
        TMDB_IMAGE_DOMAIN: 'image.tmdb.org',
        TMDB_LOCALE: 'zh-TW',
        TMDB_SCRAP_ORIGINAL_IMAGE: true,
      }),
    )
  })

  it('round-trips advanced network fields and extends both image access lists', async () => {
    const user = userEvent.setup()
    await renderSettings()
    const dialog = await openAdvancedTab('网络')
    await fireEvent.update(dialog.getByLabelText('代理服务器'), 'socks5://proxy.example:1080')
    await fireEvent.update(dialog.getByLabelText('Github加速代理'), 'https://github-proxy.example')
    await fireEvent.update(dialog.getByLabelText('PIP加速代理'), 'https://pypi.example/simple')
    await fireEvent.click(dialog.getByLabelText('DNS Over HTTPS'))
    await fireEvent.update(dialog.getByLabelText('DOH 服务器'), 'https://dns.example/dns-query')
    await fireEvent.update(dialog.getByLabelText('DOH 域名'), 'example.com')
    await user.click(dialog.getByText('安全图片域名'))

    const domainInput = dialog.getByPlaceholderText('添加域名，如：image.tmdb.org')
    await fireEvent.update(domainInput, 'cdn.example.com')
    await user.click(domainInput.closest('.v-input')!.querySelector('button')!)
    const rangeInput = dialog.getByPlaceholderText('添加 CIDR，如：198.18.0.0/15')
    await fireEvent.update(rangeInput, '10.0.0.0/8')
    await user.click(rangeInput.closest('.v-input')!.querySelector('button')!)
    await fireEvent.click(dialog.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(findPost('system/env')?.[1]).toEqual(
      expect.objectContaining({
        DOH_DOMAINS: 'example.com',
        DOH_ENABLE: true,
        DOH_RESOLVERS: 'https://dns.example/dns-query',
        GITHUB_PROXY: 'https://github-proxy.example',
        IMAGE_PROXY_ALLOWED_PRIVATE_RANGES: ['10.0.0.0/8'],
        PIP_PROXY: 'https://pypi.example/simple',
        PROXY_HOST: 'socks5://proxy.example:1080',
        SECURITY_IMAGE_DOMAINS: ['cdn.example.com'],
      }),
    )
  })

  it('round-trips data cleanup boundaries and every advanced log field', async () => {
    const user = userEvent.setup()
    await renderSettings()
    const dialog = await openAdvancedTab('数据')
    await fireEvent.click(dialog.getByLabelText('启用数据清理'))
    await fireEvent.update(dialog.getByLabelText('消息表保留天数'), '0')
    await fireEvent.update(dialog.getByLabelText('下载历史表保留天数'), '30')
    await fireEvent.update(dialog.getByLabelText('站点数据表保留天数'), '60')
    await fireEvent.update(dialog.getByLabelText('整理历史表保留天数'), '90')

    await user.click(dialog.getByRole('tab', { name: '日志' }))
    await selectOption('日志等级', 'ERROR - 错误')
    await fireEvent.update(dialog.getByLabelText('日志文件最大容量(MB)'), '20')
    await fireEvent.update(dialog.getByLabelText('日志文件最大备份数量'), '7')
    await fireEvent.update(dialog.getByLabelText('日志文件格式'), '')
    await fireEvent.click(dialog.getByLabelText('调试模式'))
    await fireEvent.click(dialog.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(findPost('system/env')?.[1]).toEqual(
      expect.objectContaining({
        DATA_CLEANUP_DOWNLOAD_HISTORY_DAYS: 30,
        DATA_CLEANUP_ENABLE: true,
        DATA_CLEANUP_MESSAGE_DAYS: 0,
        DATA_CLEANUP_SITE_USERDATA_DAYS: 60,
        DATA_CLEANUP_TRANSFER_HISTORY_DAYS: 90,
        DEBUG: true,
        LOG_BACKUP_COUNT: '7',
        LOG_FILE_FORMAT: null,
        LOG_LEVEL: 'ERROR',
        LOG_MAX_FILE_SIZE: '20',
      }),
    )
  })

  it.each(['sqlite', 'postgresql'])('shows database backup defaults for %s', async databaseType => {
    systemEnv.DB_TYPE = databaseType
    await renderSettings()
    const dialog = await openAdvancedTab('数据')

    expect(dialog.getByLabelText('启用数据备份')).not.toBeChecked()
    expect(dialog.queryByLabelText('备份周期')).not.toBeInTheDocument()

    await fireEvent.click(dialog.getByLabelText('启用数据备份'))

    expect(dialog.getByLabelText('备份周期')).toHaveValue('0 3 * * *')
    expect(dialog.getByLabelText('备份目录')).toHaveValue('')
    expect(dialog.getByLabelText('备份目录')).toHaveAttribute('placeholder', '/config/database_backup')
    expect(dialog.getByLabelText('备份目录')).toHaveAttribute('data-storage', 'local')
    expect(dialog.getByLabelText('备份过期天数')).toHaveValue(30)
    expect(dialog.getByLabelText('最大保留份数')).toHaveValue(30)
    expect(dialog.getByLabelText('数据库迁移前备份')).toBeChecked()
  })

  it('loads, edits, and saves the database backup policy', async () => {
    systemEnv = {
      ...systemEnv,
      DB_BACKUP_CRON: '15 2 * * 1',
      DB_BACKUP_ENABLE: true,
      DB_BACKUP_MAX_COUNT: 12,
      DB_BACKUP_ON_UPGRADE: false,
      DB_BACKUP_PATH: '/data/backup',
      DB_BACKUP_RETENTION_DAYS: 45,
    }
    await renderSettings()
    const dialog = await openAdvancedTab('数据')

    expect(dialog.getByLabelText('备份周期')).toHaveValue('15 2 * * 1')
    expect(dialog.getByLabelText('备份目录')).toHaveValue('/data/backup')
    expect(dialog.getByLabelText('数据库迁移前备份')).not.toBeChecked()
    await fireEvent.update(dialog.getByLabelText('备份周期'), '30 4 * * *')
    await fireEvent.update(dialog.getByLabelText('备份目录'), '  relative/backup  ')
    await fireEvent.update(dialog.getByLabelText('备份过期天数'), '60')
    await fireEvent.update(dialog.getByLabelText('最大保留份数'), '20')
    await fireEvent.click(dialog.getByLabelText('数据库迁移前备份'))
    await fireEvent.click(dialog.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(findPost('system/env')?.[1]).toEqual(
      expect.objectContaining({
        DB_BACKUP_CRON: '30 4 * * *',
        DB_BACKUP_ENABLE: true,
        DB_BACKUP_MAX_COUNT: 20,
        DB_BACKUP_ON_UPGRADE: true,
        DB_BACKUP_PATH: 'relative/backup',
        DB_BACKUP_RETENTION_DAYS: 60,
      }),
    )
  })

  it('hides disabled backup fields while preserving their values', async () => {
    systemEnv = {
      ...systemEnv,
      DB_BACKUP_CRON: ' 15 2 * * 1 ',
      DB_BACKUP_ENABLE: true,
      DB_BACKUP_MAX_COUNT: '12',
      DB_BACKUP_ON_UPGRADE: false,
      DB_BACKUP_PATH: ' /data/backup ',
      DB_BACKUP_RETENTION_DAYS: '45',
    }
    await renderSettings()
    const dialog = await openAdvancedTab('数据')

    await fireEvent.click(dialog.getByLabelText('启用数据备份'))
    expect(dialog.queryByLabelText('备份周期')).not.toBeInTheDocument()
    expect(dialog.queryByLabelText('数据库迁移前备份')).not.toBeInTheDocument()
    await fireEvent.click(dialog.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(findPost('system/env')?.[1]).toEqual(
      expect.objectContaining({
        DB_BACKUP_CRON: '15 2 * * 1',
        DB_BACKUP_ENABLE: false,
        DB_BACKUP_MAX_COUNT: 12,
        DB_BACKUP_ON_UPGRADE: false,
        DB_BACKUP_PATH: '/data/backup',
        DB_BACKUP_RETENTION_DAYS: 45,
      }),
    )
  })

  it('rejects invalid hidden values while backup is disabled', async () => {
    systemEnv = { ...systemEnv, DB_BACKUP_ENABLE: true, DB_BACKUP_PATH: '/data/backup' }
    await renderSettings()
    const dialog = await openAdvancedTab('数据')

    await fireEvent.update(dialog.getByLabelText('备份周期'), '* * * *')
    await fireEvent.update(dialog.getByLabelText('备份目录'), '   ')
    await fireEvent.update(dialog.getByLabelText('备份过期天数'), '-1')
    await fireEvent.update(dialog.getByLabelText('最大保留份数'), '1.5')
    await fireEvent.click(dialog.getByLabelText('启用数据备份'))
    await fireEvent.click(dialog.getByRole('button', { name: '保存' }))

    expect(mocks.apiPost).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith('备份周期必须留空或使用有效的 Cron 表达式')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('accepts zero backup limits and normalizes a blank path to the backend default', async () => {
    systemEnv = { ...systemEnv, DB_BACKUP_ENABLE: true, DB_BACKUP_PATH: null }
    await renderSettings()
    const dialog = await openAdvancedTab('数据')

    expect(dialog.getByLabelText('备份目录')).toHaveValue('')
    await fireEvent.update(dialog.getByLabelText('备份周期'), '')
    await fireEvent.update(dialog.getByLabelText('备份目录'), '   ')
    await fireEvent.update(dialog.getByLabelText('备份过期天数'), '0')
    await fireEvent.update(dialog.getByLabelText('最大保留份数'), '0')
    await fireEvent.click(dialog.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(findPost('system/env')?.[1]).toEqual(
      expect.objectContaining({
        DB_BACKUP_CRON: '',
        DB_BACKUP_MAX_COUNT: 0,
        DB_BACKUP_ON_UPGRADE: true,
        DB_BACKUP_PATH: null,
        DB_BACKUP_RETENTION_DAYS: 0,
      }),
    )
  })

  it.each([
    ['备份周期', '* * * *', '备份周期必须留空或使用有效的 Cron 表达式'],
    ['备份过期天数', '-1', '备份过期天数必须是大于等于 0 的整数'],
    ['最大保留份数', '1.5', '最大保留份数必须是大于等于 0 的整数'],
  ])('rejects invalid database backup field %s before posting', async (label, value, message) => {
    systemEnv.DB_BACKUP_ENABLE = true
    await renderSettings()
    const dialog = await openAdvancedTab('数据')

    await fireEvent.update(dialog.getByLabelText(label), value)
    await fireEvent.click(dialog.getByRole('button', { name: '保存' }))

    expect(mocks.apiPost).not.toHaveBeenCalled()
    expect(mocks.toastError).toHaveBeenCalledWith(message)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('round-trips every advanced laboratory control when Rust is available', async () => {
    Object.assign(systemEnv, {
      RUST_ACCEL_AVAILABLE: true,
      TRANSFER_FAILURE_NOTIFICATION_AGGREGATION: true,
    })
    await renderSettings()
    const dialog = await openAdvancedTab('实验室')
    await fireEvent.update(dialog.getByLabelText('本地插件仓库路径'), '/plugins/local')
    await fireEvent.update(dialog.getByLabelText('文件整理线程数'), '4')
    await fireEvent.update(dialog.getByLabelText('整理失败重试次数'), '6')
    await fireEvent.update(dialog.getByLabelText('文件操作超时（秒）'), '45')
    await fireEvent.update(dialog.getByLabelText('文件复制停滞超时（秒）'), '180')
    for (const label of [
      '插件热加载',
      '按媒体聚合整理失败通知',
      '本地文件操作隔离',
      '编码探测性能模式',
      'Rust 加速',
      '网络存储快速监控',
    ]) {
      await fireEvent.click(dialog.getByLabelText(label))
    }
    await fireEvent.click(dialog.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(findPost('system/env')?.[1]).toEqual(
      expect.objectContaining({
        ENCODING_DETECTION_PERFORMANCE_MODE: false,
        FS_PROXY_ENABLED: false,
        FS_PROXY_STALL_TIMEOUT: 180,
        FS_PROXY_TIMEOUT: 45,
        MONITOR_NETWORK_FAST_MODE: true,
        PLUGIN_AUTO_RELOAD: true,
        PLUGIN_LOCAL_REPO_PATHS: '/plugins/local',
        RUST_ACCEL: true,
        TRANSFER_FAILURE_NOTIFICATION_AGGREGATION: false,
        TRANSFER_MAX_FAILED_RETRIES: 6,
        TRANSFER_THREADS: 4,
      }),
    )
  })

  it.each([{ RUST_ACCEL_AVAILABLE: true, RUST_ACCEL_ENABLED: false }, { RUST_ACCEL_ENABLED: true }])(
    'derives Rust availability from the supported capability fields %#',
    async capability => {
      delete systemEnv.RUST_ACCEL_AVAILABLE
      Object.assign(systemEnv, capability, { RUST_ACCEL: true })
      await renderSettings()

      const dialog = await openAdvancedTab('实验室')
      expect(dialog.getByLabelText('Rust 加速')).toHaveAttribute('aria-disabled', 'false')
      expect(dialog.getByLabelText('Rust 加速')).toBeChecked()
    },
  )

  it('disables unavailable Rust acceleration and forces its advanced payload off', async () => {
    systemEnv.RUST_ACCEL_AVAILABLE = false
    systemEnv.RUST_ACCEL_ENABLED = true
    systemEnv.RUST_ACCEL = true
    await renderSettings()

    const dialog = await openAdvancedTab('实验室')
    const rust = dialog.getByLabelText('Rust 加速')
    expect(rust).toBeDisabled()
    expect(rust).not.toBeChecked()
    await fireEvent.click(dialog.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(findPost('system/env')).toBeDefined())
    expect(findPost('system/env')?.[1]).toEqual(expect.objectContaining({ RUST_ACCEL: false }))
  })

  it('keeps Rust acceleration enabled and read-only when required by the runtime', async () => {
    systemEnv.RUST_ACCEL_AVAILABLE = true
    systemEnv.RUST_ACCEL_REQUIRED = true
    systemEnv.RUST_ACCEL = false
    await renderSettings()

    const dialog = await openAdvancedTab('实验室')
    const rust = dialog.getByLabelText('Rust 加速')
    expect(rust).toHaveAttribute('aria-disabled', 'false')
    expect(rust).toBeChecked()
    await fireEvent.click(rust)
    expect(rust).toBeChecked()
    await fireEvent.click(dialog.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(findPost('system/env')).toBeDefined())
    expect(findPost('system/env')?.[1]).toEqual(expect.objectContaining({ RUST_ACCEL: true }))
  })

  it('suppresses silent refresh while the advanced dialog is open and resumes after save', async () => {
    await renderSettings()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('system/env'))
    const refresh = mocks.useSilentSettingRefresh.mock.calls[0]?.[0] as () => Promise<void>
    const dialog = await openAdvancedTab('系统')
    mocks.apiGet.mockClear()

    await refresh()
    expect(mocks.apiGet).not.toHaveBeenCalled()

    await fireEvent.click(dialog.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await refresh()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('system/env'))
  })

  it.each([
    ['下载器', 'system/setting/Downloaders', '下载器设置保存失败！'],
    ['媒体服务器', 'system/setting/MediaServers', '媒体服务器设置保存失败！'],
  ])('reports an HTTP failure while saving %s settings', async (cardTitle, endpoint, message) => {
    let attempts = 0
    mocks.apiPost.mockImplementation((path: string) => {
      if (path === endpoint && attempts++ === 0) return Promise.reject(new Error('offline'))
      return Promise.resolve({ success: true })
    })
    await renderSettings()

    await fireEvent.click(getSettingsCard(cardTitle).getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(message))
    expect(mocks.toastSuccess).not.toHaveBeenCalled()

    await fireEvent.click(getSettingsCard(cardTitle).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledOnce())
    expect(mocks.apiPost.mock.calls.filter(call => call[0] === endpoint)).toHaveLength(2)
  })

  it('reports an advanced environment save failure while keeping the dialog open', async () => {
    mocks.apiPost.mockImplementation((path: string) => {
      if (path === 'system/env') return Promise.reject(new Error('offline'))
      return Promise.resolve({ success: true })
    })
    await renderSettings()
    await fireEvent.click(screen.getByRole('button', { name: /高级设置/ }))
    const dialog = within(screen.getByRole('dialog'))

    await fireEvent.click(dialog.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('设置保存失败：请求失败！'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/ScrapingSwitchs', expect.any(Object))
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('keeps the advanced dialog open when scraping save fails after the environment succeeds', async () => {
    mocks.apiPost.mockImplementation((path: string) => {
      if (path === 'system/setting/ScrapingSwitchs') return Promise.reject(new Error('offline'))
      return Promise.resolve({ success: true })
    })
    await renderSettings()
    const dialog = await openAdvancedTab('系统')

    await fireEvent.click(dialog.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('刮削开关设置保存失败'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(findPost('system/env')).toBeDefined()
    expect(mocks.toastSuccess).not.toHaveBeenCalledWith('高级设置保存成功')
  })
})
