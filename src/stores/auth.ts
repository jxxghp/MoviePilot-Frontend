import { defineStore } from 'pinia'
import type { authState } from '@/stores/types'
import { usePluginSidebarNavStore } from '@/stores/pluginSidebarNav'
import { useUserStore } from '@/stores/user'
import { clearCachedMediaSubscribeStatuses } from '@/utils/mediaStatusCache'

export const useAuthStore = defineStore('auth', {
  state: (): authState => ({
    token: null,
    remember: false,
    originalPath: null,
  }),

  // 全局持久化
  persist: true,

  actions: {
    setToken(token: string | null) {
      this.token = token
    },
    clearToken() {
      this.token = null
    },
    setRemember(remember: boolean) {
      this.remember = remember
    },
    setOriginalPath(originalPath: string | null) {
      this.originalPath = originalPath
    },
    login(payload: authState) {
      this.setToken(payload.token)
      this.setRemember(payload.remember)
    },
    logout() {
      this.clearToken()
      this.setOriginalPath(null)
      // 身份和权限属于登录会话；退出后不得被同一浏览器中的下一个账号继承。
      useUserStore().reset()
      clearCachedMediaSubscribeStatuses()
      usePluginSidebarNavStore().reset()
    },
  },

  getters: {
    getToken: state => state.token,
    getRemember: state => state.remember,
    getOriginalPath: state => state.originalPath,
  },
})
