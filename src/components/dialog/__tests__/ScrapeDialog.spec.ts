import ScrapeDialog from '@/components/dialog/ScrapeDialog.vue'
import type { FileItem, ManualScrapeOptions } from '@/api/types'
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { seedMediaSourceCatalog } from '@tests/support/msw/handlers/catalog'
import { mediaEpisodeGroupsHandler } from '@tests/support/msw/handlers/media'
import { server } from '@tests/support/msw/server'
import { describe, expect, it, vi } from 'vitest'

// 渲染手动刮削弹窗并收集业务事件。
async function renderDialog(recognizeSource = 'themoviedb', items?: FileItem[]) {
  seedMediaSourceCatalog()
  const events = {
    close: vi.fn(),
    scrape: vi.fn<(options: ManualScrapeOptions) => void>(),
  }
  const result = await renderWithProviders(ScrapeDialog, {
    global: {
      components: {
        VDialogCloseBtn: DialogCloseBtn,
      },
    },
    initialState: {
      globalSettings: {
        data: {
          RECOGNIZE_SOURCE: recognizeSource,
        },
      },
    },
    props: {
      items: items ?? [{ name: 'Test Movie.mkv', path: '/media/Test Movie.mkv', storage: 'local', type: 'file' }],
      modelValue: true,
      onClose: events.close,
      onScrape: events.scrape,
    },
  })

  return { ...result, events }
}

describe('ScrapeDialog', () => {
  it('uses the configured source while keeping media id optional', async () => {
    const user = userEvent.setup()
    const { events } = await renderDialog('douban')

    expect(screen.getByLabelText('类型').closest('.v-col-md-6')).not.toBeNull()
    expect(screen.getByLabelText('数据源').closest('.v-col-md-6')).not.toBeNull()
    expect(screen.getByLabelText('豆瓣编号').closest('.v-col-md-12')).not.toBeNull()

    const startScrapeButton = screen.getByRole('button', { name: '开始刮削' })
    expect(startScrapeButton).toHaveStyle({ width: '50%', flex: '0 0 50%' })
    expect(startScrapeButton.closest('.app-dialog-actions')).toHaveClass('justify-center')
    await user.click(startScrapeButton)

    expect(events.scrape).toHaveBeenCalledWith({
      media_source: 'douban',
      media_id: undefined,
      type_name: undefined,
    })
  })

  it('submits the selected media type, source, and native id', async () => {
    const user = userEvent.setup()
    const { events } = await renderDialog()

    await user.click(screen.getByLabelText('类型'))
    await user.click(await screen.findByRole('option', { name: '电影' }))
    await user.click(screen.getByLabelText('数据源'))
    await user.click(await screen.findByRole('option', { name: '豆瓣' }))
    await user.type(screen.getByLabelText('豆瓣编号'), '1295644')
    await user.click(screen.getByRole('button', { name: '开始刮削' }))

    expect(events.scrape).toHaveBeenCalledWith({
      media_source: 'douban',
      media_id: '1295644',
      type_name: '电影',
    })
  })

  it('loads TMDB episode groups for TV and submits the selected group', async () => {
    const groupRequests = vi.fn()
    server.use(
      mediaEpisodeGroupsHandler(1399, [
        { episode_count: 12, group_count: 1, id: 'group-1', name: '播出顺序' },
      ], 200, groupRequests),
    )
    const user = userEvent.setup()
    const { events } = await renderDialog()

    await user.click(screen.getByLabelText('类型'))
    await user.click(await screen.findByRole('option', { name: '电视剧' }))
    await user.type(screen.getByLabelText('TheMovieDb编号'), '1399')
    await waitFor(() => expect(groupRequests).toHaveBeenCalledOnce())
    expect(screen.getByLabelText('TheMovieDb编号').closest('.v-col-md-6')).not.toBeNull()
    expect(screen.getByLabelText('剧集组').closest('.v-col-md-6')).not.toBeNull()
    await user.click(screen.getByLabelText('剧集组'))
    await user.click(await screen.findByRole('option', { name: /播出顺序/ }))
    await user.click(screen.getByRole('button', { name: '开始刮削' }))

    expect(events.scrape).toHaveBeenCalledWith({
      media_source: 'themoviedb',
      media_id: '1399',
      type_name: '电视剧',
      episode_group: 'group-1',
    })
  })

  it('shows the selected item count for batch scraping', async () => {
    await renderDialog('themoviedb', [
      { name: 'Test Show S01E01.mkv', path: '/tv/Test Show S01E01.mkv', storage: 'local', type: 'file' },
      { name: 'Test Show S01E02.mkv', path: '/tv/Test Show S01E02.mkv', storage: 'local', type: 'file' },
    ])

    expect(screen.getByText('共 2 项')).toBeInTheDocument()
  })

  it('supports MusicBrainz UUIDs when scraping music', async () => {
    const user = userEvent.setup()
    const { events } = await renderDialog('themoviedb', [
      { name: '晴天.flac', path: '/music/晴天.flac', storage: 'local', type: 'file' },
    ])

    await user.click(screen.getByLabelText('类型'))
    await user.click(await screen.findByRole('option', { name: '音乐' }))
    await user.type(screen.getByLabelText('MusicBrainz ID'), '977e6978-139d-425c-bb98-6b0c62d1e45e')
    await user.click(screen.getByRole('button', { name: '开始刮削' }))

    expect(events.scrape).toHaveBeenCalledWith({
      media_source: 'musicbrainz',
      media_id: '977e6978-139d-425c-bb98-6b0c62d1e45e',
      type_name: '音乐',
      music_type: 'recording',
    })
  })

  it('keeps an explicitly selected TheAudioDB source for music scraping', async () => {
    const user = userEvent.setup()
    const { events } = await renderDialog('themoviedb', [
      { name: 'Yellow.flac', path: '/music/Yellow.flac', storage: 'local', type: 'file' },
    ])

    await user.click(screen.getByLabelText('类型'))
    await user.click(await screen.findByRole('option', { name: '音乐' }))
    await user.click(screen.getByLabelText('数据源'))
    await user.click(await screen.findByRole('option', { name: 'TheAudioDB' }))
    await user.type(screen.getByLabelText('TheAudioDB ID'), '32793500')
    await user.click(screen.getByRole('button', { name: '开始刮削' }))

    expect(events.scrape).toHaveBeenCalledWith({
      media_source: 'theaudiodb',
      media_id: '32793500',
      type_name: '音乐',
      music_type: 'recording',
    })
  })

  it('submits an explicit album namespace for music album ids', async () => {
    const user = userEvent.setup()
    const { events } = await renderDialog('musicbrainz', [
      { name: '叶惠美', path: '/music/叶惠美', storage: 'local', type: 'dir' },
    ])

    await user.click(screen.getByLabelText('类型'))
    await user.click(await screen.findByRole('option', { name: '音乐' }))
    await user.click(screen.getByLabelText('音乐实体'))
    await user.click(await screen.findByRole('option', { name: '专辑' }))
    await user.type(screen.getByLabelText('MusicBrainz ID'), '977e6978-139d-425c-bb98-6b0c62d1e45e')
    await user.click(screen.getByRole('button', { name: '开始刮削' }))

    expect(events.scrape).toHaveBeenCalledWith({
      media_source: 'musicbrainz',
      media_id: '977e6978-139d-425c-bb98-6b0c62d1e45e',
      type_name: '音乐',
      music_type: 'album',
    })
  })
})
