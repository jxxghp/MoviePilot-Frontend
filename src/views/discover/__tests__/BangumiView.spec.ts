import BangumiView from '@/views/discover/BangumiView.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMediaListHarness, latestMediaListRequest } from './sourceViewTestUtils'

describe('BangumiView', () => {
  let mediaList: ReturnType<typeof createMediaListHarness>

  beforeEach(() => {
    mediaList = createMediaListHarness()
  })

  async function renderView() {
    return renderWithProviders(BangumiView, {
      global: {
        stubs: {
          MediaCardListView: mediaList.stub,
        },
      },
    })
  }

  it('starts with number, string, and null values and builds ten years from a fixed clock', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T12:00:00+08:00'))

    await renderView()

    expect(latestMediaListRequest(mediaList)).toEqual({
      apipath: 'discover/bangumi',
      params: {
        type: 2,
        cat: null,
        sort: 'rank',
        year: null,
      },
    })
    for (const year of ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017']) {
      expect(screen.getByText(year)).toBeInTheDocument()
    }
    expect(screen.queryByText('2016')).not.toBeInTheDocument()
  })

  it('passes object keys as strings while keeping the fixed Bangumi type numeric', async () => {
    const user = userEvent.setup()
    const currentYear = String(new Date().getFullYear())
    await renderView()

    await user.click(screen.getByText('Movie'))
    await user.click(screen.getByText('日期'))
    await user.click(screen.getByText(currentYear))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/bangumi',
        params: {
          type: 2,
          cat: '3',
          sort: 'date',
          year: currentYear,
        },
      })
    })
  })

  it('leaves deselected optional chip values undefined instead of normalizing them', async () => {
    const user = userEvent.setup()
    const currentYear = String(new Date().getFullYear())
    await renderView()

    await user.click(screen.getByText('Movie'))
    await user.click(screen.getByText('日期'))
    await user.click(screen.getByText(currentYear))
    await user.click(screen.getByText('Movie'))
    await user.click(screen.getByText('日期'))
    await user.click(screen.getByText(currentYear))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'discover/bangumi',
        params: {
          type: 2,
          cat: undefined,
          sort: undefined,
          year: undefined,
        },
      })
    })
  })
})
