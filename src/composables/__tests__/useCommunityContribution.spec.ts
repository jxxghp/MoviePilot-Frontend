import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@tests/support/render'
import { flushPromises } from '@vue/test-utils'
import { AxiosError } from 'axios'
import {
  COMMUNITY_AUTH_CHANGED_EVENT,
  notifyCommunityAuthChanged,
  useCommunityContribution,
  type CommunityProfile,
} from '../useCommunityContribution'
import {
  communityProfileCacheKey,
  readCommunityProfileCache,
  writeCommunityProfileCache,
} from '@/utils/communityProfileCache'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api', () => ({ default: { get: mocks.get } }))

/** 使用当前核验时间构造公开勋章资料，不包含凭据。 */
function profile(overrides: Partial<CommunityProfile> = {}): CommunityProfile {
  return {
    state: 'ready',
    login: 'artist',
    user_id: 42,
    medals: [{ key: 'helper', at: '2025-06-18' }],
    generated_at: '2026-10-16T00:00:00Z',
    checked_at: Math.floor(Date.now() / 1000),
    stale: false,
    ...overrides,
  }
}

/** 由测试控制返回顺序，复现慢请求与身份切换交错。 */
function deferred() {
  let resolve!: (value: CommunityProfile) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<CommunityProfile>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

/** 在组件作用域内启动 composable，覆盖卸载清理和响应式身份切换。 */
async function mountCommunity(active = true, user = '1') {
  const enabled = ref(active)
  const identity = ref(user)
  let community!: ReturnType<typeof useCommunityContribution>
  const Harness = defineComponent({
    setup() {
      community = useCommunityContribution(enabled, identity)
      return () => null
    },
  })
  const view = await renderWithProviders(Harness)
  return { ...view, community, enabled, identity }
}

beforeEach(() => {
  mocks.get.mockReset()
  mocks.get.mockReturnValue(new Promise(() => {}))
})

describe('勋章快照与后台复核', () => {
  it('后端首次预热时保持占位，通过只读查询自动接收结果', async () => {
    vi.useFakeTimers()
    mocks.get.mockResolvedValueOnce(profile({ state: 'unavailable', user_id: null, medals: [], refreshing: true }))
    mocks.get.mockResolvedValueOnce(profile())
    const { community } = await mountCommunity()
    await flushPromises()
    expect(community.initialLoading.value).toBe(true)
    expect(community.failed.value).toBe(false)
    await vi.advanceTimersByTimeAsync(1500)
    expect(community.medals.value[0]?.key).toBe('helper')
    expect(community.loading.value).toBe(false)
    expect(mocks.get).toHaveBeenCalledTimes(2)
    expect(mocks.get).toHaveBeenLastCalledWith(
      'github/community',
      expect.objectContaining({ params: { refresh: false } }),
    )
  })

  it('后端重启预热时保留浏览器中同用户的勋章，完成后自动更新', async () => {
    vi.useFakeTimers()
    writeCommunityProfileCache('1', profile())
    mocks.get.mockResolvedValueOnce(profile({ state: 'unavailable', user_id: null, medals: [], refreshing: true }))
    mocks.get.mockResolvedValueOnce(profile({ medals: [{ key: 'code', tier: 4 }] }))
    const { community } = await mountCommunity()
    await flushPromises()
    expect(community.eligible.value).toBe(true)
    expect(community.medals.value[0]?.key).toBe('helper')
    expect(readCommunityProfileCache('1')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(1500)
    expect(community.medals.value[0]?.key).toBe('code')
    expect(community.loading.value).toBe(false)
  })

  it('手动刷新期间保留旧勋章，后续进度查询不重复要求后台刷新', async () => {
    vi.useFakeTimers()
    mocks.get.mockResolvedValueOnce(profile())
    const { community } = await mountCommunity()
    await flushPromises()
    mocks.get.mockResolvedValueOnce(profile({ refreshing: true })).mockResolvedValueOnce(profile())
    await community.refresh(true)
    expect(community.eligible.value).toBe(true)
    expect(community.loading.value).toBe(true)
    await vi.advanceTimersByTimeAsync(1500)
    expect(community.loading.value).toBe(false)
    expect(mocks.get.mock.calls.map(([, config]) => config.params.refresh)).toEqual([false, true, false])
  })

  it('持续后台故障时进度查询有时间上限，组件卸载后不再查询', async () => {
    vi.useFakeTimers()
    mocks.get.mockResolvedValue(profile({ state: 'unavailable', user_id: null, medals: [], refreshing: true }))
    const { community, unmount } = await mountCommunity()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(52_000)
    expect(community.loading.value).toBe(false)
    const count = mocks.get.mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mocks.get).toHaveBeenCalledTimes(count)
    unmount()
    await vi.advanceTimersByTimeAsync(2000)
    expect(mocks.get).toHaveBeenCalledTimes(count)
  })

  it('切换用户会取消等待中的后台进度查询', async () => {
    vi.useFakeTimers()
    mocks.get.mockResolvedValueOnce(profile({ state: 'unavailable', user_id: null, medals: [], refreshing: true }))
    const { enabled } = await mountCommunity()
    await flushPromises()
    enabled.value = false
    await vi.advanceTimersByTimeAsync(3000)
    expect(mocks.get).toHaveBeenCalledTimes(1)
  })

  it('重新登录立即恢复同用户快照，并继续后台复核最新档位', async () => {
    const request = deferred()
    writeCommunityProfileCache('1', profile())
    mocks.get.mockReturnValue(request.promise)
    const { community } = await mountCommunity()
    expect(community.eligible.value).toBe(true)
    expect(community.medals.value).toEqual(profile().medals)
    expect(community.profile.value?.stale).toBe(true)
    expect(community.loading.value).toBe(true)
    expect(community.initialLoading.value).toBe(false)
    expect(mocks.get).toHaveBeenCalledWith(
      'github/community',
      expect.objectContaining({ params: { refresh: false }, skipNavigationCancellation: true }),
    )
    request.resolve(profile({ medals: [{ key: 'code', tier: 4 }] }))
    await flushPromises()
    expect(community.medals.value).toEqual([{ key: 'code', tier: 4, specialty: undefined }])
    expect(community.loading.value).toBe(false)
    expect(community.profile.value?.stale).toBe(false)
    expect(readCommunityProfileCache('1')?.medals).toEqual([{ key: 'code', tier: 4 }])
  })

  it('首次访问仅在请求期间显示占位，失败后结束等待', async () => {
    const request = deferred()
    mocks.get.mockReturnValue(request.promise)
    const { community } = await mountCommunity()
    expect(community.initialLoading.value).toBe(true)
    expect(community.eligible.value).toBe(false)
    request.reject(new Error('offline'))
    await flushPromises()
    expect(community.initialLoading.value).toBe(false)
    expect(community.failed.value).toBe(true)
  })

  it('临时网络失败保留勋章并标记旧结果，且不延长快照有效期', async () => {
    const request = deferred()
    writeCommunityProfileCache('1', profile())
    const saved = localStorage.getItem(communityProfileCacheKey('1'))
    mocks.get.mockReturnValue(request.promise)
    const { community } = await mountCommunity()
    request.reject(new Error('timeout'))
    await flushPromises()
    expect(community.eligible.value).toBe(true)
    expect(community.failed.value).toBe(true)
    expect(community.profile.value?.stale).toBe(true)
    expect(localStorage.getItem(communityProfileCacheKey('1'))).toBe(saved)
  })

  it.each(['disabled', 'unavailable', 'unconfigured'] as const)('服务端返回 %s 时撤销旧勋章和快照', async state => {
    writeCommunityProfileCache('1', profile())
    mocks.get.mockResolvedValue(profile({ state, login: null, user_id: null, medals: [] }))
    const { community } = await mountCommunity()
    await flushPromises()
    expect(community.medals.value).toEqual([])
    expect(community.eligible.value).toBe(state === 'unconfigured')
    expect(readCommunityProfileCache('1')).toBeNull()
  })

  it.each([401, 403])('HTTP %s 撤销缓存展示', async status => {
    writeCommunityProfileCache('1', profile())
    const error = new AxiosError('denied')
    error.response = {
      status,
      statusText: 'Denied',
      data: {},
      headers: {},
      config: { headers: {} },
    } as typeof error.response
    mocks.get.mockRejectedValue(error)
    const { community } = await mountCommunity()
    await flushPromises()
    expect(community.eligible.value).toBe(false)
    expect(readCommunityProfileCache('1')).toBeNull()
  })

  it('退出和重新登录保留用户隔离快照，切换到其他用户不继承勋章', async () => {
    writeCommunityProfileCache('1', profile())
    const { community, enabled, identity } = await mountCommunity()
    enabled.value = false
    expect(community.profile.value).toBeNull()
    expect(readCommunityProfileCache('1')).not.toBeNull()
    enabled.value = true
    expect(community.eligible.value).toBe(true)
    identity.value = '2'
    expect(community.profile.value).toBeNull()
    expect(community.initialLoading.value).toBe(true)
  })

  it.each([false, true])('禁用功能或普通用户不能读取快照或发送请求：%s', async otherUser => {
    writeCommunityProfileCache('1', profile())
    const { community } = await mountCommunity(false, otherUser ? '2' : '1')
    expect(community.profile.value).toBeNull()
    expect(community.initialLoading.value).toBe(false)
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it('切换用户后到达的旧请求不能重写当前勋章或持久快照', async () => {
    const oldRequest = deferred()
    mocks.get.mockReturnValueOnce(oldRequest.promise)
    const { community, identity } = await mountCommunity()
    identity.value = '2'
    oldRequest.resolve(profile())
    await flushPromises()
    expect(community.profile.value).toBeNull()
    expect(readCommunityProfileCache('1')).toBeNull()
    expect(readCommunityProfileCache('2')).toBeNull()
  })

  it('授权变更清空本实例全部用户快照并发送通知，不影响其他实例', async () => {
    writeCommunityProfileCache('1', profile())
    writeCommunityProfileCache('2', profile({ user_id: 99 }))
    localStorage.setItem('community-profile:v1:https://other.example/api/v1/:1', 'other-instance')
    const listener = vi.fn()
    window.addEventListener(COMMUNITY_AUTH_CHANGED_EVENT, listener)
    notifyCommunityAuthChanged()
    window.removeEventListener(COMMUNITY_AUTH_CHANGED_EVENT, listener)
    expect(listener).toHaveBeenCalledOnce()
    expect(readCommunityProfileCache('1')).toBeNull()
    expect(readCommunityProfileCache('2')).toBeNull()
    expect(localStorage.getItem('community-profile:v1:https://other.example/api/v1/:1')).toBe('other-instance')
  })

  it('更换 Token 立即撤下旧勋章，只有新请求能重新点亮入口', async () => {
    writeCommunityProfileCache('1', profile())
    const oldRequest = deferred()
    const newRequest = deferred()
    mocks.get.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
    const { community } = await mountCommunity()
    community.authChanged()
    expect(community.profile.value).toBeNull()
    expect(readCommunityProfileCache('1')).toBeNull()
    oldRequest.resolve(profile())
    await flushPromises()
    expect(community.profile.value).toBeNull()
    expect(readCommunityProfileCache('1')).toBeNull()
    newRequest.resolve(profile({ user_id: 99, login: 'new-user', medals: [] }))
    await flushPromises()
    expect(community.profile.value?.user_id).toBe(99)
    expect(readCommunityProfileCache('1')?.user_id).toBe(99)
  })

  it('其他标签页撤销授权时清除内存资料并重新核验', async () => {
    writeCommunityProfileCache('1', profile())
    const { community } = await mountCommunity()
    localStorage.removeItem(communityProfileCacheKey('1'))
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: communityProfileCacheKey('1'),
        newValue: null,
        storageArea: localStorage,
      }),
    )
    expect(community.profile.value).toBeNull()
    expect(mocks.get).toHaveBeenLastCalledWith(
      'github/community',
      expect.objectContaining({ params: { refresh: true } }),
    )
  })

  it('组件卸载后到达的旧请求不能写回缓存', async () => {
    const request = deferred()
    mocks.get.mockReturnValue(request.promise)
    const { unmount } = await mountCommunity()
    unmount()
    request.resolve(profile())
    await flushPromises()
    expect(readCommunityProfileCache('1')).toBeNull()
  })

  it('合并进行中的复核并保留一分钟冷却，手动刷新可绕过前端冷却', async () => {
    const request = deferred()
    mocks.get.mockReturnValue(request.promise)
    const { community } = await mountCommunity()
    void community.refresh(true)
    expect(mocks.get).toHaveBeenCalledTimes(1)
    request.resolve(profile())
    await flushPromises()
    await community.refresh()
    expect(mocks.get).toHaveBeenCalledTimes(1)
    await community.refresh(true)
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })
})
