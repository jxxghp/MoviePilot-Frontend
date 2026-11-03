import TorrentBlacklistDialog from '@/components/dialog/TorrentBlacklistDialog.vue'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import {
  blacklistAddHandler,
  blacklistEntry,
  blacklistListHandler,
  blacklistUrl,
} from '@tests/support/msw/handlers/blacklist'
import { apiFailureJson, apiJson } from '@tests/support/msw/response'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('vue-toastification', () => ({ useToast: () => toast }))

async function renderDialog(admin = true) {
  return renderWithProviders(TorrentBlacklistDialog, { initialState: { user: { superUser: admin } } })
}

describe('TorrentBlacklistDialog', () => {
  beforeEach(() => {
    toast.success.mockClear()
    toast.error.mockClear()
    server.use(http.get('http://localhost/api/v1/site/', () => apiJson([{ id: 7, name: '站点七' }])))
  })

  it('显示永久规则说明、空列表并校验至少一个条件', async () => {
    server.use(blacklistListHandler({ items: [], total: 0, page: 1, count: 20 }))
    await renderDialog()
    expect(await screen.findByText('暂无黑名单条目')).toBeInTheDocument()
    expect(screen.getByText(/同条条件同时满足/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加规则' })).toBeDisabled()
  })

  it('通过可见表单提交关键词、站点和发布者，并展示重复添加结果', async () => {
    const user = userEvent.setup()
    const receive = vi.fn()
    server.use(
      blacklistListHandler({ items: [], total: 0, page: 1, count: 20 }),
      blacklistAddHandler({ entry: blacklistEntry(), created: false }, receive),
    )
    await renderDialog()
    await user.type(screen.getByRole('textbox', { name: '关键词' }), 'bad')
    await user.type(screen.getByRole('textbox', { name: '发布者' }), 'Alice')
    await user.click(screen.getByRole('combobox', { name: '站点' }))
    await user.click(await screen.findByRole('option', { name: '站点七' }))
    await user.click(screen.getByRole('button', { name: '添加规则' }))
    await waitFor(() => expect(receive).toHaveBeenCalledWith({ keyword: 'bad', site_id: 7, uploader: 'Alice' }))
    expect(toast.success).toHaveBeenCalledWith('该规则已在黑名单中')
  })

  it('列表加载失败显示重试，恢复后显示条目', async () => {
    const user = userEvent.setup()
    server.use(http.get(blacklistUrl, () => apiFailureJson('读取失败', null)))
    await renderDialog()
    expect(await screen.findByRole('alert')).toHaveTextContent('黑名单加载失败')
    server.use(blacklistListHandler({ items: [blacklistEntry()], total: 1, page: 1, count: 20 }))
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('bad')).toBeInTheDocument()
  })

  it('清空文本条件后禁用添加且不提交空规则', async () => {
    const user = userEvent.setup()
    const receive = vi.fn()
    server.use(
      blacklistListHandler({ items: [], total: 0, page: 1, count: 20 }),
      blacklistAddHandler({ entry: blacklistEntry(), created: true }, receive),
    )
    await renderDialog()
    await user.type(screen.getByRole('textbox', { name: '关键词' }), 'bad')
    await user.click(screen.getByRole('button', { name: 'Clear 关键词' }))
    expect(screen.getByRole('button', { name: '添加规则' })).toBeDisabled()
    expect(receive).not.toHaveBeenCalled()
  })

  it('添加进行中防止重复提交，失败后保留条件并允许重试', async () => {
    const user = userEvent.setup()
    let finish!: () => void
    const pending = new Promise<void>(resolve => {
      finish = resolve
    })
    const receive = vi.fn()
    server.use(
      blacklistListHandler({ items: [], total: 0, page: 1, count: 20 }),
      http.post(blacklistUrl, async () => {
        receive()
        await pending
        return apiFailureJson('已达到黑名单容量', null)
      }),
    )
    await renderDialog()
    await user.type(screen.getByRole('textbox', { name: '关键词' }), 'bad')
    await user.dblClick(screen.getByRole('button', { name: '添加规则' }))
    expect(receive).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '添加规则' })).toBeDisabled()
    finish()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('已达到黑名单容量'))
    expect(screen.getByRole('textbox', { name: '关键词' })).toHaveValue('bad')
    expect(screen.getByRole('button', { name: '添加规则' })).not.toBeDisabled()
  })

  it('删除最后一页唯一条目后回到上一页', async () => {
    const user = userEvent.setup()
    let removed = false
    const first = blacklistEntry('第一页', 'b'.repeat(32))
    const last = blacklistEntry('最后一页')
    server.use(
      blacklistListHandler(url => {
        const page = Number(url.searchParams.get('page'))
        return { items: page === 1 ? [first] : removed ? [] : [last], total: removed ? 20 : 21, page, count: 20 }
      }),
      http.delete(`${blacklistUrl}/${last.id}`, () => {
        removed = true
        return apiJson({ removed: true })
      }),
    )
    await renderDialog()
    await screen.findByText('第一页')
    await user.click(screen.getByRole('button', { name: '下一页' }))
    const row = (await screen.findByText('最后一页')).closest('.v-list-item')!
    await user.click(within(row as HTMLElement).getByRole('button', { name: '移除条目' }))
    expect(await screen.findByText('第一页')).toBeInTheDocument()
    expect(screen.queryByText('最后一页')).not.toBeInTheDocument()
  })

  it('慢的旧分页响应不能覆盖当前页面', async () => {
    const user = userEvent.setup()
    let resolveSlow!: () => void
    const slow = new Promise<void>(resolve => {
      resolveSlow = resolve
    })
    let requested = false
    server.use(
      blacklistListHandler(async url => {
        const page = Number(url.searchParams.get('page'))
        if (page === 2) {
          requested = true
          await slow
        }
        return { items: [blacklistEntry(page === 1 ? '当前页' : '过时页')], total: 21, page, count: 20 }
      }),
    )
    await renderDialog()
    await screen.findByText('当前页')
    await user.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(requested).toBe(true))
    await user.click(screen.getByRole('button', { name: '上一页' }))
    await screen.findByText('当前页')
    const responded = new Promise<void>(resolve => {
      const observe = ({ request }: { request: Request }) => {
        if (new URL(request.url).searchParams.get('page') === '2') {
          server.events.removeListener('response:mocked', observe)
          resolve()
        }
      }
      server.events.on('response:mocked', observe)
    })
    resolveSlow()
    await responded
    await flushPromises()
    expect(screen.getByText('当前页')).toBeInTheDocument()
    expect(screen.queryByText('过时页')).not.toBeInTheDocument()
  })

  it('移除失败保留条目并允许重试', async () => {
    const user = userEvent.setup()
    const entry = blacklistEntry()
    server.use(
      blacklistListHandler({ items: [entry], total: 1, page: 1, count: 20 }),
      http.delete(`${blacklistUrl}/${entry.id}`, () => apiFailureJson('不能移除', null)),
    )
    await renderDialog()
    await screen.findByText('bad')
    await user.click(screen.getByRole('button', { name: '移除条目' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(screen.getByText('bad')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '移除条目' })).not.toBeDisabled()
  })

  it('普通用户没有管理表单且不发起管理员请求', async () => {
    const requested = vi.fn()
    server.use(
      http.get(blacklistUrl, () => {
        requested()
        return apiJson(null)
      }),
    )
    await renderDialog(false)
    expect(screen.queryByRole('button', { name: '添加规则' })).not.toBeInTheDocument()
    expect(requested).not.toHaveBeenCalled()
  })
})
