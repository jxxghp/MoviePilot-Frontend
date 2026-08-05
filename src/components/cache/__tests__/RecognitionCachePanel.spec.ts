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
  default: {
    get: mocks.apiGet,
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

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
    mocks.apiGet.mockResolvedValue({
      data: {
        count: 12,
        recognized: 9,
        unrecognized: 3,
        shared_recognized: 27,
        shared_recognize_enabled: true,
        data: [],
      },
    })

    await renderRecognitionCachePanel()

    expect(await screen.findByText('共享识别')).toBeInTheDocument()
    expect(screen.getByText('27')).toBeInTheDocument()
    expect(screen.getByText('未识别')).toBeInTheDocument()
  })

  it('hides shared recognition statistics when sharing is disabled', async () => {
    mocks.apiGet.mockResolvedValue({
      data: {
        count: 12,
        recognized: 9,
        unrecognized: 3,
        shared_recognized: 27,
        shared_recognize_enabled: false,
        data: [],
      },
    })

    await renderRecognitionCachePanel()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('tmdb/cache'))

    expect(screen.queryByText('共享识别')).not.toBeInTheDocument()
  })

  it('loads TMDB cache even when Douban is selected as the recognition source', async () => {
    mocks.apiGet.mockResolvedValue({
      data: {
        count: 0,
        recognized: 0,
        unrecognized: 0,
        shared_recognized: 0,
        shared_recognize_enabled: false,
        data: [],
      },
    })

    await renderRecognitionCachePanel('douban')

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('tmdb/cache'))
  })
})
