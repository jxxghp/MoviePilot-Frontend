import vuetify from '@/plugins/vuetify'
import AccountSettingNotification from '@/views/setting/AccountSettingNotification.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { flushPromises } from '@vue/test-utils'
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

const templateFixture = {
  organizeSuccess: '{"title":"organized"}',
  downloadAdded: '{"title":"downloaded"}',
  subscribeAdded: '{}',
  subscribeComplete: '{}',
}

function mockLoadedSettings() {
  mocks.apiGet.mockImplementation((endpoint: string) => {
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

  it('模板读取逆序完成时只打开最后选择的模板并保存到相同目标', async () => {
    const user = userEvent.setup()
    await renderNotificationSettings()
    await screen.findByLabelText('开始时间')
    const pending: Array<(value: unknown) => void> = []
    mocks.apiGet.mockImplementation(() => new Promise(resolve => pending.push(resolve)))
    await user.click(screen.getByRole('button', { name: /资源入库/ }))
    await user.click(screen.getByRole('button', { name: /资源下载/ }))
    expect(pending).toHaveLength(2)
    pending[1]({ success: true, data: { value: templateFixture } })
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    pending[0]({ success: true, data: { value: templateFixture } })
    await flushPromises()
    await waitFor(() => expect(mocks.openSharedDialog.mock.calls.at(-1)?.[1].templateType).toBe('downloadAdded'))
    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    await getDialogEvents().save('edited-download')
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/NotificationTemplates', {
      ...templateFixture,
      downloadAdded: 'edited-download',
    })
  })

  it('旧模板的延迟保存回调不能覆盖当前模板或关闭新编辑器', async () => {
    const user = userEvent.setup()
    await renderNotificationSettings()
    await screen.findByLabelText('开始时间')
    await user.click(screen.getByRole('button', { name: /资源入库/ }))
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    const oldEvents = getDialogEvents()
    await user.click(screen.getByRole('button', { name: /资源下载/ }))
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledTimes(2))
    await oldEvents.save('stale-organize')
    expect(mocks.apiPost).not.toHaveBeenCalled()
    await getDialogEvents().save('current-download')
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/NotificationTemplates', {
      ...templateFixture,
      downloadAdded: 'current-download',
    })
  })

  it('已提交的旧模板保存完成时不会关闭后来打开的新编辑器', async () => {
    const user = userEvent.setup()
    await renderNotificationSettings()
    await screen.findByLabelText('开始时间')
    await user.click(screen.getByRole('button', { name: /资源入库/ }))
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
    let finishSave!: (value: unknown) => void
    mocks.apiPost.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishSave = resolve
        }),
    )
    const saving = getDialogEvents().save('edited-organize')
    await user.click(screen.getByRole('button', { name: /资源下载/ }))
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledTimes(2))
    const currentController = mocks.openSharedDialog.mock.results.at(-1)?.value
    finishSave({ success: true })
    await saving
    expect(currentController.close).not.toHaveBeenCalled()
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/NotificationTemplates', {
      ...templateFixture,
      organizeSuccess: 'edited-organize',
    })
  })

  it('loads owned settings, adds missing switch defaults, and follows active refresh state', async () => {
    const { rerender } = await renderNotificationSettings()

    expect(await screen.findByLabelText('开始时间')).toBeInTheDocument()
    expect(mocks.apiGet).not.toHaveBeenCalledWith('system/setting/Notifications')
    expect(screen.getByLabelText('开始时间')).toHaveValue('08:30')
    expect(screen.getByLabelText('结束时间')).toHaveValue('22:00')
    expect(getCard('通知发送范围').getAllByRole('radiogroup')).toHaveLength(9)

    const refreshOptions = mocks.useSilentSettingRefresh.mock.calls[0]?.[1]
    expect(refreshOptions.active.value).toBe(true)
    await rerender({ active: false })
    expect(refreshOptions.active.value).toBe(false)
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
      await screen.findByLabelText('开始时间')
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
    await screen.findByLabelText('开始时间')
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
    await screen.findByLabelText('开始时间')

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
        { type: '资源下载', action: 'admin', missing_user: 'admin' },
        { type: '智能体', action: 'admin', missing_user: 'admin' },
        { type: '其它', action: 'admin', missing_user: 'admin' },
      ]),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('通知发送时间保存成功')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('消息类型开关保存成功')
  })

  it('reports HTTP failures when saving notification time or message scopes', async () => {
    const user = userEvent.setup()
    await renderNotificationSettings()
    await screen.findByLabelText('开始时间')

    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await user.click(getCard('通知发送时间').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('通知发送时间保存失败！'))

    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await user.click(getCard('通知发送范围').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('消息类型开关保存失败！'))
  })
  it('按消息类型保存无操作用户策略，非个人通知禁用该设置但保留选择', async () => {
    const user = userEvent.setup()
    await renderNotificationSettings()
    await screen.findByLabelText('开始时间')
    const scope = getCard('通知发送范围')
    const selects = scope.getAllByRole('combobox')
    expect(selects[0].closest('.v-select')!.querySelector('input')).not.toBeDisabled()
    expect(selects[3].closest('.v-select')!.querySelector('input')).toBeDisabled()
    await user.click(selects[0])
    await user.click(await screen.findByRole('option', { name: '跳过个人通知' }))
    await user.click(scope.getAllByRole('radio', { name: '仅管理员' })[0])
    expect(selects[0].closest('.v-select')!.querySelector('input')).toBeDisabled()
    await user.click(scope.getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenCalledWith(
      'system/setting/NotificationSwitchs',
      expect.arrayContaining([{ type: '资源下载', action: 'admin', missing_user: 'skip' }]),
    )
  })
})
