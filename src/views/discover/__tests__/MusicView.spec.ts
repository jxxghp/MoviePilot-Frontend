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

/** 渲染音乐探索筛选，列表区域用桩组件回显请求参数。 */
function renderMusicView() {
  return renderWithProviders(MusicView, {
    global: { stubs: { MediaCardListView: MediaCardListViewStub } },
  })
}

describe('MusicView', () => {
  it('defaults to the sitewide top albums chart of the current month', async () => {
    await renderMusicView()

    const params = screen.getByTestId('music-params')
    expect(params).toHaveTextContent('"media_source":"musicbrainz"')
    expect(params).not.toHaveTextContent('"source"')
    expect(params).toHaveTextContent('"mode":"chart"')
    expect(params).toHaveTextContent('"entity":"album"')
    expect(params).toHaveTextContent('"range_name":"this_month"')
    expect(params).toHaveTextContent('"sort_by":"listen_count.desc"')
  })

  it('provides the official chart entities, periods and listen filters', async () => {
    const user = userEvent.setup()
    await renderMusicView()

    await user.click(screen.getByText('热门单曲'))
    await user.click(screen.getByText('过去一季'))
    await user.click(screen.getByText('收听最少'))
    await user.click(screen.getByText('仅有封面'))

    const params = screen.getByTestId('music-params')
    expect(params).toHaveTextContent('"entity":"recording"')
    expect(params).toHaveTextContent('"range_name":"quarter"')
    expect(params).toHaveTextContent('"sort_by":"listen_count.asc"')
    expect(params).toHaveTextContent('"with_cover":true')
  })

  it('switches to the official fresh releases mode with its own sort options', async () => {
    const user = userEvent.setup()
    await renderMusicView()

    await user.click(screen.getByText('新发行'))

    expect(screen.getByText('艺术家')).toBeInTheDocument()
    expect(screen.getByText('专辑名称')).toBeInTheDocument()

    await user.click(screen.getByText('艺术家'))
    await user.click(screen.getByText('即将发行'))

    const params = screen.getByTestId('music-params')
    expect(params).toHaveTextContent('"mode":"fresh"')
    expect(params).toHaveTextContent('"sort":"artist_credit_name"')
    expect(params).toHaveTextContent('"days":14')
    expect(params).toHaveTextContent('"past":false')
    expect(params).toHaveTextContent('"future":true')
  })
})
