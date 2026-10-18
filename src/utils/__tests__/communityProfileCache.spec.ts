import { describe, expect, it, vi } from 'vitest'
import type { CommunityProfile } from '@/composables/useCommunityContribution'
import {
  clearCommunityProfileCache,
  communityProfileCacheKey,
  readCommunityProfileCache,
  writeCommunityProfileCache,
} from '../communityProfileCache'

/** 构造当前核验时间的最小完整资料。 */
function profile(overrides: Partial<CommunityProfile> = {}): CommunityProfile {
  return {
    state: 'ready',
    login: 'artist',
    user_id: 42,
    medals: [{ key: 'helper' }],
    generated_at: null,
    checked_at: Math.floor(Date.now() / 1000),
    stale: false,
    ...overrides,
  }
}

describe('communityProfileCache', () => {
  it('快照只供临时展示，恢复时标记为上次结果', () => {
    const value = profile()
    writeCommunityProfileCache('1', value)
    expect(readCommunityProfileCache('1')).toEqual({ ...value, stale: true })
    expect(readCommunityProfileCache('2')).toBeNull()
  })

  it.each([null, 'bad json', '{}', '{"profile":null}'])('损坏的快照按首次访问处理：%s', raw => {
    if (raw !== null) localStorage.setItem(communityProfileCacheKey('1'), raw)
    expect(readCommunityProfileCache('1')).toBeNull()
  })

  it('隔日登录仍可恢复，七天后过期且服务端旧结果不能续期', () => {
    vi.useFakeTimers()
    const value = profile()
    writeCommunityProfileCache('1', value)
    vi.advanceTimersByTime(24 * 60 * 60 * 1000)
    expect(readCommunityProfileCache('1')).not.toBeNull()
    vi.advanceTimersByTime(6 * 24 * 60 * 60 * 1000)
    expect(readCommunityProfileCache('1')).toBeNull()
    writeCommunityProfileCache('1', value)
    expect(readCommunityProfileCache('1')).toBeNull()
  })

  it('拒绝未来时间，防止系统时间回退后长期复用快照', () => {
    vi.useFakeTimers()
    writeCommunityProfileCache('1', profile())
    vi.setSystemTime(Date.now() - 60_000)
    expect(readCommunityProfileCache('1')).toBeNull()
  })

  it.each(['disabled', 'unavailable', 'unconfigured', 'stale'] as const)('不将 %s 状态保存为新核验结果', state => {
    writeCommunityProfileCache('1', profile(state === 'stale' ? { stale: true } : { state }))
    expect(readCommunityProfileCache('1')).toBeNull()
  })

  it('存储被浏览器禁用时不影响查询链路', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => writeCommunityProfileCache('1', profile())).not.toThrow()
    expect(() => clearCommunityProfileCache('1')).not.toThrow()
    expect(readCommunityProfileCache('1')).toBeNull()
  })
})
