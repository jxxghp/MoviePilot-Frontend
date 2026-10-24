import UserProfile from '../UserProfile.vue'
import { renderWithProviders } from '@tests/support/render'
import { nativeGlobalActions } from '@/native/registry'
import { useUserStore } from '@/stores'
import { computed } from 'vue'
import { waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ community: vi.fn(), get: vi.fn() }))
vi.mock('@/api', () => ({ default: { get: mocks.get } }))
vi.mock('vue-toastification', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))

beforeEach(() => {
  mocks.community.mockResolvedValue({ state: 'ready', user_id: 123, medals: [{ key: 'tester' }] })
  mocks.get.mockImplementation((path: string) => {
    if (path === 'github/community') return mocks.community()
    if (path === 'system/update/status') return Promise.resolve({ updates: [] })
    return Promise.resolve({ value: '' })
  })
})

/** 在原 UserProfile 作用域读取面板，确保异步资格与 store 更新不会冻结为旧快照。 */
async function renderProfile(level = 1, superUser = true) {
  const result = await renderWithProviders(UserProfile, {
    stubActions: false,
    initialState: {
      user: { superUser, userID: 7, userName: '演示用户', level },
      globalSettings: { data: { COMMUNITY_MEDALS_ENABLED: true } },
    },
  })
  const action = nativeGlobalActions.value.get('profile')!
  const entries = computed(() => action.panel!()!.sections.flatMap(section => section.items))
  return { ...result, action, entries }
}

describe('原生用户菜单与网页状态同步', () => {
  it('已认证账号隐藏认证入口，勋章资格异步完成后立即出现在原顺序中', async () => {
    const { entries } = await renderProfile(2)
    await waitFor(() => expect(entries.value.some(item => item.id === 'medals')).toBe(true))
    expect(entries.value.map(item => item.id)).toEqual([
      'profile',
      'settings',
      'customizer',
      'language',
      'help',
      'medals',
      'about',
      'restart',
      'logout',
    ])
    expect(entries.value.some(item => item.id === 'auth')).toBe(false)
    expect(entries.value.some(item => ['css', 'ui', 'glass', 'transparency'].includes(item.id))).toBe(false)
  })

  it('认证等级和身份变化使用最新 store，普通用户不继承管理员勋章或认证入口', async () => {
    const { entries, pinia } = await renderProfile()
    expect(entries.value.some(item => item.id === 'auth')).toBe(true)
    const user = useUserStore(pinia)
    user.setLevel(2)
    expect(entries.value.some(item => item.id === 'auth')).toBe(false)
    user.setSuperUser(false)
    expect(entries.value.map(item => item.id)).not.toContain('medals')
    expect(entries.value.map(item => item.id)).not.toContain('settings')
  })

  it('从原生打开时执行与网页头像菜单相同的勋章静默复核', async () => {
    const { action } = await renderProfile(2)
    await waitFor(() => expect(mocks.community).toHaveBeenCalled())
    mocks.community.mockClear()
    const time = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000)
    try {
      await action.panel!()!.onOpen!()
      expect(mocks.community).toHaveBeenCalledTimes(1)
    } finally {
      time.mockRestore()
    }
  })
})
