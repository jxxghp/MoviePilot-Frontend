import MediaInfoCard from '@/components/cards/MediaInfoCard.vue'
import { screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

describe('MediaInfoCard', () => {
  it('renders music recognition results whose meta identity is stored in title', async () => {
    await renderWithProviders(MediaInfoCard, {
      props: {
        context: {
          meta_info: {
            album: '完美的一天',
            artists: ['孙燕姿'],
            audio_format: 'FLAC',
            bit_depth: 24,
            bitrate: 1411200,
            duration: 221,
            sample_rate: 48000,
            title: '眼泪成诗',
            total_tracks: 10,
            track_number: 2,
            type: '音乐',
          },
          media_info: {
            album: '完美的一天',
            artist: '孙燕姿',
            metadata_category: 'Album',
            cover_url: 'https://coverartarchive.org/release-group/album-1/front-500',
            duration: 221,
            genres: ['华语流行'],
            isrc: 'TWA530505002',
            music_type: 'recording',
            release_date: '2005-10-07',
            title: '眼泪成诗',
            total_tracks: 10,
            track_number: 2,
            type: '音乐',
          },
        },
      },
    })

    expect(screen.getByText('眼泪成诗')).toBeInTheDocument()
    expect(screen.getByText('孙燕姿')).toBeInTheDocument()
    expect(screen.getByText('专辑：完美的一天')).toBeInTheDocument()
    expect(screen.getByText('2005-10-07 · 3:41 · 音轨 2/10')).toBeInTheDocument()
    expect(screen.getByText('单曲')).toBeInTheDocument()
    expect(screen.getByText('Album')).toBeInTheDocument()
    expect(screen.getByText('华语流行')).toBeInTheDocument()
    expect(screen.getByText('FLAC')).toBeInTheDocument()
    expect(screen.getByText('24-bit')).toBeInTheDocument()
    expect(screen.getByText('48 kHz')).toBeInTheDocument()
    expect(screen.getByText('1,411 kbps')).toBeInTheDocument()
    expect(screen.getByText('TWA530505002')).toBeInTheDocument()
    expect(document.querySelector('.v-img__img')).toHaveAttribute(
      'src',
      'https://coverartarchive.org/release-group/album-1/front-500',
    )
    expect(screen.queryByText('识别失败，无法识别到有效信息！')).not.toBeInTheDocument()
  })

  it('does not render music tags for movie contexts', async () => {
    await renderWithProviders(MediaInfoCard, {
      props: {
        context: {
          meta_info: {
            name: '流浪地球',
            type: '电影',
          },
          media_info: {
            title: '流浪地球',
            type: '电影',
            release_date: '2019-02-05',
            genres: ['科幻', '冒险'],
            year: 2019,
          },
        },
      },
    })

    // 影视结果不应出现音乐专属标签：日期、风格、艺术家等
    expect(screen.getByText('流浪地球')).toBeInTheDocument()
    expect(screen.queryByText('2019-02-05')).not.toBeInTheDocument()
    expect(screen.queryByText('科幻')).not.toBeInTheDocument()
    expect(screen.queryByText('冒险')).not.toBeInTheDocument()
  })

  it('uses the global backend cache for recognized music covers', async () => {
    const cover = 'https://coverartarchive.org/release-group/album-2/front-500'
    const { container } = await renderWithProviders(MediaInfoCard, {
      initialState: {
        globalSettings: {
          data: { GLOBAL_IMAGE_CACHE: true },
          initialized: true,
          loading: false,
        },
      },
      props: {
        context: {
          meta_info: { title: '缓存测试歌曲', type: '音乐' },
          media_info: { cover_url: cover, title: '缓存测试歌曲', type: '音乐' },
        },
      },
    })

    const image = container.querySelector<HTMLImageElement>('.v-img__img')
    expect(image?.src).toContain('system/cache/image?url=')
    expect(image?.src).toContain(encodeURIComponent(cover))
  })
})
