import { useLlmProviderDirectory } from '@/composables/useLlmProviderDirectory'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

function createProvider(id: string, runtime: string) {
  return {
    id,
    name: id,
    runtime,
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
  }
}

describe('useLlmProviderDirectory', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('只为 OpenAI 兼容 runtime 或声明 Responses 工具能力的模型显示 API 协议字段', async () => {
    mocks.apiGet.mockResolvedValue({
      success: true,
      data: [
        createProvider('openai', 'openai_compatible'),
        createProvider('deepseek', 'deepseek'),
        createProvider('google', 'google'),
      ],
    })

    const Harness = defineComponent({
      setup() {
        const provider = ref('openai')
        const model = ref('')
        const directory = useLlmProviderDirectory({
          provider,
          apiKey: ref(''),
          baseUrl: ref(''),
          model,
        })

        return {
          loadProviders: directory.loadProviders,
          selectProvider: (value: string) => {
            provider.value = value
          },
          selectModel: (value: string) => {
            model.value = value
          },
          loadModels: directory.loadModels,
          showApiProtocolField: directory.showApiProtocolField,
          supportsBuiltinWebSearch: directory.supportsBuiltinWebSearch,
        }
      },
      template: '<div />',
    })

    const wrapper = mount(Harness)
    await wrapper.vm.loadProviders()

    expect(wrapper.vm.showApiProtocolField).toBe(true)

    wrapper.vm.selectProvider('deepseek')
    await nextTick()

    expect(wrapper.vm.showApiProtocolField).toBe(false)

    mocks.apiGet.mockResolvedValueOnce({
      success: true,
      data: {
        models: [
          {
            id: 'deepseek-v4-flash',
            name: 'deepseek-v4-flash',
            server_tools: [
              {
                id: 'web_search',
                required_api_protocol: 'responses',
                client_adapter: 'openai_responses',
              },
            ],
          },
        ],
      },
    })
    await wrapper.vm.loadModels()
    wrapper.vm.selectModel('deepseek-v4-flash')
    await nextTick()

    expect(wrapper.vm.supportsBuiltinWebSearch).toBe(true)
    expect(wrapper.vm.showApiProtocolField).toBe(true)

    wrapper.vm.selectProvider('google')
    await nextTick()
    mocks.apiGet.mockResolvedValueOnce({
      success: true,
      data: {
        models: [
          {
            id: 'gemini-3.6-flash-preview',
            name: 'gemini-3.6-flash-preview',
            server_tools: [
              {
                id: 'web_search',
                required_api_protocol: 'native',
                client_adapter: 'google_native',
              },
            ],
          },
        ],
      },
    })
    await wrapper.vm.loadModels()
    wrapper.vm.selectModel('gemini-3.6-flash-preview')
    await nextTick()

    expect(wrapper.vm.supportsBuiltinWebSearch).toBe(true)
    expect(wrapper.vm.showApiProtocolField).toBe(false)
    wrapper.unmount()
  })
})
