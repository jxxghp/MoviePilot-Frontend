import { getPluginDataSummary } from '@/api/pluginData'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
  }),
}))

describe('plugin data summary API adapter', () => {
  beforeEach(() => mocks.apiGet.mockReset())

  it('keeps only non-value diagnostic fields', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      plugin_id: ' DemoPlugin ',
      plugin_name: ' 演示插件 ',
      plugin_version: ' 1.0.0 ',
      state: true,
      count: 2,
      total_chars: 28,
      keys_truncated: false,
      keys: [
        {
          key: ' api_token ',
          value_type: 'string',
          serialized_chars: 14,
          sensitive: true,
          value: 'secret-token',
        },
        { key: ' history ', value_type: 'array', serialized_chars: 14, sensitive: false, preview: '[secret]' },
      ],
      data: { api_token: 'secret-token' },
    })

    await expect(getPluginDataSummary('DemoPlugin')).resolves.toEqual({
      plugin_id: 'DemoPlugin',
      plugin_name: '演示插件',
      plugin_version: '1.0.0',
      state: true,
      count: 2,
      total_chars: 28,
      keys_truncated: false,
      keys: [
        { key: 'api_token', value_type: 'string', serialized_chars: 14, sensitive: true },
        { key: 'history', value_type: 'array', serialized_chars: 14, sensitive: false },
      ],
    })
    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/runtime/DemoPlugin/data/summary')
  })

  it('drops malformed keys and invalid sizes', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      keys: [
        { key: '', value_type: 'string' },
        { key: 'custom', value_type: 'unsupported', serialized_chars: 4 },
        { key: 'valid', value_type: 'object', serialized_chars: -1 },
      ],
    })

    await expect(getPluginDataSummary('DemoPlugin')).resolves.toMatchObject({
      plugin_id: 'DemoPlugin',
      count: 1,
      keys: [{ key: 'valid', value_type: 'object', serialized_chars: null, sensitive: false }],
    })
  })

  it('normalizes an invalid response to an empty summary', async () => {
    mocks.apiGet.mockResolvedValueOnce(null)

    await expect(getPluginDataSummary('DemoPlugin')).resolves.toEqual({
      plugin_id: 'DemoPlugin',
      count: 0,
      total_chars: 0,
      keys: [],
      keys_truncated: false,
    })
  })
})
