import { defineComponent } from 'vue'
import { useUserStore } from '@/stores'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@tests/support/render'
import { createSubscribe } from '@tests/support/factories/subscribe'
import {
  usePluginSubscriptionManager,
  type NativeSubscriptionManager,
} from '@/composables/usePluginSubscriptionManager'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  search: vi.fn(),
  reset: vi.fn(),
  confirm: vi.fn(),
  openDialog: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/api', () => ({
  default: createDataApiMock({ get: mocks.get, put: mocks.put, delete: mocks.delete }),
  getApiBusinessErrorMessage: (error: unknown) => (error instanceof Error ? error.message : undefined),
}))
vi.mock('@/api/subscription', () => ({ searchSubscription: mocks.search, resetSubscription: mocks.reset }))
vi.mock('@/router', () => ({ default: { push: mocks.push } }))
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => mocks.confirm }))
vi.mock('@/composables/useSharedDialog', () => ({ openSharedDialog: mocks.openDialog }))
vi.mock('vue-toastification', () => ({
  useToast: () => ({ success: mocks.success, info: mocks.info, error: mocks.error }),
}))

/** 在独立应用上下文中创建宿主管理入口，权限和回调均按用例隔离。 */
async function managerScope(permission = true) {
  let manager: NativeSubscriptionManager | undefined
  const rendered = await renderWithProviders(
    defineComponent({
      setup() {
        manager = usePluginSubscriptionManager()
        return () => null
      },
    }),
    { initialState: { user: { permissions: { subscribe: permission }, superUser: false, userName: 'tester' } } },
  )
  if (!manager) throw new Error('管理入口未初始化')
  return { ...rendered, manager }
}

/** 仅需要入口函数的用例沿用简洁构造。 */
async function managerHarness(permission = true) {
  return (await managerScope(permission)).manager
}

