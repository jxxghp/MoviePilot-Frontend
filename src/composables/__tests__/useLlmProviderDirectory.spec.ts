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

  it('仅为 OpenAI 兼容 runtime 显示 API 协议字段', async () => {
    mocks.apiGet.mockResolvedValue({
      success: true,
      data: [createProvider('openai', 'openai_compatible'), createProvider('deepseek', 'deepseek')],
    })

    const Harness = defineComponent({
      setup() {
        const provider = ref('openai')
        const directory = useLlmProviderDirectory({
          provider,
          apiKey: ref(''),
          baseUrl: ref(''),
          model: ref(''),
        })

        return {
          loadProviders: directory.loadProviders,
          selectProvider: (value: string) => {
            provider.value = value
          },
          showApiProtocolField: directory.showApiProtocolField,
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
    wrapper.unmount()
  })
})
