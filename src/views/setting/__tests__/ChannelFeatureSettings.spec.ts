import { ApiRequestError } from '@/api'
import type { ChannelSettings } from '@/api/channelSettings'
import { clearSharedDialogs, useSharedDialog } from '@/composables/useSharedDialog'
import ChannelFeatureSettings from '@/views/setting/ChannelFeatureSettings.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requests = vi.hoisted(() => ({
  load: vi.fn(),
  createConnection: vi.fn(),
  getReferences: vi.fn(),
  deleteConnection: vi.fn(),
  editNotification: vi.fn(),
  editInteraction: vi.fn(),
  rotateCredential: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/api/channelSettings', () => ({
  getChannelSettings: requests.load,
  updateNotificationRoute: requests.editNotification,
  updateInteractionPolicy: requests.editInteraction,
  updateChannelConnection: vi.fn(),
  createChannelConnection: requests.createConnection,
  getChannelConnectionReferences: requests.getReferences,
  deleteChannelConnection: requests.deleteConnection,
  rotateChannelCredential: requests.rotateCredential,
}))
vi.mock('vue-toastification', () => ({ useToast: () => ({ success: requests.success, error: requests.error }) }))
vi.mock('@/composables/useModuleCatalog', () => ({
  useModuleCatalog: () => ({
    loadModuleCatalog: vi.fn(),
    moduleOptions: () => ({ value: [{ title: 'Telegram', value: 'telegram' }] }),
  }),
}))

/** 控制请求的完成顺序，模拟已经提交但仍未返回的保存或读取。 */
function pending<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

/** 建立拥有不同功能版本的同一连接。 */
function settings(): ChannelSettings {
  return {
    connections: [
      {
        id: 'bot',
        name: '示例机器人',
        provider: 'telegram',
        mode: 'standard',
        enabled: true,
        identity_namespace: 'bot',
        revision: 2,
      },
    ],
    notifications: [{ connection_id: 'bot', enabled: true, message_types: ['订阅'], revision: 7 }],
    interactions: [{ connection_id: 'bot', enabled: true, admission: 'manual', revision: 3 }],
  }
}

/** 通过卡片打开当前页面的功能设置。 */
async function openCard(name = '示例机器人') {
  await fireEvent.click(await screen.findByRole('button', { name }))
}

/** 通过图标菜单切换当前连接的管理页面。 */
async function switchManagement(title: string) {
  await fireEvent.click(await screen.findByRole('button', { name: '切换管理页面' }))
  await fireEvent.click(await screen.findByText(title, { exact: true, selector: '.v-list-item-title' }))
}

