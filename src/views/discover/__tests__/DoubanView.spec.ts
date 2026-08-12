import DoubanView from '@/views/discover/DoubanView.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMediaListHarness, latestMediaListRequest } from './sourceViewTestUtils'

describe('DoubanView', () => {
  let mediaList: ReturnType<typeof createMediaListHarness>

  beforeEach(() => {
    mediaList = createMediaListHarness()
  })

  async function renderView() {
    return renderWithProviders(DoubanView, {
      global: {
        stubs: {
          MediaCardListView: mediaList.stub,
        },
      },
    })
  }

  it('starts with the frontend sort default and builds recent years from a fixed clock', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T12:00:00+08:00'))

    await renderView()

    expect(latestMediaListRequest(mediaList)).toEqual({
      apipath: 'discover/douban_movies',
      params: {
        sort: 'U',
        tags: '',
      },
    })
    for (const year of ['2026', '2025', '2024', '2023', '2022', '2021']) {
      expect(screen.getByText(year)).toBeInTheDocument()
    }
    expect(screen.queryByText('2020')).not.toBeInTheDocument()
    expect(screen.getByText('2020年代')).toBeInTheDocument()
  })

  it('keeps tags in genre-zone-year order across selection, replacement, and clearing', async () => {
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByText('2020年代'))
    await user.click(screen.getByText('日本'))
    await user.click(screen.getByText('喜剧'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/douban_movies',
        params: {
          sort: 'U',
          tags: '喜剧,日本,2020年代',
        },
      })
    })

    await user.click(screen.getByText('动作'))
    await user.click(screen.getByText('日本'))
    await user.click(screen.getByText('2020年代'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList).params.tags).toBe('动作')
    })

    await user.click(screen.getByText('动作'))
    await waitFor(() => expect(latestMediaListRequest(mediaList).params.tags).toBe(''))
  })

  it('preserves filters across type changes and restores deselected type and sort defaults', async () => {
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByText('高分优先'))
    await user.click(screen.getByText('喜剧'))
    await user.click(screen.getByText('电视剧'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/douban_tvs',
        params: {
          sort: 'S',
          tags: '喜剧',
        },
      })
    })

    await user.click(screen.getByText('电视剧'))
    await user.click(screen.getByText('高分优先'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/douban_movies',
        params: {
          sort: 'U',
          tags: '喜剧',
        },
      })
    })
  })

  it('defaults Douban music to official category browsing filters', async () => {
    const user = userEvent.setup()
    await renderView()

    await user.click(screen.getByTestId('douban-type-music'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'music/explore',
        params: {
          count: 30,
          douban_sort: 'U',
          media_source: 'doubanmusic',
          tags: '流行',
          with_cover: false,
        },
      })
    })
    expect(screen.queryByText('高分优先')).not.toBeInTheDocument()
    expect(screen.queryByText('2020年代')).not.toBeInTheDocument()
    expect(screen.queryByText('排行榜')).not.toBeInTheDocument()
    expect(screen.queryByText('分类浏览')).not.toBeInTheDocument()

    await user.click(screen.getByText('华语'))
    await user.click(screen.getByText('评分排序'))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList).params).toEqual({
        count: 30,
        douban_sort: 'S',
        media_source: 'doubanmusic',
        tags: '流行,华语',
        with_cover: false,
      })
    })

    await user.click(screen.getByText('仅有封面'))
    await waitFor(() => expect(latestMediaListRequest(mediaList).params.with_cover).toBe(true))
  })
})
