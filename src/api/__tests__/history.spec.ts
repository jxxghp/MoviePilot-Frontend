import { clearLegacyTransferHistory } from '@/api/history'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
  }),
}))

describe('history api', () => {
  beforeEach(() => {
    mocks.apiDelete.mockReset()
    mocks.apiDelete.mockResolvedValue({ data: null, message: '', success: true })
  })

  it('clears legacy transfer history through the destructive DELETE endpoint', async () => {
    await clearLegacyTransferHistory()

    expect(mocks.apiDelete).toHaveBeenCalledOnce()
    expect(mocks.apiDelete).toHaveBeenCalledWith('history/transfer/all')
  })
})
