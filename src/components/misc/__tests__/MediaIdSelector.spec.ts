import MediaIdSelector from '@/components/misc/MediaIdSelector.vue'
import { fireEvent, screen } from '@testing-library/vue'
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
    expect(subtitles).toEqual(['音乐 周杰伦', '音乐 周杰伦 · 叶惠美'])
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
