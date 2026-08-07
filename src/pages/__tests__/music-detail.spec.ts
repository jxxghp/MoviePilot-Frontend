import MusicDetailPage from '@/pages/music-detail.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    post: (...args: unknown[]) => mocks.apiPost(...args),
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

describe('music detail page', () => {
  beforeEach(() => {
    mocks.apiPost.mockReset()
    mocks.apiPost.mockImplementation((path: string) => {
      if (path === 'music/recognize') {
        return Promise.resolve({
          album: '叶惠美',
          artist: '周杰伦',
          artists: ['周杰伦'],
          cover_url: 'https://coverartarchive.org/release-group/example/front-500',
          media_id: '977e6978-139d-425c-bb98-6b0c62d1e45e',
          source: 'musicbrainz',
          title: '晴天',
          type: '音乐',
          year: 2003,
        })
      }
      return Promise.resolve({ data: { id: 1 }, success: true })
    })
  })

  it('loads details and connects resource search and subscription actions', async () => {
    const { router } = await renderWithProviders(MusicDetailPage, {
      initialRoute:
        '/music/detail?source=musicbrainz&mediaid=977e6978-139d-425c-bb98-6b0c62d1e45e&title=晴天',
      global: {
        stubs: { NoDataFound: true },
      },
    })

    expect(await screen.findByText('晴天')).toBeInTheDocument()
    expect(mocks.apiPost).toHaveBeenCalledWith('music/recognize', {
      source: 'musicbrainz',
      media_id: '977e6978-139d-425c-bb98-6b0c62d1e45e',
    })

    await fireEvent.click(screen.getByRole('button', { name: '订阅' }))
    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith('subscribe/', {
        media_id: '977e6978-139d-425c-bb98-6b0c62d1e45e',
        media_source: 'musicbrainz',
        name: '晴天',
        type: '音乐',
        year: '2003',
      }),
    )

    await fireEvent.click(screen.getByRole('button', { name: '搜索资源' }))
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/resource'))
  })
})
