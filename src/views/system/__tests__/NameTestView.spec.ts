import NameTestView from '@/views/system/NameTestView.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  routerPush: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
}))

vi.mock('@/router', () => ({
  default: {
    push: mocks.routerPush,
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  }),
}))

interface RecognizedMedia {
  category?: string
  media_id: string
  source: string
  title: string
  type: string
  year: string
}

async function renderRecognizedMedia(media: RecognizedMedia, onClose = vi.fn()) {
  mocks.apiGet.mockResolvedValueOnce({
    media_info: media,
    meta_info: {
      apply_words: [],
      name: media.title,
      org_string: 'Test.Release',
    },
    torrent_info: {},
  })

  const result = await renderWithProviders(NameTestView, {
    attrs: { onClose },
    initialState: {
      globalSettings: {
        data: { RECOGNIZE_SOURCE: 'themoviedb' },
      },
    },
  })
  const user = userEvent.setup()

  await user.type(screen.getByLabelText('标题'), 'Test.Release')
  await user.click(screen.getByRole('button', { name: '识别' }))
  await screen.findByRole('link', { name: media.media_id })

  return { ...result, onClose, user }
}

describe('NameTestView media identity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mocks.routerPush.mockResolvedValue(undefined)
  })

  it.each([
    [
      'TheMovieDb',
      { media_id: '271016', source: 'themoviedb', title: '测试剧集', type: '电视剧', year: '2026' },
      'https://www.themoviedb.org/tv/271016',
    ],
    [
      'Douban',
      { media_id: '1295644', source: 'douban', title: '测试电影', type: '电影', year: '1994' },
      'https://movie.douban.com/subject/1295644',
    ],
    [
      'Bangumi',
      { media_id: '485', source: 'bangumi', title: '测试动画', type: '电视剧', year: '2026' },
      'https://bgm.tv/subject/485',
    ],
    [
      'AniList',
      { media_id: '154587', source: 'anilist', title: '测试番剧', type: '电视剧', year: '2026' },
      'https://anilist.co/anime/154587',
    ],
  ])('formats %s and links its native media ID', async (sourceLabel, media, expectedLink) => {
    await renderRecognizedMedia(media)

    const mediaIdLink = screen.getByRole('link', { name: media.media_id })
    expect(mediaIdLink).toHaveAttribute('href', expectedLink)
    expect(mediaIdLink).toHaveAttribute('target', '_blank')
    expect(mediaIdLink).toHaveAttribute('rel', 'noopener noreferrer')
    expect(mediaIdLink.closest('.pipeline-step')).toHaveTextContent(`媒体 ID${media.media_id}`)
    expect(mediaIdLink.closest('.pipeline-step')).not.toHaveTextContent(sourceLabel)
    const sourceDisplay = screen.getByTestId('recognition-source')
    expect(sourceDisplay).toHaveAttribute('data-source', media.source)
    expect(sourceDisplay).toHaveAccessibleName(sourceLabel)
    expect(sourceDisplay.closest('.pipeline-step')).toHaveTextContent(`识别数据源${sourceLabel}`)
    expect(sourceDisplay.querySelector('.media-source-logo')).toBeInTheDocument()
  })

  it('shows the recognized media type and category below metadata', async () => {
    await renderRecognizedMedia({
      category: '动漫',
      media_id: '485',
      source: 'bangumi',
      title: '测试动画',
      type: '电视剧',
      year: '2026',
    })

    const classificationStep = screen.getByText('媒体分类').closest('.pipeline-step')
    expect(classificationStep).toHaveTextContent('媒体分类电视剧 · 动漫')
  })

  it('closes the recognition dialog before navigating to the media detail', async () => {
    const eventOrder: string[] = []
    const onClose = vi.fn(() => eventOrder.push('close'))
    mocks.routerPush.mockImplementation(async () => {
      eventOrder.push('push')
    })
    const media = {
      media_id: '271016',
      source: 'themoviedb',
      title: '测试剧集',
      type: '电视剧',
      year: '2026',
    }
    const { user } = await renderRecognizedMedia(media, onClose)

    await user.click(screen.getByRole('button', { name: '查看详情' }))

    expect(eventOrder).toEqual(['close', 'push'])
    expect(onClose).toHaveBeenCalledOnce()
    expect(mocks.routerPush).toHaveBeenCalledWith({
      path: '/media',
      query: {
        mediaid: 'tmdb:271016',
        title: '测试剧集',
        type: '电视剧',
        year: '2026',
      },
    })
  })

  it('persists the five most recent unique titles and restores them in the combobox', async () => {
    mocks.apiGet.mockImplementation(async (_endpoint: string, options: { params: { title: string } }) => ({
      media_info: {
        media_id: '271016',
        source: 'themoviedb',
        title: options.params.title,
        type: '电视剧',
        year: '2026',
      },
      meta_info: {
        apply_words: [],
        name: options.params.title,
        org_string: options.params.title,
      },
      torrent_info: {},
    }))
    const result = await renderWithProviders(NameTestView, {
      initialState: {
        globalSettings: {
          data: { RECOGNIZE_SOURCE: 'themoviedb' },
        },
      },
    })
    const user = userEvent.setup()
    const titleInput = screen.getByLabelText('标题')
    const submittedTitles = ['标题一', '标题二', '标题三', '标题四', '标题五', '标题六', '标题三']

    for (const [index, title] of submittedTitles.entries()) {
      await user.clear(titleInput)
      await user.type(titleInput, ` ${title} `)
      await user.click(screen.getByRole('button', { name: index === 0 ? '识别' : '重新识别' }))
      await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(index + 1))
    }

    expect(JSON.parse(localStorage.getItem('MP_NAME_TEST_TITLE_HISTORY') || '[]')).toEqual([
      '标题三',
      '标题六',
      '标题五',
      '标题四',
      '标题二',
    ])

    result.unmount()
    await renderWithProviders(NameTestView, {
      initialState: {
        globalSettings: {
          data: { RECOGNIZE_SOURCE: 'themoviedb' },
        },
      },
    })

    const restoredInput = screen.getByLabelText('标题')
    await user.click(restoredInput)
    const historyOptions = await screen.findAllByRole('option')
    expect(historyOptions.map(option => option.textContent)).toEqual(['标题三', '标题六', '标题五', '标题四', '标题二'])
    await user.click(screen.getByRole('option', { name: '标题六' }))

    expect(restoredInput).toHaveValue('标题六')
  })
})
