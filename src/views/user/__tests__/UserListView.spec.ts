import type { User } from '@/api/types'
import UserListView from '@/views/user/UserListView.vue'
import { DEFAULT_PERMISSIONS } from '@/utils/permission'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { createUser } from '@tests/support/factories/user'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, ref, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  appMode: false,
  openSharedDialog: vi.fn(),
  useDynamicButton: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: { get: (...args: unknown[]) => mocks.apiGet(...args) },
}))

vi.mock('@/composables/useDynamicButton', () => ({
  useDynamicButton: (options: unknown) => mocks.useDynamicButton(options),
}))

vi.mock('@/composables/usePWA', async () => {
  const { computed } = await import('vue')
  return { usePWA: () => ({ appMode: computed(() => mocks.appMode) }) }
})

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

const UserCardStub = defineComponent({
  name: 'UserCard',
  props: {
    user: { type: Object as PropType<User>, required: true },
    users: { type: Array as PropType<User[]>, required: true },
  },
  emits: ['remove', 'save'],
  setup(props, { emit }) {
    return () =>
      h('article', { 'data-testid': `user-${props.user.id}` }, [
        h('span', props.user.name),
        h('button', { onClick: () => emit('remove'), type: 'button' }, `remove-${props.user.id}`),
        h('button', { onClick: () => emit('save'), type: 'button' }, `save-${props.user.id}`),
      ])
  },
})

const ProgressiveCardGridStub = defineComponent({
  name: 'ProgressiveCardGrid',
  props: {
    getItemKey: { type: Function as PropType<(user: User) => number>, required: true },
    items: { type: Array as PropType<User[]>, required: true },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'section',
        props.items.flatMap(item => h('div', { key: props.getItemKey(item) }, slots.default?.({ item }) ?? [])),
      )
  },
})

const NoDataFoundStub = defineComponent({
  name: 'NoDataFound',
  props: { errorDescription: String, errorTitle: String },
  template:
    '<section role="region" aria-label="用户状态">{{ errorTitle }} {{ errorDescription }}<slot name="button" /></section>',
})

const LoadingBannerStub = defineComponent({
  name: 'LoadingBanner',
  template: '<div role="status">加载用户</div>',
})

const ButtonStub = defineComponent({
  name: 'VBtn',
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return () => h('button', { ...attrs, type: 'button' }, slots.default?.())
  },
})

const KeepAliveHost = defineComponent({
  components: { UserListView },
  setup() {
    return { active: ref(true) }
  },
  template: `
    <button type="button" @click="active = false">停用用户页</button>
    <button type="button" @click="active = true">启用用户页</button>
    <KeepAlive><UserListView v-if="active" /></KeepAlive>
  `,
})

interface RenderListOptions {
  appMode?: boolean
  initialRoute?: string
  superUser?: boolean
  useKeepAlive?: boolean
}

async function renderList(options: RenderListOptions = {}) {
  mocks.appMode = options.appMode ?? false
  return renderWithProviders(options.useKeepAlive ? KeepAliveHost : UserListView, {
    initialRoute: options.initialRoute ?? '/user',
    initialState: {
      user: {
        permissions: DEFAULT_PERMISSIONS,
        superUser: options.superUser ?? true,
      },
    },
    global: {
      stubs: {
        LoadingBanner: LoadingBannerStub,
        NoDataFound: NoDataFoundStub,
        ProgressiveCardGrid: ProgressiveCardGridStub,
        UserCard: UserCardStub,
        VFab: ButtonStub,
        VPageContentTitle: true,
      },
    },
  })
}

describe('UserListView', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.useDynamicButton.mockReset()
    mocks.openSharedDialog.mockReturnValue({ close: vi.fn(), id: 1, updateProps: vi.fn() })
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('loads users once during the initial activated mount', async () => {
    const user = createUser()
    mocks.apiGet.mockResolvedValue([user])

    await renderList()

    expect(await screen.findByText(user.name)).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
    expect(mocks.apiGet).toHaveBeenCalledWith('/user/')
  })

  it('shows a normal empty state for a successful empty response', async () => {
    mocks.apiGet.mockResolvedValue([])

    await renderList()

    expect(await screen.findByRole('region', { name: '用户状态' })).toHaveTextContent('没有用户')
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument()
  })

  it('shows a retryable failure instead of remaining in loading state', async () => {
    mocks.apiGet.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce([createUser({ name: 'recovered' })])

    await renderList()

    const retry = await screen.findByRole('button', { name: '重试' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await fireEvent.click(retry)
    expect(await screen.findByText('recovered')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
  })

  it('refreshes after child remove and save events', async () => {
    const user = createUser()
    mocks.apiGet.mockResolvedValue([user])
    await renderList()
    expect(await screen.findByText(user.name)).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: `remove-${user.id}` }))
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(2))
    await fireEvent.click(screen.getByRole('button', { name: `save-${user.id}` }))
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(3))
  })

  it('refreshes when a kept-alive view is activated again', async () => {
    mocks.apiGet.mockResolvedValue([createUser()])
    await renderList({ useKeepAlive: true })
    await screen.findByText('alice')

    await fireEvent.click(screen.getByRole('button', { name: '停用用户页' }))
    await fireEvent.click(screen.getByRole('button', { name: '启用用户页' }))

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(2))
  })

  it('keeps stale users visible and offers retry when reactivation refresh fails', async () => {
    mocks.apiGet
      .mockResolvedValueOnce([createUser({ name: 'stale-user' })])
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce([createUser({ name: 'recovered-user' })])
    await renderList({ useKeepAlive: true })
    await screen.findByText('stale-user')

    await fireEvent.click(screen.getByRole('button', { name: '停用用户页' }))
    await fireEvent.click(screen.getByRole('button', { name: '启用用户页' }))

    const retry = await screen.findByRole('button', { name: '重试' })
    expect(screen.getByText('stale-user')).toBeInTheDocument()
    await fireEvent.click(retry)
    expect(await screen.findByText('recovered-user')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledTimes(3)
  })

  it.each([
    ['PWA 模式', { appMode: true }],
    ['非用户路由', { initialRoute: '/apps' }],
    ['无管理权限', { superUser: false }],
  ])('hides the page add button in %s', async (_case, options) => {
    mocks.apiGet.mockResolvedValue([])
    await renderList(options)
    await screen.findByRole('region', { name: '用户状态' })

    expect(document.querySelector('.compact-fab')).not.toBeInTheDocument()
  })

  it('opens the add dialog from page and dynamic actions with admin permission', async () => {
    mocks.apiGet.mockResolvedValue([])
    await renderList()
    await screen.findByRole('region', { name: '用户状态' })

    expect(mocks.useDynamicButton).toHaveBeenCalledWith(expect.objectContaining({ permission: 'admin' }))
    await fireEvent.click(document.querySelector('.compact-fab')!)
    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    expect(mocks.openSharedDialog.mock.calls[0][1]).toMatchObject({
      maxWidth: '45rem',
      oper: 'add',
      usernames: [],
    })
    mocks.openSharedDialog.mock.calls[0][2].save()
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(2))

    mocks.useDynamicButton.mock.calls[0][0].onClick()
    expect(mocks.openSharedDialog).toHaveBeenCalledTimes(2)
  })
})
