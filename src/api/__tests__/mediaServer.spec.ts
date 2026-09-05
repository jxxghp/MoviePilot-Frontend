import { listMediaServerClients } from '@/api/mediaServer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
  }),
}))

describe('media server API adapters', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('queries the redacted enabled-client projection', async () => {
    mocks.apiGet.mockResolvedValueOnce([{ name: ' Home ', type: ' emby ' }])

    await expect(listMediaServerClients()).resolves.toEqual([{ name: 'Home', type: 'emby' }])
    expect(mocks.apiGet).toHaveBeenCalledWith('mediaserver/clients')
  })

  it('drops malformed clients without leaking arbitrary fields', async () => {
    mocks.apiGet.mockResolvedValueOnce([
      { name: 'Home', type: 'emby', config: { token: 'secret' } },
      { name: '', type: 'plex' },
      null,
    ])

    await expect(listMediaServerClients()).resolves.toEqual([{ name: 'Home', type: 'emby' }])
  })

  it('normalizes non-list responses to an empty collection', async () => {
    mocks.apiGet.mockResolvedValueOnce(null)

    await expect(listMediaServerClients()).resolves.toEqual([])
  })
})
