import vuetify from '@/plugins/vuetify'
import AccountSettingNotification from '@/views/setting/AccountSettingNotification.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  useSilentSettingRefresh: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({ get: mocks.apiGet, post: mocks.apiPost }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: mocks.openSharedDialog,
}))

vi.mock('@/composables/useSilentSettingRefresh', () => ({
  useSilentSettingRefresh: mocks.useSilentSettingRefresh,
}))

vi.mock('@/components/cards/NotificationChannelCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'NotificationChannelCardStub',
      props: { notification: { type: Object, required: true } },
      emits: ['change', 'close'],
      template: `
        <section :aria-label="'channel-' + notification.name">
          <span>{{ notification.name }} / {{ notification.type }}</span>
          <input
            :aria-label="'name-' + notification.name"
            :value="notification.name"
            @input="$emit('change', { ...notification, name: $event.target.value }, notification.name)"
          />
          <button :aria-label="'remove-' + notification.name" @click="$emit('close')">remove</button>
        </section>
      `,
    }),
  }
})

vi.mock('vuedraggable', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'DraggableStub',
      props: { modelValue: { type: Array, default: () => [] } },
      emits: ['update:modelValue'],
      setup(props, { emit, slots }) {
        const reverse = () => emit('update:modelValue', [...props.modelValue].reverse())
        return () => {
          const items = props.modelValue as Array<{ name?: string }>
          return h('div', [
            h('button', { 'aria-label': 'reverse-channels', onClick: reverse }, 'reverse'),
            ...items.map(element => slots.item?.({ element })),
          ])
        }
      },
    }),
  }
})

const notificationsFixture = [
  { name: 'Alpha', type: 'wechatclawbot', enabled: true, config: { token: 'fixture-token' } },
  { name: '通知3', type: 'telegram', enabled: false, config: {} },
]

const templateFixture = {
  organizeSuccess: '{"title":"organized"}',
  downloadAdded: '{"title":"downloaded"}',
  subscribeAdded: '{}',
  subscribeComplete: '{}',
}

function mockLoadedSettings() {
  mocks.apiGet.mockImplementation((endpoint: string) => {
    if (endpoint === 'system/setting/Notifications') {
      return { success: true, data: { value: structuredClone(notificationsFixture) } }
    }
    if (endpoint === 'system/setting/NotificationSwitchs') {
      return { success: true, data: { value: [{ type: '资源下载', action: 'user' }] } }
    }
    if (endpoint === 'system/setting/NotificationSendTime') {
      return { success: true, data: { value: { start: '08:30', end: '22:00' } } }
    }
    if (endpoint === 'system/setting/NotificationTemplates') {
      return { success: true, data: { value: structuredClone(templateFixture) } }
    }
    throw new Error(`Unexpected GET ${endpoint}`)
  })
  mocks.apiPost.mockResolvedValue({ success: true })
}

function createDialogController() {
  return { close: vi.fn(), id: 1, updateProps: vi.fn() }
}

async function renderNotificationSettings() {
  return renderWithProviders(AccountSettingNotification)
}

function getCard(title: string) {
  const card = screen.getByText(title).closest('.v-card')
  expect(card).not.toBeNull()
  return within(card as HTMLElement)
}

function getDialogEvents() {
  return mocks.openSharedDialog.mock.calls.at(-1)?.[2] as {
    close: () => void
    save: (value: string) => Promise<void>
    'update:content': (value: string) => void
    'update:modelValue': (value: boolean) => void
  }
}

