import UserProfile from '../UserProfile.vue'
import { renderWithProviders } from '@tests/support/render'
import { nativeGlobalActions } from '@/native/registry'
import { useAuthStore, useUserStore } from '@/stores'
import { flushPromises } from '@vue/test-utils'
import { computed, toValue } from 'vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  persistPartialThemeCustomizerSettings,
  readThemeCustomizerSettings,
  THEME_CUSTOMIZER_CHANGE_EVENT,
} from '@/composables/useThemeCustomizer'

const mocks = vi.hoisted(() => ({ community: vi.fn(), get: vi.fn(), confirm: vi.fn(), routerPush: vi.fn() }))
vi.mock('@/api', () => ({ default: { get: mocks.get, post: vi.fn().mockResolvedValue(null) } }))
vi.mock('@/router', () => ({ default: { push: mocks.routerPush } }))
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => ({ createConfirm: mocks.confirm }) }))
vi.mock('vue-toastification', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))

beforeEach(() => {
  mocks.get.mockClear()
  mocks.routerPush.mockReset()
  mocks.confirm.mockReset().mockResolvedValue(true)
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
  it('重启恢复后清理登录会话，保留 App 及配对网页通知绑定', async () => {
    const { entries, pinia } = await renderProfile(2)
    await flushPromises()
    const auth = useAuthStore(pinia)
    auth.login({ token: 'restart-session-token', remember: true })
    const fetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('MoviePilotNative', {
      transportVersion: 1,
      postMessage: vi.fn(),
      notificationInstallation: 'installation-restart-001',
    })
    const logout = vi.spyOn(auth, 'logout')
    const clearToken = vi.spyOn(auth, 'clearToken')
    const restart = entries.value.find(item => item.id === 'restart')!
    vi.useFakeTimers()

    await restart.invoke?.()
    await vi.advanceTimersByTimeAsync(6000)

    expect(mocks.get).toHaveBeenCalledWith('system/restart')
    expect(mocks.get).toHaveBeenCalledWith('system/ping', expect.any(Object))
    expect(fetch).not.toHaveBeenCalled()
    expect(clearToken).toHaveBeenCalledOnce()
    expect(logout).not.toHaveBeenCalled()
    expect(auth.token).toBeNull()
    expect(mocks.routerPush).toHaveBeenCalledWith('/login')
  })

  it('网页主题菜单中的玻璃设置随总开关即时显示和隐藏', async () => {
    await renderProfile(2)
    persistPartialThemeCustomizerSettings({ glassEnabled: false })
    await fireEvent.click(screen.getByRole('button', { name: '用户菜单' }))
    await fireEvent.click(await screen.findByText('主题', { selector: '.v-list-item-title' }))
    expect(screen.queryByText('玻璃设置')).not.toBeInTheDocument()
    persistPartialThemeCustomizerSettings({ glassEnabled: true })
    expect(await screen.findByText('玻璃设置')).toBeVisible()
    persistPartialThemeCustomizerSettings({ glassEnabled: false })
    await waitFor(() => expect(screen.queryByText('玻璃设置')).not.toBeInTheDocument())
  })

  it('已认证账号隐藏认证入口，勋章资格异步完成后立即出现在原顺序中', async () => {
    const { entries, action } = await renderProfile(2)
    expect(toValue(action.title)).toBe('用户')
    expect(action.panel!()!.title).toBe('用户')
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
    const preferences = action.panel!()!.sections.find(section => section.items.some(item => item.id === 'customizer'))!
    expect(preferences.title).toBeUndefined()
    expect(preferences.items.map(item => item.id)).toEqual(['customizer', 'language'])
    expect(preferences.items[0].title).toBe('主题')
    expect(preferences.items[0].subtitle).toBe('跟随系统')
    expect(entries.value.some(item => item.id === 'auth')).toBe(false)
    expect(entries.value.some(item => ['css', 'ui', 'glass', 'transparency'].includes(item.id))).toBe(false)
  })

  it('主题副标题随已保存的明暗设置更新，不把当前系统明暗误显示为用户选择', async () => {
    const { entries } = await renderProfile(2)
    for (const [theme, title] of [
      ['light', '浅色'],
      ['dark', '深色'],
      ['auto', '跟随系统'],
    ] as const) {
      window.dispatchEvent(
        new CustomEvent(THEME_CUSTOMIZER_CHANGE_EVENT, { detail: { ...readThemeCustomizerSettings(), theme } }),
      )
      expect(entries.value.find(item => item.id === 'customizer')?.subtitle).toBe(title)
    }
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
