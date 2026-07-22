import AniListView from '@/views/discover/AniListView.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMediaListHarness, latestMediaListRequest } from './sourceViewTestUtils'

describe('AniListView', () => {
  let mediaList: ReturnType<typeof createMediaListHarness>

  beforeEach(() => {
    mediaList = createMediaListHarness()
  })

  /** 渲染带媒体列表观测桩的 AniList 探索页。 */
  async function renderView() {
    return renderWithProviders(AniListView, {
      global: {
        stubs: {
          MediaCardListView: mediaList.stub,
        },
      },
    })
  }

  it('starts with popular sorting and all optional filters cleared', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-22T12:00:00+08:00'))

    await renderView()

    expect(latestMediaListRequest(mediaList)).toEqual({
      apipath: 'anilist/discover',
      params: {
        sort: 'POPULARITY_DESC',
        genre: null,
        format: null,
        season: null,
        season_year: null,
        status: null,
        country: null,
      },
    })
  })

  it('uses the shared chip filter pattern and forwards selected values', async () => {
    const user = userEvent.setup()
    await renderView()

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await user.click(screen.getByText('评分优先'))
    await user.click(screen.getByText('剧场版'))
    await user.click(screen.getByText('奇幻'))
    await user.click(screen.getByText('夏季'))
    await user.click(screen.getByText('2026'))
    await user.click(screen.getByText('已完结'))
    await user.click(screen.getByText('日本'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'anilist/discover',
        params: {
          sort: 'SCORE_DESC',
          genre: 'Fantasy',
          format: 'MOVIE',
          season: 'SUMMER',
          season_year: 2026,
          status: 'FINISHED',
          country: 'JP',
        },
      })
    })
  })
})