describe('共享连接设置', () => {
  beforeEach(() => {
    clearSharedDialogs()
    vi.resetAllMocks()
    requests.load.mockImplementation(async () => settings())
  })

  it('关闭通知只保存路由，交互页关闭只保存对应策略', async () => {
    const notify = await renderWithProviders(ChannelFeatureSettings, {
      props: { feature: 'notification', active: true },
    })
    await openCard()
    await fireEvent.click(await screen.findByRole('checkbox', { name: '启用主动通知' }))
    await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(requests.editNotification).toHaveBeenCalledWith(
        expect.objectContaining({ connection_id: 'bot', revision: 7 }),
        false,
        ['订阅'],
      ),
    )
    expect(requests.editInteraction).not.toHaveBeenCalled()
    notify.unmount()

    await renderWithProviders(ChannelFeatureSettings, { props: { feature: 'interaction', active: true } })
    await openCard()
    await fireEvent.click(await screen.findByRole('checkbox', { name: '启用机器人交互' }))
    await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(requests.editInteraction).toHaveBeenCalledWith(
        expect.objectContaining({ connection_id: 'bot', revision: 3 }),
        false,
      ),
    )
    expect(requests.editNotification).toHaveBeenCalledTimes(1)
  })

  it('保存冲突用提示消息并刷新，读取失败保持错误状态且不回退旧表单', async () => {
    const conflict = new ApiRequestError('Conflict')
    conflict.status = 409
    requests.editInteraction.mockRejectedValue(conflict)
    const view = await renderWithProviders(ChannelFeatureSettings, { props: { feature: 'interaction', active: true } })
    await openCard()
    await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存' }))
    await waitFor(() => expect(requests.error).toHaveBeenCalledWith('其他页面已更新这项设置，请重新读取后再保存。'))
    view.unmount()

    const missing = new ApiRequestError('Not Found')
    missing.status = 404
    requests.load.mockRejectedValue(missing)
    await renderWithProviders(ChannelFeatureSettings, { props: { feature: 'interaction', active: true } })
    await waitFor(() => expect(requests.error).toHaveBeenCalledWith('读取渠道设置失败'))
    expect(screen.queryByText('此版本后端使用旧版通知设置。')).toBeNull()
    expect(requests.load).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
  })

  it('轮换失败且连接已暂停时刷新两页共用的连接状态', async () => {
    const before = settings()
    before.connections[0].can_rotate_credential = true
    const paused = settings()
    paused.connections[0] = {
      ...before.connections[0],
      revision: 3,
      credential_status: 'verification_required',
    }
    requests.load.mockResolvedValueOnce(before).mockResolvedValueOnce(paused)
    requests.rotateCredential.mockRejectedValue(
      new ApiRequestError('平台身份待核验', {
        businessFailure: true,
        payload: { success: false, data: paused.connections[0] },
      }),
    )
    await renderWithProviders(ChannelFeatureSettings, { props: { feature: 'interaction', active: true } })
    await openCard()
    await switchManagement('连接配置')
    await fireEvent.update(await screen.findByLabelText('新的机器人令牌'), 'new-token')
    await fireEvent.click(screen.getByRole('button', { name: '核验并轮换令牌' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '示例机器人' })).not.toBeDisabled())
    await openCard()
    expect(await screen.findByText('平台身份待核验，连接已暂停收发。请在连接设置中重新核验凭据。')).toBeVisible()
    expect(requests.rotateCredential).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'bot', revision: 2 }),
      'new-token',
    )
    await switchManagement('连接配置')
    expect(await screen.findByLabelText('新的机器人令牌')).toHaveValue('')
  })

  it('同页连接变更先保留打开的草稿，关闭后读取最新连接版本', async () => {
    const updated = settings()
    updated.notifications[0] = { ...updated.notifications[0], enabled: false, revision: 10 }
    requests.load.mockResolvedValueOnce(settings()).mockResolvedValue(updated)
    const view = await renderWithProviders(ChannelFeatureSettings, {
      props: { feature: 'notification', active: true, refreshKey: 0 },
    })
    await openCard()
    await view.rerender({ refreshKey: 1 })
    expect(requests.load).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('checkbox', { name: '启用主动通知' })).toBeChecked()
    await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(requests.load).toHaveBeenCalledTimes(2))
    await openCard()
    expect(screen.getByRole('checkbox', { name: '启用主动通知' })).not.toBeChecked()
    await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存' }))
    expect(requests.editNotification).toHaveBeenCalledWith(expect.objectContaining({ revision: 10 }), false, ['订阅'])
    await waitFor(() => expect(requests.success).toHaveBeenCalledWith('保存成功'))
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: '启用主动通知' })).toBeNull())
    view.unmount()
  })

  it('重开页面时迟到的读取不能回填旧连接或版本', async () => {
    const earlier = pending<ChannelSettings>()
    const fresh = settings()
    fresh.notifications[0].enabled = false
    fresh.notifications[0].revision = 11
    requests.load.mockReturnValueOnce(earlier.promise).mockResolvedValueOnce(fresh)

    const view = await renderWithProviders(ChannelFeatureSettings, { props: { feature: 'notification', active: true } })
    const signal: AbortSignal = requests.load.mock.calls[0][0]
    await view.rerender({ active: false })
    expect(signal.aborted).toBe(true)
    await view.rerender({ active: true })
    await openCard()
    expect(await screen.findByRole('checkbox', { name: '启用主动通知' })).not.toBeChecked()

    earlier.resolve(settings())
    await earlier.promise
    await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存' }))
    expect(requests.editNotification).toHaveBeenCalledWith(expect.objectContaining({ revision: 11 }), false, ['订阅'])
  })

  it('迟到的保存不能关闭重开后的弹窗、回填配置或显示旧提示', async () => {
    const earlier = pending<unknown>()
    requests.editNotification.mockReturnValueOnce(earlier.promise)
    const view = await renderWithProviders(ChannelFeatureSettings, { props: { feature: 'notification', active: true } })
    await openCard()
    await fireEvent.click(await screen.findByRole('checkbox', { name: '启用主动通知' }))
    await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存' }))
    await view.rerender({ active: false })
    await view.rerender({ active: true })
    await openCard()
    await switchManagement('连接配置')
    const name = await screen.findByLabelText('连接名称')
    await fireEvent.update(name, '新会话草稿')

    earlier.resolve(undefined)
    await earlier.promise
    expect(name).toHaveValue('新会话草稿')
    expect(requests.load).toHaveBeenCalledTimes(2)
    expect(requests.success).not.toHaveBeenCalled()
  })

  it('离开设置时清理新增连接弹窗和其中的草稿', async () => {
    const { dialogs } = useSharedDialog()
    const view = await renderWithProviders(ChannelFeatureSettings, { props: { feature: 'connection', active: true } })
    await fireEvent.click(await screen.findByRole('button', { name: '新建连接' }))
    await fireEvent.click(await screen.findByText('Telegram', { exact: true, selector: '.v-list-item-title' }))
    await openCard('Telegram 1')
    expect(dialogs.value).toHaveLength(1)

    await view.rerender({ active: false })
    expect(dialogs.value).toHaveLength(0)
    expect(requests.createConnection).not.toHaveBeenCalled()

    await view.rerender({ active: true })
    await fireEvent.click(await screen.findByRole('button', { name: '新建连接' }))
    await fireEvent.click(await screen.findByText('Telegram', { exact: true, selector: '.v-list-item-title' }))
    await openCard('Telegram 1')
    expect(dialogs.value).toHaveLength(1)
    view.unmount()
    expect(dialogs.value).toHaveLength(0)
  })

  it('新建和编辑草稿仅在页面保存时创建连接', async () => {
    const { dialogs } = useSharedDialog()
    requests.createConnection.mockResolvedValue({ id: 'new-bot' })
    await renderWithProviders(ChannelFeatureSettings, { props: { feature: 'connection', active: true } })
    await fireEvent.click(await screen.findByRole('button', { name: '新建连接' }))
    await fireEvent.click(await screen.findByText('Telegram', { exact: true, selector: '.v-list-item-title' }))
    await openCard('Telegram 1')
    const draft = dialogs.value[0].props.notification as { id: string }
    dialogs.value[0].events.change({
      ...draft,
      name: '新机器人',
      type: 'telegram',
      config: { TELEGRAM_TOKEN: 'test-token' },
    })
    clearSharedDialogs()
    expect(requests.createConnection).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: '新机器人' })).toBeVisible()

    await fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(requests.createConnection).toHaveBeenCalledExactlyOnceWith('新机器人', 'telegram', {
        TELEGRAM_TOKEN: 'test-token',
      }),
    )
  })

  it('从外层卡片移除共享连接前显示影响范围，确认后提交连接和两项功能的版本', async () => {
    const data = settings()
    data.can_delete_connections = true
    requests.load.mockResolvedValue(data)
    requests.getReferences.mockResolvedValue({ member_count: 2, task_count: 3 })
    const view = await renderWithProviders(ChannelFeatureSettings, { props: { feature: 'connection', active: true } })
    const remove = await screen.findByRole('button', { name: '移除连接 示例机器人' })
    await fireEvent.click(remove)
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('此连接关联 2 条成员记录和 3 个定时任务。')).toBeVisible()
    expect(within(dialog).getByText('通知路由停止投递。')).toBeVisible()
    expect(requests.deleteConnection).not.toHaveBeenCalled()
    await fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(requests.deleteConnection).not.toHaveBeenCalled()
    await fireEvent.click(remove)
    const confirm = within(await screen.findByRole('dialog'))
    await fireEvent.click(await confirm.findByRole('button', { name: '移除连接' }))
    expect(requests.deleteConnection).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 'bot', revision: 2 }),
      expect.objectContaining({ connection_id: 'bot', revision: 7 }),
      expect.objectContaining({ connection_id: 'bot', revision: 3 }),
    )
    view.unmount()
  })

  it('连接卡片默认打开配置，菜单只显示支持的用途，切换保留各自开关草稿', async () => {
    const data = settings()
    data.connections.push({ ...data.connections[0], id: 'push', provider: 'webpush', name: '浏览器推送' })
    data.notifications.push({ connection_id: 'push', enabled: false, message_types: [], revision: 1 })
    requests.load.mockResolvedValue(data)
    const view = await renderWithProviders(ChannelFeatureSettings, {
      props: { feature: 'connection', active: true },
    })
    await openCard()
    expect(await screen.findByLabelText('连接名称')).toBeVisible()
    await switchManagement('通知管理')
    await fireEvent.click(screen.getByRole('checkbox', { name: '启用主动通知' }))
    await switchManagement('交互管理')
    expect(screen.getByRole('checkbox', { name: '启用机器人交互' })).toBeChecked()
    await switchManagement('通知管理')
    expect(screen.getByRole('checkbox', { name: '启用主动通知' })).not.toBeChecked()
    await fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await fireEvent.click(await screen.findByRole('button', { name: '更多操作 浏览器推送' }))
    expect(await screen.findByText('通知管理', { exact: true, selector: '.v-list-item-title' })).toBeVisible()
    expect(screen.queryByText('交互管理', { exact: true, selector: '.v-list-item-title' })).toBeNull()
    await fireEvent.click(screen.getByText('通知管理', { exact: true, selector: '.v-list-item-title' }))
    expect(await screen.findByRole('checkbox', { name: '启用主动通知' })).not.toBeChecked()
    await fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(requests.editNotification).not.toHaveBeenCalled()
    expect(requests.editInteraction).not.toHaveBeenCalled()
    view.unmount()
  })

  it('同时显示不同类型的渠道卡片，切换卡片使用各自的配置和版本', async () => {
    const data = settings()
    data.connections.push({ ...data.connections[0], id: 'other', name: '第二个机器人', provider: 'qqbot' })
    data.notifications.push({ connection_id: 'other', enabled: true, message_types: ['站点'], revision: 19 })
    requests.load.mockResolvedValue(data)
    const { unmount } = await renderWithProviders(ChannelFeatureSettings, {
      props: { feature: 'notification', active: true },
    })
    expect(await screen.findByRole('button', { name: /第二个机器人/ })).toBeVisible()
    await openCard()
    await fireEvent.click(await screen.findByRole('checkbox', { name: '启用主动通知' }))
    await fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await fireEvent.click(screen.getByRole('button', { name: /第二个机器人/ }))
    expect(screen.getByRole('checkbox', { name: '启用主动通知' })).toBeChecked()
    await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存' }))
    expect(requests.editNotification).toHaveBeenCalledWith(
      expect.objectContaining({ connection_id: 'other', revision: 19 }),
      true,
      ['站点'],
    )
    await waitFor(() => expect(requests.success).toHaveBeenCalledWith('保存成功'))
    unmount()
  })
})
