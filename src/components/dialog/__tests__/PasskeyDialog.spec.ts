import PasskeyDialog from '@/components/dialog/PasskeyDialog.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { createPassKey } from '@tests/support/factories/user'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  credentialCreate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
  }),
}))

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

function registrationCredential(id: string): PublicKeyCredential {
  const bytes = new Uint8Array([1, 2, 3]).buffer
  return {
    id,
    rawId: bytes,
    response: {
      attestationObject: bytes,
      clientDataJSON: bytes,
      getTransports: () => ['internal'],
    },
    type: 'public-key',
  } as unknown as PublicKeyCredential
}

function startResponse(token: string) {
  return {
    data: {
      options: JSON.stringify({ challenge: 'AQID', user: { id: 'BAUG', name: 'alice' } }),
      transaction_token: token,
    },
    success: true,
  }
}

async function renderDialog() {
  return renderWithProviders(PasskeyDialog, {
    props: { modelValue: true },
    global: { stubs: { VDialogCloseBtn: DialogCloseBtn } },
  })
}

describe('PasskeyDialog', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.credentialCreate.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.apiGet.mockResolvedValue({ data: [], success: true })
    Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: class PublicKeyCredential {} })
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: { create: (...args: unknown[]) => mocks.credentialCreate(...args) },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('loads the current list and emits it to the profile', async () => {
    mocks.apiGet.mockResolvedValue({ data: [createPassKey()], success: true })
    const { emitted } = await renderDialog()

    expect(await screen.findByText('MacBook Touch ID')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledWith('mfa/passkey/list')
    expect(emitted()['update:passkeyList']).toEqual([[[createPassKey()]]])
  })

  it('distinguishes a list HTTP failure from an empty list and retries', async () => {
    mocks.apiGet.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      data: [createPassKey({ name: 'Recovered Key' })],
      success: true,
    })
    await renderDialog()

    expect(await screen.findByText('服务器连接失败')).toBeInTheDocument()
    expect(screen.queryByText('您还没有注册任何通行密钥')).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('Recovered Key')).toBeInTheDocument()
  })

  it('validates name and browser capability before starting registration', async () => {
    await renderDialog()
    await screen.findByText('您还没有注册任何通行密钥')

    await fireEvent.click(screen.getByRole('button', { name: '注册通行密钥' }))
    expect(mocks.toastError).toHaveBeenCalledWith('请输入通行密钥名称')

    await fireEvent.update(screen.getByLabelText('通行密钥名称'), 'Laptop')
    Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: undefined })
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
    await fireEvent.click(screen.getByRole('button', { name: '注册通行密钥' }))
    expect(mocks.toastError).toHaveBeenCalledWith('通行密钥需要 HTTPS 安全连接')
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })

  it('registers a credential with the transaction from the same attempt and refreshes the list', async () => {
    mocks.apiPost.mockResolvedValueOnce(startResponse('tx-one')).mockResolvedValueOnce({ success: true })
    mocks.credentialCreate.mockResolvedValue(registrationCredential('credential-one'))
    mocks.apiGet
      .mockResolvedValueOnce({ data: [], success: true })
      .mockResolvedValueOnce({ data: [createPassKey({ name: 'Laptop' })], success: true })
    await renderDialog()
    await screen.findByText('您还没有注册任何通行密钥')

    await fireEvent.update(screen.getByLabelText('通行密钥名称'), 'Laptop')
    await fireEvent.click(screen.getByRole('button', { name: '注册通行密钥' }))

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(2))
    expect(mocks.apiPost).toHaveBeenNthCalledWith(
      2,
      'mfa/passkey/register/finish',
      expect.objectContaining({
        credential: expect.objectContaining({ id: 'credential-one', type: 'public-key' }),
        name: 'Laptop',
        transaction_token: 'tx-one',
      }),
      expect.objectContaining({ signal: expect.anything() }),
    )
    expect(await screen.findByText('Laptop')).toBeInTheDocument()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('通行密钥注册成功')
  })

  it('does not finish registration after the credential chooser is cancelled', async () => {
    mocks.apiPost.mockResolvedValueOnce(startResponse('tx-one'))
    mocks.credentialCreate.mockResolvedValue(null)
    await renderDialog()
    await screen.findByText('您还没有注册任何通行密钥')

    await fireEvent.update(screen.getByLabelText('通行密钥名称'), 'Laptop')
    await fireEvent.click(screen.getByRole('button', { name: '注册通行密钥' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('注册被取消'))
    expect(mocks.apiPost).toHaveBeenCalledOnce()
  })

  it('cancels WebAuthn and does not finish registration after the shared dialog unmounts', async () => {
    const credentialRequest = deferred<PublicKeyCredential>()
    mocks.apiPost.mockResolvedValueOnce(startResponse('tx-one'))
    mocks.credentialCreate.mockReturnValue(credentialRequest.promise)
    const { unmount } = await renderDialog()
    await screen.findByText('您还没有注册任何通行密钥')

    await fireEvent.update(screen.getByLabelText('通行密钥名称'), 'Laptop')
    await fireEvent.click(screen.getByRole('button', { name: '注册通行密钥' }))
    await waitFor(() => expect(mocks.credentialCreate).toHaveBeenCalledOnce())
    const credentialOptions = mocks.credentialCreate.mock.calls[0][0] as CredentialCreationOptions

    unmount()
    expect(credentialOptions.signal?.aborted).toBe(true)
    credentialRequest.resolve(registrationCredential('late-credential'))
    await flushPromises()

    expect(mocks.apiPost).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('deletes only after password confirmation and refreshes only after success', async () => {
    mocks.apiGet.mockResolvedValue({ data: [createPassKey()], success: true })
    mocks.apiPost
      .mockResolvedValueOnce({ message: '密码错误', success: false })
      .mockResolvedValueOnce({ success: true })
    const { emitted } = await renderDialog()
    await screen.findByText('MacBook Touch ID')

    await fireEvent.click(screen.getByRole('button', { name: '' }))
    const request = (emitted().verifyPassword as unknown[][] | undefined)?.[0]?.[0] as {
      callback: (password: string) => Promise<void>
    }
    await request.callback('wrong')
    expect(mocks.toastError).toHaveBeenCalledWith('密码错误')
    expect(mocks.apiGet).toHaveBeenCalledOnce()

    await request.callback('correct')
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(2))
    expect(mocks.apiPost).toHaveBeenLastCalledWith('mfa/passkey/delete', { passkey_id: 11, password: 'correct' })
  })

  it('ignores an old list response after close and reopen', async () => {
    const oldRequest = deferred<{ data: ReturnType<typeof createPassKey>[]; success: boolean }>()
    const newRequest = deferred<{ data: ReturnType<typeof createPassKey>[]; success: boolean }>()
    mocks.apiGet.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
    const result = await renderDialog()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledOnce())

    await result.rerender({ modelValue: false })
    await result.rerender({ modelValue: true })
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(2))
    newRequest.resolve({ data: [createPassKey({ name: 'New Session Key' })], success: true })
    expect(await screen.findByText('New Session Key')).toBeInTheDocument()

    oldRequest.resolve({ data: [createPassKey({ name: 'Old Session Key' })], success: true })
    await Promise.resolve()
    await Promise.resolve()
    await waitFor(() => expect(screen.getByText('New Session Key')).toBeInTheDocument())
    expect(screen.queryByText('Old Session Key')).not.toBeInTheDocument()
  })

  it('keeps each fast registration attempt bound to its own transaction', async () => {
    const oldCredential = deferred<PublicKeyCredential>()
    mocks.credentialCreate
      .mockReturnValueOnce(oldCredential.promise)
      .mockResolvedValueOnce(registrationCredential('new'))
    mocks.apiPost.mockImplementation((url: string) => {
      if (url === 'mfa/passkey/register/start') {
        const starts = mocks.apiPost.mock.calls.filter(call => call[0] === url).length
        return Promise.resolve(startResponse(starts === 1 ? 'tx-old' : 'tx-new'))
      }
      if (url === 'mfa/passkey/register/finish') return Promise.resolve({ success: true })
      return Promise.reject(new Error(`unexpected POST ${url}`))
    })
    const result = await renderDialog()
    await screen.findByText('您还没有注册任何通行密钥')

    await fireEvent.update(screen.getByLabelText('通行密钥名称'), 'Old')
    await fireEvent.click(screen.getByRole('button', { name: '注册通行密钥' }))
    await waitFor(() => expect(mocks.credentialCreate).toHaveBeenCalledOnce())
    await result.rerender({ modelValue: false })
    await result.rerender({ modelValue: true })
    await fireEvent.update(screen.getByLabelText('通行密钥名称'), 'New')
    await fireEvent.click(screen.getByRole('button', { name: '注册通行密钥' }))
    await waitFor(() =>
      expect(mocks.apiPost.mock.calls.filter(call => call[0] === 'mfa/passkey/register/finish')).toHaveLength(1),
    )

    oldCredential.resolve(registrationCredential('old'))
    await flushPromises()
    expect(mocks.apiPost.mock.calls.filter(call => call[0] === 'mfa/passkey/register/finish')).toHaveLength(1)
    expect(mocks.apiPost.mock.calls.find(call => call[0] === 'mfa/passkey/register/finish')?.[1]).toMatchObject({
      credential: expect.objectContaining({ id: 'new' }),
      transaction_token: 'tx-new',
    })
  })

  it('emits close when the user closes the dialog', async () => {
    const { emitted } = await renderDialog()
    await screen.findByText('您还没有注册任何通行密钥')

    await fireEvent.click(screen.getAllByRole('button', { name: '关闭' })[0])
    expect(emitted()['update:modelValue']).toEqual([[false]])
  })
})
