import type { Context, TorrentInfo } from '@/api/types'
import TorrentMoreSourcesDialog from '@/components/dialog/TorrentMoreSourcesDialog.vue'
import { screen } from '@testing-library/vue'
import { createTorrentInfo } from '@tests/support/factories/site'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'

const DialogStub = defineComponent({
  name: 'VDialog',
  template: '<div role="dialog"><slot /></div>',
})

/** 仅构造更多来源展示需要的资源信息，其他媒体字段不参与促销判定。 */
function context(torrent: Partial<TorrentInfo>): Context {
  return {
    media_info: {},
    meta_info: {},
    torrent_info: createTorrentInfo({ site_name: '测试站', ...torrent }),
  } as Context
}

describe('TorrentMoreSourcesDialog promotion display', () => {
  it.each([
    [null, null],
    [undefined, undefined],
    [0, null],
    [null, 2],
  ] as const)('hides unknown promotion with factors %s / %s', async (download, upload) => {
    const { container } = await renderWithProviders(TorrentMoreSourcesDialog, {
      props: {
        items: [context({ downloadvolumefactor: download, uploadvolumefactor: upload, volume_factor: '未知' })],
      },
      global: { stubs: { VDialog: DialogStub } },
    })
    expect(screen.getByText('测试站')).toBeInTheDocument()
    expect(screen.queryByText('未知')).not.toBeInTheDocument()
    expect(container.querySelector('.chip-free')).not.toBeInTheDocument()
  })

  it('keeps free, discount and upload bonus styles for known factors', async () => {
    await renderWithProviders(TorrentMoreSourcesDialog, {
      props: {
        items: [
          context({ downloadvolumefactor: 0, volume_factor: 'FREE' }),
          context({ downloadvolumefactor: 0.5, volume_factor: '50%' }),
          context({ uploadvolumefactor: 2, volume_factor: '2X' }),
        ],
      },
      global: { stubs: { VDialog: DialogStub } },
    })
    expect(screen.getByText('FREE').closest('.v-chip')).toHaveClass('chip-free')
    expect(screen.getByText('50%').closest('.v-chip')).toHaveClass('chip-discount')
    expect(screen.getByText('2X').closest('.v-chip')).toHaveClass('chip-bonus')
  })
})
