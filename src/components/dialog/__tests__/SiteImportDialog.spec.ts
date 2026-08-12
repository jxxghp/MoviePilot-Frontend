import SiteImportDialog from '@/components/dialog/SiteImportDialog.vue'
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createSite } from '@tests/support/factories/site'
import { addSiteHandler, siteApiUrls } from '@tests/support/msw/handlers/site'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  done: vi.fn(),
  start: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess, warning: mocks.toastWarning }),
}))

vi.mock('@/api/nprogress', () => ({
  configureNProgress: vi.fn(),
  doneNProgress: mocks.done,
  startNProgress: mocks.start,
}))

async function renderDialog() {
  const events = { importSuccess: vi.fn(), update: vi.fn() }
  const result = await renderWithProviders(SiteImportDialog, {
    props: {
      modelValue: true,
      'onImport-success': events.importSuccess,
      'onUpdate:modelValue': events.update,
    },
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
  })
  return { ...result, events }
}

function jsonFile(data: unknown, name = 'sites.json') {
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => JSON.stringify(data) })
  return file
}

function brokenJsonFile() {
  const file = new File(['{broken'], 'broken.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => '{broken' })
  return file
}

async function chooseFile(file: File) {
  await userEvent.setup().upload(screen.getByLabelText('选择文件'), file)
}

describe('SiteImportDialog', () => {
  it('previews only the first five sites and marks invalid rows', async () => {
    const sites = Array.from({ length: 6 }, (_, index) =>
      createSite(index === 1 ? { name: '' } : { name: `导入站点 ${index + 1}` }),
    )
    await renderDialog()

    await chooseFile(jsonFile(sites))

    expect(await screen.findByText('预览数据 (6 个站点)')).toBeInTheDocument()
    expect(screen.getByText('导入站点 1')).toBeInTheDocument()
    expect(screen.getByText('未命名站点')).toBeInTheDocument()
    expect(screen.getByText('导入站点 5')).toBeInTheDocument()
    expect(screen.queryByText('导入站点 6')).not.toBeInTheDocument()
    expect(screen.getByText('数据无效')).toBeInTheDocument()
  })

  it('rejects a non-JSON drop before parsing', async () => {
    await renderDialog()
    const file = new File(['text'], 'sites.txt', { type: 'text/plain' })

    await fireEvent.drop(document.querySelector('.upload-zone')!, { dataTransfer: { files: [file] } })

    expect(mocks.toastError).toHaveBeenCalledWith('不支持的文件类型，请选择JSON文件')
    expect(screen.getByLabelText('选择文件')).toBeInTheDocument()
  })

  it('rejects invalid JSON', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await renderDialog()

    await chooseFile(brokenJsonFile())

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('文件解析失败，请检查文件格式'))
    expect(screen.getByLabelText('选择文件')).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith('Parse file error:', expect.any(SyntaxError))
  })

  it('rejects non-array JSON', async () => {
    await renderDialog()

    await chooseFile(jsonFile({ name: 'single' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('文件格式无效，请检查文件内容'))
    expect(screen.getByLabelText('选择文件')).toBeInTheDocument()
  })

  it('tracks drag state and can reset a selected batch', async () => {
    await renderDialog()
    const zone = document.querySelector('.upload-zone')!

    await fireEvent.dragOver(zone)
    expect(zone).toHaveClass('dragging')
    await fireEvent.dragLeave(zone)
    expect(zone).not.toHaveClass('dragging')

    await fireEvent.drop(zone, { dataTransfer: { files: [jsonFile([createSite({ name: '拖入站点' })])] } })
    expect(await screen.findByText('拖入站点')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(screen.getByLabelText('选择文件')).toBeInTheDocument()
  })

  it('imports valid sites sequentially without their ids and closes on complete success', async () => {
    const sites = [createSite({ id: 801, name: '第一站' }), createSite({ id: 802, name: '第二站' })]
    const order: Array<Record<string, unknown>> = []
    server.use(
      addSiteHandler({ success: true }, 200, payload => {
        order.push(payload as unknown as Record<string, unknown>)
      }),
    )
    const user = userEvent.setup()
    const { events } = await renderDialog()
    await chooseFile(jsonFile(sites))

    await user.click(await screen.findByRole('button', { name: '开始导入' }))

    await waitFor(() => expect(order).toHaveLength(2))
    expect(order.map(site => site.name)).toEqual(['第一站', '第二站'])
    expect(order.every(site => !('id' in site))).toBe(true)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('成功导入 2 个站点')
    expect(events.importSuccess).toHaveBeenCalledOnce()
    expect(events.update).toHaveBeenCalledWith(false)
    expect(mocks.start).toHaveBeenCalledOnce()
    expect(mocks.done).toHaveBeenCalledOnce()
  })

  it('warns about invalid records and imports only valid records', async () => {
    const valid = createSite({ name: '有效站点' })
    const invalid = createSite({ domain: '', name: '无效站点' })
    const requested = vi.fn()
    server.use(addSiteHandler({ success: true }, 200, requested))
    await renderDialog()
    await chooseFile(jsonFile([valid, invalid]))

    await fireEvent.click(await screen.findByRole('button', { name: '开始导入' }))

    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    expect(mocks.toastWarning).toHaveBeenCalledWith('部分数据无效，有效数据 1/2 个')
  })

  it('keeps all business failures visible with backend details', async () => {
    const sites = [createSite({ name: '重复站点' }), createSite({ name: '未支持站点' })]
    let requestIndex = 0
    server.use(
      addSiteHandler({ success: false }, 200, () => {
        requestIndex += 1
      }),
    )
    await renderDialog()
    await chooseFile(jsonFile(sites))

    await fireEvent.click(await screen.findByRole('button', { name: '开始导入' }))

    expect(await screen.findByText('导入过程中出现 2 个错误')).toBeInTheDocument()
    expect(requestIndex).toBe(2)
    expect(mocks.toastError).toHaveBeenCalledWith('导入失败，2 个站点全部导入失败')
    expect(screen.getByText('重复站点 - 错误详情')).toBeInTheDocument()
    expect(screen.getByText('未支持站点 - 错误详情')).toBeInTheDocument()
  })

  it('reports partial success and preserves the backend HTTP error message', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sites = [createSite({ name: '成功站点' }), createSite({ name: '失败站点' })]
    let requestIndex = 0
    server.use(
      http.post(siteApiUrls.list, () => {
        requestIndex += 1
        if (requestIndex === 1) return HttpResponse.json({ success: true })
        return HttpResponse.json({ message: '第二站请求失败', success: false }, { status: 500 })
      }),
    )
    await renderDialog()
    await chooseFile(jsonFile(sites))

    await fireEvent.click(await screen.findByRole('button', { name: '开始导入' }))

    expect(await screen.findByText('导入过程中出现 1 个错误')).toBeInTheDocument()
    expect(screen.getByText('成功导入 1 个站点')).toBeInTheDocument()
    expect(mocks.toastError).toHaveBeenCalledWith('导入完成，成功 1 个，失败 1 个')
    await fireEvent.click(screen.getByText('失败站点 - 错误详情'))
    expect(await screen.findByText('第二站请求失败')).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith('Import site 失败站点 failed:', expect.any(Error))
  })

  it('does not start a request when every record is invalid', async () => {
    const requested = vi.fn()
    server.use(addSiteHandler({ success: true }, 200, requested))
    await renderDialog()
    await chooseFile(jsonFile([createSite({ domain: '', name: '', url: '' })]))

    await fireEvent.click(await screen.findByRole('button', { name: '开始导入' }))

    expect(mocks.toastError).toHaveBeenCalledWith('没有有效的数据')
    expect(requested).not.toHaveBeenCalled()
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('closes a failed result without a success event', async () => {
    server.use(addSiteHandler({ success: false, message: '已存在' }))
    const { events } = await renderDialog()
    await chooseFile(jsonFile([createSite({ name: '失败站点' })]))
    await fireEvent.click(await screen.findByRole('button', { name: '开始导入' }))
    expect(await screen.findByText('导入过程中出现 1 个错误')).toBeInTheDocument()

    const resultCloseButton = screen.getByText('关闭').closest('button')
    expect(resultCloseButton).not.toBeNull()
    await fireEvent.click(resultCloseButton!)
    expect(events.update).toHaveBeenCalledWith(false)
    expect(events.importSuccess).not.toHaveBeenCalled()
  })
})
