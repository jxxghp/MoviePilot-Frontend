import RecognitionCachePanel from '@/components/cache/RecognitionCachePanel.vue'
import { screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: mocks.apiGet,
  }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

const emptyMusicResponse = {
  data: {
    count: 0,
    recognized: 0,
    unrecognized: 0,
    data: [],
  },
}

/** 按请求端点分别返回 TMDB 与音乐识别缓存数据。 */
function mockCacheApis(tmdbData: Record<string, unknown>) {
  mocks.apiGet.mockImplementation((url: string) =>
    Promise.resolve(url === 'music/cache' ? emptyMusicResponse : { data: tmdbData }),
  )
}

async function renderRecognitionCachePanel(recognitionSource = 'themoviedb') {
  return renderWithProviders(RecognitionCachePanel, {
    initialState: {
      globalSettings: {
        data: {
          GLOBAL_IMAGE_CACHE: false,
          RECOGNIZE_SOURCE: recognitionSource,
          TMDB_IMAGE_DOMAIN: 'image.tmdb.org',
        },
      },
    },
  })
}

describe('RecognitionCachePanel shared recognition statistics', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
  })

  it('shows the persisted shared recognition count when sharing is enabled', async () => {
    mockCacheApis({
      count: 12,
      recognized: 9,
      unrecognized: 3,
      shared_recognized: 27,
      shared_recognize_enabled: true,
      data: [],
    })

    await renderRecognitionCachePanel()

    expect(await screen.findByText('共享识别')).toBeInTheDocument()
    expect(screen.getByText('27')).toBeInTheDocument()
    expect(screen.getByText('未识别')).toBeInTheDocument()
  })

  it('hides shared recognition statistics when sharing is disabled', async () => {
    mockCacheApis({
      count: 12,
      recognized: 9,
      unrecognized: 3,
      shared_recognized: 27,
      shared_recognize_enabled: false,
      data: [],
    })

    await renderRecognitionCachePanel()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('tmdb/cache'))

    expect(screen.queryByText('共享识别')).not.toBeInTheDocument()
  })

  it('loads TMDB cache even when Douban is selected as the recognition source', async () => {
    mockCacheApis({
      count: 0,
      recognized: 0,
      unrecognized: 0,
      shared_recognized: 0,
      shared_recognize_enabled: false,
      data: [],
    })

    await renderRecognitionCachePanel('douban')

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('tmdb/cache'))
  })
})

describe('RecognitionCachePanel unified movie/TV and music management', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
  })

  it('loads both cache sources and aggregates the statistics', async () => {
    mocks.apiGet.mockImplementation((url: string) =>
      Promise.resolve(
        url === 'music/cache'
          ? {
              data: {
                count: 3,
                recognized: 2,
                unrecognized: 1,
                data: [
                  {
                    key: '[音乐]晴天-周杰伦-叶惠美-2003',
                    media_id: 'rec-1',
                    title: '晴天',
                    artists: ['周杰伦'],
                    album: '叶惠美',
                    year: 2003,
                    music_type: 'recording',
                    cover_url: '',
                  },
                ],
              },
            }
          : {
              data: {
                count: 12,
                recognized: 9,
                unrecognized: 3,
                shared_recognized: 0,
                shared_recognize_enabled: false,
                data: [],
              },
            },
      ),
    )

    await renderRecognitionCachePanel()

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('tmdb/cache'))
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('music/cache'))
    // 总条数 12 + 3，已识别 9 + 2，未识别 3 + 1
    expect(await screen.findByText('15')).toBeInTheDocument()
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    // 音乐条目直接展示在统一面板中
    expect(screen.getByText('晴天')).toBeInTheDocument()
    // 类型筛选下拉框默认展示“全部”
    expect(screen.getByText('全部')).toBeInTheDocument()
  })
})
