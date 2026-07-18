import TheMovieDbView from '@/views/discover/TheMovieDbView.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMediaListHarness, latestMediaListRequest } from './sourceViewTestUtils'

const INITIAL_PARAMS = {
  sort_by: 'popularity.desc',
  with_genres: '',
  with_original_language: '',
  with_keywords: '',
  with_watch_providers: '',
  vote_average: 0,
  vote_count: 10,
  release_date: '',
}

describe('TheMovieDbView', () => {
  let mediaList: ReturnType<typeof createMediaListHarness>

  beforeEach(() => {
    mediaList = createMediaListHarness()
  })

  async function renderView() {
    return renderWithProviders(TheMovieDbView, {
      global: {
        stubs: {
          MediaCardListView: mediaList.stub,
        },
      },
    })
  }

  it('starts with the exact movie endpoint and filter contract', async () => {
    await renderView()

    expect(latestMediaListRequest(mediaList)).toEqual({
      apipath: 'discover/tmdb_movies',
      params: INITIAL_PARAMS,
    })
  })

  it('repairs media-specific sort and genre values in both type directions', async () => {
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByText('上映日期降序'))
    await user.click(screen.getByText('动作'))
    await user.click(screen.getByText('电视剧'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/tmdb_tvs',
        params: {
          ...INITIAL_PARAMS,
          sort_by: 'popularity.desc',
          with_genres: '',
        },
      })
    })

    await user.click(screen.getByText('首播日期降序'))
    await user.click(screen.getByText('动作冒险'))
    await user.click(screen.getByText('电影'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/tmdb_movies',
        params: {
          ...INITIAL_PARAMS,
          sort_by: 'popularity.desc',
          with_genres: '',
        },
      })
    })
  })

  it('preserves shared filters and the current numeric input types across type changes', async () => {
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByText('评分降序'))
    await user.click(screen.getByText('动画'))
    await user.click(screen.getByText('中文'))
    screen.getByRole('slider').focus()
    await user.keyboard('{ArrowRight}'.repeat(7))
    const voteCount = screen.getByRole('spinbutton')
    await user.clear(voteCount)
    await user.type(voteCount, '25')
    await user.click(screen.getByText('电视剧'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/tmdb_tvs',
        params: {
          ...INITIAL_PARAMS,
          sort_by: 'vote_average.desc',
          with_genres: '16',
          with_original_language: 'zh',
          vote_average: 7,
          vote_count: '25',
        },
      })
    })
  })

  it('restores mandatory defaults while leaving optional chip filters unset', async () => {
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByText('电影'))
    await user.click(screen.getByText('评分降序'))
    await user.click(screen.getByText('评分降序'))
    await user.click(screen.getByText('动画'))
    await user.click(screen.getByText('动画'))
    await user.click(screen.getByText('中文'))
    await user.click(screen.getByText('中文'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/tmdb_movies',
        params: {
          ...INITIAL_PARAMS,
          with_genres: undefined,
          with_original_language: undefined,
        },
      })
    })
  })
})