describe('plugin native subscription management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue(createSubscribe({ id: 7, season: 0, episode_group: 'special-group' }))
    mocks.confirm.mockResolvedValue(true)
    mocks.search.mockResolvedValue({ queued_count: 1, ongoing_count: 0 })
    mocks.put.mockResolvedValue(undefined)
    mocks.delete.mockResolvedValue(undefined)
    mocks.reset.mockResolvedValue(undefined)
  })

  it('rejects invalid IDs and missing subscription permission before requesting data', async () => {
    const denied = await managerHarness(false)
    expect((await denied({ action: 'edit', subscriptionId: 7 })).success).toBe(false)
    const manager = await managerHarness()
    for (const id of [-1, 0, 1.2, NaN])
      expect((await manager({ action: 'edit', subscriptionId: id })).success).toBe(false)
    expect(mocks.get).not.toHaveBeenCalled()
    expect(mocks.openDialog).not.toHaveBeenCalled()
  })

  it('does not open dialogs or mutate an inaccessible or absent subscription', async () => {
    mocks.get.mockResolvedValue({ id: null })
    const manager = await managerHarness()
    expect((await manager({ action: 'reset', subscriptionId: 7 })).success).toBe(false)
    expect(mocks.reset).not.toHaveBeenCalled()
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.openDialog).not.toHaveBeenCalled()
  })

  it('opens the native editor and refreshes only on actual save/remove events', async () => {
    const changed = vi.fn()
    const manager = await managerHarness()
    expect(await manager({ action: 'edit', subscriptionId: 7, onChanged: changed })).toEqual({
      success: true,
      status: 'opened',
    })
    expect(mocks.get).toHaveBeenCalledWith('subscribe/7')
    expect(mocks.openDialog).toHaveBeenCalledWith(
      expect.any(Object),
      { subid: 7 },
      { save: expect.any(Function), remove: expect.any(Function) },
      { closeOn: ['close', 'save', 'remove'] },
    )
    expect(changed).not.toHaveBeenCalled()
    await mocks.openDialog.mock.calls[0][2].save()
    expect(changed).toHaveBeenCalledOnce()
  })

  it('passes the current canonical subscription to the activity dialog, preserving season/group', async () => {
    const manager = await managerHarness()
    await manager({ action: 'activity', subscriptionId: 7 })
    expect(mocks.openDialog).toHaveBeenCalledWith(
      expect.any(Object),
      { subscription: expect.objectContaining({ id: 7, season: 0, episode_group: 'special-group' }) },
      {},
      { closeOn: ['close'] },
    )
  })

  it('opens media details using both source and media ID from the authorized record', async () => {
    const manager = await managerHarness()
    await manager({ action: 'detail', subscriptionId: 7 })
    expect(mocks.push).toHaveBeenCalledWith({
      path: '/media',
      query: expect.objectContaining({
        media_source: 'themoviedb',
        media_id: expect.any(String),
        type: '电影',
      }),
    })
  })

  it('cancelling the native reset confirmation performs no write or refresh', async () => {
    mocks.confirm.mockResolvedValue(false)
    const changed = vi.fn()
    const manager = await managerHarness()
    expect(await manager({ action: 'reset', subscriptionId: 7, onChanged: changed })).toEqual({
      success: false,
      code: 'CANCELLED',
      cancelled: true,
    })
    expect(mocks.reset).not.toHaveBeenCalled()
    expect(changed).not.toHaveBeenCalled()
  })

  it.each(['pause', 'resume', 'reset', 'delete'] as const)(
    'uses the native %s endpoint after confirmation',
    async action => {
      const changed = vi.fn()
      const manager = await managerHarness()
      expect(await manager({ action, subscriptionId: 7, onChanged: changed })).toEqual({
        success: true,
        status: 'completed',
      })
      expect(mocks.confirm).toHaveBeenCalledOnce()
      if (action === 'reset') expect(mocks.reset).toHaveBeenCalledWith(7)
      else if (action === 'delete') expect(mocks.delete).toHaveBeenCalledWith('subscribe/7')
      else expect(mocks.put).toHaveBeenCalledWith(`subscribe/status/7?state=${action === 'pause' ? 'S' : 'R'}`)
      expect(changed).toHaveBeenCalledOnce()
    },
  )

  it('reports an ongoing search without submitting a different operation', async () => {
    mocks.search.mockResolvedValue({ queued_count: 0, ongoing_count: 1 })
    const manager = await managerHarness()
    expect(await manager({ action: 'search', subscriptionId: 7 })).toEqual({ success: true, status: 'completed' })
    expect(mocks.search).toHaveBeenCalledWith(7)
    expect(mocks.info).toHaveBeenCalledOnce()
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it('propagates native API failure and allows retry without reporting a change', async () => {
    const changed = vi.fn()
    mocks.reset.mockRejectedValueOnce(new Error('重置失败'))
    const manager = await managerHarness()
    expect(await manager({ action: 'reset', subscriptionId: 7, onChanged: changed })).toEqual({
      success: false,
      code: 'REQUEST_FAILED',
      message: '重置失败',
    })
    expect(changed).not.toHaveBeenCalled()
    expect((await manager({ action: 'reset', subscriptionId: 7, onChanged: changed })).success).toBe(true)
    expect(changed).toHaveBeenCalledOnce()
  })

  it('卸载后不再接受操作，也不发送 API 请求', async () => {
    const scope = await managerScope()
    scope.unmount()
    expect(await scope.manager({ action: 'delete', subscriptionId: 7 })).toEqual({
      success: false,
      code: 'HOST_DISPOSED',
      cancelled: true,
    })
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it('读取期间卸载时不再打开弹窗', async () => {
    let resolve!: (value: ReturnType<typeof createSubscribe>) => void
    mocks.get.mockReturnValueOnce(
      new Promise(done => {
        resolve = done
      }),
    )
    const scope = await managerScope()
    const pending = scope.manager({ action: 'edit', subscriptionId: 7 })
    scope.unmount()
    resolve(createSubscribe({ id: 7 }))
    expect(await pending).toMatchObject({ success: false, code: 'HOST_DISPOSED' })
    expect(mocks.openDialog).not.toHaveBeenCalled()
  })

  it('已打开弹窗的保存回调不会刷新卸载后的插件', async () => {
    const changed = vi.fn()
    const scope = await managerScope()
    await scope.manager({ action: 'edit', subscriptionId: 7, onChanged: changed })
    const save = mocks.openDialog.mock.calls[0][2].save
    scope.unmount()
    await save()
    expect(changed).not.toHaveBeenCalled()
  })

  it.each(['identity', 'permission'] as const)('确认期间%s变化时不写入', async change => {
    let confirm!: (value: boolean) => void
    mocks.confirm.mockReturnValueOnce(
      new Promise(done => {
        confirm = done
      }),
    )
    const scope = await managerScope()
    const pending = scope.manager({ action: 'pause', subscriptionId: 7 })
    await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce())
    const user = useUserStore(scope.pinia)
    if (change === 'identity') user.userName = 'another-user'
    else user.permissions.subscribe = false
    confirm(true)
    expect(await pending).toMatchObject({
      success: false,
      code: change === 'identity' ? 'HOST_DISPOSED' : 'PERMISSION_DENIED',
    })
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it.each(['logs', 'files', 'share', 'execution'] as const)(
    '新增%s操作重新读取记录并仅打开对应原生界面',
    async action => {
      mocks.get.mockResolvedValue({
        ...createSubscribe({ id: 7 }),
        execution_status: { state: 'completed', phase: 'completed' },
      })
      const manager = await managerHarness()
      expect(await manager({ action, subscriptionId: 7 })).toMatchObject({ success: true, status: 'opened' })
      const props = mocks.openDialog.mock.calls[0][1]
      if (action === 'files') expect(props).toEqual({ subid: 7 })
      if (action === 'share') expect(props.sub.id).toBe(7)
      if (action === 'logs') expect(props.subscription.id).toBe(7)
      if (action === 'execution') expect(props.execution.state).toBe('completed')
      expect(mocks.put).not.toHaveBeenCalled()
      expect(mocks.delete).not.toHaveBeenCalled()
    },
  )

  it('没有执行状态时不会构造无效执行详情弹窗', async () => {
    const manager = await managerHarness()
    expect(await manager({ action: 'execution', subscriptionId: 7 })).toMatchObject({
      success: false,
      code: 'INVALID_REQUEST',
    })
    expect(mocks.openDialog).not.toHaveBeenCalled()
  })

  it('rejects a concurrent operation on the same subscription while its read is pending', async () => {
    let resolve!: (value: ReturnType<typeof createSubscribe>) => void
    mocks.get.mockReturnValueOnce(
      new Promise(done => {
        resolve = done
      }),
    )
    const manager = await managerHarness()
    const pending = manager({ action: 'edit', subscriptionId: 7 })
    expect(await manager({ action: 'search', subscriptionId: 7 })).toEqual({
      success: false,
      code: 'BUSY',
      cancelled: true,
    })
    expect(mocks.get).toHaveBeenCalledOnce()
    resolve(createSubscribe({ id: 7 }))
    await pending
    expect(mocks.search).not.toHaveBeenCalled()
  })
})
