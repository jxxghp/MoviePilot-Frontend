import { listDownloadDirectories, listStorageOptions, listTransferDirectories } from '@/api/storage'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
  }),
}))

describe('storage API adapters', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiGet.mockResolvedValue([])
  })

  it('queries API-ready download paths without reading the complete setting object', async () => {
    await expect(listDownloadDirectories()).resolves.toEqual([])

    expect(mocks.apiGet).toHaveBeenCalledWith('download/paths')
  })

  it('queries redacted storage options', async () => {
    await expect(listStorageOptions()).resolves.toEqual([])

    expect(mocks.apiGet).toHaveBeenCalledWith('storage/options')
  })

  it('normalizes malformed nullable collection responses to empty lists', async () => {
    mocks.apiGet.mockResolvedValueOnce(null)

    await expect(listDownloadDirectories()).resolves.toEqual([])
  })

  it('passes structured directory filters through query parameters', async () => {
    await expect(listTransferDirectories({ directory_type: 'library', storage_type: 'remote' })).resolves.toEqual([])

    expect(mocks.apiGet).toHaveBeenCalledWith('storage/directories', {
      params: { directory_type: 'library', storage_type: 'remote' },
    })
  })
})
