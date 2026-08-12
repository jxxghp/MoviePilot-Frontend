import OTPAuthDialog from '@/components/dialog/OTPAuthDialog.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  qrCode: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({ post: (...args: unknown[]) => mocks.apiPost(...args) }),
}))
vi.mock('qrcode', () => ({ default: { toDataURL: (...args: unknown[]) => mocks.qrCode(...args) } }))
vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

const DialogCloseBtn = defineComponent({
  name: 'VDialogCloseBtn',
  emits: ['click'],
  setup(_props, { emit }) {
    return () => h('button', { 'aria-label': '关闭', onClick: () => emit('click'), type: 'button' })
  },
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function renderDialog(isOtp = false) {
  return renderWithProviders(OTPAuthDialog, {
    props: { isOtp, modelValue: true },
    global: { stubs: { VDialogCloseBtn: DialogCloseBtn } },
  })
}

describe('OTPAuthDialog', () => {
  beforeEach(() => {
    mocks.apiPost.mockReset()
    mocks.qrCode.mockReset()
    mocks.qrCode.mockResolvedValue('data:image/png;base64,otp')
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('generates a fresh URI, secret, and QR code when an inactive session opens', async () => {
    mocks.apiPost.mockResolvedValue({
      data: { secret: 'SECRET-ONE', uri: 'otpauth://totp/MoviePilot:alice?secret=SECRET-ONE' },
      success: true,
    })
    await renderDialog()

    expect(await screen.findByText('SECRET-ONE')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '设置二次验证' })).toHaveAttribute('src', 'data:image/png;base64,otp')
    expect(mocks.qrCode).toHaveBeenCalledWith('otpauth://totp/MoviePilot:alice?secret=SECRET-ONE', {
      margin: 1,
      width: 200,
    })
  })

  it.each([
    ['URI', { data: { secret: 'SECRET', uri: '' }, success: true }],
    ['secret', { data: { secret: '', uri: 'otpauth://totp/MoviePilot:alice' }, success: true }],
  ])('treats a missing %s as a retryable generation failure', async (_field, response) => {
    mocks.apiPost.mockResolvedValue(response)
    await renderDialog()

    expect(await screen.findByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '设置二次验证' })).not.toBeInTheDocument()
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('获取身份验证器设置失败'))
  })

  it('retries after a generation HTTP failure', async () => {
    mocks.apiPost.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      data: { secret: 'SECRET-TWO', uri: 'otpauth://totp/MoviePilot:alice?secret=SECRET-TWO' },
      success: true,
    })
    await renderDialog()

    await fireEvent.click(await screen.findByRole('button', { name: '重试' }))
    expect(await screen.findByText('SECRET-TWO')).toBeInTheDocument()
    expect(mocks.apiPost).toHaveBeenCalledTimes(2)
  })

  it('enables OTP only after a successful verification', async () => {
    mocks.apiPost
      .mockResolvedValueOnce({
        data: { secret: 'SECRET', uri: 'otpauth://totp/MoviePilot:alice?secret=SECRET' },
        success: true,
      })
      .mockResolvedValueOnce({ success: false, message: '验证码错误' })
      .mockResolvedValueOnce({ success: true })
    const { emitted } = await renderDialog()
    await screen.findByText('SECRET')

    await fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(mocks.toastError).toHaveBeenCalledWith('请填写6位验证码')

    await fireEvent.update(screen.getByLabelText('输入身份验证器生成的 6 位验证码'), '123456')
    await fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('启用二次验证失败：验证码错误'))
    expect(emitted()['update:isOtp']).toBeUndefined()

    await fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(emitted()['update:isOtp']).toEqual([[true]]))
    expect(mocks.apiPost).toHaveBeenLastCalledWith('mfa/otp/verify', {
      otpPassword: '123456',
      uri: 'otpauth://totp/MoviePilot:alice?secret=SECRET',
    })
  })

  it('disables OTP through password confirmation only after backend success', async () => {
    mocks.apiPost
      .mockResolvedValueOnce({ message: '密码错误', success: false })
      .mockResolvedValueOnce({ success: true })
    const { emitted } = await renderDialog(true)

    await fireEvent.click(screen.getByRole('button', { name: '关闭二次验证' }))
    const request = (emitted().verifyPassword as unknown[][] | undefined)?.[0]?.[0] as {
      callback: (password: string) => Promise<void>
    }
    expect(request).toMatchObject({ text: '关闭二次验证前需要验证登录密码。', title: '关闭二次验证' })

    await request.callback('wrong')
    expect(mocks.toastError).toHaveBeenCalledWith('关闭二次验证失败：密码错误')
    expect(emitted()['update:isOtp']).toBeUndefined()

    await request.callback('correct')
    await waitFor(() => expect(emitted()['update:isOtp']).toEqual([[false]]))
    expect(mocks.apiPost).toHaveBeenLastCalledWith('mfa/otp/disable', { password: 'correct' })
  })

  it('ignores a stale generation response after close and reopen', async () => {
    const oldRequest = deferred<{ data: { secret: string; uri: string }; success: boolean }>()
    const newRequest = deferred<{ data: { secret: string; uri: string }; success: boolean }>()
    mocks.apiPost.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
    const result = await renderDialog()
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledOnce())

    await result.rerender({ isOtp: false, modelValue: false })
    await result.rerender({ isOtp: false, modelValue: true })
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(2))
    newRequest.resolve({ data: { secret: 'NEW', uri: 'otpauth://new' }, success: true })
    expect(await screen.findByText('NEW')).toBeInTheDocument()

    oldRequest.resolve({ data: { secret: 'OLD', uri: 'otpauth://old' }, success: true })
    await Promise.resolve()
    await Promise.resolve()
    await waitFor(() => expect(screen.getByText('NEW')).toBeInTheDocument())
    expect(screen.queryByText('OLD')).not.toBeInTheDocument()
  })

  it('ignores a pending generation failure after the shared dialog unmounts', async () => {
    const request = deferred<{ message: string; success: boolean }>()
    mocks.apiPost.mockReturnValue(request.promise)
    const { unmount } = await renderDialog()
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledOnce())

    unmount()
    request.resolve({ message: 'late failure', success: false })
    await Promise.resolve()
    await Promise.resolve()

    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('emits close when the user closes the dialog', async () => {
    mocks.apiPost.mockResolvedValue({
      data: { secret: 'SECRET', uri: 'otpauth://totp/MoviePilot:alice?secret=SECRET' },
      success: true,
    })
    const { emitted } = await renderDialog()
    await screen.findByText('SECRET')

    await fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    await fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(emitted()['update:modelValue']).toEqual([[false], [false]])
  })
})
