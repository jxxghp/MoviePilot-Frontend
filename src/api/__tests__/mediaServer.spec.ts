import {
  bindMediaServerAccount,
  listMediaServerAccountBindings,
  listMediaServerClients,
  unbindMediaServerAccount,
} from '@/api/mediaServer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
  }),
}))

describe('media server API adapters', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiDelete.mockReset()
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

  it('lists, binds, and unbinds media server accounts without keeping unexpected fields', async () => {
    mocks.apiGet.mockResolvedValueOnce([
      {
        server: '客厅 Emby',
        server_type: 'emby',
        sync_mode: 'userdata',
        supports_binding: true,
        bound: false,
        status: 'unbound',
        remote_username: null,
        source: null,
        updated_at: null,
        token: 'should-be-stripped',
      },
    ])
    const bindings = await listMediaServerAccountBindings()
    expect(bindings).toEqual([
      {
        server: '客厅 Emby',
        server_type: 'emby',
        sync_mode: 'userdata',
        supports_binding: true,
        bound: false,
        status: 'unbound',
        remote_username: null,
        source: null,
        updated_at: null,
      },
    ])

    mocks.apiPost.mockResolvedValueOnce({
      server: '客厅 Emby',
      server_type: 'emby',
      sync_mode: 'session',
      supports_binding: true,
      bound: true,
      status: 'bound',
      remote_username: 'alice',
      source: 'manual',
      updated_at: 1700000000,
    })
    const bound = await bindMediaServerAccount({ server: '客厅 Emby', username: 'alice', password: 'secret' })
    expect(bound.sync_mode).toBe('session')
    expect(bound.bound).toBe(true)

    mocks.apiDelete.mockResolvedValueOnce(null)
    await unbindMediaServerAccount('客厅 Emby')
    expect(mocks.apiDelete).toHaveBeenCalledWith(`mediaserver/account-bindings/${encodeURIComponent('客厅 Emby')}`)
  })
})
