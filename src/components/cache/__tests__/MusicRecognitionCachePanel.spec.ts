import MusicRecognitionCachePanel from '@/components/cache/MusicRecognitionCachePanel.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
    delete: mocks.apiDelete,
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

const cacheKey = '[音乐]晴天-周杰伦-叶惠美-2003'

function mockMusicCacheData() {
  mocks.apiGet.mockResolvedValue({
    data: {
      count: 2,
      recognized: 1,
      unrecognized: 1,
      data: [
        {
          key: cacheKey,
          media_id: 'rec-1',
          title: '晴天',
          artists: ['周杰伦'],
          album: '叶惠美',
          year: 2003,
          music_type: 'recording',
          cover_url: '',
        },
        {
          key: '[音乐]未知曲目--None-None',
          media_id: '',
          title: '未知曲目',
          artists: [],
          album: '',
          year: '',
          music_type: 'recording',
          cover_url: '',
        },
      ],
    },
  })
}

async function renderMusicRecognitionCachePanel() {
  return renderWithProviders(MusicRecognitionCachePanel, {
    initialState: {
      globalSettings: {
        data: {
          GLOBAL_IMAGE_CACHE: false,
          RECOGNIZE_SOURCE: 'musicbrainz',
          TMDB_IMAGE_DOMAIN: 'image.tmdb.org',
        },
      },
    },
  })
}

describe('MusicRecognitionCachePanel', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiDelete.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
  })

  it('loads music recognition cache from the music endpoint', async () => {
    mockMusicCacheData()

    await renderMusicRecognitionCachePanel()

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('music/cache'))
    expect(await screen.findByText('晴天')).toBeInTheDocument()
    expect(screen.getByText('周杰伦')).toBeInTheDocument()
    expect(screen.getByText('未知曲目')).toBeInTheDocument()
    expect(screen.getByText('MusicBrainz ID')).toBeInTheDocument()
  })

  it('shows empty hint when music cache is empty', async () => {
    mocks.apiGet.mockResolvedValue({
      data: {
        count: 0,
        recognized: 0,
        unrecognized: 0,
        data: [],
      },
    })

    await renderMusicRecognitionCachePanel()

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('music/cache'))
    expect(await screen.findByText('暂无 MusicBrainz 识别缓存')).toBeInTheDocument()
  })

  it('deletes a music cache item through the encoded endpoint', async () => {
    mockMusicCacheData()
    mocks.apiDelete.mockResolvedValue({ success: true, message: '音乐识别缓存删除成功' })

    await renderMusicRecognitionCachePanel()
    await screen.findByText('晴天')

    const user = userEvent.setup()
    const deleteButtons = screen.getAllByRole('button', { name: '删除' })
    await user.click(deleteButtons[0])

    await waitFor(() => expect(mocks.apiDelete).toHaveBeenCalledWith(`music/cache/${encodeURIComponent(cacheKey)}`))
    expect(mocks.toastSuccess).toHaveBeenCalled()
  })
})
