import type { Context } from '@/api/types'
import TorrentMoreSourcesDialog from '@/components/dialog/TorrentMoreSourcesDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

function createSource(resolution: string): Context {
  return {
    media_info: {},
    meta_info: {
      edition: 'WEB-DL',
      name: '测试媒体',
      resource_pix: resolution,
      resource_team: 'Team A',
      season_episode: 'S01',
    },
    torrent_info: {
      page_url: 'https://example.test/' + resolution,
      seeders: 1,
      site_name: '测试站点',
      size: 1,
      title: '测试资源 ' + resolution,
      volume_factor: 'FREE',
    },
  } as Context
}

describe('TorrentMoreSourcesDialog', () => {
  it('shows each alternative source resolution', async () => {
    await renderWithProviders(TorrentMoreSourcesDialog, {
      props: {
        modelValue: true,
        items: [createSource('720p'), createSource('480p')],
      },
    })

    expect(screen.getByText('720p')).toBeInTheDocument()
    expect(screen.getByText('480p')).toBeInTheDocument()
  })
})
