import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNotificationPoliciesStore } from '@/stores/notificationPolicies'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/api', () => ({ default: createDataApiMock(mocks) }))

describe('自动整理接管通知的共享配置', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mocks.get.mockReset()
    mocks.post.mockReset()
    mocks.post.mockResolvedValue({ success: true })
  })

  it('缺少旧配置时保留全部通知，两个入口共用一次读取和同一草稿', async () => {
    mocks.get.mockResolvedValue({ success: true, data: { value: null } })
    const first = useNotificationPoliciesStore()
    const second = useNotificationPoliciesStore()
    await Promise.all([first.load(), second.load()])
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(first.mode).toBe('all')
    first.mode = 'attention'
    expect(second.mode).toBe('attention')
    await first.save()
    expect(mocks.post).toHaveBeenCalledWith('system/settings', {
      setting_key: 'NotificationPolicies',
      operation: 'replace',
      value: { agent_transfer_takeover: 'attention' },
    })
    expect(second.dirty).toBe(false)
  })

  it('保存只替换该策略，保留服务器返回的其他配置字段', async () => {
    mocks.get.mockResolvedValue({
      success: true,
      data: { value: { agent_transfer_takeover: 'off', future_policy: 'all' } },
    })
    const store = useNotificationPoliciesStore()
    await store.load()
    store.mode = 'attention'
    expect(await store.save()).toBe(true)
    expect(mocks.post.mock.calls[0][1].value).toEqual({ agent_transfer_takeover: 'attention', future_policy: 'all' })
  })

  it('读取失败或不支持的值不会被默认值覆盖保存，重试成功才允许写入', async () => {
    const store = useNotificationPoliciesStore()
    mocks.get.mockRejectedValueOnce(new Error('offline'))
    await store.load()
    expect(store.loadFailed).toBe(true)
    expect(await store.save()).toBe(false)
    mocks.get.mockResolvedValueOnce({ success: true, data: { value: { agent_transfer_takeover: 'unsupported' } } })
    await store.load(true)
    expect(store.loaded).toBe(false)
    mocks.get.mockResolvedValueOnce({ success: true, data: { value: { agent_transfer_takeover: 'off' } } })
    await store.load(true)
    expect(store.loaded).toBe(true)
    expect(store.mode).toBe('off')
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('切换页面不会覆盖未保存的草稿，失败保存可以重试', async () => {
    mocks.get.mockResolvedValue({ success: true, data: { value: { agent_transfer_takeover: 'all' } } })
    const store = useNotificationPoliciesStore()
    await store.load()
    store.mode = 'off'
    await store.load(true)
    expect(mocks.get).toHaveBeenCalledTimes(1)
    mocks.post.mockRejectedValueOnce(new Error('offline'))
    expect(await store.save()).toBe(false)
    expect(store.saveFailed).toBe(true)
    expect(store.dirty).toBe(true)
    expect(await store.save()).toBe(true)
    expect(store.saveFailed).toBe(false)
    expect(store.dirty).toBe(false)
  })

  it('迟到的刷新不会覆盖用户刚编辑的值，保存时也不启动额外刷新', async () => {
    mocks.get.mockResolvedValueOnce({ success: true, data: { value: { agent_transfer_takeover: 'all' } } })
    const store = useNotificationPoliciesStore()
    await store.load()
    let finishRead: (value: unknown) => void = () => undefined
    mocks.get.mockImplementationOnce(() => new Promise(resolve => (finishRead = resolve)))
    const pending = store.load(true)
    await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2))
    store.mode = 'attention'
    finishRead({ success: true, data: { value: { agent_transfer_takeover: 'off' } } })
    await pending
    expect(store.mode).toBe('attention')
    let finishSave: (value: unknown) => void = () => undefined
    mocks.post.mockImplementationOnce(() => new Promise(resolve => (finishSave = resolve)))
    const saving = store.save()
    await store.load(true)
    expect(await store.save()).toBe(false)
    expect(mocks.get).toHaveBeenCalledTimes(2)
    finishSave({ success: true })
    expect(await saving).toBe(true)
  })
})
