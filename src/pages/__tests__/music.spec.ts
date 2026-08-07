import MusicPage from '@/pages/music.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

describe('music page', () => {
  beforeEach(() => {
    mocks.apiGet.mockResolvedValue([
      {
        album: '叶惠美',
        artist: '周杰伦',
        artists: ['周杰伦'],
        media_id: 'recording-1',
        source: 'musicbrainz',
        title: '晴天',
        type: '音乐',
        year: 2003,
      },
    ])
    mocks.apiPost.mockResolvedValue({ data: { id: 1 }, success: true })
  })

  it('searches metadata and connects resource search and subscription actions', async () => {
    const { router } = await renderWithProviders(MusicPage, {
      initialRoute: '/music?query=晴天',
      global: {
        stubs: {
          NoDataFound: true,
          VPageContentTitle: true,
        },
      },
    })

    await waitFor(() =>
      expect(mocks.apiGet).toHaveBeenCalledWith('music/search', {
        params: { count: 30, query: '晴天' },
      }),
    )
    const resourceButton = await screen.findByRole('button', { name: '搜索资源' })
    await fireEvent.click(resourceButton)
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/resource'))
    expect(router.currentRoute.value.query).toMatchObject({
      keyword: 'musicbrainz:recording-1',
      type: '音乐',
    })

    await router.push('/music?query=晴天')
    await fireEvent.click(screen.getByRole('button', { name: '订阅' }))
    await waitFor(() =>
      expect(mocks.apiPost).toHaveBeenCalledWith('subscribe/', {
        media_id: 'recording-1',
        media_source: 'musicbrainz',
        name: '晴天',
        type: '音乐',
        year: '2003',
      }),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('音乐订阅添加成功')
  })
})
