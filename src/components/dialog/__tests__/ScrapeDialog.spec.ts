import ScrapeDialog from '@/components/dialog/ScrapeDialog.vue'
import type { FileItem, ManualScrapeOptions } from '@/api/types'
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it, vi } from 'vitest'

// 渲染手动刮削弹窗并收集业务事件。
async function renderDialog(recognizeSource = 'themoviedb', items?: FileItem[]) {
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

    await user.click(screen.getByRole('button', { name: '确认' }))

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
    await user.click(screen.getByRole('button', { name: '确认' }))

    expect(events.scrape).toHaveBeenCalledWith({
      media_source: 'douban',
      media_id: '1295644',
      type_name: '电影',
    })
  })

  it('shows the selected item count for batch scraping', async () => {
    await renderDialog('themoviedb', [
      { name: 'Test Show S01E01.mkv', path: '/tv/Test Show S01E01.mkv', storage: 'local', type: 'file' },
      { name: 'Test Show S01E02.mkv', path: '/tv/Test Show S01E02.mkv', storage: 'local', type: 'file' },
    ])

    expect(screen.getByText('共 2 项')).toBeInTheDocument()
  })
})
