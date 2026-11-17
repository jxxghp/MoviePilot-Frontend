import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import type { ChannelMemberUpdate } from '@/api/authorization'
import ChannelAuthorizationDialog from '@/components/dialog/ChannelAuthorizationDialog.vue'
import { NativeLayoutAdapter } from '@/native/layout'
import { NativeSheetAdapter } from '@/native/sheet'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createChannelMember } from '@tests/support/factories/authorization'
import { authorizationApiUrls, authorizationListHandler } from '@tests/support/msw/handlers/authorization'
import { apiFailureJson, apiJson } from '@tests/support/msw/response'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

/** 使用真实 Vuetify 控件和 HTTP 客户端渲染审批窗口。 */
async function renderDialog() {
  return renderWithProviders(ChannelAuthorizationDialog, {
    props: { modelValue: true },
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
  })
}

describe('ChannelAuthorizationDialog', () => {
  it('网页将图标文字刷新与直接授权放在列表底部，进入表单后隐藏刷新', async () => {
    server.use(authorizationListHandler([createChannelMember()]))
    await renderDialog()
    await screen.findByRole('button', { name: '审批 小明' })
    const refresh = screen.getByRole('button', { name: '刷新' })
    const add = screen.getByRole('button', { name: '直接授权' })
    const footer = add.closest('.app-dialog-actions')!
    expect(footer).toContainElement(refresh)
    expect(footer).toHaveClass('justify-space-between')
    expect(refresh).toHaveClass('v-btn--variant-text')
    expect(refresh).not.toHaveClass('v-btn--icon')
    expect(refresh).toHaveTextContent('刷新')
    expect(refresh.querySelector('.v-btn__prepend .v-icon')).toBeInTheDocument()
    expect(footer.querySelectorAll('button')).toHaveLength(2)
    await waitFor(() => expect(add).toBeEnabled())
    await fireEvent.click(add)
    expect(screen.queryByRole('button', { name: '刷新' })).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(await screen.findByRole('button', { name: '刷新' })).toBeEnabled()
  })

  it('App 将直接授权与刷新登记到原生标题栏菜单，进入表单后撤销两个旧入口', async () => {
    server.use(authorizationListHandler([createChannelMember()]))
    const layout = new NativeLayoutAdapter(document, window)
    const adapter = new NativeSheetAdapter(document)
    layout.setActive(true)
    try {
      await renderDialog()
      await screen.findByRole('button', { name: '审批 小明' })
      await waitFor(() => expect(screen.getByRole('button', { name: '直接授权' })).toBeEnabled())
      const sheet = adapter.read('用户管理')!
      expect(sheet.actions).toEqual([
        expect.objectContaining({ title: '直接授权', enabled: true, icon: 'mdi-shield-check-outline' }),
        expect.objectContaining({ title: '刷新', enabled: true, icon: 'mdi-refresh' }),
      ])
      expect(document.querySelector('.app-dialog-actions')).not.toBeInTheDocument()
      expect(adapter.execute('presentation.action', { id: sheet.id, actionId: sheet.actions[0].id })).toBe(true)
      await screen.findByLabelText('平台用户 ID')
      expect(adapter.read('用户管理')!.actions).toEqual([])
      for (const action of sheet.actions)
        expect(adapter.execute('presentation.action', { id: sheet.id, actionId: action.id })).toBe(false)
      await fireEvent.click(screen.getByRole('button', { name: '取消' }))
      expect(await screen.findByRole('button', { name: '审批 小明' })).toBeInTheDocument()
      expect(adapter.read('用户管理')!.actions).toHaveLength(2)
    } finally {
      adapter.reset()
      layout.setActive(false)
    }
  })

  it('App 原生刷新复用列表读取，加载时禁止重复触发并保留搜索条件', async () => {
    const requested = vi.fn()
    let finishRefresh!: () => void
    const refreshResponse = new Promise<void>(resolve => {
      finishRefresh = resolve
    })
    server.use(
      http.get(authorizationApiUrls.list, async () => {
        requested()
        if (requested.mock.calls.length > 1) await refreshResponse
        return apiJson({
          members: requested.mock.calls.length === 1 ? [] : [createChannelMember()],
          channels: [],
        })
      }),
    )
    const layout = new NativeLayoutAdapter(document, window)
    const adapter = new NativeSheetAdapter(document)
    layout.setActive(true)
    try {
      const { unmount } = await renderDialog()
      await screen.findByText('暂无符合条件的成员')
      await waitFor(() => expect(screen.getByRole('button', { name: '刷新' })).toBeEnabled())
      await fireEvent.update(screen.getByRole('textbox', { name: '搜索昵称或用户 ID' }), '小')
      const sheet = adapter.read('用户管理')!
      expect(sheet.actions[0]).toEqual(expect.objectContaining({ title: '直接授权', enabled: false }))
      const refresh = sheet.actions[1]
      expect(refresh).toEqual(expect.objectContaining({ title: '刷新', enabled: true, icon: 'mdi-refresh' }))
      expect(adapter.execute('presentation.action', { id: sheet.id, actionId: refresh.id })).toBe(true)
      await waitFor(() => expect(requested).toHaveBeenCalledTimes(2))
      expect(adapter.read('用户管理')!.actions[1].enabled).toBe(false)
      expect(adapter.execute('presentation.action', { id: sheet.id, actionId: refresh.id })).toBe(false)
      expect(requested).toHaveBeenCalledTimes(2)
      finishRefresh()
      expect(await screen.findByRole('button', { name: '审批 小明' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: '搜索昵称或用户 ID' })).toHaveValue('小')
      await waitFor(() => expect(adapter.read('用户管理')!.actions[1].enabled).toBe(true))
      unmount()
      expect(adapter.execute('presentation.action', { id: sheet.id, actionId: refresh.id })).toBe(false)
    } finally {
      finishRefresh()
      adapter.reset()
      layout.setActive(false)
    }
  })

  it('在同一窗口审批默认成员，并按明确选择提交定时任务能力', async () => {
    const member = createChannelMember()
    const changed = vi.fn()
    server.use(
      authorizationListHandler([member]),
      http.put(authorizationApiUrls.member(member.id), async ({ request }) => {
        const payload = (await request.json()) as ChannelMemberUpdate
        changed(payload)
        return apiJson({ ...member, ...payload })
      }),
    )
    await renderDialog()
    await fireEvent.click(await screen.findByRole('button', { name: '审批 小明' }))
    expect(screen.getByLabelText('平台用户 ID')).toHaveValue('10001')
    expect(screen.getByLabelText('平台用户 ID')).toHaveAttribute('readonly')
    expect(screen.getByRole('checkbox', { name: '定时任务' })).not.toBeChecked()
    await fireEvent.click(screen.getByRole('checkbox', { name: '下载' }))
    await fireEvent.click(screen.getByRole('checkbox', { name: '定时任务' }))
    await fireEvent.click(screen.getByRole('button', { name: '批准授权' }))
    await waitFor(() =>
      expect(changed).toHaveBeenCalledWith({
        status: 'approved',
        role: 'member',
        scopes: ['search', 'subscribe', 'schedule'],
      }),
    )
    await fireEvent.click(screen.getByRole('tab', { name: '已授权 (1)' }))
    expect(await screen.findByRole('button', { name: '编辑 小明' })).toBeInTheDocument()
  })

  it('授予渠道管理员时必须单独确认，确认前不发送请求', async () => {
    const user = userEvent.setup()
    const member = createChannelMember()
    const changed = vi.fn()
    server.use(
      authorizationListHandler([member]),
      http.put(authorizationApiUrls.member(member.id), async ({ request }) => {
        const payload = (await request.json()) as ChannelMemberUpdate
        changed(payload)
        return apiJson({ ...member, ...payload })
      }),
    )
    await renderDialog()
    await user.click(await screen.findByRole('button', { name: '审批 小明' }))
    await user.click(screen.getByLabelText('角色'))
    await user.click(await screen.findByRole('option', { name: '渠道管理员' }))
    expect(screen.getByRole('button', { name: '批准授权' })).toBeDisabled()
    expect(changed).not.toHaveBeenCalled()
    await user.click(screen.getByRole('checkbox', { name: '确认授予渠道管理员权限' }))
    await user.click(screen.getByRole('button', { name: '批准授权' }))
    await waitFor(() =>
      expect(changed).toHaveBeenCalledWith({
        status: 'approved',
        role: 'admin',
        scopes: ['search', 'subscribe', 'download', 'schedule'],
      }),
    )
  })

  it('拒绝、停用和恢复保留记录身份，恢复前可重新核对权限', async () => {
    const pending = createChannelMember()
    const approved = createChannelMember({
      id: 'member-b',
      display_name: '小红',
      status: 'approved',
      scopes: ['search'],
      sender_id: '10002',
    })
    const updated = vi.fn()
    server.use(
      authorizationListHandler([pending, approved]),
      http.put('http://localhost/api/v1/authorization/:id', async ({ params, request }) => {
        const payload = (await request.json()) as ChannelMemberUpdate
        updated(params.id, payload)
        return apiJson({ ...(params.id === pending.id ? pending : approved), ...payload })
      }),
    )
    await renderDialog()
    await fireEvent.click(await screen.findByRole('button', { name: '拒绝 小明' }))
    await waitFor(() =>
      expect(updated).toHaveBeenCalledWith('member-a', expect.objectContaining({ status: 'rejected' })),
    )
    await fireEvent.click(screen.getByRole('tab', { name: '已授权 (1)' }))
    await fireEvent.click(await screen.findByRole('button', { name: '停用 小红' }))
    await fireEvent.click(await screen.findByRole('tab', { name: '停用 / 拒绝 (2)' }))
    await fireEvent.click(screen.getByRole('button', { name: '恢复 小红' }))
    expect(screen.getByRole('checkbox', { name: '资源搜索' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '下载' })).not.toBeChecked()
    await fireEvent.click(screen.getByRole('button', { name: '批准授权' }))
    await waitFor(() =>
      expect(updated).toHaveBeenLastCalledWith('member-b', { status: 'approved', role: 'member', scopes: ['search'] }),
    )
  })

  it('加载失败可重试，保存失败保留正在编辑的权限', async () => {
    const member = createChannelMember()
    server.use(http.get(authorizationApiUrls.list, () => apiFailureJson('读取暂时失败')))
    await renderDialog()
    expect(await screen.findByRole('alert')).toHaveTextContent('读取暂时失败')
    server.use(
      authorizationListHandler([member]),
      http.put(authorizationApiUrls.member(member.id), () => apiFailureJson('审批冲突，请刷新后重试')),
    )
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await fireEvent.click(await screen.findByRole('button', { name: '审批 小明' }))
    await fireEvent.click(screen.getByRole('checkbox', { name: '定时任务' }))
    await fireEvent.click(screen.getByRole('button', { name: '批准授权' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('审批冲突，请刷新后重试')
    expect(screen.getByRole('checkbox', { name: '定时任务' })).toBeChecked()
    expect(screen.getByLabelText('平台用户 ID')).toHaveValue('10001')
  })

  it('直接授权只可选择启用实例，完整发送者 ID 必填且提交前去除空白', async () => {
    const user = userEvent.setup()
    const created = vi.fn()
    server.use(
      authorizationListHandler(
        [],
        [
          { id: 'telegram-a', name: '家庭机器人', channel: 'Telegram', enabled: true },
          { id: 'telegram-disabled', name: '停用机器人', channel: 'Telegram', enabled: false },
        ],
      ),
      http.post(authorizationApiUrls.list, async ({ request }) => {
        const payload = await request.json()
        created(payload)
        return apiJson(createChannelMember({ status: 'approved' }))
      }),
    )
    await renderDialog()
    const add = await screen.findByRole('button', { name: '直接授权' })
    await waitFor(() => expect(add).toBeEnabled())
    await user.click(add)
    await user.click(screen.getByLabelText('通知渠道'))
    expect(await screen.findByRole('option', { name: '家庭机器人 · Telegram' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '停用机器人 · Telegram' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: '家庭机器人 · Telegram' }))
    expect(screen.getByRole('button', { name: '批准授权' })).toBeDisabled()
    await fireEvent.update(screen.getByLabelText('平台用户 ID'), '  10001  ')
    await fireEvent.update(screen.getByLabelText('显示名称'), ' 小明 ')
    await fireEvent.click(screen.getByRole('button', { name: '批准授权' }))
    await waitFor(() =>
      expect(created).toHaveBeenCalledWith({
        notification_id: 'telegram-a',
        sender_id: '10001',
        display_name: '小明',
        status: 'approved',
        role: 'member',
        scopes: ['search', 'subscribe', 'download'],
      }),
    )
  })

  it('仅显示无文本标签的搜索框，输入昵称、用户 ID、关联账号或渠道信息即本地过滤', async () => {
    const requested = vi.fn()
    const members = [
      createChannelMember(),
      createChannelMember({
        id: 'member-b',
        display_name: '小红',
        sender_id: '20002',
        notification_id: 'wechat-b',
        source: '工作机器人',
        channel: 'WeChat',
        linked_username: 'WorkUser',
      }),
      createChannelMember({ id: 'member-c', display_name: '小红', sender_id: '30003', status: 'approved' }),
    ]
    server.use(
      http.get(authorizationApiUrls.list, () => {
        requested()
        return apiJson({ members, channels: [] })
      }),
    )
    await renderDialog()
    await screen.findByRole('button', { name: '审批 小明' })
    const search = screen.getByRole('textbox', { name: '搜索昵称或用户 ID' })
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    // Vuetify 保留空 label 节点，但不显示浮动标签或移动端两栏标签。
    expect(document.querySelector(`label[for="${search.id}"]`)).toHaveTextContent(/^$/)
    expect(search).toHaveAttribute('placeholder', '搜索昵称或用户 ID')
    for (const keyword of ['小红', '200', ' workuser ', '工作', 'wEcHaT']) {
      await fireEvent.update(search, keyword)
      expect(screen.queryByText('10001')).not.toBeInTheDocument()
      expect(screen.getByText('20002')).toBeInTheDocument()
      expect(screen.queryByText('30003')).not.toBeInTheDocument()
      expect(screen.getByRole('tab', { name: '待审批 (2)' })).toBeInTheDocument()
    }
    expect(requested).toHaveBeenCalledTimes(1)
    await fireEvent.update(search, '不匹配')
    expect(screen.getByText('暂无符合条件的成员')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(await screen.findByText('10001')).toBeInTheDocument()
    expect(screen.getByText('20002')).toBeInTheDocument()
    expect(requested).toHaveBeenCalledTimes(1)
  })

  it('搜索用户 ID 仍可区分昵称相同的跨实例成员', async () => {
    server.use(
      authorizationListHandler([
        createChannelMember(),
        createChannelMember({ id: 'member-b', sender_id: '20002', notification_id: 'telegram-b' }),
      ]),
    )
    await renderDialog()
    await screen.findAllByRole('button', { name: '审批 小明' })
    await fireEvent.update(screen.getByRole('textbox', { name: '搜索昵称或用户 ID' }), '20002')
    expect(screen.queryByText('10001')).not.toBeInTheDocument()
    expect(screen.getByText('20002')).toBeInTheDocument()
  })
})
