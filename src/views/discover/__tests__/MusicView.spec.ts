import MusicView from '@/views/discover/MusicView.vue'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'

const MediaCardListViewStub = defineComponent({
  props: ['apipath', 'params'],
  template: '<pre data-testid="music-params">{{ JSON.stringify(params) }}</pre>',
})

describe('MusicView', () => {
  it('provides period, sort, cover and listen-count filters to music exploration', async () => {
    const user = userEvent.setup()
    await renderWithProviders(MusicView, {
      global: {
        stubs: { MediaCardListView: MediaCardListViewStub },
      },
    })

    await user.click(screen.getByText('本周'))
    await user.click(screen.getByText('收听最少'))
    await user.click(screen.getByText('仅有封面'))
    await user.clear(screen.getByLabelText('最低收听次数'))
    await user.type(screen.getByLabelText('最低收听次数'), '100')

    expect(screen.getByTestId('music-params')).toHaveTextContent('"range_name":"this_week"')
    expect(screen.getByTestId('music-params')).toHaveTextContent('"sort_by":"listen_count.asc"')
    expect(screen.getByTestId('music-params')).toHaveTextContent('"with_cover":true')
    expect(screen.getByTestId('music-params')).toHaveTextContent('"min_listen_count":100')
  })
})
