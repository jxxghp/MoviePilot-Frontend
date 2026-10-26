import { getMediaStatus } from '@/api/mediaStatus'
import { invalidateSharedData } from '@/utils/sharedDataCache'
import type { MediaInfo } from '@/api/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/api', () => ({ default: { get: mocks.get, post: mocks.post } }))

/** 构造不同来源身份但同名的可见卡片，验证合并时不会把不同媒体串用。 */
function movie(id: number): MediaInfo {
  return {
    media_source: 'themoviedb',
    media_id: String(id),
    title: `电影 ${id}`,
    type: '电影',
    year: '2026',
  } as MediaInfo
}

describe('visible media status batches', () => {
  beforeEach(() => {
    invalidateSharedData()
    mocks.get.mockReset()
    mocks.post.mockReset()
    vi.useFakeTimers()
  })

  it('coalesces forty visible cards into one request and preserves each result and mode', async () => {
    mocks.post.mockImplementation(async (_path, items) =>
      items.map((item: { media_id: string }) => ({
        item_id: item.media_id,
        subscribed: true,
        seasons: { 2: 'best_version_full' },
      })),
    )
    const requests = Array.from({ length: 40 }, (_, id) => getMediaStatus(movie(id + 1)))
    const duplicate = getMediaStatus(movie(1))
    await vi.advanceTimersByTimeAsync(10)
    const results = await Promise.all(requests)
    expect(mocks.post).toHaveBeenCalledOnce()
    expect(mocks.post.mock.calls[0][1]).toHaveLength(40)
    expect(results.map(item => item.item_id)).toEqual(Array.from({ length: 40 }, (_, id) => String(id + 1)))
    expect((await duplicate).seasons).toEqual({ 2: 'best_version_full' })
    await getMediaStatus(movie(1))
    expect(mocks.post).toHaveBeenCalledOnce()
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it('caps each batch at fifty and waits for the current batch before sending another', async () => {
    let finish!: () => void
    const first = new Promise<void>(resolve => {
      finish = resolve
    })
    mocks.post.mockImplementation(async (_path, items) => {
      if (items.length === 50) await first
      return items.map(() => ({ subscribed: false, seasons: {} }))
    })
    const requests = Array.from({ length: 51 }, (_, id) => getMediaStatus(movie(id + 1)))
    await vi.advanceTimersByTimeAsync(10)
    expect(mocks.post).toHaveBeenCalledOnce()
    finish()
    await Promise.all(requests)
    expect(mocks.post.mock.calls.map(([, items]) => items.length)).toEqual([50, 1])
  })

  it('falls back to bounded old endpoints only when the batch endpoint is absent', async () => {
    mocks.post.mockRejectedValue({ response: { status: 404 } })
    mocks.get.mockImplementation(async path =>
      path === 'mediaserver/exists' ? { item: { id: 'old-library' } } : { id: 7 },
    )
    const pending = getMediaStatus(movie(1))
    await vi.advanceTimersByTimeAsync(10)
    await expect(pending).resolves.toEqual({ item_id: 'old-library', subscribed: true, seasons: {}, legacy: true })
    expect(mocks.get).toHaveBeenCalledTimes(2)
    invalidateSharedData()
    mocks.post.mockRejectedValueOnce({ response: { status: 503 } })
    const failure = getMediaStatus(movie(2))
    const assertion = expect(failure).rejects.toMatchObject({ response: { status: 503 } })
    await vi.advanceTimersByTimeAsync(10)
    await assertion
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })
})
