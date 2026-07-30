import SiteAddEditDialog from '@/components/dialog/SiteAddEditDialog.vue'
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import { getActiveRequestsCount } from '@/utils/requestOptimizer'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createSite, createSiteDownloader } from '@tests/support/factories/site'
import {
  addSiteHandler,
  siteDetailsHandler,
  siteDownloadersHandler,
  updateSiteHandler,
} from '@tests/support/msw/handlers/site'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  done: vi.fn(),
  start: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/api/nprogress', () => ({
  configureNProgress: vi.fn(),
  doneNProgress: mocks.done,
  startNProgress: mocks.start,
}))

async function renderDialog(oper: 'add' | 'edit', siteid?: number, downloaders = [createSiteDownloader()]) {
  const events = { close: vi.fn(), save: vi.fn() }
  const downloaderRequested = vi.fn()
  server.use(siteDownloadersHandler(downloaders, 200, downloaderRequested))
  const result = await renderWithProviders(SiteAddEditDialog, {
    props: {
      modelValue: true,
      oper,
      siteid,
      onClose: events.close,
      onSave: events.save,
    },
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
  })
  await waitFor(() => expect(downloaderRequested).toHaveBeenCalledOnce())
  await waitFor(() => expect(getActiveRequestsCount()).toBe(0))
  return { ...result, events }
}

