import { clearSharedDialogs } from '@/composables/useSharedDialog'
import { clearAgentPetCache } from '@/utils/agentPetCache'
import { defineStore } from 'pinia'
import type { authState } from '@/stores/types'
import { usePluginSidebarNavStore } from '@/stores/pluginSidebarNav'
import { useUserStore } from '@/stores/user'
import { clearCachedMediaSubscribeStatuses } from '@/utils/mediaStatusCache'
import { revokeNativeNotificationBinding } from '@/native/notifications'
import { endNativeWidgetSession } from '@/native/widgets'

export const useAuthStore = defineStore('auth', {
  state: (): authState => ({
    token: null,
    remember: false,
    originalPath: null,
  }),

  // 全局持久化
  persist: true,

  actions: {
    /** 登录或刷新时替换当前认证令牌，持久化由原 store 插件统一管理。 */
    setToken(token: string | null) {
      if (this.token !== token) clearSharedDialogs()
      this.token = token
    },
    /** 清除本地认证，调用方负责先撤销需要旧身份的系统绑定。 */
    clearToken() {
      clearSharedDialogs()
      this.token = null
    },
    /** 保存用户明确选择的登录记忆偏好。 */
    setRemember(remember: boolean) {
      this.remember = remember
    },
    /** 保存登录完成后的原业务目的地。 */
    setOriginalPath(originalPath: string | null) {
      this.originalPath = originalPath
    },
    /** 接受既有认证接口结果，不创建另一套容器认证。 */
    login(payload: authState) {
      this.setToken(payload.token)
      this.setRemember(payload.remember)
    },
    /** 先通知容器撤销通知和小组件，再清理当前用户和依赖登录态的缓存。 */
    logout() {
      endNativeWidgetSession()
      // 在清除现有认证之前撤销通知；失败不能阻断本地退出或恢复已失效会话。
      revokeNativeNotificationBinding(this.token)
      this.clearToken()
      this.setOriginalPath(null)
      // 身份和权限属于登录会话；退出后不得被同一浏览器中的下一个账号继承。
      const userStore = useUserStore()
      clearAgentPetCache(userStore.userName)
      userStore.reset()
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
