import { useAuthStore } from '@/stores/auth'
import { usePluginSidebarNavStore } from '@/stores/pluginSidebarNav'
import { useUserStore } from '@/stores/user'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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

  it('logs out and clears all account-scoped state', () => {
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
      wizard: true,
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

    authStore.logout()

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
      wizard: false,
    })
  })
})
