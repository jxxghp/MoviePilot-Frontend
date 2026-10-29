import { useAuthStore } from '@/stores/auth'
import { usePluginSidebarNavStore } from '@/stores/pluginSidebarNav'
import { useUserStore } from '@/stores/user'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    delete window.MoviePilotNative
    vi.unstubAllGlobals()
  })

  it('starts with the unauthenticated state and matching getters', () => {
    const authStore = useAuthStore()

    expect(authStore.$state).toEqual({ token: null, remember: false, originalPath: null })
    expect(authStore.getToken).toBeNull()
    expect(authStore.getRemember).toBe(false)
    expect(authStore.getOriginalPath).toBeNull()
  })

  it('logs in and updates independent authentication fields', () => {
    const authStore = useAuthStore()

    authStore.setOriginalPath('/recommend')
    authStore.login({ token: 'test-token', remember: true, originalPath: '/ignored' })

    expect(authStore.token).toBe('test-token')
    expect(authStore.remember).toBe(true)
    expect(authStore.originalPath).toBe('/recommend')

    authStore.setRemember(false)
    authStore.clearToken()
    expect(authStore.getRemember).toBe(false)
    expect(authStore.getToken).toBeNull()
  })

  it.each(['logout', 'resetSession'] as const)('%s 清理全部账号会话状态', action => {
    const authStore = useAuthStore()
    const pluginNavStore = usePluginSidebarNavStore()
    const userStore = useUserStore()
    const pendingRequest = Promise.resolve()

    authStore.login({ token: 'test-token', remember: true })
    authStore.setOriginalPath('/plugins')
    userStore.loginUser({
      avatar: '/avatar.png',
      level: 3,
      permissions: { admin: true, discovery: true },
      superUser: true,
      userID: 42,
      userName: 'previous-user',
    })
    pluginNavStore.$patch({
      inflight: pendingRequest,
      items: [
        {
          icon: 'mdi-test-tube',
          nav_key: 'main',
          order: 1,
          plugin_id: 'demo',
          section: 'system',
          title: 'Demo',
        },
      ],
      loaded: true,
    })

    authStore[action]()

    expect(authStore.token).toBeNull()
    expect(authStore.originalPath).toBeNull()
    expect(authStore.remember).toBe(true)
    expect(pluginNavStore.items).toEqual([])
    expect(pluginNavStore.loaded).toBe(false)
    expect(pluginNavStore.inflight).toBeNull()
    expect(userStore.$state).toEqual({
      avatar: '',
      level: 1,
      permissions: expect.objectContaining({ admin: false }),
      superUser: false,
      userID: -1,
      userName: '',
    })
  })

  it('重启或认证失效后重新登录保留通知绑定，主动退出仍撤销当前安装', () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetch)
    window.MoviePilotNative = {
      transportVersion: 1,
      postMessage: vi.fn(),
      notificationInstallation: 'installation-0001',
    }
    const authStore = useAuthStore()
    authStore.login({ token: 'before-restart', remember: true })

    authStore.resetSession()
    expect(authStore.token).toBeNull()
    expect(fetch).not.toHaveBeenCalled()

    authStore.login({ token: 'after-restart', remember: true })
    expect(fetch).not.toHaveBeenCalled()
    authStore.logout()

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer after-restart')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      action: 'unregister',
      installation: 'installation-0001',
      origin: location.origin,
    })
    expect(authStore.token).toBeNull()
  })

  it('原生组件退出通知在清空主登录之前同步发出，消息没有认证载荷', () => {
    const authStore = useAuthStore()
    authStore.setToken('web-main-token')
    window.MoviePilotNative = { transportVersion: 1, widgetsVersion: 1, postMessage: vi.fn() }
    const listener = vi.fn((event: Event) => {
      expect(authStore.token).toBe('web-main-token')
      expect(event).not.toBeInstanceOf(CustomEvent)
    })
    window.addEventListener('moviepilot:widget-logout', listener)
    try {
      authStore.logout()
      expect(listener).toHaveBeenCalledOnce()
      expect(authStore.token).toBeNull()
    } finally {
      window.removeEventListener('moviepilot:widget-logout', listener)
      delete window.MoviePilotNative
    }
  })
})
