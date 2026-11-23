import UserCard from '@/components/cards/UserCard.vue'
import { nativeCardMenus } from '@/native/card'
import { useUserStore } from '@/stores'
import avatar1 from '@images/avatars/avatar-1.png'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { createUser } from '@tests/support/factories/user'
import { renderWithProviders } from '@tests/support/render'
import { readNativeCardMenu } from '@tests/support/nativeCardMenu'
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

/** 保留按钮事件与可访问名称，避免 jsdom 加载图标和布局细节。 */
const ButtonStub = defineComponent({
  name: 'VBtn',
  inheritAttrs: false,
  /** 按钮透传属性与原点击事件。 */
  setup(_props, { attrs, slots }) {
    return () => h('button', { ...attrs, type: 'button' }, slots.default?.())
  },
})

/** 图标以标识文本呈现，按钮仍由显式可访问名称描述。 */
const IconStub = defineComponent({
  name: 'VIcon',
  props: { icon: String },
  /** 保留图标标识以核对显示分支。 */
  setup(props) {
    return () => h('span', props.icon)
  },
})

/** jsdom 不加载图片，以原生错误事件验证头像失效后的可见回退。 */
const ImageStub = defineComponent({
  name: 'VImg',
  props: { src: String, alt: String },
  emits: ['error'],
  /** 保留图片地址、替代文本与加载错误事件，不读取卡片内部状态。 */
  setup(props, { emit }) {
    return () => h('img', { src: props.src, alt: props.alt, onError: () => emit('error') })
  },
})

/** 渲染用户卡片，无法在 jsdom 执行的图片加载仅替换浏览器边界。 */
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
    global: { stubs: { VBtn: ButtonStub, VIcon: IconStub, VImg: ImageStub } },
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

  it.each(['', '   '])('shows the built-in avatar when the new user has no avatar (%j)', async avatar => {
    const { container } = await renderCard({ user: { avatar } })
    expect(container.querySelector('.v-avatar img')).toHaveAttribute('src', avatar1)
  })

  it('falls back from an unavailable saved avatar and retries a changed avatar source', async () => {
    const { container, rerender, user } = await renderCard({
      user: { avatar: '/assets/avatar-1-old-version.png' },
    })
    const image = container.querySelector('.v-avatar img')!
    expect(image).toHaveAttribute('src', '/assets/avatar-1-old-version.png')
    await fireEvent.error(image)
    expect(container.querySelector('.v-avatar img')).toHaveAttribute('src', avatar1)

    const uploaded = 'data:image/png;base64,synthetic-avatar'
    await rerender({ user: { ...user, avatar: uploaded } })
    expect(container.querySelector('.v-avatar img')).toHaveAttribute('src', uploaded)
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

  it('projects editing and confirmed deletion through the existing native card menu', async () => {
    mocks.apiDelete.mockResolvedValue({ success: true })
    const { container, events } = await renderCard()
    const root = container.querySelector('.user-card')!
    const edit = readNativeCardMenu(root)!
    expect(edit.title).toBe('Alice')
    expect(edit.items).toEqual([
      expect.objectContaining({ id: 'action-edit', title: '编辑', icon: 'mdi-pencil' }),
      expect.objectContaining({ id: 'action-delete', title: '删除', icon: 'mdi-delete', destructive: true }),
    ])
    expect(await nativeCardMenus.menus.select(edit.presentationId, 'action-edit', () => {})).toBe(true)
    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    expect(mocks.openSharedDialog.mock.calls[0][1]).toMatchObject({ oper: 'edit', username: 'alice' })
    const remove = readNativeCardMenu(root)!
    expect(await nativeCardMenus.menus.select(remove.presentationId, 'action-delete', () => {})).toBe(true)
    expect(mocks.confirm).toHaveBeenCalledOnce()
    expect(mocks.apiDelete).toHaveBeenCalledWith('user/id/7')
    expect(events.remove).toHaveBeenCalledOnce()
  })

  it.each([{ currentUserId: 7 }, { superUser: false }])('omits native deletion when forbidden (%j)', async options => {
    const { container } = await renderCard(options)
    const menu = readNativeCardMenu(container.querySelector('.user-card')!)!
    expect(menu.items.map(item => item.id)).toEqual(['action-edit'])
    expect(await nativeCardMenus.menus.select(menu.presentationId, 'action-delete', () => {})).toBe(false)
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.apiDelete).not.toHaveBeenCalled()
  })

  it('revokes deletion after permission changes and editing after the card is reused for another user', async () => {
    const { container, rerender, user } = await renderCard()
    const root = container.querySelector('.user-card')!
    const remove = readNativeCardMenu(root)!
    useUserStore().superUser = false
    expect(await nativeCardMenus.menus.select(remove.presentationId, 'action-delete', () => {})).toBe(false)
    expect(mocks.confirm).not.toHaveBeenCalled()
    const edit = readNativeCardMenu(root)!
    await rerender({ user: { ...user, id: 8, name: 'bob' } })
    expect(await nativeCardMenus.menus.select(edit.presentationId, 'action-edit', () => {})).toBe(false)
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })

  it('does not offer deleting the current user', async () => {
    await renderCard({ currentUserId: 7 })

    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument()
  })

  it('does not offer deleting users to non-administrators', async () => {
    await renderCard({ superUser: false })

    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument()
  })

  it('does not request deletion when confirmation is canceled', async () => {
    mocks.confirm.mockResolvedValue(false)
    await renderCard()

    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(mocks.apiDelete).not.toHaveBeenCalled()
  })

  it('emits remove only after a successful deletion', async () => {
    mocks.apiDelete.mockResolvedValue({ success: true })
    const { events } = await renderCard()

    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(mocks.apiDelete).toHaveBeenCalledWith('user/id/7'))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('用户删除成功')
    expect(events.remove).toHaveBeenCalledOnce()
  })

  it('shows business failure without emitting remove', async () => {
    mocks.apiDelete.mockResolvedValue({ success: false })
    const { events } = await renderCard()

    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('用户删除失败！'))
    expect(events.remove).not.toHaveBeenCalled()
  })

  it('shows HTTP failure without emitting remove', async () => {
    mocks.apiDelete.mockRejectedValue(new Error('network'))
    const { events } = await renderCard()

    await fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('用户删除失败！'))
    expect(events.remove).not.toHaveBeenCalled()
  })
})
