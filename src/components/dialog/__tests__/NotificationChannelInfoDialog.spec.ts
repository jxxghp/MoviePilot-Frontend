import NotificationChannelInfoDialog from '@/components/dialog/NotificationChannelInfoDialog.vue'
import { WEB_PUSH_PERMISSION_REQUEST_KEY, type WebPushPermissionRequester } from '@/composables/useWebPushNotifications'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
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
    vi.stubGlobal('PushManager', class PushManagerStub {})
    vi.stubGlobal('navigator', { serviceWorker: {} })
    vi.stubGlobal('Notification', {
      permission: 'default' as NotificationPermission,
      requestPermission: vi.fn(),
    })
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
