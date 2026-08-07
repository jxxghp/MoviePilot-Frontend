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
    expect(screen.queryByText('识别失败，无法识别到有效信息！')).not.toBeInTheDocument()
  })
})
