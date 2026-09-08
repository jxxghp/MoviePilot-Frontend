import MediaIdSelector from '@/components/misc/MediaIdSelector.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: { get: mocks.apiGet },
}))

describe('MediaIdSelector layout', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('keeps the search field visible while results scroll independently', async () => {
    mocks.apiGet.mockResolvedValue([
      {
        media_id: 'tmdb-1',
        media_source: 'themoviedb',
        overview: '测试简介',
        poster_path: '',
        title: 'Hello Mini',
        type: '电视剧',
        year: '2019',
      },
    ])

    const { container } = await renderWithProviders(MediaIdSelector, {
      props: { type: 'themoviedb' },
      global: {
        stubs: {
          VDialogCloseBtn: {
            props: ['innerClass'],
            template: '<button type="button" :class="innerClass"><slot /></button>',
          },
        },
      },
    })
    const searchPanel = container.querySelector('.media-id-selector__search')
    const closeButton = container.querySelector('.media-id-selector__close')

    expect(container.querySelector('.media-id-selector')).toBeInTheDocument()
    expect(searchPanel).toBeInstanceOf(HTMLElement)
    expect(closeButton).toBeInstanceOf(HTMLButtonElement)
    expect(container.querySelector('.v-input__details')).not.toBeInTheDocument()
    expect(closeButton).toHaveAttribute('aria-label', '关闭')
    expect(closeButton).not.toHaveClass('static')

    const input = screen.getByPlaceholderText('输入媒体名称')
    await fireEvent.update(input, 'hello')
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('Hello Mini（2019）')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledWith('media/search', {
      params: {
        count: 20,
        media_source: 'themoviedb',
        page: 1,
        title: 'hello',
        type: 'media',
      },
    })

    const results = container.querySelector('.media-id-selector__results')
    expect(results).toBeInstanceOf(HTMLElement)
  })

  it('omits the repeated album title for albums while keeping it for recordings', async () => {
    mocks.apiGet.mockResolvedValue([
      {
        album: '叶惠美',
        artist: '周杰伦',
        media_id: 'album-1',
        media_source: 'musicbrainz',
        music_type: 'album',
        title: '叶惠美',
        type: '音乐',
        year: 2003,
      },
      {
        album: '叶惠美',
        artist: '周杰伦',
        media_id: 'recording-1',
        media_source: 'musicbrainz',
        music_type: 'recording',
        title: '以父之名',
        type: '音乐',
      },
    ])

    const { container } = await renderWithProviders(MediaIdSelector, {
      props: { type: 'musicbrainz' },
      global: {
        stubs: {
          VDialogCloseBtn: {
            props: ['innerClass'],
            template: '<button type="button" :class="innerClass"><slot /></button>',
          },
        },
      },
    })

    const input = screen.getByPlaceholderText('输入媒体名称')
    await fireEvent.update(input, '周杰伦')
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('叶惠美（2003）')).toBeInTheDocument()

    const subtitles = Array.from(container.querySelectorAll('.v-list-item-subtitle')).map(item =>
      item.textContent?.trim(),
    )
    expect(subtitles).toEqual(['专辑 周杰伦', '单曲 周杰伦 · 叶惠美'])
  })

  it('prefills album searches, scopes the API request, and exposes release-group types', async () => {
    mocks.apiGet.mockResolvedValue([
      {
        album_type: 'Single',
        artist: 'Eagles',
        media_id: 'live-single',
        media_source: 'musicbrainz',
        music_type: 'album',
        secondary_types: ['Live'],
        title: 'Hotel California',
        type: '音乐',
      },
      {
        album_type: 'Album',
        artist: 'Eagles',
        media_id: 'studio-album',
        media_source: 'musicbrainz',
        music_type: 'album',
        title: 'Hotel California',
        type: '音乐',
        year: 1976,
      },
      {
        artist: 'Eagles',
        media_id: 'recording-1',
        media_source: 'musicbrainz',
        music_type: 'recording',
        title: 'Hotel California',
        type: '音乐',
      },
    ])

    const { container } = await renderWithProviders(MediaIdSelector, {
      props: {
        initialKeyword: 'Eagles - Hotel California (1976)',
        musicTypes: ['album'],
        type: 'musicbrainz',
      },
      global: {
        stubs: {
          VDialogCloseBtn: {
            props: ['innerClass'],
            template: '<button type="button" :class="innerClass"><slot /></button>',
          },
        },
      },
    })

    expect(await screen.findByText('Hotel California（1976）')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('输入媒体名称')).toHaveValue('Eagles - Hotel California (1976)')
    expect(mocks.apiGet).toHaveBeenCalledWith('media/search', {
      params: {
        count: 20,
        media_source: 'musicbrainz',
        music_type: 'album',
        page: 1,
        title: 'Eagles - Hotel California (1976)',
        type: 'music',
      },
    })
    expect(screen.queryByText('单曲 Eagles')).not.toBeInTheDocument()
    const subtitles = Array.from(container.querySelectorAll('.v-list-item-subtitle')).map(item =>
      item.textContent?.trim(),
    )
    expect(subtitles).toEqual(['专辑 · Single · Live Eagles', '专辑 · Album Eagles'])
  })

  it('keeps newer manual search results when the initial search finishes later', async () => {
    let resolveInitialSearch: (value: Array<Record<string, unknown>>) => void = () => undefined
    const initialSearch = new Promise<Array<Record<string, unknown>>>(resolve => {
      resolveInitialSearch = resolve
    })
    mocks.apiGet.mockReturnValueOnce(initialSearch).mockResolvedValueOnce([
      {
        album_type: 'Album',
        artist: 'Eagles',
        media_id: 'new-result',
        media_source: 'musicbrainz',
        music_type: 'album',
        title: 'Hotel California',
        type: '音乐',
        year: 1976,
      },
    ])

    await renderWithProviders(MediaIdSelector, {
      props: {
        initialKeyword: 'Hotel California',
        musicTypes: ['album'],
        type: 'musicbrainz',
      },
      global: {
        stubs: {
          VDialogCloseBtn: {
            props: ['innerClass'],
            template: '<button type="button" :class="innerClass"><slot /></button>',
          },
        },
      },
    })

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(1))
    const input = screen.getByPlaceholderText('输入媒体名称')
    await fireEvent.update(input, 'Eagles - Hotel California (1976)')
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('Hotel California（1976）')).toBeInTheDocument()

    resolveInitialSearch([
      {
        album_type: 'Single',
        artist: 'Cover Artist',
        media_id: 'old-result',
        media_source: 'musicbrainz',
        music_type: 'album',
        title: 'Stale Hotel California',
        type: '音乐',
      },
    ])
    await Promise.resolve()
    await Promise.resolve()

    expect(screen.queryByText('Stale Hotel California')).not.toBeInTheDocument()
    expect(screen.getByText('Hotel California（1976）')).toBeInTheDocument()
  })

  it('ends loading when a pending initial search is cancelled', async () => {
    mocks.apiGet.mockReturnValue(new Promise(() => undefined))

    const view = await renderWithProviders(MediaIdSelector, {
      props: {
        initialKeyword: 'Hotel California',
        musicTypes: ['album'],
        type: 'musicbrainz',
      },
      global: {
        stubs: {
          VDialogCloseBtn: {
            props: ['innerClass'],
            template: '<button type="button" :class="innerClass"><slot /></button>',
          },
        },
      },
    })

    const fieldProgress = () => view.container.querySelector('.v-field__loader .v-progress-linear')
    await waitFor(() => expect(fieldProgress()).toHaveStyle({ height: '2px' }))
    await view.rerender({
      initialKeyword: '',
      musicTypes: ['album'],
      type: 'musicbrainz',
    })

    await waitFor(() => expect(fieldProgress()).toHaveStyle({ height: '0px' }))
  })

  it('does not infer a primary identity from auxiliary provider IDs', async () => {
    mocks.apiGet.mockResolvedValue([
      {
        douban_id: 'legacy-douban-id',
        title: '仅辅助 ID',
        type: '电影',
      },
    ])

    await renderWithProviders(MediaIdSelector, {
      props: { type: 'douban' },
      global: {
        stubs: {
          VDialogCloseBtn: {
            props: ['innerClass'],
            template: '<button type="button" :class="innerClass"><slot /></button>',
          },
        },
      },
    })
    const input = screen.getByPlaceholderText('输入媒体名称')
    await fireEvent.update(input, '辅助')
    await fireEvent.keyDown(input, { key: 'Enter' })

    expect(mocks.apiGet).toHaveBeenCalledWith('media/search', {
      params: {
        count: 20,
        media_source: 'douban',
        page: 1,
        title: '辅助',
        type: 'media',
      },
    })
    expect(screen.queryByText('仅辅助 ID')).not.toBeInTheDocument()
  })

  it('ignores results whose declared source does not match the requested source', async () => {
    mocks.apiGet.mockResolvedValue([
      {
        media_id: '42',
        media_source: 'themoviedb',
        title: '跨源结果',
        type: '电影',
      },
    ])

    await renderWithProviders(MediaIdSelector, {
      props: { type: 'douban' },
      global: {
        stubs: {
          VDialogCloseBtn: {
            props: ['innerClass'],
            template: '<button type="button" :class="innerClass"><slot /></button>',
          },
        },
      },
    })
    const input = screen.getByPlaceholderText('输入媒体名称')
    await fireEvent.update(input, '跨源')
    await fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.queryByText('跨源结果')).not.toBeInTheDocument()
  })
})
