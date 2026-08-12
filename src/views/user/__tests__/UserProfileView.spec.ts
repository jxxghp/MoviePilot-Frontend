import UserProfileView from '@/views/user/UserProfileView.vue'
import type { PassKey } from '@/api/types'
import { useUserStore } from '@/stores'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { createPassKey, createUser } from '@tests/support/factories/user'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
    put: (...args: unknown[]) => mocks.apiPut(...args),
  }),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

function currentUser() {
  return createUser({
    avatar: 'saved-avatar.png',
    email: 'alice@example.com',
    is_otp: false,
    settings: { nickname: 'Alice' },
  })
}

function mockSuccessfulLoad() {
  mocks.apiGet.mockImplementation((url: string) => {
    if (url === 'user/alice') return Promise.resolve(currentUser())
    if (url === 'mfa/passkey/list') return Promise.resolve({ data: [createPassKey()], success: true })
    return Promise.reject(new Error(`unexpected GET ${url}`))
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function renderProfile() {
  return renderWithProviders(UserProfileView, {
    initialState: {
      user: {
        avatar: 'store-avatar.png',
        userId: 7,
        userName: 'alice',
      },
    },
    stubActions: false,
  })
}

async function uploadAvatar(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await fireEvent(input, new Event('input', { bubbles: true }))
}

describe('UserProfileView', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPut.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('loads the current profile and passkey count from their real response shapes', async () => {
    mockSuccessfulLoad()
    await renderProfile()

    expect(await screen.findByDisplayValue('alice@example.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Alice')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenNthCalledWith(1, 'user/alice')
    expect(mocks.apiGet).toHaveBeenNthCalledWith(2, 'mfa/passkey/list')

    await fireEvent.click(screen.getByRole('button', { name: '账号安全' }))
    expect(await screen.findByText('1 个密钥')).toBeInTheDocument()
  })

  it('shows a retryable error instead of a blank profile after loading fails', async () => {
    mocks.apiGet.mockRejectedValueOnce(new Error('network')).mockImplementation((url: string) => {
      if (url === 'user/alice') return Promise.resolve(currentUser())
      return Promise.resolve({ data: [], success: true })
    })
    await renderProfile()

    expect(await screen.findByText('服务器连接失败')).toBeInTheDocument()
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByDisplayValue('alice@example.com')).toBeInTheDocument()
  })

  it('shows the loaded profile while the passkey badge request is still pending', async () => {
    const passkeyRequest = deferred<{ data: PassKey[]; success: boolean }>()
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'user/alice') return Promise.resolve(currentUser())
      if (url === 'mfa/passkey/list') return passkeyRequest.promise
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
    await renderProfile()

    expect(await screen.findByDisplayValue('alice@example.com')).toBeInTheDocument()
    passkeyRequest.resolve({ data: [], success: true })
  })

  it('validates password confirmation without sending an update', async () => {
    mockSuccessfulLoad()
    await renderProfile()
    await screen.findByDisplayValue('alice@example.com')

    await fireEvent.update(screen.getByLabelText('密码'), 'new-password')
    await fireEvent.update(screen.getByLabelText('确认密码'), 'different')
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(mocks.toastError).toHaveBeenCalledWith('两次输入的密码不一致')
    expect(mocks.apiPut).not.toHaveBeenCalled()
  })

  it('validates avatar files and supports restoring the saved or default avatar', async () => {
    mockSuccessfulLoad()
    const { container } = await renderProfile()
    await screen.findByDisplayValue('alice@example.com')
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement

    await uploadAvatar(fileInput, new File(['text'], 'avatar.txt', { type: 'text/plain' }))
    expect(mocks.toastError).toHaveBeenCalledWith('上传的文件不符合要求，请重新选择头像')

    await uploadAvatar(fileInput, new File([new Uint8Array(800 * 1024 + 1)], 'large.png', { type: 'image/png' }))
    expect(mocks.toastError).toHaveBeenCalledWith('文件大小不得大于800KB')

    await uploadAvatar(fileInput, new File([new Uint8Array([1, 2, 3])], 'avatar.png', { type: 'image/png' }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('新头像上传成功，待保存后生效!'))

    await fireEvent.click(screen.getByRole('button', { name: '重置' }))
    await fireEvent.click(screen.getByRole('button', { name: '默认' }))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已还原当前使用头像！')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已重置为默认头像，待保存后生效！')
  })

  it('keeps notification identity fields editable in the profile payload', async () => {
    mockSuccessfulLoad()
    mocks.apiPut.mockResolvedValue({ success: true })
    await renderProfile()
    await screen.findByDisplayValue('alice@example.com')

    const identities: Array<[string, string]> = [
      ['企业微信用户', 'wechat-user'],
      ['微信 ClawBot 用户', 'clawbot-user'],
      ['飞书用户', 'feishu-user'],
      ['Telegram用户', 'telegram-user'],
      ['Slack用户', 'slack-user'],
      ['Discord用户', 'discord-user'],
      ['VoceChat用户', 'vocechat-user'],
      ['SynologyChat用户', 'synology-user'],
      ['豆瓣用户', 'douban-user'],
    ]
    for (const [label, value] of identities) await fireEvent.update(screen.getByLabelText(label), value)
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledOnce())
    expect(mocks.apiPut.mock.calls[0][1]).toMatchObject({
      settings: {
        discord_userid: 'discord-user',
        douban_userid: 'douban-user',
        feishu_openid: 'feishu-user',
        slack_userid: 'slack-user',
        synologychat_userid: 'synology-user',
        telegram_userid: 'telegram-user',
        vocechat_userid: 'vocechat-user',
        wechat_userid: 'wechat-user',
        wechatclawbot_userid: 'clawbot-user',
      },
    })
  })

  it('saves edited profile data and updates the current-user store only after success', async () => {
    mockSuccessfulLoad()
    mocks.apiPut.mockResolvedValue({ success: true })
    await renderProfile()
    await screen.findByDisplayValue('alice@example.com')

    await fireEvent.update(screen.getByLabelText('邮箱'), 'updated@example.com')
    await fireEvent.update(screen.getByLabelText('昵称'), 'Alice Updated')
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledOnce())
    expect(mocks.apiPut).toHaveBeenCalledWith(
      'user/',
      expect.objectContaining({
        email: 'updated@example.com',
        name: 'alice',
        settings: expect.objectContaining({ nickname: 'Alice Updated' }),
      }),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('用户信息保存成功！')
    expect(useUserStore().userName).toBe('alice')
  })

  it('keeps edited input retryable after a business failure', async () => {
    mockSuccessfulLoad()
    mocks.apiPut.mockResolvedValue({ message: '没有权限', success: false })
    await renderProfile()
    await screen.findByDisplayValue('alice@example.com')

    await fireEvent.update(screen.getByLabelText('邮箱'), 'retry@example.com')
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('用户信息保存失败：没有权限！'))
    expect(screen.getByDisplayValue('retry@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })

  it('shows an HTTP save failure and allows the same input to be retried', async () => {
    mockSuccessfulLoad()
    mocks.apiPut.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ success: true })
    await renderProfile()
    await screen.findByDisplayValue('alice@example.com')

    await fireEvent.update(screen.getByLabelText('邮箱'), 'retry@example.com')
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('用户信息保存失败：服务器连接失败！'))
    expect(screen.getByDisplayValue('retry@example.com')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledTimes(2))
  })

  it('prevents duplicate save submissions while a request is pending', async () => {
    mockSuccessfulLoad()
    let resolveUpdate!: (value: { success: boolean }) => void
    mocks.apiPut.mockReturnValue(
      new Promise(resolve => {
        resolveUpdate = resolve
      }),
    )
    await renderProfile()
    await screen.findByDisplayValue('alice@example.com')

    const save = screen.getByRole('button', { name: '保存' })
    await fireEvent.click(save)
    await fireEvent.click(save)
    expect(mocks.apiPut).toHaveBeenCalledOnce()

    resolveUpdate({ success: true })
    await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeEnabled())
  })

  it('projects OTP and passkey dialog updates back into the profile badges', async () => {
    mockSuccessfulLoad()
    await renderProfile()
    await screen.findByDisplayValue('alice@example.com')

    await fireEvent.click(screen.getByRole('button', { name: '账号安全' }))
    await fireEvent.click(screen.getByText('二次验证'))
    const otpEvents = mocks.openSharedDialog.mock.calls[0][2] as Record<string, (value: unknown) => void>
    otpEvents['update:isOtp'](true)
    otpEvents['update:modelValue'](false)

    await fireEvent.click(screen.getByRole('button', { name: '账号安全' }))
    expect(await screen.findByText('已启用')).toBeInTheDocument()
    await fireEvent.click(screen.getByText('通行密钥管理'))
    const passkeyEvents = mocks.openSharedDialog.mock.calls[1][2] as Record<string, (value: unknown) => void>
    passkeyEvents['update:passkeyList']([createPassKey(), createPassKey({ id: 12, name: 'Security Key' })])
    passkeyEvents['update:modelValue'](false)

    await fireEvent.click(screen.getByRole('button', { name: '账号安全' }))
    expect(await screen.findByText('2 个密钥')).toBeInTheDocument()
  })

  it('forwards MFA password verification through the shared verification dialog', async () => {
    mockSuccessfulLoad()
    const controllers = Array.from({ length: 2 }, () => ({ close: vi.fn(), id: 1, updateProps: vi.fn() }))
    mocks.openSharedDialog.mockImplementation(() => controllers.shift())
    await renderProfile()
    await screen.findByDisplayValue('alice@example.com')

    await fireEvent.click(screen.getByRole('button', { name: '账号安全' }))
    await fireEvent.click(screen.getByText('二次验证'))
    const otpEvents = mocks.openSharedDialog.mock.calls[0][2] as Record<string, (value: unknown) => void>
    const verified = vi.fn()
    otpEvents.verifyPassword({ callback: verified, text: '请输入密码', title: '验证密码' })

    const verifyProps = mocks.openSharedDialog.mock.calls[1][1]
    const verifyEvents = mocks.openSharedDialog.mock.calls[1][2] as Record<string, (value?: unknown) => void>
    expect(verifyProps).toEqual({ text: '请输入密码', title: '验证密码' })
    await verifyEvents.confirm('secret')
    expect(verified).toHaveBeenCalledWith('secret')
  })
})