describe('SiteAddEditDialog', () => {
  it('creates a site with the entered form values and loaded downloader', async () => {
    const saved = vi.fn()
    server.use(addSiteHandler({ success: true }, 200, saved))
    const user = userEvent.setup()
    const { events } = await renderDialog('add', undefined, [createSiteDownloader({ name: '下载器 A' })])

    await user.type(screen.getByLabelText('站点地址'), 'https://new.example.com/')
    await fireEvent.update(screen.getByLabelText('RSS地址'), 'https://new.example.com/rss')
    await fireEvent.update(screen.getByLabelText('超时时间（秒）'), '30')
    await fireEvent.update(screen.getByLabelText('站点Cookie'), 'session=test')
    await fireEvent.update(screen.getByLabelText('站点User-Agent'), 'Goal5C-UA')
    await user.click(screen.getByRole('tab', { name: 'API' }))
    await fireEvent.update(screen.getByLabelText('请求头（Authorization）'), 'Bearer goal5c')
    await fireEvent.update(screen.getByLabelText('令牌（API Key）'), 'goal5c-key')
    await user.click(screen.getByLabelText('下载器'))
    await user.click(await screen.findByText('下载器 A'))
    await user.click(screen.getByLabelText('限制站点访问频率'))
    await fireEvent.update(screen.getByLabelText('单位周期（秒）'), '60')
    await fireEvent.update(screen.getByLabelText('周期内访问次数'), '5')
    await fireEvent.update(screen.getByLabelText('访问间隔（秒）'), '2')
    await user.click(screen.getByLabelText('使用代理访问'))
    await user.click(screen.getByLabelText('浏览器仿真'))
    await user.click(screen.getByRole('button', { name: '新增站点' }))

    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(saved.mock.calls[0][0]).toMatchObject({
      apikey: 'goal5c-key',
      cookie: 'session=test',
      downloader: '下载器 A',
      limit_count: '5',
      limit_interval: '60',
      limit_seconds: '2',
      proxy: true,
      render: true,
      rss: 'https://new.example.com/rss',
      timeout: '30',
      token: 'Bearer goal5c',
      ua: 'Goal5C-UA',
      url: 'https://new.example.com/',
    })
    expect(events.save).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('新增站点成功')
    expect(mocks.start).toHaveBeenCalledOnce()
    expect(mocks.done).toHaveBeenCalledOnce()
  })

  it('does not submit an add request without a URL', async () => {
    const saved = vi.fn()
    server.use(addSiteHandler({ success: true }, 200, saved))
    const { events } = await renderDialog('add')

    await fireEvent.click(screen.getByRole('button', { name: '新增站点' }))

    expect(saved).not.toHaveBeenCalled()
    expect(events.save).not.toHaveBeenCalled()
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('shows a business failure when creation is rejected', async () => {
    server.use(addSiteHandler({ message: '站点已存在', success: false }))
    const user = userEvent.setup()
    const { events } = await renderDialog('add')

    await user.type(screen.getByLabelText('站点地址'), 'https://duplicate.example.com/')
    await user.click(screen.getByRole('button', { name: '新增站点' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('新增站点失败：站点已存在'))
    expect(events.save).not.toHaveBeenCalled()
    expect(mocks.done).toHaveBeenCalledOnce()
  })

  it('restores progress and keeps the dialog open after an HTTP creation failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    server.use(addSiteHandler({ message: '服务异常', success: false }, 500))
    const user = userEvent.setup()
    const { events } = await renderDialog('add')

    await user.type(screen.getByLabelText('站点地址'), 'https://failed.example.com/')
    await user.click(screen.getByRole('button', { name: '新增站点' }))

    await waitFor(() => expect(mocks.done).toHaveBeenCalledOnce())
    expect(events.save).not.toHaveBeenCalled()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledOnce()
  })

  it('restores numeric flags and API mode when editing a rate-limited site', async () => {
    const site = createSite({
      apikey: 'api-key',
      downloader: '下载器 A',
      limit_count: 4,
      limit_interval: 60,
      limit_seconds: 2,
      proxy: 1,
      render: 0,
      token: 'token',
    })
    server.use(siteDetailsHandler(site.id, site))
    await renderDialog('edit', site.id, [createSiteDownloader({ name: '下载器 A' })])

    expect(await screen.findByText(site.name)).toBeInTheDocument()
    expect(screen.getByLabelText('使用代理访问')).toBeChecked()
    expect(screen.getByLabelText('浏览器仿真')).not.toBeChecked()
    expect(screen.getByLabelText('限制站点访问频率')).toBeChecked()
    expect(screen.getByDisplayValue('api-key')).toBeInTheDocument()
  })

  it('clears rate limits when disabled and emits save after an update', async () => {
    const site = createSite({ limit_count: 4, limit_interval: 60, limit_seconds: 2, name: '限流站点' })
    const saved = vi.fn()
    server.use(siteDetailsHandler(site.id, site), updateSiteHandler({ success: true }, 200, saved))
    const user = userEvent.setup()
    const { events } = await renderDialog('edit', site.id)

    await user.click(await screen.findByLabelText('限制站点访问频率'))
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(saved.mock.calls[0][0]).toMatchObject({ limit_count: 0, limit_interval: 0, limit_seconds: 0 })
    expect(events.save).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('限流站点 更新成功')
  })

  it.each([
    ['business', 200, { message: '不允许更新', success: false }, '限流站点 更新失败：不允许更新'],
    ['HTTP', 500, { message: '服务异常', success: false }, '限流站点 更新失败！'],
  ])('keeps the dialog open on %s update failure', async (_case, status, response, message) => {
    const consoleError = status === 500 ? vi.spyOn(console, 'error').mockImplementation(() => {}) : undefined
    const site = createSite({ name: '限流站点' })
    server.use(siteDetailsHandler(site.id, site), updateSiteHandler(response, status))
    const { events } = await renderDialog('edit', site.id)

    await fireEvent.click(await screen.findByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(message))
    expect(events.save).not.toHaveBeenCalled()
    expect(mocks.done).toHaveBeenCalledOnce()
    if (status === 500) expect(consoleError).toHaveBeenCalledOnce()
  })

  it('emits close from the dialog close button', async () => {
    const { events } = await renderDialog('add')

    await fireEvent.click(document.querySelector('.absolute.right-3.top-3')!)

    expect(events.close).toHaveBeenCalledOnce()
  })
})
