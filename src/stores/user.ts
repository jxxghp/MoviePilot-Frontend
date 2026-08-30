import { defineStore } from 'pinia'
import type { userState } from '@/stores/types'
import { DEFAULT_PERMISSIONS } from '@/utils/permission'

export const useUserStore = defineStore('user', {
  state: (): userState => ({
    superUser: false,
    userID: -1,
    userName: '',
    avatar: '',
    level: 1,
    permissions: {
      ...DEFAULT_PERMISSIONS,
      features: { ...DEFAULT_PERMISSIONS.features },
    },
  }),

  // 全局持久化
  persist: true,

  actions: {
    setSuperUser(superUser: boolean) {
      this.superUser = superUser
    },
    setUserID(userID: number) {
      this.userID = userID
    },
    setUserName(userName: string) {
      this.userName = userName
    },
    setAvatar(avatar: string) {
      this.avatar = avatar
    },
    setLevel(level: number) {
      this.level = level
    },
    setPermissions(permissions: object) {
      const mergedPermissions = { ...DEFAULT_PERMISSIONS, ...permissions }
      this.permissions = {
        ...mergedPermissions,
        features: { ...mergedPermissions.features },
      }
    },
    loginUser(payload: userState) {
      this.setSuperUser(payload.superUser)
      this.setUserID(payload.userID)
      this.setUserName(payload.userName)
      this.setAvatar(payload.avatar)
      this.setLevel(payload.level)
      this.setPermissions(payload.permissions)
    },
    reset() {
      this.setSuperUser(false)
      this.setUserID(-1)
      this.setUserName('')
      this.setAvatar('')
      this.setLevel(1)
      this.setPermissions(DEFAULT_PERMISSIONS)
    },
  },

  getters: {
    getSuperUser: state => state.superUser,
    getUserID: state => state.userID,
    getUserName: state => state.userName,
    getAvatar: state => state.avatar,
    getLevel: state => state.level,
    getPermissions: state => state.permissions,
  },
})
