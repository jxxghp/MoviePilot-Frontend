import UserAddEditDialog from '@/components/dialog/UserAddEditDialog.vue'
import { useUserStore } from '@/stores'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createUser } from '@tests/support/factories/user'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  done: vi.fn(),
  start: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

const DialogCloseBtn = defineComponent({
  name: 'VDialogCloseBtn',
  emits: ['click'],
  setup(_props, { emit }) {
    return () => h('button', { 'aria-label': '关闭', onClick: () => emit('click'), type: 'button' })
  },
})

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
    put: (...args: unknown[]) => mocks.apiPut(...args),
  }),
}))

vi.mock('@/api/nprogress', () => ({
  doneNProgress: () => mocks.done(),
  startNProgress: () => mocks.start(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

async function renderDialog(
  oper: 'add' | 'edit',
  username?: string,
  initialPermissions = { discovery: true, search: true, subscribe: true, manage: false, features: {} },
) {
  const events = { close: vi.fn(), save: vi.fn() }
  const result = await renderWithProviders(UserAddEditDialog, {
    props: {
      modelValue: true,
      oper,
      username,
      usernames: ['alice', 'existing'],
      onClose: events.close,
      onSave: events.save,
    },
    initialState: {
      user: {
        avatar: 'old-avatar.png',
        permissions: initialPermissions,
        userName: username === 'alice' ? 'alice' : 'admin',
      },
    },
    stubActions: false,
    global: { stubs: { VDialogCloseBtn: DialogCloseBtn } },
  })
  return { ...result, events }
}

async function fillAddForm(name = 'new-user', password = 'secret') {
  await fireEvent.update(screen.getByLabelText('用户名'), name)
  await fireEvent.update(screen.getByLabelText('密码'), password)
  await fireEvent.update(screen.getByLabelText('确认密码'), password)
}

describe('UserAddEditDialog', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiPut.mockReset()
    mocks.done.mockReset()
    mocks.start.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('validates username, duplicates, and password confirmation before adding', async () => {
    await renderDialog('add')

    await fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(mocks.toastError).toHaveBeenCalledWith('用户名不能为空')

    await fillAddForm('existing')
    await fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(mocks.toastError).toHaveBeenCalledWith('用户名已存在')

    await fireEvent.update(screen.getByLabelText('用户名'), 'new-user')
    await fireEvent.update(screen.getByLabelText('确认密码'), 'different')
    await fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(mocks.toastError).toHaveBeenCalledWith('两次输入的密码不一致')
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })

  it('creates a user with the edited fields and normalized permissions', async () => {
    mocks.apiPost.mockResolvedValue({ success: true })
    const { events } = await renderDialog('add')
    await fillAddForm()
    await fireEvent.update(screen.getByLabelText('邮箱'), 'new@example.com')

    await fireEvent.click(screen.getByRole('button', { name: '添加' }))

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledOnce())
    expect(mocks.apiPost).toHaveBeenCalledWith(
      'user/',
      expect.objectContaining({
        email: 'new@example.com',
        name: 'new-user',
        password: 'secret',
        permissions: expect.objectContaining({ discovery: true, manage: false, search: true, subscribe: true }),
      }),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('用户【new-user】创建成功')
    expect(events.save).toHaveBeenCalledOnce()
    expect(mocks.done).toHaveBeenCalledOnce()
  })

  it('includes notification identities in the creation payload', async () => {
    mocks.apiPost.mockResolvedValue({ success: true })
    await renderDialog('add')
    await fillAddForm('notification-user')
    await fireEvent.update(screen.getByLabelText('企业微信ID'), 'wx-user')
    await fireEvent.update(screen.getByLabelText('Telegram ID'), 'tg-user')

    await fireEvent.click(screen.getByRole('button', { name: '添加' }))

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledOnce())
    expect(mocks.apiPost.mock.calls[0][1]).toMatchObject({
      settings: { telegram_userid: 'tg-user', wechat_userid: 'wx-user' },
    })
  })

  it('sends changed permission categories and features when adding', async () => {
    mocks.apiPost.mockResolvedValue({ success: true })
    await renderDialog('add')
    await fillAddForm('permission-user')

    const searchCategory = screen.getByRole('button', { name: /^搜索 / })
    await fireEvent.click(searchCategory)
    await fireEvent.keyDown(searchCategory, { key: 'Enter' })
    await fireEvent.keyDown(searchCategory, { key: ' ' })
    expect(screen.getByText('搜索功能')).toBeInTheDocument()
    const searchFeature = screen.getAllByRole('checkbox').find(element => element.textContent?.includes('资源搜索'))
    expect(searchFeature).toBeDefined()
    expect(searchFeature).toHaveAttribute('aria-checked', 'true')
    await fireEvent.click(searchFeature!)
    expect(searchFeature).toHaveAttribute('aria-checked', 'false')
    await fireEvent.keyDown(searchFeature!, { key: ' ' })
    expect(searchFeature).toHaveAttribute('aria-checked', 'true')
    await fireEvent.click(searchFeature!.querySelector('input[type="checkbox"]')!)
    expect(searchFeature).toHaveAttribute('aria-checked', 'false')
    await fireEvent.click(screen.getByRole('button', { name: '清空' }))
    expect(searchFeature).toHaveAttribute('aria-checked', 'false')
    await fireEvent.click(screen.getByRole('button', { name: '默认' }))
    expect(searchFeature).toHaveAttribute('aria-checked', 'true')
    await fireEvent.click(screen.getByRole('button', { name: '清空' }))
    await fireEvent.click(screen.getByRole('button', { name: '全选' }))
    expect(searchFeature).toHaveAttribute('aria-checked', 'true')
    await fireEvent.keyDown(searchFeature!, { key: 'Enter' })
    expect(searchFeature).toHaveAttribute('aria-checked', 'false')
    await fireEvent.click(searchCategory.querySelector('.permission-category-option__toggle')!)
    await fireEvent.click(screen.getByRole('button', { name: '添加' }))

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledOnce())
    expect(mocks.apiPost.mock.calls[0][1].permissions).toMatchObject({
      search: false,
      features: { 'search.resource': false },
    })
  })

  it('toggles password visibility through the form controls', async () => {
    await renderDialog('add')
    const password = screen.getByLabelText('密码')
    const confirmation = screen.getByLabelText('确认密码')

    await fireEvent.click(password.closest('.v-input')!.querySelector('.v-field__append-inner .v-icon')!)
    await fireEvent.click(confirmation.closest('.v-input')!.querySelector('.v-field__append-inner .v-icon')!)
    expect(password).toHaveAttribute('type', 'text')
    expect(confirmation).toHaveAttribute('type', 'text')
  })

  it('validates avatar type and size, then accepts and resets a valid image', async () => {
    await renderDialog('add')
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    const inputClick = vi.spyOn(input, 'click')

    await fireEvent.click(input.previousElementSibling!)
    expect(inputClick).toHaveBeenCalledOnce()

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['text'], 'avatar.txt', { type: 'text/plain' })],
    })
    await fireEvent.input(input)
    expect(mocks.toastError).toHaveBeenCalledWith('上传的文件不符合要求，请重新选择头像')

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File([new Uint8Array(800 * 1024 + 1)], 'large.png', { type: 'image/png' })],
    })
    await fireEvent.input(input)
    expect(mocks.toastError).toHaveBeenCalledWith('文件大小不得大于800KB')

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File([new Uint8Array([1, 2, 3])], 'avatar.png', { type: 'image/png' })],
    })
    await fireEvent.input(input)
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('新头像上传成功，待保存后生效!'))
    await fireEvent.click(screen.getByRole('button', { name: /重置默认头像/ }))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已重置为默认头像，待保存后生效！')
  })

  it('restores the saved avatar and emits close while editing', async () => {
    mocks.apiGet.mockResolvedValue(createUser({ avatar: 'saved-avatar.png', name: 'alice' }))
    const { events } = await renderDialog('edit', 'alice')
    await screen.findByDisplayValue('alice')

    await fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已还原当前使用头像！')
    await fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(events.close).toHaveBeenCalledOnce()
  })

  it('keeps the dialog open after a business creation failure', async () => {
    mocks.apiPost.mockResolvedValue({ message: '不允许创建', success: false })
    const { events } = await renderDialog('add')
    await fillAddForm()

    await fireEvent.click(screen.getByRole('button', { name: '添加' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('创建用户失败：不允许创建'))
    expect(events.save).not.toHaveBeenCalled()
  })

  it('shows HTTP creation failure and restores progress for retry', async () => {
    mocks.apiPost.mockRejectedValue(new Error('network'))
    const { events } = await renderDialog('add')
    await fillAddForm()

    await fireEvent.click(screen.getByRole('button', { name: '添加' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('创建用户失败：服务器连接失败'))
    expect(events.save).not.toHaveBeenCalled()
    expect(mocks.done).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '添加' })).toBeEnabled()
  })

  it('loads an existing user and sends controlled edit fields', async () => {
    mocks.apiGet.mockResolvedValue(
      createUser({
        avatar: 'saved-avatar.png',
        email: 'alice@example.com',
        name: 'alice',
        permissions: { discovery: true, search: false, subscribe: true, manage: false, features: {} },
        settings: { nickname: 'Alice' },
      }),
    )
    mocks.apiPut.mockResolvedValue({ success: true })
    const { events } = await renderDialog('edit', 'alice')

    expect(await screen.findByDisplayValue('alice@example.com')).toBeInTheDocument()
    await fireEvent.update(screen.getByLabelText('昵称'), 'Alice Updated')
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledOnce())
    expect(mocks.apiPut).toHaveBeenCalledWith(
      'user/',
      expect.objectContaining({
        avatar: 'saved-avatar.png',
        name: 'alice',
        permissions: expect.objectContaining({ search: false }),
        settings: expect.objectContaining({ nickname: 'Alice Updated' }),
      }),
    )
    expect(events.save).toHaveBeenCalledOnce()
    expect(useUserStore().avatar).toBe('old-avatar.png')
  })

  it('keeps current-user permissions on failure and updates them only after success', async () => {
    mocks.apiGet.mockResolvedValue(createUser({ avatar: 'saved-avatar.png', name: 'alice' }))
    mocks.apiPut.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ success: true })
    await renderDialog('edit', 'alice', {
      discovery: false,
      search: false,
      subscribe: false,
      manage: false,
      features: {},
    })
    await screen.findByDisplayValue('alice')

    await fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledOnce())
    expect(useUserStore().permissions).toMatchObject({ discovery: false, search: false, subscribe: false })

    await fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledTimes(2))
    expect(mocks.apiPut.mock.calls[1][1].permissions).toMatchObject({
      discovery: true,
      search: true,
      subscribe: true,
    })
    await waitFor(() =>
      expect(useUserStore().permissions).toMatchObject({ discovery: true, search: true, subscribe: true }),
    )
  })

  it.each([
    ['business', { message: '不允许更新', success: false }, false],
    ['HTTP', new Error('network'), true],
  ])('keeps editing available after %s update failure', async (_case, result, rejects) => {
    mocks.apiGet.mockResolvedValue(createUser({ name: 'alice' }))
    if (rejects) mocks.apiPut.mockRejectedValue(result)
    else mocks.apiPut.mockResolvedValue(result)
    const { events } = await renderDialog('edit', 'alice')
    await screen.findByDisplayValue('alice')

    await userEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining('更新用户失败')))
    expect(events.save).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })

  it('preserves the saved avatar baseline for restore after an HTTP update failure', async () => {
    mocks.apiGet.mockResolvedValue(createUser({ avatar: 'saved-avatar.png', name: 'alice' }))
    mocks.apiPut.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ success: true })
    await renderDialog('edit', 'alice')
    await screen.findByDisplayValue('alice')

    await fireEvent.click(screen.getByRole('button', { name: /重置默认头像/ }))
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledTimes(1))

    await fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledTimes(2))
    expect(mocks.apiPut.mock.calls[1][1]).toMatchObject({ avatar: 'saved-avatar.png' })
  })
})
