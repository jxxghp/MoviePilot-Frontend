import LoginPage from '@/pages/login.vue'
import { useAuthStore, useUserStore } from '@/stores'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { defineComponent, h, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  pluginApi: {
    get: vi.fn(),
    post: vi.fn(),
  },
  loadRemoteComponentFromModule: vi.fn(),
  navMenus: [{ title: 'Home', to: '/home' }],
  router: {
    currentRoute: { value: { query: {} } },
    push: vi.fn(),
    resolve: vi.fn((target: string) => ({ path: target })),
  },
}))

vi.mock('@/api', () => ({
  default: mocks.api,
  pluginApi: mocks.pluginApi,
}))

vi.mock('@/router', () => ({
  default: mocks.router,
}))

vi.mock('@/router/i18n-menu', () => ({
  getNavMenus: () => mocks.navMenus,
}))

vi.mock('@/utils/federationLoader', () => ({
  loadRemoteComponentFromModule: (...args: unknown[]) => mocks.loadRemoteComponentFromModule(...args),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function remoteAuthPage(label: string) {
  return defineComponent({
    name: `${label}AuthPage`,
    setup: () => () => h('div', label),
  })
}

function ticketAuthPage(ticket?: string) {
  return defineComponent({
    name: 'TicketAuthPage',
    emits: ['authenticated'],
    setup(_, { emit }) {
      return () => h('button', { onClick: () => emit('authenticated', { ticket }) }, 'Complete Plugin Login')
    },
  })
}

function failingAuthPage(error: unknown) {
  return defineComponent({
    name: 'FailingAuthPage',
    emits: ['error'],
    setup(_, { emit }) {
      return () => h('button', { onClick: () => emit('error', error) }, 'Fail Plugin Login')
    },
  })
}

function loginResponse(overrides: Record<string, unknown> = {}) {
  return {
    access_token: 'synthetic-token',
    avatar: 'avatar.png',
    level: 2,
    permissions: {
      discovery: true,
      features: { 'discovery.recommend': true },
      manage: true,
      search: true,
      subscribe: true,
    },
    super_user: false,
    user_id: 7,
    user_name: 'alice',
    wizard: false,
    ...overrides,
  }
}

function mfaRequired(methods: unknown = ['otp']) {
  return {
    response: {
      data: {
        success: false,
        message: '需要二次验证',
        data: { mfa_methods: methods },
      },
      headers: { 'x-mfa-required': 'true' },
      status: 401,
    },
  }
}

async function submitPassword(container: Element) {
  await fireEvent.update(screen.getByRole('textbox', { name: '用户名' }), 'alice')
  await fireEvent.update(screen.getByLabelText('密码'), 'secret')
  const form = container.querySelector<HTMLFormElement>('form.login-form')
  expect(form).not.toBeNull()
  await fireEvent.submit(form!)
}

async function renderLogin(initialState: Record<string, Record<string, unknown>> = {}) {
  return renderWithProviders(LoginPage, {
    global: {
      stubs: {
        OpticalLogoLab: { template: '<div><slot /></div>' },
      },
    },
    initialState,
    stubActions: false,
  })
}

describe('login page orchestration', () => {
  beforeEach(() => {
    mocks.api.get.mockReset()
    mocks.api.post.mockReset()
    mocks.pluginApi.get.mockReset()
    mocks.pluginApi.post.mockReset()
    mocks.loadRemoteComponentFromModule.mockReset()
    mocks.router.push.mockReset()
    mocks.router.resolve.mockClear()
    mocks.router.currentRoute.value.query = {}
    mocks.api.get.mockResolvedValue([])
    mocks.navMenus = [{ title: 'Home', to: '/home' }]
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('sends only one password request while the current submission is pending', async () => {
    const pendingLogin = deferred<never>()
    mocks.pluginApi.post.mockReturnValue(pendingLogin.promise)
    const { container } = await renderLogin()

    await fireEvent.update(screen.getByRole('textbox', { name: '用户名' }), 'alice')
    await fireEvent.update(screen.getByLabelText('密码'), 'secret')
    const form = container.querySelector<HTMLFormElement>('form.login-form')
    expect(form).not.toBeNull()

    await fireEvent.submit(form!)
    await fireEvent.submit(form!)

    expect(mocks.pluginApi.post).toHaveBeenCalledTimes(1)
  })

  it('does not submit an incomplete password form', async () => {
    const { container } = await renderLogin()

    await fireEvent.submit(container.querySelector<HTMLFormElement>('form.login-form')!)

    expect(mocks.pluginApi.post).not.toHaveBeenCalled()
  })

  it('toggles password visibility without submitting the form', async () => {
    await renderLogin()
    const password = screen.getByLabelText('密码')

    expect(password).toHaveAttribute('type', 'password')
    await fireEvent.click(screen.getByRole('button', { name: '显示密码' }))
    expect(password).toHaveAttribute('type', 'text')
    await fireEvent.click(screen.getByRole('button', { name: '隐藏密码' }))

    expect(password).toHaveAttribute('type', 'password')
    expect(mocks.pluginApi.post).not.toHaveBeenCalled()
  })

  it('keeps the latest plugin AuthPage when an earlier provider resolves late', async () => {
    const alpha = deferred<ReturnType<typeof remoteAuthPage>>()
    const beta = deferred<ReturnType<typeof remoteAuthPage>>()
    mocks.api.get.mockResolvedValue([
      {
        id: 'plugin:alpha',
        type: 'plugin',
        name: 'Alpha Login',
        enabled: true,
        remote: { id: 'alpha', url: '/alpha/remoteEntry.js' },
      },
      {
        id: 'plugin:beta',
        type: 'plugin',
        name: 'Beta Login',
        enabled: true,
        remote: { id: 'beta', url: '/beta/remoteEntry.js' },
      },
    ])
    mocks.loadRemoteComponentFromModule.mockImplementation((remote: { id: string }) =>
      remote.id === 'alpha' ? alpha.promise : beta.promise,
    )
    await renderLogin()

    await fireEvent.click(await screen.findByRole('button', { name: 'Alpha Login' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Beta Login' }))
    expect(mocks.loadRemoteComponentFromModule).toHaveBeenCalledTimes(2)

    beta.resolve(remoteAuthPage('Beta Auth Page'))
    expect(await screen.findByText('Beta Auth Page')).toBeInTheDocument()

    alpha.resolve(remoteAuthPage('Alpha Auth Page'))
    await alpha.promise
    await nextTick()
    await waitFor(() => {
      expect(screen.queryByText('Alpha Auth Page')).not.toBeInTheDocument()
      expect(screen.getByText('Beta Auth Page')).toBeInTheDocument()
    })
  })

  it('keeps password login available when provider discovery fails', async () => {
    mocks.api.get.mockRejectedValue(new Error('provider unavailable'))

    await renderLogin()

    expect(await screen.findByRole('button', { name: '登录' })).toBeInTheDocument()
    expect(screen.queryByText('provider unavailable')).not.toBeInTheDocument()
    expect(console.error).toHaveBeenCalledOnce()
  })

  it('does not let delayed provider discovery cancel an explicit password login', async () => {
    const providers = deferred<unknown[]>()
    const passwordLogin = deferred<never>()
    let passwordSignal: AbortSignal | undefined
    const conditionalAvailability = vi.fn().mockResolvedValue(true)
    vi.stubGlobal(
      'PublicKeyCredential',
      class PublicKeyCredentialStub {
        static isConditionalMediationAvailable = conditionalAvailability
      },
    )
    mocks.api.get.mockReturnValue(providers.promise)
    mocks.pluginApi.post.mockImplementation((url: string, _data: unknown, config?: { signal?: AbortSignal }) => {
      if (url === '/login/access-token') {
        passwordSignal = config?.signal
        return passwordLogin.promise
      }
      return Promise.resolve({ success: false })
    })
    const { container } = await renderLogin()

    await submitPassword(container)
    providers.resolve([])
    await providers.promise
    await nextTick()

    expect(passwordSignal?.aborted).toBe(false)
    expect(conditionalAvailability).not.toHaveBeenCalled()
    expect(mocks.pluginApi.post).toHaveBeenCalledTimes(1)
  })

  it('skips provider and Conditional UI startup for a remembered session', async () => {
    await renderLogin({ auth: { remember: true, token: 'remembered-token' } })

    expect(mocks.router.push).toHaveBeenCalledWith('/')
    expect(mocks.api.get).not.toHaveBeenCalled()
    expect(mocks.pluginApi.post).not.toHaveBeenCalled()
  })

  it('stores the password login session and consumes the original destination', async () => {
    mocks.pluginApi.post.mockResolvedValue(loginResponse())
    const { container } = await renderLogin()
    const authStore = useAuthStore()
    authStore.setOriginalPath('/recommend?tab=trending#today')

    await submitPassword(container)

    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/recommend?tab=trending#today'))
    expect(authStore.token).toBe('synthetic-token')
    expect(authStore.originalPath).toBeNull()
    expect(useUserStore().userName).toBe('alice')
    expect(useUserStore().permissions.features).toEqual({ 'discovery.recommend': true })
    const formData = mocks.pluginApi.post.mock.calls[0][1] as FormData
    expect(formData.get('username')).toBe('alice')
    expect(formData.get('password')).toBe('secret')
    expect(formData.get('otp_password')).toBe('')
  })

  it('does not create a session when no navigation entry is permitted', async () => {
    mocks.navMenus = []
    mocks.pluginApi.post.mockResolvedValue(loginResponse())
    const { container } = await renderLogin()

    await submitPassword(container)

    expect(await screen.findByText('登录失败，您没有任何功能权限，请联系管理员！')).toBeInTheDocument()
    expect(useAuthStore().token).toBeNull()
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it('routes a login that requires setup to the wizard before any menu', async () => {
    mocks.pluginApi.post.mockResolvedValue(loginResponse({ wizard: true }))
    const { container } = await renderLogin()

    await submitPassword(container)

    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/setup-wizard'))
    expect(mocks.router.push).not.toHaveBeenCalledWith('/home')
  })

  it('maps password HTTP failures to a visible retryable error', async () => {
    mocks.pluginApi.post.mockRejectedValue({ response: { data: {}, status: 403 } })
    const { container } = await renderLogin()

    await submitPassword(container)

    expect(await screen.findByRole('alert')).toHaveTextContent('登录失败，您没有权限访问！')
    expect(screen.getByRole('textbox', { name: '用户名' })).toHaveValue('alice')
    expect(useAuthStore().token).toBeNull()
  })

  it('maps a password server failure to the dedicated retryable error', async () => {
    mocks.pluginApi.post.mockRejectedValue({ response: { data: {}, status: 500 } })
    const { container } = await renderLogin()

    await submitPassword(container)

    expect(await screen.findByRole('alert')).toHaveTextContent('登录失败，服务器错误！')
    expect(screen.getByRole('textbox', { name: '用户名' })).toHaveValue('alice')
    expect(useAuthStore().token).toBeNull()
  })

  it('maps a password network failure without leaving the login form', async () => {
    mocks.pluginApi.post.mockRejectedValue(new Error('offline'))
    const { container } = await renderLogin()

    await submitPassword(container)

    expect(await screen.findByRole('alert')).toHaveTextContent('登录失败，请检查网络连接！')
    expect(screen.getByLabelText('密码')).toHaveValue('secret')
  })

  it('prefers a structured backend message for password failures', async () => {
    mocks.pluginApi.post.mockRejectedValue({ response: { data: { message: '账号已被停用' }, status: 403 } })
    const { container } = await renderLogin()

    await submitPassword(container)

    expect(await screen.findByRole('alert')).toHaveTextContent('账号已被停用')
  })

  it('includes an unknown HTTP status in the fallback password error', async () => {
    mocks.pluginApi.post.mockRejectedValue({ response: { data: {}, status: 418 } })
    const { container } = await renderLogin()

    await submitPassword(container)

    expect(await screen.findByRole('alert')).toHaveTextContent('Status: 418')
  })

  it('switches the login page locale from the language menu', async () => {
    await renderLogin()

    await fireEvent.click(screen.getByRole('button', { name: /简体中文/ }))
    await fireEvent.click(await screen.findByText('English'))

    expect(await screen.findByRole('button', { name: /English/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument()
  })

  it('enters the OTP step only for a supported server-declared method', async () => {
    mocks.pluginApi.post.mockRejectedValue(mfaRequired(['otp', 'unknown', 'otp']))
    const { container } = await renderLogin()

    await submitPassword(container)

    expect(await screen.findByTestId('mfa-otp-form')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '用户名' })).not.toBeInTheDocument()
  })

  it('keeps password login visible when the MFA response has no supported method', async () => {
    mocks.pluginApi.post.mockRejectedValue(mfaRequired(['sms']))
    const { container } = await renderLogin()

    await submitPassword(container)

    expect(await screen.findByText('无法获取验证方式，请重新登录')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '用户名' })).toBeInTheDocument()
    expect(screen.queryByTestId('mfa-otp-form')).not.toBeInTheDocument()
  })

  it('submits the original password with the OTP and completes login', async () => {
    mocks.pluginApi.post.mockRejectedValueOnce(mfaRequired()).mockResolvedValueOnce(loginResponse())
    const { container } = await renderLogin()
    await submitPassword(container)
    const otpInput = await screen.findByRole('textbox', { name: '验证码' })

    await fireEvent.update(otpInput, '123456')
    await fireEvent.submit(screen.getByTestId('mfa-otp-form'))

    await waitFor(() => expect(useAuthStore().token).toBe('synthetic-token'))
    const formData = mocks.pluginApi.post.mock.calls[1][1] as FormData
    expect(formData.get('username')).toBe('alice')
    expect(formData.get('password')).toBe('secret')
    expect(formData.get('otp_password')).toBe('123456')
  })

  it('keeps the OTP step retryable and clears an invalid code', async () => {
    mocks.pluginApi.post
      .mockRejectedValueOnce(mfaRequired())
      .mockRejectedValueOnce({ response: { data: {}, status: 401 } })
    const { container } = await renderLogin()
    await submitPassword(container)
    const otpInput = await screen.findByRole('textbox', { name: '验证码' })

    await fireEvent.update(otpInput, '654321')
    await fireEvent.submit(screen.getByTestId('mfa-otp-form'))

    expect(await screen.findByText('验证失败，请检查验证码后重试')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '验证码' })).toHaveValue('')
    expect(screen.getByTestId('mfa-otp-form')).toBeInTheDocument()
  })

  it('keeps the OTP step retryable after a network failure', async () => {
    mocks.pluginApi.post.mockRejectedValueOnce(mfaRequired()).mockRejectedValueOnce(new Error('offline'))
    const { container } = await renderLogin()
    await submitPassword(container)

    await fireEvent.update(await screen.findByRole('textbox', { name: '验证码' }), '654321')
    await fireEvent.submit(screen.getByTestId('mfa-otp-form'))

    expect(await screen.findByText('登录失败，请检查网络连接！')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '验证码' })).toHaveValue('')
    expect(screen.getByTestId('mfa-otp-form')).toBeInTheDocument()
  })

  it('returns from OTP verification to a clean password step', async () => {
    mocks.pluginApi.post.mockRejectedValue(mfaRequired())
    const { container } = await renderLogin()
    await submitPassword(container)

    await fireEvent.click(await screen.findByTestId('mfa-back'))

    expect(await screen.findByRole('textbox', { name: '用户名' })).toHaveValue('alice')
    expect(screen.queryByTestId('mfa-otp-form')).not.toBeInTheDocument()
  })

  it('ignores an obsolete provider failure after the latest AuthPage loads', async () => {
    const alpha = deferred<ReturnType<typeof remoteAuthPage>>()
    mocks.api.get.mockResolvedValue([
      {
        id: 'plugin:alpha',
        type: 'plugin',
        name: 'Alpha Login',
        enabled: true,
        remote: { id: 'alpha', url: '/alpha/remoteEntry.js' },
      },
      {
        id: 'plugin:beta',
        type: 'plugin',
        name: 'Beta Login',
        enabled: true,
        remote: { id: 'beta', url: '/beta/remoteEntry.js' },
      },
    ])
    mocks.loadRemoteComponentFromModule.mockImplementation((remote: { id: string }) =>
      remote.id === 'alpha' ? alpha.promise : Promise.resolve(remoteAuthPage('Beta Auth Page')),
    )
    await renderLogin()

    await fireEvent.click(await screen.findByRole('button', { name: 'Alpha Login' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Beta Login' }))
    expect(await screen.findByText('Beta Auth Page')).toBeInTheDocument()
    alpha.reject(new Error('obsolete failure'))
    await alpha.promise.catch(() => undefined)
    await nextTick()

    expect(screen.queryByText('obsolete failure')).not.toBeInTheDocument()
    expect(screen.getByText('Beta Auth Page')).toBeInTheDocument()
    expect(console.error).not.toHaveBeenCalled()
  })

  it('exchanges a plugin ticket through the shared login completion path', async () => {
    mocks.api.get.mockResolvedValue([
      {
        id: 'plugin:ticket',
        type: 'plugin',
        name: 'Ticket Login',
        enabled: true,
        remote: { id: 'ticket', url: '/ticket/remoteEntry.js' },
      },
    ])
    mocks.loadRemoteComponentFromModule.mockResolvedValue(ticketAuthPage('plugin-ticket'))
    mocks.pluginApi.post.mockResolvedValue(loginResponse({ user_name: 'plugin-user' }))
    await renderLogin()

    await fireEvent.click(await screen.findByRole('button', { name: 'Ticket Login' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Complete Plugin Login' }))

    await waitFor(() => expect(useAuthStore().token).toBe('synthetic-token'))
    expect(mocks.pluginApi.post).toHaveBeenCalledWith(
      'auth/exchange',
      { ticket: 'plugin-ticket' },
      { feedback: 'silent' },
    )
    expect(useUserStore().userName).toBe('plugin-user')
    expect(mocks.router.push).toHaveBeenCalledWith('/home')
  })

  it('exchanges only once when the current AuthPage emits the same completion twice', async () => {
    const exchange = deferred<ReturnType<typeof loginResponse>>()
    mocks.api.get.mockResolvedValue([
      {
        id: 'plugin:ticket',
        type: 'plugin',
        name: 'Ticket Login',
        enabled: true,
        remote: { id: 'ticket', url: '/ticket/remoteEntry.js' },
      },
    ])
    mocks.loadRemoteComponentFromModule.mockResolvedValue(ticketAuthPage('plugin-ticket'))
    mocks.pluginApi.post.mockReturnValue(exchange.promise)
    await renderLogin()

    await fireEvent.click(await screen.findByRole('button', { name: 'Ticket Login' }))
    const complete = await screen.findByRole('button', { name: 'Complete Plugin Login' })
    await fireEvent.click(complete)
    await fireEvent.click(complete)

    expect(mocks.pluginApi.post).toHaveBeenCalledTimes(1)
  })

  it('ignores an earlier password response after plugin login completes', async () => {
    const passwordLogin = deferred<ReturnType<typeof loginResponse>>()
    let passwordSignal: AbortSignal | undefined
    mocks.api.get.mockResolvedValue([
      {
        id: 'plugin:ticket',
        type: 'plugin',
        name: 'Ticket Login',
        enabled: true,
        remote: { id: 'ticket', url: '/ticket/remoteEntry.js' },
      },
    ])
    mocks.loadRemoteComponentFromModule.mockResolvedValue(ticketAuthPage('plugin-ticket'))
    mocks.pluginApi.post.mockImplementation((url: string, _data: unknown, config?: { signal?: AbortSignal }) => {
      if (url === '/login/access-token') {
        passwordSignal = config?.signal
        return passwordLogin.promise
      }
      return Promise.resolve(loginResponse({ access_token: 'plugin-token', user_name: 'plugin-user' }))
    })
    const { container } = await renderLogin()

    await submitPassword(container)
    await fireEvent.click(await screen.findByRole('button', { name: 'Ticket Login' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Complete Plugin Login' }))
    await waitFor(() => expect(useUserStore().userName).toBe('plugin-user'))
    expect(passwordSignal?.aborted).toBe(true)

    passwordLogin.resolve(loginResponse({ access_token: 'password-token', user_name: 'password-user' }))
    await passwordLogin.promise
    await nextTick()

    expect(useAuthStore().token).toBe('plugin-token')
    expect(useUserStore().userName).toBe('plugin-user')
  })

  it('shows the current plugin ticket exchange failure without closing the dialog', async () => {
    mocks.api.get.mockResolvedValue([
      {
        id: 'plugin:ticket',
        type: 'plugin',
        name: 'Ticket Login',
        enabled: true,
        remote: { id: 'ticket', url: '/ticket/remoteEntry.js' },
      },
    ])
    mocks.loadRemoteComponentFromModule.mockResolvedValue(ticketAuthPage('expired-ticket'))
    mocks.pluginApi.post.mockRejectedValue({
      response: { data: { detail: '认证票据无效或已过期' }, status: 401 },
    })
    await renderLogin()

    await fireEvent.click(await screen.findByRole('button', { name: 'Ticket Login' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Complete Plugin Login' }))

    expect(await screen.findByText('认证票据无效或已过期')).toBeInTheDocument()
    expect(useAuthStore().token).toBeNull()
  })

  it('shows an error emitted by the current plugin AuthPage', async () => {
    mocks.api.get.mockResolvedValue([
      {
        id: 'plugin:error',
        type: 'plugin',
        name: 'Error Login',
        enabled: true,
        remote: { id: 'error', url: '/error/remoteEntry.js' },
      },
    ])
    mocks.loadRemoteComponentFromModule.mockResolvedValue(failingAuthPage(new Error('remote authorization failed')))
    await renderLogin()

    await fireEvent.click(await screen.findByRole('button', { name: 'Error Login' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Fail Plugin Login' }))

    expect(await screen.findByText('remote authorization failed')).toBeInTheDocument()
    expect(mocks.pluginApi.post).not.toHaveBeenCalled()
  })

  it('shows the current plugin AuthPage load failure', async () => {
    mocks.api.get.mockResolvedValue([
      {
        id: 'plugin:broken',
        type: 'plugin',
        name: 'Broken Login',
        enabled: true,
        remote: { id: 'broken', url: '/broken/remoteEntry.js' },
      },
    ])
    mocks.loadRemoteComponentFromModule.mockRejectedValue(new Error('remote entry unavailable'))
    await renderLogin()

    await fireEvent.click(await screen.findByRole('button', { name: 'Broken Login' }))

    expect(await screen.findByText('remote entry unavailable')).toBeInTheDocument()
    expect(console.error).toHaveBeenCalledOnce()
  })

  it('rejects a plugin authenticated event without a ticket', async () => {
    mocks.api.get.mockResolvedValue([
      {
        id: 'plugin:ticket',
        type: 'plugin',
        name: 'Ticket Login',
        enabled: true,
        remote: { id: 'ticket', url: '/ticket/remoteEntry.js' },
      },
    ])
    mocks.loadRemoteComponentFromModule.mockResolvedValue(ticketAuthPage())
    await renderLogin()

    await fireEvent.click(await screen.findByRole('button', { name: 'Ticket Login' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Complete Plugin Login' }))

    expect(await screen.findByText('登录失败，请检查用户名、密码或验证码')).toBeInTheDocument()
    expect(mocks.pluginApi.post).not.toHaveBeenCalled()
  })

  it('does not wait for WebPush subscription before completing an administrator login', async () => {
    const webPushRequest = deferred<never>()
    const subscription = { endpoint: 'https://push.invalid/synthetic' }
    vi.stubGlobal('PushManager', class PushManagerStub {})
    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(subscription),
          },
        }),
      },
    })
    mocks.api.post.mockImplementation((url: string) => {
      if (url === '/message/webpush/subscribe') return webPushRequest.promise
      return Promise.resolve(null)
    })
    mocks.pluginApi.post.mockResolvedValue(loginResponse({ super_user: true }))
    const { container } = await renderLogin()

    await submitPassword(container)

    await waitFor(() => expect(mocks.router.push).toHaveBeenCalledWith('/home'))
    expect(useAuthStore().token).toBe('synthetic-token')
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledWith('/message/webpush/subscribe', subscription))
  })

  it('converts Passkey options and credential buffers for the authentication endpoints', async () => {
    const credentialGet = vi.fn().mockResolvedValue({
      id: 'credential-id',
      rawId: new Uint8Array([1, 2]).buffer,
      response: {
        authenticatorData: new Uint8Array([3]).buffer,
        clientDataJSON: new Uint8Array([4]).buffer,
        signature: new Uint8Array([5]).buffer,
        userHandle: new Uint8Array([6]).buffer,
      },
      type: 'public-key',
    })
    vi.stubGlobal('PublicKeyCredential', class PublicKeyCredentialStub {})
    vi.stubGlobal('navigator', { credentials: { get: credentialGet } })
    mocks.api.get.mockResolvedValue([
      {
        id: 'system:passkey',
        type: 'system',
        method: 'passkey',
        name: '通行密钥',
        enabled: true,
      },
    ])
    mocks.api.post.mockImplementation((url: string) => {
      if (url === '/mfa/passkey/authenticate/start') {
        return Promise.resolve({
          options: {
            allowCredentials: [{ id: 'AwQ', type: 'public-key' }],
            challenge: 'AQI',
            timeout: 60_000,
          },
          transaction_token: 'transaction-1',
        })
      }
      return Promise.resolve(null)
    })
    mocks.pluginApi.post.mockResolvedValue(loginResponse({ user_name: 'passkey-user' }))
    const { container } = await renderLogin()

    await fireEvent.click(await waitFor(() => container.querySelector<HTMLButtonElement>('.passkey-btn')!))

    await waitFor(() => expect(useAuthStore().token).toBe('synthetic-token'))
    const credentialOptions = credentialGet.mock.calls[0][0] as CredentialRequestOptions
    expect(Array.from(new Uint8Array(credentialOptions.publicKey!.challenge as ArrayBuffer))).toEqual([1, 2])
    expect(Array.from(new Uint8Array(credentialOptions.publicKey!.allowCredentials![0].id as ArrayBuffer))).toEqual([
      3, 4,
    ])
    expect(credentialOptions.mediation).toBeUndefined()
    expect(mocks.api.post).toHaveBeenCalledWith(
      '/mfa/passkey/authenticate/start',
      {},
      {
        feedback: 'silent',
        signal: expect.any(AbortSignal),
      },
    )
    expect(mocks.pluginApi.post).toHaveBeenCalledWith(
      '/mfa/passkey/authenticate/finish',
      {
        credential: {
          id: 'credential-id',
          rawId: 'AQI',
          response: {
            authenticatorData: 'Aw',
            clientDataJSON: 'BA',
            signature: 'BQ',
            userHandle: 'Bg',
          },
          type: 'public-key',
        },
        transaction_token: 'transaction-1',
      },
      {
        feedback: 'silent',
        signal: expect.any(AbortSignal),
      },
    )
    expect(useUserStore().userName).toBe('passkey-user')
  })

  it('shows a visible error when a manual Passkey start is rejected', async () => {
    vi.stubGlobal('PublicKeyCredential', class PublicKeyCredentialStub {})
    mocks.api.get.mockResolvedValue([
      {
        id: 'system:passkey',
        type: 'system',
        method: 'passkey',
        name: '通行密钥',
        enabled: true,
      },
    ])
    mocks.api.post.mockRejectedValue(new Error('认证失败'))
    const { container } = await renderLogin()

    await fireEvent.click(await waitFor(() => container.querySelector<HTMLButtonElement>('.passkey-btn')!))

    expect(await screen.findByRole('alert')).toHaveTextContent('登录失败，请检查用户名、密码或验证码')
    expect(useAuthStore().token).toBeNull()
  })

  it('aborts an in-flight Passkey finish request when password login takes ownership', async () => {
    const finish = deferred<ReturnType<typeof loginResponse>>()
    let finishSignal: AbortSignal | undefined
    vi.stubGlobal('PublicKeyCredential', class PublicKeyCredentialStub {})
    vi.stubGlobal('navigator', {
      credentials: {
        get: vi.fn().mockResolvedValue({
          id: 'credential-id',
          rawId: new Uint8Array([1]).buffer,
          response: {
            authenticatorData: new Uint8Array([2]).buffer,
            clientDataJSON: new Uint8Array([3]).buffer,
            signature: new Uint8Array([4]).buffer,
            userHandle: null,
          },
          type: 'public-key',
        }),
      },
    })
    mocks.api.get.mockResolvedValue([
      {
        id: 'system:passkey',
        type: 'system',
        method: 'passkey',
        name: '通行密钥',
        enabled: true,
      },
    ])
    mocks.api.post.mockImplementation((url: string) => {
      if (url === '/mfa/passkey/authenticate/start') {
        return Promise.resolve({
          options: JSON.stringify({ challenge: 'AQI' }),
          transaction_token: 'finish-transaction',
        })
      }
      return new Promise(() => {})
    })
    mocks.pluginApi.post.mockImplementation((url: string, _data: unknown, config?: { signal?: AbortSignal }) => {
      if (url === '/mfa/passkey/authenticate/finish') {
        finishSignal = config?.signal
        return finish.promise
      }
      return new Promise(() => {})
    })
    const { container } = await renderLogin()

    await fireEvent.click(await waitFor(() => container.querySelector<HTMLButtonElement>('.passkey-btn')!))
    await waitFor(() =>
      expect(mocks.pluginApi.post).toHaveBeenCalledWith(
        '/mfa/passkey/authenticate/finish',
        expect.any(Object),
        expect.any(Object),
      ),
    )
    await submitPassword(container)

    expect(finishSignal?.aborted).toBe(true)
    finish.resolve(loginResponse({ access_token: 'passkey-token', user_name: 'passkey-user' }))
    await finish.promise
    await nextTick()
    expect(useAuthStore().token).toBeNull()
    expect(useUserStore().userName).toBe('')
  })

  it('shows a cancellation message when the user dismisses manual Passkey selection', async () => {
    const canceled = new Error('cancelled')
    canceled.name = 'NotAllowedError'
    vi.stubGlobal('PublicKeyCredential', class PublicKeyCredentialStub {})
    vi.stubGlobal('navigator', { credentials: { get: vi.fn().mockRejectedValue(canceled) } })
    mocks.api.get.mockResolvedValue([
      {
        id: 'system:passkey',
        type: 'system',
        method: 'passkey',
        name: '通行密钥',
        enabled: true,
      },
    ])
    mocks.api.post.mockResolvedValue({
      options: JSON.stringify({ challenge: 'AQI' }),
      transaction_token: 'cancel-transaction',
    })
    const { container } = await renderLogin()

    await fireEvent.click(await waitFor(() => container.querySelector<HTMLButtonElement>('.passkey-btn')!))

    expect(await screen.findByRole('alert')).toHaveTextContent('通行密钥认证被取消')
    expect(useAuthStore().token).toBeNull()
  })

  it('reports unsupported manual Passkey capability without starting an API request', async () => {
    mocks.api.get.mockResolvedValue([
      {
        id: 'system:passkey',
        type: 'system',
        method: 'passkey',
        name: '通行密钥',
        enabled: true,
      },
    ])
    const { container } = await renderLogin()

    await fireEvent.click(await waitFor(() => container.querySelector<HTMLButtonElement>('.passkey-btn')!))

    expect(await screen.findByText('通行密钥需要 HTTPS 安全连接')).toBeInTheDocument()
    expect(mocks.api.post).not.toHaveBeenCalled()
  })

  it('aborts an unfinished Conditional UI request when the page unmounts', async () => {
    let capturedSignal: AbortSignal | undefined
    const credentialGet = vi.fn((options: CredentialRequestOptions) => {
      capturedSignal = options.signal
      return new Promise<Credential | null>(() => {})
    })
    vi.stubGlobal(
      'PublicKeyCredential',
      class PublicKeyCredentialStub {
        static isConditionalMediationAvailable = vi.fn().mockResolvedValue(true)
      },
    )
    vi.stubGlobal('navigator', { credentials: { get: credentialGet } })
    mocks.api.post.mockResolvedValue({
      options: JSON.stringify({ challenge: 'AQI' }),
      transaction_token: 'conditional-transaction',
    })
    const { unmount } = await renderLogin()
    await waitFor(() => expect(credentialGet).toHaveBeenCalledOnce())

    unmount()

    expect(capturedSignal?.aborted).toBe(true)
  })

  it('does not start Conditional UI after its capability check resolves on an unmounted page', async () => {
    const capability = deferred<boolean>()
    vi.stubGlobal(
      'PublicKeyCredential',
      class PublicKeyCredentialStub {
        static isConditionalMediationAvailable = vi.fn(() => capability.promise)
      },
    )
    vi.stubGlobal('navigator', { credentials: { get: vi.fn() } })
    const { unmount } = await renderLogin()
    await waitFor(() => expect(PublicKeyCredential.isConditionalMediationAvailable).toHaveBeenCalledOnce())

    unmount()
    capability.resolve(true)
    await capability.promise
    await nextTick()

    expect(mocks.api.post).not.toHaveBeenCalled()
  })

  it('aborts Conditional UI when the user submits password login', async () => {
    let capturedSignal: AbortSignal | undefined
    const credentialGet = vi.fn((options: CredentialRequestOptions) => {
      capturedSignal = options.signal
      return new Promise<Credential | null>(() => {})
    })
    vi.stubGlobal(
      'PublicKeyCredential',
      class PublicKeyCredentialStub {
        static isConditionalMediationAvailable = vi.fn().mockResolvedValue(true)
      },
    )
    vi.stubGlobal('navigator', { credentials: { get: credentialGet } })
    mocks.api.post.mockImplementation((url: string) => {
      if (url === '/mfa/passkey/authenticate/start') {
        return Promise.resolve({
          options: JSON.stringify({ challenge: 'AQI' }),
          transaction_token: 'conditional-transaction',
        })
      }
      return new Promise(() => {})
    })
    const { container } = await renderLogin()
    await waitFor(() => expect(credentialGet).toHaveBeenCalledOnce())

    await submitPassword(container)

    expect(capturedSignal?.aborted).toBe(true)
    expect(mocks.pluginApi.post).toHaveBeenCalledWith('/login/access-token', expect.any(FormData), expect.any(Object))
  })

  it('does not leave Conditional UI loading when an aborted credential request resolves late', async () => {
    const credential = deferred<Credential>()
    let capturedSignal: AbortSignal | undefined
    const credentialGet = vi.fn((options: CredentialRequestOptions) => {
      capturedSignal = options.signal
      return credential.promise
    })
    vi.stubGlobal(
      'PublicKeyCredential',
      class PublicKeyCredentialStub {
        static isConditionalMediationAvailable = vi.fn().mockResolvedValue(true)
      },
    )
    vi.stubGlobal('navigator', { credentials: { get: credentialGet } })
    mocks.api.get.mockResolvedValue([
      {
        id: 'system:passkey',
        type: 'system',
        method: 'passkey',
        name: '通行密钥',
        enabled: true,
      },
    ])
    mocks.api.post.mockImplementation((url: string) => {
      if (url === '/mfa/passkey/authenticate/start') {
        return Promise.resolve({
          options: JSON.stringify({ challenge: 'AQI' }),
          transaction_token: 'conditional-transaction',
        })
      }
      return new Promise(() => {})
    })
    const { container } = await renderLogin()
    await waitFor(() => expect(credentialGet).toHaveBeenCalledOnce())
    const passkeyButton = await waitFor(() => container.querySelector<HTMLElement>('.passkey-btn')!)

    await submitPassword(container)
    expect(capturedSignal?.aborted).toBe(true)
    credential.resolve({
      id: 'late-credential',
      rawId: new Uint8Array([1]).buffer,
      response: {
        authenticatorData: new Uint8Array([2]).buffer,
        clientDataJSON: new Uint8Array([3]).buffer,
        signature: new Uint8Array([4]).buffer,
        userHandle: null,
      },
      type: 'public-key',
    } as unknown as Credential)
    await credential.promise
    await nextTick()

    expect(passkeyButton).not.toHaveClass('v-btn--loading')
    expect(mocks.pluginApi.post).not.toHaveBeenCalledWith('/mfa/passkey/authenticate/finish', expect.any(Object))
  })

  it('aborts manual Passkey before password login can take ownership', async () => {
    let capturedSignal: AbortSignal | undefined
    const credentialGet = vi.fn((options: CredentialRequestOptions) => {
      capturedSignal = options.signal
      return new Promise<Credential | null>(() => {})
    })
    vi.stubGlobal('PublicKeyCredential', class PublicKeyCredentialStub {})
    vi.stubGlobal('navigator', { credentials: { get: credentialGet } })
    mocks.api.get.mockResolvedValue([
      {
        id: 'system:passkey',
        type: 'system',
        method: 'passkey',
        name: '通行密钥',
        enabled: true,
      },
    ])
    mocks.api.post.mockImplementation((url: string) => {
      if (url === '/mfa/passkey/authenticate/start') {
        return Promise.resolve({
          options: JSON.stringify({ challenge: 'AQI' }),
          transaction_token: 'manual-transaction',
        })
      }
      return new Promise(() => {})
    })
    const { container } = await renderLogin()

    await fireEvent.click(await waitFor(() => container.querySelector<HTMLButtonElement>('.passkey-btn')!))
    await waitFor(() => expect(credentialGet).toHaveBeenCalledOnce())
    await submitPassword(container)

    expect(capturedSignal?.aborted).toBe(true)
    expect(mocks.pluginApi.post).not.toHaveBeenCalledWith('/mfa/passkey/authenticate/finish', expect.any(Object))
  })
})
