import api from '@/api'
import AnalyticsMediaStatistic from '@/views/dashboard/AnalyticsMediaStatistic.vue'
import { renderWithProviders } from '@tests/support/render'
import { screen, waitFor } from '@testing-library/vue'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/api', () => ({ default: { get: vi.fn() } }))
vi.mock('@/composables/useDashboardMotion', async importOriginal => {
  const actual = await importOriginal<typeof import('@/composables/useDashboardMotion')>()
  return {
    ...actual,
    useAnimatedDashboardNumber: (source: { value: number }) => source,
  }
})

const apiGet = vi.mocked(api.get)
const snapshotKey = 'MP_DASHBOARD_SNAPSHOT_V1:7:media-statistic-v1'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolver => {
    resolve = resolver
  })
  return { promise, resolve }
}

describe('AnalyticsMediaStatistic', () => {
  it('restores the last successful statistic before F5 revalidation completes', async () => {
    localStorage.setItem(
      snapshotKey,
      JSON.stringify({
        savedAt: Date.now(),
        value: {
          movie_count: 12,
          tv_count: 34,
          episode_count: 56,
          user_count: 7,
          movie_count_month: 1,
          tv_count_month: 2,
          episode_count_month: 3,
        },
      }),
    )
    const request = deferred<Record<string, number>>()
    apiGet.mockReturnValue(request.promise)

    await renderWithProviders(AnalyticsMediaStatistic, { initialState: { user: { userID: 7 } } })

    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('34')).toBeInTheDocument()
    expect(screen.getByText('56')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(apiGet).toHaveBeenCalledWith('dashboard/statistic')

    request.resolve({
      movie_count: 21,
      tv_count: 43,
      episode_count: 65,
      user_count: 8,
      movie_count_month: 4,
      tv_count_month: 5,
      episode_count_month: 6,
    })

    await waitFor(() => expect(screen.getByText('21')).toBeInTheDocument())
    expect(JSON.parse(localStorage.getItem(snapshotKey) ?? '{}').value).toMatchObject({
      movie_count: 21,
      tv_count: 43,
      episode_count: 65,
      user_count: 8,
    })
  })

  it('keeps the restored statistic when revalidation fails', async () => {
    localStorage.setItem(
      snapshotKey,
      JSON.stringify({
        savedAt: Date.now(),
        value: {
          movie_count: 12,
          tv_count: 34,
          episode_count: null,
          user_count: 7,
          movie_count_month: 1,
          tv_count_month: 2,
          episode_count_month: 3,
        },
      }),
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})
    apiGet.mockRejectedValue(new Error('remote unavailable'))

    await renderWithProviders(AnalyticsMediaStatistic, { initialState: { user: { userID: 7 } } })

    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('dashboard/statistic'))
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('34')).toBeInTheDocument()
    expect(screen.getByText('未获取')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('keeps the newest KeepAlive response when initial refreshes finish out of order', async () => {
    const firstRequest = deferred<Record<string, number>>()
    const secondRequest = deferred<Record<string, number>>()
    apiGet.mockReturnValueOnce(firstRequest.promise).mockReturnValueOnce(secondRequest.promise)
    const KeepAliveHarness = defineComponent({
      components: { AnalyticsMediaStatistic },
      template: '<KeepAlive><AnalyticsMediaStatistic /></KeepAlive>',
    })

    await renderWithProviders(KeepAliveHarness, { initialState: { user: { userID: 7 } } })
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2))

    secondRequest.resolve({
      movie_count: 21,
      tv_count: 43,
      episode_count: 65,
      user_count: 8,
      movie_count_month: 4,
      tv_count_month: 5,
      episode_count_month: 6,
    })
    await waitFor(() => expect(screen.getByText('21')).toBeInTheDocument())

    firstRequest.resolve({
      movie_count: 12,
      tv_count: 34,
      episode_count: 56,
      user_count: 7,
      movie_count_month: 1,
      tv_count_month: 2,
      episode_count_month: 3,
    })
    await Promise.resolve()

    expect(screen.getByText('21')).toBeInTheDocument()
    expect(screen.queryByText('12')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(snapshotKey) ?? '{}').value).toMatchObject({
      movie_count: 21,
      tv_count: 43,
      episode_count: 65,
      user_count: 8,
    })
  })
})
