import AccountSettingSystem from '@/views/setting/AccountSettingSystem.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
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

/** 构造系统设置页所需的最小 LLM 目录状态。 */
function createLlmDirectoryState() {
  return {
    providerItems: ref([]),
    baseUrlPresetItems: ref([]),
    models: ref([]),
    selectedProvider: ref(null),
    selectedModel: ref(null),
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
    authSession: ref(null),
    handleProviderSelection: vi.fn(),
    applyModelMetadata: vi.fn(),
    loadProviders: vi.fn().mockResolvedValue(undefined),
    loadModels: vi.fn(),
    openAuthPage: vi.fn(),
    startAuth: vi.fn(),
    pollAuthSession: vi.fn(),
    disconnectAuth: vi.fn(),
    closeAuthDialog: vi.fn(),
  }
}

describe('AccountSettingSystem', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.toastError.mockReset()
    mocks.toastInfo.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.useLlmProviderDirectory.mockReset()
    mocks.useSilentSettingRefresh.mockReset()
    mocks.useLlmProviderDirectory.mockReturnValue(createLlmDirectoryState())
    mocks.apiPost.mockResolvedValue({ success: true })
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'system/env') {
        return {
          success: true,
          data: {
            ACOUSTID_API_KEY: 'b1auxfOzAg',
            DB_TYPE: 'sqlite',
            RUST_ACCEL_AVAILABLE: false,
          },
        }
      }
      if (endpoint === 'message/agent/mcp/servers') {
        return { success: true, data: { servers: [] } }
      }
      return { success: true, data: { value: [] } }
    })
  })

  it('loads and saves the AcoustID key from advanced media settings', async () => {
    await renderWithProviders(AccountSettingSystem, {
      global: { stubs: { VDialogCloseBtn: true } },
    })
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
})
