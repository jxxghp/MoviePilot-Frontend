import SiteCookieUpdateDialog from '@/components/dialog/SiteCookieUpdateDialog.vue'
import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createSite } from '@tests/support/factories/site'
import { updateSiteCookieHandler } from '@tests/support/msw/handlers/site'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

async function renderDialog() {
  const site = createSite({ id: 701, name: 'Cookie 站点' })
  const events = { close: vi.fn(), done: vi.fn() }
  const result = await renderWithProviders(SiteCookieUpdateDialog, {
    props: { modelValue: true, site, onClose: events.close, onDone: events.done },
    global: {
      components: { VDialogCloseBtn: DialogCloseBtn },
      stubs: { ProgressDialog: { props: ['text'], template: '<div role="status">{{ text }}</div>' } },
    },
  })
  return { ...result, events, site }
}

async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('用户名'), 'tester')
  await user.type(screen.getByLabelText('密码'), 'secret')
  await user.type(screen.getByLabelText('验证码'), '654321')
}

describe('SiteCookieUpdateDialog', () => {
  it('skips requests until username and password are both provided', async () => {
    const requested = vi.fn()
    server.use(updateSiteCookieHandler(701, { success: true }, 200, requested))
    const { events } = await renderDialog()

    await fireEvent.click(screen.getByRole('button', { name: '开始更新' }))

    expect(requested).not.toHaveBeenCalled()
    expect(events.done).not.toHaveBeenCalled()
  })

  it('submits username, password, and OTP and emits done on success', async () => {
    const requested = vi.fn()
    server.use(updateSiteCookieHandler(701, { success: true }, 200, requested))
    const user = userEvent.setup()
    const { events } = await renderDialog()
    await fillCredentials(user)

    await user.click(screen.getByRole('button', { name: '开始更新' }))

    await waitFor(() =>
      expect(requested).toHaveBeenCalledWith({ code: '654321', password: 'secret', username: 'tester' }),
    )
    expect(events.done).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Cookie 站点 更新Cookie & UA成功！')
    expect(screen.getByRole('button', { name: '开始更新' })).toBeEnabled()
  })

  it('toggles password visibility', async () => {
    const user = userEvent.setup()
    await renderDialog()
    const password = screen.getByLabelText('密码')
    const toggle = password.closest('.v-input')!.querySelector('.v-field__append-inner [role="button"]')!

    expect(password).toHaveAttribute('type', 'password')
    await user.click(toggle)
    expect(password).toHaveAttribute('type', 'text')
  })

  it('shows the backend message for a business failure', async () => {
    server.use(updateSiteCookieHandler(701, { message: '验证码错误', success: false }))
    const user = userEvent.setup()
    const { events } = await renderDialog()
    await fillCredentials(user)

    await user.click(screen.getByRole('button', { name: '开始更新' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Cookie 站点 更新失败：验证码错误'))
    expect(events.done).not.toHaveBeenCalled()
  })

  it.each([
    ['detail', { detail: '站点不存在' }, '站点不存在'],
    ['message', { message: '认证服务异常' }, '认证服务异常'],
  ])('shows an HTTP %s response and restores pending state', async (_case, body, message) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    server.use(http.post('http://localhost/api/v1/site/cookie/701', () => HttpResponse.json(body, { status: 500 })))
    const user = userEvent.setup()
    await renderDialog()
    await fillCredentials(user)

    await user.click(screen.getByRole('button', { name: '开始更新' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(`Cookie 站点 更新失败：${message}`))
    expect(screen.getByRole('button', { name: '开始更新' })).toBeEnabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledOnce()
  })

  it('disables the update action while the request is pending and restores it afterward', async () => {
    let resolveRequest!: () => void
    const pending = new Promise<void>(resolve => {
      resolveRequest = resolve
    })
    server.use(updateSiteCookieHandler(701, { success: true }, 200, () => pending))
    const user = userEvent.setup()
    await renderDialog()
    await fillCredentials(user)

    await user.click(screen.getByRole('button', { name: '开始更新' }))
    expect(await screen.findByRole('status')).toHaveTextContent('正在更新 Cookie 站点 Cookie & UA...')
    expect(screen.getByRole('button', { name: '开始更新' })).toBeDisabled()

    resolveRequest()
    await waitFor(() => expect(screen.getByRole('button', { name: '开始更新' })).toBeEnabled())
  })

  it('emits close from the dialog close button', async () => {
    const { events } = await renderDialog()
    await fireEvent.click(document.querySelector('.absolute.right-3.top-3')!)
    expect(events.close).toHaveBeenCalledOnce()
  })
})