describe('AccountSettingNotification', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.useSilentSettingRefresh.mockReset()
    mocks.openSharedDialog.mockImplementation(() => createDialogController())
    mockLoadedSettings()
  })

  it('loads owned settings, adds missing switch defaults, and follows active refresh state', async () => {
    const { rerender } = await renderNotificationSettings()

    expect(await screen.findByText('Alpha / wechatclawbot')).toBeInTheDocument()
    expect(screen.getByText('通知3 / telegram')).toBeInTheDocument()
    expect(screen.getByLabelText('开始时间')).toHaveValue('08:30')
    expect(screen.getByLabelText('结束时间')).toHaveValue('22:00')
    expect(getCard('通知发送范围').getAllByRole('radiogroup')).toHaveLength(9)

    const refreshOptions = mocks.useSilentSettingRefresh.mock.calls[0]?.[1]
    expect(refreshOptions.active.value).toBe(true)
    await rerender({ active: false })
    expect(refreshOptions.active.value).toBe(false)
  })

  it('creates a unique automatic channel name, removes channels, and saves the current order', async () => {
    const user = userEvent.setup()
    await renderNotificationSettings()
    await screen.findByText('Alpha / wechatclawbot')
    const channelCard = getCard('通知渠道')

    const buttons = channelCard.getAllByRole('button')
    await user.click(buttons.at(-1)!)
    await user.click(await screen.findByText('企业微信', { selector: '.v-list-item-title' }))
    expect(screen.getByText('通知4 / wechat')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'remove-通知3' }))
    await user.click(screen.getByRole('button', { name: 'reverse-channels' }))
    await user.click(channelCard.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/Notifications', [
        expect.objectContaining({ name: '通知4', type: 'wechat' }),
        expect.objectContaining({ name: 'Alpha', type: 'wechatclawbot' }),
      ])
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('通知设置保存成功')
  })

  it('offers DingTalk as a native notification channel', async () => {
    const user = userEvent.setup()
    await renderNotificationSettings()
    await screen.findByText('Alpha / wechatclawbot')

    const channelCard = getCard('通知渠道')
    await user.click(channelCard.getAllByRole('button').at(-1)!)
    await user.click(await screen.findByText('钉钉', { selector: '.v-list-item-title' }))

    expect(screen.getByText('通知4 / dingtalk')).toBeInTheDocument()
  })

  it('compresses chained ClawBot renames and migrates the original source before saving channels', async () => {
    const user = userEvent.setup()
    await renderNotificationSettings()
    await screen.findByText('Alpha / wechatclawbot')

    await fireEvent.update(screen.getByLabelText('name-Alpha'), 'Beta')
    await fireEvent.update(await screen.findByLabelText('name-Beta'), 'Gamma')
    await user.click(getCard('通知渠道').getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(2))
    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, 'notification/manage', {
      target: 'WechatClawBot',
      action: 'migrate_cache',
      params: { old_name: 'Alpha', new_name: 'Gamma' },
    })
    expect(mocks.apiPost).toHaveBeenNthCalledWith(
      2,
      'system/setting/Notifications',
      expect.arrayContaining([expect.objectContaining({ name: 'Gamma', type: 'wechatclawbot' })]),
    )
  })

  it('keeps a failed ClawBot migration pending and retries it before saving channels', async () => {
    const user = userEvent.setup()
    await renderNotificationSettings()
    await screen.findByText('Alpha / wechatclawbot')
    await fireEvent.update(screen.getByLabelText('name-Alpha'), 'Beta')
    const save = getCard('通知渠道').getByRole('button', { name: '保存' })

    mocks.apiPost.mockResolvedValueOnce({ success: false, message: 'migration failed' })
    await user.click(save)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('通知设置保存失败！'))
    expect(mocks.apiPost).toHaveBeenCalledTimes(1)

    mocks.apiPost.mockClear()
    mocks.apiPost.mockResolvedValue({ success: true })
    await user.click(save)
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(2))
    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, 'notification/manage', {
      target: 'WechatClawBot',
      action: 'migrate_cache',
      params: { old_name: 'Alpha', new_name: 'Beta' },
    })
    expect(mocks.apiPost).toHaveBeenNthCalledWith(
      2,
      'system/setting/Notifications',
      expect.arrayContaining([expect.objectContaining({ name: 'Beta' })]),
    )
  })

  it('loads, edits, and saves a template while pausing refresh and following the active theme', async () => {
    const previousTheme = vuetify.theme.global.name.value
    // 从浅色主题起步验证编辑器跟随主题切换，不受应用默认主题影响。
    vuetify.theme.global.name.value = 'light'
    const controller = createDialogController()
    mocks.openSharedDialog.mockReturnValue(controller)

    try {
      const user = userEvent.setup()
      await renderNotificationSettings()
      await screen.findByText('Alpha / wechatclawbot')
      const templateButton = screen.getByRole('button', { name: /资源入库/ })
      await user.click(templateButton)

      await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
      expect(mocks.openSharedDialog.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ content: templateFixture.organizeSuccess, editorTheme: 'github_light_default' }),
      )
      expect(mocks.useSilentSettingRefresh.mock.calls[0]?.[1].active.value).toBe(false)

      getDialogEvents()['update:content']('{"title":"updated"}')
      vuetify.theme.global.name.value = 'dark'
      await waitFor(() => expect(controller.updateProps).toHaveBeenCalledWith({ editorTheme: 'github_dark' }))
      await getDialogEvents().save('{"title":"updated"}')

      expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/NotificationTemplates', {
        ...templateFixture,
        organizeSuccess: '{"title":"updated"}',
      })
      expect(mocks.toastSuccess).toHaveBeenCalledWith('模板保存成功')
      expect(controller.close).toHaveBeenCalledOnce()
    } finally {
      vuetify.theme.global.name.value = previousTheme
    }
  })

  it('keeps the template editor open when saving fails and reports load failures', async () => {
    const user = userEvent.setup()
    const controller = createDialogController()
    mocks.openSharedDialog.mockReturnValue(controller)
    await renderNotificationSettings()
    await screen.findByText('Alpha / wechatclawbot')
    const templateButton = screen.getByRole('button', { name: /资源下载/ })
    await user.click(templateButton)
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())

    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await getDialogEvents().save('{"title":"failed"}')
    expect(mocks.toastError).toHaveBeenCalledWith('模板保存失败！')
    expect(controller.close).not.toHaveBeenCalled()

    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'system/setting/NotificationTemplates') throw new Error('offline')
      return mockLoadedSettings()
    })
    mocks.openSharedDialog.mockClear()
    await user.click(screen.getByRole('button', { name: /添加订阅/ }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('模板加载失败！'))
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })

  it('saves edited notification time and merged message scope payloads', async () => {
    const user = userEvent.setup()
    await renderNotificationSettings()
    await screen.findByText('Alpha / wechatclawbot')

    await fireEvent.update(screen.getByLabelText('开始时间'), '09:15')
    await fireEvent.update(screen.getByLabelText('结束时间'), '21:45')
    await user.click(getCard('通知发送时间').getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/NotificationSendTime', {
      start: '09:15',
      end: '21:45',
    })

    const scopeCard = getCard('通知发送范围')
    await user.click(scopeCard.getAllByRole('radio', { name: '仅管理员' })[0])
    await user.click(scopeCard.getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenCalledWith(
      'system/setting/NotificationSwitchs',
      expect.arrayContaining([
        { type: '资源下载', action: 'admin' },
        { type: '智能体', action: 'admin' },
        { type: '其它', action: 'admin' },
      ]),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('通知发送时间保存成功')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('消息类型开关保存成功')
  })

  it('reports HTTP failures when saving notification time or message scopes', async () => {
    const user = userEvent.setup()
    await renderNotificationSettings()
    await screen.findByText('Alpha / wechatclawbot')

    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await user.click(getCard('通知发送时间').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('通知发送时间保存失败！'))

    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await user.click(getCard('通知发送范围').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('消息类型开关保存失败！'))
  })
})
