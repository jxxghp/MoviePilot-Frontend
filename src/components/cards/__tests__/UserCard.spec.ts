import UserCard from '@/components/cards/UserCard.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { createUser } from '@tests/support/factories/user'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  confirm: vi.fn(),
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
    get: (...args: unknown[]) => mocks.apiGet(...args),
  }),
}))

vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => mocks.confirm }))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

const ButtonStub = defineComponent({
  name: 'VBtn',
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => h('button', { ...attrs, type: 'button' }, slots.default?.())
  },
})

const IconStub = defineComponent({
  name: 'VIcon',
  props: { icon: String },
  setup(props) {
    return () => h('span', props.icon)
  },
})

async function renderCard(
  options: { currentUserId?: number; superUser?: boolean; user?: Parameters<typeof createUser>[0] } = {},
) {
  const user = createUser({ id: 7, name: 'alice', settings: { nickname: 'Alice' }, ...options.user })
  const events = { remove: vi.fn(), save: vi.fn() }
  const result = await renderWithProviders(UserCard, {
    props: {
      user,
      users: [user, createUser({ id: 8, name: 'bob' })],
      onRemove: events.remove,
      onSave: events.save,
    },
    initialState: {
      global: { globalSettings: { GLOBAL_IMAGE_CACHE: false } },
      user: { superUser: options.superUser ?? true, userID: options.currentUserId ?? 99 },
    },
    global: { stubs: { VBtn: ButtonStub, VIcon: IconStub } },
  })
  return { ...result, events, user }
}

describe('UserCard', () => {
  beforeEach(() => {
    mocks.apiDelete.mockReset()
    mocks.apiGet.mockReset()
    mocks.confirm.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.apiGet.mockResolvedValue([])
    mocks.confirm.mockResolvedValue(true)
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('shows movie and TV subscription counts', async () => {
    mocks.apiGet.mockResolvedValue([
      { id: 1, type: '电影' },
      { id: 2, type: '电影' },
      { id: 3, type: '电视剧' },
    ])
    await renderCard()

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('subscribe/user/alice'))
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('renders administrator, inactive, OTP, and fallback profile details', async () => {
    mocks.apiGet.mockResolvedValue(null)
    await renderCard({
      user: {
        email: '',
        is_active: false,
        is_otp: true,
        is_superuser: true,
        nickname: '',
        settings: {},
      },
    })

    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('管理员')).toBeInTheDocument()
    expect(screen.getByText('已停用')).toBeInTheDocument()
    expect(screen.getByText('2FA')).toBeInTheDocument()
    expect(screen.getByText('未设置邮箱')).toBeInTheDocument()
  })

  it('prefers the direct nickname and hides absent permission chips', async () => {
    await renderCard({ user: { nickname: 'Direct Nickname', permissions: {} } })

    expect(screen.getByText('Direct Nickname')).toBeInTheDocument()
    expect(screen.queryByText('发现')).not.toBeInTheDocument()
  })

  it('keeps management actions available when subscription loading fails', async () => {
    mocks.apiGet.mockRejectedValue(new Error('network'))
    const { container } = await renderCard()

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledOnce())
    await fireEvent.click(container.querySelector('.user-card')!)
    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
  })

  it('opens editing with all usernames and relays save', async () => {
    const { container, events } = await renderCard()
    await fireEvent.click(container.querySelector('.user-card')!)

    expect(mocks.openSharedDialog.mock.calls[0][1]).toEqual({
      oper: 'edit',
      username: 'alice',
      usernames: ['alice', 'bob'],
    })
    mocks.openSharedDialog.mock.calls[0][2].save()
    expect(events.save).toHaveBeenCalledOnce()
  })

  it('does not offer deleting the current user', async () => {
    await renderCard({ currentUserId: 7 })

    expect(screen.queryByRole('button', { name: 'mdi-delete' })).not.toBeInTheDocument()
  })

  it('does not offer deleting users to non-administrators', async () => {
    await renderCard({ superUser: false })

    expect(screen.queryByRole('button', { name: 'mdi-delete' })).not.toBeInTheDocument()
  })

  it('does not request deletion when confirmation is canceled', async () => {
    mocks.confirm.mockResolvedValue(false)
    await renderCard()

    await fireEvent.click(screen.getByRole('button', { name: 'mdi-delete' }))
    expect(mocks.apiDelete).not.toHaveBeenCalled()
  })

  it('emits remove only after a successful deletion', async () => {
    mocks.apiDelete.mockResolvedValue({ success: true })
    const { events } = await renderCard()

    await fireEvent.click(screen.getByRole('button', { name: 'mdi-delete' }))
    await waitFor(() => expect(mocks.apiDelete).toHaveBeenCalledWith('user/id/7'))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('用户删除成功')
    expect(events.remove).toHaveBeenCalledOnce()
  })

  it('shows business failure without emitting remove', async () => {
    mocks.apiDelete.mockResolvedValue({ success: false })
    const { events } = await renderCard()

    await fireEvent.click(screen.getByRole('button', { name: 'mdi-delete' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('用户删除失败！'))
    expect(events.remove).not.toHaveBeenCalled()
  })

  it('shows HTTP failure without emitting remove', async () => {
    mocks.apiDelete.mockRejectedValue(new Error('network'))
    const { events } = await renderCard()

    await fireEvent.click(screen.getByRole('button', { name: 'mdi-delete' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('用户删除失败！'))
    expect(events.remove).not.toHaveBeenCalled()
  })
})
