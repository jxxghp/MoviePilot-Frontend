import { listCustomIdentifiers, replaceCustomIdentifiers } from '@/api/customIdentifiers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  }),
}))

describe('custom identifiers API adapter', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset().mockResolvedValue(null)
    mocks.apiPost.mockReset().mockResolvedValue(null)
  })

  it('queries and narrows the dedicated identifier collection', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      count: 3,
      identifiers: ['旧名 => 新名', null, '季数 <> S02'],
    })

    await expect(listCustomIdentifiers()).resolves.toEqual(['旧名 => 新名', '季数 <> S02'])
    expect(mocks.apiGet).toHaveBeenCalledWith('system/identifiers')
  })

  it('normalizes a malformed query collection to an empty list', async () => {
    mocks.apiGet.mockResolvedValueOnce({ identifiers: {} })

    await expect(listCustomIdentifiers()).resolves.toEqual([])
  })

  it('replaces the list with an optimistic concurrency snapshot', async () => {
    mocks.apiPost.mockResolvedValueOnce({ identifiers: ['A', 'B'] })

    await expect(replaceCustomIdentifiers(['A', 'B'], ['A'])).resolves.toEqual(['A', 'B'])
    expect(mocks.apiPost).toHaveBeenCalledWith('system/identifiers', {
      identifiers: ['A', 'B'],
      expected_identifiers: ['A'],
    })
  })

  it('keeps the submitted list when an older compatible response omits it', async () => {
    await expect(replaceCustomIdentifiers(['A'], [])).resolves.toEqual(['A'])
  })
})
