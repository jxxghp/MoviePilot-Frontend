import { getSystemSetting } from '@/api/systemSettings'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
  }),
}))

describe('system settings API adapters', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('queries one exact setting without requesting secret values', async () => {
    const item = {
      definition: {
        declared_type: 'str | None',
        nullable: true,
        persistence: 'app.env',
        sensitive: false,
        update_operations: ['replace'],
        value_shape: 'str',
      },
      group: 'settings',
      has_value: true,
      label: 'MOVIE_RENAME_FORMAT',
      redacted: false,
      setting_key: 'MOVIE_RENAME_FORMAT',
      source: 'settings',
      value: '{{ title }}',
      value_type: 'str',
    }
    mocks.apiGet.mockResolvedValueOnce({
      include_values: true,
      matched_count: 1,
      settings: [item],
      show_secrets: false,
    })

    await expect(getSystemSetting<string>('MOVIE_RENAME_FORMAT')).resolves.toEqual(item)
    expect(mocks.apiGet).toHaveBeenCalledWith('system/settings', {
      params: { setting_key: 'MOVIE_RENAME_FORMAT' },
    })
  })

  it('returns null when the exact item is absent or malformed', async () => {
    mocks.apiGet.mockResolvedValueOnce({ settings: [] }).mockResolvedValueOnce(null)

    await expect(getSystemSetting('MOVIE_RENAME_FORMAT')).resolves.toBeNull()
    await expect(getSystemSetting('MOVIE_RENAME_FORMAT')).resolves.toBeNull()
  })
})
