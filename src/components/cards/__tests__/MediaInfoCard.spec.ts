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
            artists: ['周杰伦'],
            audio_format: 'FLAC',
            bit_depth: 24,
            sample_rate: 48000,
            title: '晴天',
            type: '音乐',
          },
          media_info: {
            artist: '周杰伦',
            title: '晴天',
            type: '音乐',
          },
        },
      },
    })

    expect(screen.getByText('晴天')).toBeInTheDocument()
    expect(screen.getByText('FLAC')).toBeInTheDocument()
    expect(screen.getByText('24 kHz 48000')).toBeInTheDocument()
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
})
