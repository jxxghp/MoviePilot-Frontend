import NameTestView from '@/views/system/NameTestView.vue'
import { screen } from '@testing-library/vue'
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
  detail_link?: string
  media_id: string
  media_source: string
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
      { media_id: '271016', media_source: 'themoviedb', title: '测试剧集', type: '电视剧', year: '2026' },
      'https://www.themoviedb.org/tv/271016',
    ],
    [
      'Douban',
      { media_id: '1295644', media_source: 'douban', title: '测试电影', type: '电影', year: '1994' },
      'https://movie.douban.com/subject/1295644',
    ],
    [
      'Bangumi',
      { media_id: '485', media_source: 'bangumi', title: '测试动画', type: '电视剧', year: '2026' },
      'https://bgm.tv/subject/485',
    ],
    [
      'AniList',
      { media_id: '154587', media_source: 'anilist', title: '测试番剧', type: '电视剧', year: '2026' },
      'https://anilist.co/anime/154587',
    ],
    [
      'MusicBrainz',
      {
        detail_link: 'https://musicbrainz.org/recording/8f97b17d-1234-4abc-9def-1234567890ab',
        media_id: '8f97b17d-1234-4abc-9def-1234567890ab',
        media_source: 'musicbrainz',
        title: '测试单曲',
        type: '音乐',
        year: '2026',
      },
      'https://musicbrainz.org/recording/8f97b17d-1234-4abc-9def-1234567890ab',
    ],
    [
      'TheAudioDB',
      {
        media_id: '32793500',
        media_source: 'theaudiodb',
        title: 'Yellow',
        type: '音乐',
        year: '2000',
      },
      'https://www.theaudiodb.com/track/32793500',
    ],
    [
      '豆瓣音乐',
      {
        media_id: '1401853',
        media_source: 'doubanmusic',
        title: '范特西',
        type: '音乐',
        year: '2001',
      },
      'https://music.douban.com/subject/1401853',
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
    expect(sourceDisplay).toHaveAttribute('data-source', media.media_source)
    expect(sourceDisplay).toHaveAccessibleName(sourceLabel)
    expect(sourceDisplay.closest('.pipeline-step')).toHaveTextContent(`识别数据源${sourceLabel}`)
    expect(sourceDisplay.querySelector('.media-source-logo')).toBeInTheDocument()
  })

  it('shows the recognized media type and category below metadata', async () => {
    await renderRecognizedMedia({
      category: '动漫',
      media_id: '485',
      media_source: 'bangumi',
      title: '测试动画',
      type: '电视剧',
      year: '2026',
    })

    const classificationStep = screen.getByText('媒体分类').closest('.pipeline-step')
    expect(classificationStep).toHaveTextContent('媒体分类电视剧 · 动漫')
  })

  it('renders music recognition results from music meta info without name field', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      media_info: {
        album: '叶惠美',
        artist: '周杰伦',
        category: 'Single',
        media_id: '8f97b17d-1234-4abc-9def-1234567890ab',
        media_source: 'musicbrainz',
        title: '晴天',
        type: '音乐',
        year: 2003,
      },
      meta_info: {
        apply_words: [],
        artist: '周杰伦',
        audio_format: 'FLAC',
        org_string: '周杰伦 - 晴天.flac',
        title: '晴天',
        type: '音乐',
      },
      torrent_info: {},
    })

    await renderWithProviders(NameTestView, {
      initialState: {
        globalSettings: {
          data: { RECOGNIZE_SOURCE: 'musicbrainz' },
        },
      },
    })
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('标题'), '周杰伦 - 晴天.flac')
    await user.click(screen.getByRole('button', { name: '识别' }))

    // 音乐元信息无 name 字段，仍应按识别成功展示曲名和来源
    await screen.findByRole('link', { name: '8f97b17d-1234-4abc-9def-1234567890ab' })
    expect(screen.getByText('晴天')).toBeInTheDocument()
    expect(screen.getByText('2003 · 周杰伦 · 叶惠美')).toBeInTheDocument()

    const sourceDisplay = screen.getByTestId('recognition-source')
    expect(sourceDisplay).toHaveAttribute('data-source', 'musicbrainz')
    expect(sourceDisplay).toHaveAccessibleName('MusicBrainz')

    const metaStep = screen.getByText('元信息').closest('.pipeline-step')
    expect(metaStep).toHaveTextContent('晴天 · 周杰伦 · FLAC')
  })

  it('hides the custom words input when MusicBrainz source is selected', async () => {
    await renderWithProviders(NameTestView, {
      initialState: {
        globalSettings: {
          data: { RECOGNIZE_SOURCE: 'themoviedb' },
        },
      },
    })
    const user = userEvent.setup()

    // 默认影视数据源时识别词输入区可见
    expect(screen.getByLabelText('识别词')).toBeInTheDocument()

    await user.click(screen.getByLabelText('识别数据源'))
    await user.click(await screen.findByRole('option', { name: 'MusicBrainz' }))
    // 音乐识别不应用识别词，输入区应隐藏
    expect(screen.queryByLabelText('识别词')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('识别数据源'))
    await user.click(await screen.findByRole('option', { name: 'TheAudioDB' }))
    expect(screen.queryByLabelText('识别词')).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('识别数据源'))
    await user.click(await screen.findByRole('option', { name: 'TheMovieDb' }))
    // 切回影视数据源后输入区恢复
    expect(screen.getByLabelText('识别词')).toBeInTheDocument()
  })

  it('treats a resolved custom-word save as success after the data client unwraps the response', async () => {
    mocks.apiGet.mockResolvedValueOnce({ value: ['已存在规则'] })
    mocks.apiPost.mockResolvedValueOnce(null)
    await renderWithProviders(NameTestView, {
      initialState: {
        globalSettings: {
          data: { RECOGNIZE_SOURCE: 'themoviedb' },
        },
      },
    })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('识别词'), '新增规则')
    await user.click(screen.getByRole('button', { name: '保存识别词' }))

    expect(mocks.apiGet).toHaveBeenCalledWith('system/setting/CustomIdentifiers')
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/CustomIdentifiers', ['已存在规则', '新增规则'], {
      feedback: 'silent',
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('识别词已保存到识别词表末尾')
  })

  it('sends TheAudioDB through the unified media source parameter', async () => {
    mocks.apiGet.mockResolvedValueOnce({})
    await renderWithProviders(NameTestView, {
      initialState: {
        globalSettings: {
          data: { RECOGNIZE_SOURCE: 'themoviedb' },
        },
      },
    })
    const user = userEvent.setup()

    await user.click(screen.getByLabelText('识别数据源'))
    await user.click(await screen.findByRole('option', { name: 'TheAudioDB' }))
    await user.type(screen.getByLabelText('标题'), 'Coldplay - Yellow')
    await user.click(screen.getByRole('button', { name: '识别' }))

    expect(mocks.apiGet).toHaveBeenCalledWith('media/recognize', {
      params: expect.objectContaining({ media_source: 'theaudiodb' }),
    })
  })

  it('closes the recognition dialog before navigating to the media detail', async () => {
    const eventOrder: string[] = []
    const onClose = vi.fn(() => eventOrder.push('close'))
    mocks.routerPush.mockImplementation(async () => {
      eventOrder.push('push')
    })
    const media = {
      media_id: '271016',
      media_source: 'themoviedb',
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
        media_id: '271016',
        media_source: 'themoviedb',
        title: '测试剧集',
        type: '电视剧',
        year: '2026',
      },
    })
  })

  it('does not offer navigation when only an auxiliary provider ID is present', async () => {
    mocks.apiGet.mockResolvedValueOnce({
      media_info: {
        episode_run_time: [],
        origin_country: [],
        title: '仅辅助身份',
        tmdb_id: 271016,
        type: '电影',
      },
      meta_info: { apply_words: [], name: '仅辅助身份', org_string: 'Auxiliary.Only' },
      torrent_info: {},
    })

    await renderWithProviders(NameTestView)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('标题'), 'Auxiliary.Only')
    await user.click(screen.getByRole('button', { name: '识别' }))

    expect(await screen.findAllByText('仅辅助身份')).not.toHaveLength(0)
    expect(screen.queryByRole('button', { name: '查看详情' })).not.toBeInTheDocument()
  })
})
