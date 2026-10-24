import {
  readRemoteUserConfig,
  THEME_CUSTOMIZER_REMOTE_KEY,
  writeRemoteUserConfig,
} from '@/utils/themeSettingsPersistence'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.get,
    post: mocks.post,
  },
}))

describe('theme settings persistence', () => {
  beforeEach(() => {
    mocks.get.mockReset()
    mocks.post.mockReset()
  })

  it('reads the stored value from the user config endpoint', async () => {
    mocks.get.mockResolvedValue({ value: { theme: 'dark' } })

    await expect(readRemoteUserConfig(THEME_CUSTOMIZER_REMOTE_KEY)).resolves.toEqual({ theme: 'dark' })
    expect(mocks.get).toHaveBeenCalledWith(`user/config/${THEME_CUSTOMIZER_REMOTE_KEY}`)
  })

  it('returns null when the endpoint fails instead of throwing', async () => {
    mocks.get.mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(readRemoteUserConfig(THEME_CUSTOMIZER_REMOTE_KEY)).resolves.toBeNull()
  })

  it('writes the value and reports success', async () => {
    mocks.post.mockResolvedValue(null)

    await expect(writeRemoteUserConfig(THEME_CUSTOMIZER_REMOTE_KEY, { theme: 'light' })).resolves.toBe(true)
    expect(mocks.post).toHaveBeenCalledWith(`user/config/${THEME_CUSTOMIZER_REMOTE_KEY}`, { theme: 'light' })
  })

  it('reports failure without throwing when the write is rejected', async () => {
    mocks.post.mockRejectedValue(new Error('forbidden'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(writeRemoteUserConfig(THEME_CUSTOMIZER_REMOTE_KEY, { theme: 'auto' })).resolves.toBe(false)
  })
})
