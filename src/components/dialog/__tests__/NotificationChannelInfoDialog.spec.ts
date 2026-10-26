import NotificationChannelInfoDialog from '@/components/dialog/NotificationChannelInfoDialog.vue'
import { WEB_PUSH_PERMISSION_REQUEST_KEY, type WebPushPermissionRequester } from '@/composables/useWebPushNotifications'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  rotateAppPush: vi.fn(),
}))

vi.mock('@/api/manage', async importOriginal => ({
  ...(await importOriginal<typeof import('@/api/manage')>()),
  rotateAppPushInstance: mocks.rotateAppPush,
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

const webPushNotification = {
  id: 'webpush-channel',
  name: '浏览器通知',
  type: 'webpush',
  enabled: true,
  config: {},
}

describe('NotificationChannelInfoDialog', () => {
  beforeEach(() => {
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.rotateAppPush.mockReset().mockResolvedValue({ rotated: true })
    vi.stubGlobal('PushManager', class PushManagerStub {})
    vi.stubGlobal('navigator', { serviceWorker: {} })
    vi.stubGlobal('Notification', {
      permission: 'default' as NotificationPermission,
      requestPermission: vi.fn(),
    })
  })

  it('空渠道名校验使用已存在的本地化消息', async () => {
    const onChange = vi.fn()
    const notification = { ...webPushNotification, name: '   ' }
    await renderWithProviders(NotificationChannelInfoDialog, {
      props: { modelValue: true, notification, notifications: [notification], onChange },
      global: { stubs: { VDialogCloseBtn: true } },
    })
    await fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(mocks.toastError).toHaveBeenCalledWith('请输入名称')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('自动接入不要求填写密钥，修改草稿地址后禁止轮换旧中心的凭据', async () => {
    const notification = { id: 'app-auto', name: '手机通知', type: 'apppush', enabled: true, config: {} }
    await renderWithProviders(NotificationChannelInfoDialog, {
      props: { modelValue: true, notification, notifications: [notification] },
      global: { stubs: { VDialogCloseBtn: true } },
    })
    const rotate = await screen.findByRole('button', { name: '轮换接入凭据' })
    expect(screen.queryByLabelText('实例中转密钥')).not.toBeInTheDocument()
    await fireEvent.click(rotate)
    await waitFor(() => expect(mocks.rotateAppPush).toHaveBeenCalledWith('手机通知'))
    await fireEvent.update(screen.getByLabelText('消息中心地址（可选）'), 'https://another.test')
    expect(screen.queryByRole('button', { name: '轮换接入凭据' })).not.toBeInTheDocument()
  })

  it('编辑已有手工接入配置时保留密钥并显示兼容入口', async () => {
    const notification = {
      id: 'app-manual',
      name: '旧手机通知',
      type: 'apppush',
      enabled: true,
      config: { PUSH_SERVER_URL: 'https://relay.test', PUSH_RELAY_KEY: 'existing-private-relay-key-00000001' },
    }
    await renderWithProviders(NotificationChannelInfoDialog, {
      props: { modelValue: true, notification, notifications: [notification] },
      global: { stubs: { VDialogCloseBtn: true } },
    })
    const input = await screen.findByLabelText('实例中转密钥')
    expect(input).toHaveValue(notification.config.PUSH_RELAY_KEY)
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.queryByRole('button', { name: '轮换接入凭据' })).not.toBeInTheDocument()
    expect(mocks.rotateAppPush).not.toHaveBeenCalled()
  })

  it('只在用户点击开启按钮时请求 WebPush 授权', async () => {
    const requestPermission = vi.fn<WebPushPermissionRequester>().mockResolvedValue('granted')

    await renderWithProviders(NotificationChannelInfoDialog, {
      props: {
        modelValue: true,
        notification: webPushNotification,
        notifications: [webPushNotification],
      },
      global: {
        provide: {
          [WEB_PUSH_PERMISSION_REQUEST_KEY]: requestPermission,
        },
        stubs: { VDialogCloseBtn: true },
      },
    })

    expect(requestPermission).not.toHaveBeenCalled()
    const enableButton = await screen.findByRole('button', { name: '开启浏览器通知' })

    await fireEvent.click(enableButton)

    await waitFor(() => expect(requestPermission).toHaveBeenCalledOnce())
    expect(mocks.toastSuccess).toHaveBeenCalledWith('浏览器通知已开启')
  })

  it('通知权限已允许时仍可点击重新登记订阅', async () => {
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn() })
    const requestPermission = vi.fn<WebPushPermissionRequester>().mockResolvedValue('granted')

    await renderWithProviders(NotificationChannelInfoDialog, {
      props: {
        modelValue: true,
        notification: webPushNotification,
        notifications: [webPushNotification],
      },
      global: {
        provide: {
          [WEB_PUSH_PERMISSION_REQUEST_KEY]: requestPermission,
        },
        stubs: { VDialogCloseBtn: true },
      },
    })

    await fireEvent.click(await screen.findByRole('button', { name: '重新登记通知' }))
    await waitFor(() => expect(requestPermission).toHaveBeenCalledOnce())
  })

  it('按渠道保存 Telegram 话题 ID', async () => {
    const notification = {
      id: 'telegram-channel',
      name: '订阅通知',
      type: 'telegram',
      enabled: true,
      config: { TELEGRAM_TOKEN: 'token', TELEGRAM_CHAT_ID: '-1001' },
    }
    const result = await renderWithProviders(NotificationChannelInfoDialog, {
      props: { modelValue: true, notification, notifications: [notification] },
      global: { stubs: { VDialogCloseBtn: true } },
    })

    await fireEvent.update(await screen.findByLabelText('话题 ID'), '1525')
    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    expect(result.emitted().change).toEqual([
      [
        expect.objectContaining({
          config: expect.objectContaining({ TELEGRAM_CHAT_ID: '-1001', TELEGRAM_TOPIC_ID: '1525' }),
        }),
        'telegram-channel',
      ],
    ])
  })
})
