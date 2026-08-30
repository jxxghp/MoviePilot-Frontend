import { useUserStore } from '@/stores/user'
import { DEFAULT_PERMISSIONS } from '@/utils/permission'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

describe('user store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with an anonymous user and matching getters', () => {
    const store = useUserStore()

    expect(store.$state).toEqual({
      avatar: '',
      level: 1,
      permissions: DEFAULT_PERMISSIONS,
      superUser: false,
      userID: -1,
      userName: '',
    })
    expect(store.getSuperUser).toBe(false)
    expect(store.getUserID).toBe(-1)
    expect(store.getUserName).toBe('')
    expect(store.getAvatar).toBe('')
    expect(store.getLevel).toBe(1)
    expect(store.getPermissions).toEqual(DEFAULT_PERMISSIONS)
  })

  it('stores a login response and fills omitted permission categories', () => {
    const store = useUserStore()

    store.loginUser({
      avatar: '/avatar.png',
      level: 2,
      permissions: {
        discovery: false,
        features: { 'discovery.recommend': false },
      },
      superUser: false,
      userID: 7,
      userName: 'viewer',
    })

    expect(store.$state).toEqual({
      avatar: '/avatar.png',
      level: 2,
      permissions: {
        ...DEFAULT_PERMISSIONS,
        discovery: false,
        features: { 'discovery.recommend': false },
      },
      superUser: false,
      userID: 7,
      userName: 'viewer',
    })
  })

  it('creates isolated default permissions for each store instance', () => {
    const firstStore = useUserStore()

    setActivePinia(createPinia())
    expect(useUserStore().permissions.features).not.toBe(firstStore.permissions.features)
  })

  it('resets every account field without sharing permission mutations', () => {
    const firstStore = useUserStore()
    firstStore.setPermissions({ admin: true })
    firstStore.permissions.features!['discovery.recommend'] = false
    firstStore.reset()

    expect(firstStore.$state).toEqual({
      avatar: '',
      level: 1,
      permissions: DEFAULT_PERMISSIONS,
      superUser: false,
      userID: -1,
      userName: '',
    })

    setActivePinia(createPinia())
    expect(useUserStore().permissions.features).toEqual({})
  })
})
