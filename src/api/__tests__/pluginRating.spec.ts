import { ApiRequestError } from '@/api/client'
import { getPluginRatings } from '@/api/pluginRating'
import { setNavigatingState } from '@/utils/requestOptimizer'
import { server } from '@tests/support/msw/server'
import { apiJson } from '@tests/support/msw/response'
import { HttpResponse, http } from 'msw'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}))

const ratingUrl = 'http://localhost/api/v1/plugin/rating'

describe('plugin rating snapshot API', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setNavigatingState(false)
  })

  it('passes a WAF that rejects plugin ID queries with one short request for a large catalog', async () => {
    const requests: string[] = []
    server.use(
      http.get(ratingUrl, ({ request }) => {
        requests.push(request.url)
        if (new URL(request.url).search) return HttpResponse.json({ detail: 'WAF blocked query' }, { status: 403 })
        return apiJson({
          demoplugin: { plugin_id: 'demoplugin', average_rating: 4.8, rating_count: 12, user_rating: 5 },
        })
      }),
    )
    const ids = ['DemoPlugin', ...Array.from({ length: 600 }, (_, index) => `Plugin${index}${'x'.repeat(100)}`)]

    const ratings = await getPluginRatings(ids)

    expect(requests).toEqual([ratingUrl])
    expect(Object.keys(ratings)).toEqual(ids)
    expect(ratings.DemoPlugin).toEqual({
      plugin_id: 'DemoPlugin',
      average_rating: 4.8,
      rating_count: 12,
      user_rating: 5,
    })
  })

  it('keeps exact list IDs, defaults unrated plugins to zero and omits unrelated snapshot entries', async () => {
    server.use(
      http.get(ratingUrl, () =>
        apiJson({
          demoplugin: { plugin_id: 'demoplugin', average_rating: 4.2, rating_count: 2 },
          unrelated: { plugin_id: 'unrelated', average_rating: 5, rating_count: 3 },
        }),
      ),
    )

    await expect(getPluginRatings(['DemoPlugin', 'UnratedPlugin', 'DemoPlugin'])).resolves.toEqual({
      DemoPlugin: { plugin_id: 'DemoPlugin', average_rating: 4.2, rating_count: 2, user_rating: null },
      UnratedPlugin: { plugin_id: 'UnratedPlugin', average_rating: 0, rating_count: 0, user_rating: null },
    })
  })

  it('does not request ratings for an empty catalog', async () => {
    const request = vi.fn(() => apiJson({}))
    server.use(http.get(ratingUrl, request))

    await expect(getPluginRatings([])).resolves.toEqual({})
    expect(request).not.toHaveBeenCalled()
  })

  it('propagates failed snapshots instead of presenting them as unrated plugins', async () => {
    server.use(http.get(ratingUrl, () => HttpResponse.json({ detail: 'Service unavailable' }, { status: 503 })))

    await expect(getPluginRatings(['DemoPlugin'])).rejects.toBeInstanceOf(ApiRequestError)
  })
})
