import { defineStore } from 'pinia'
import api from '@/api'
import type { PluginSidebarNavItem } from '@/api/types'

/**
 * 缓存 GET plugin/sidebar_nav 结果，供 DefaultLayout 与 appcenter 等共用，避免重复请求。
 */
export const usePluginSidebarNavStore = defineStore('pluginSidebarNav', {
  state: () => ({
    items: [] as PluginSidebarNavItem[],
    /** 是否已成功拉取过一次（含空数组） */
    loaded: false,
    /** 并发去重：同一时刻只进行一次请求 */
    inflight: null as Promise<void> | null,
  }),

  actions: {
    /**
     * 确保侧栏导航数据已加载；已缓存则直接返回，并发调用共享同一请求。
     * @param force 为 true 时忽略缓存重新请求（如登出后再登录可配合 reset + ensure）
     */
    async ensureSidebarNav(force = false): Promise<void> {
      if (!force && this.loaded) {
        return
      }
      if (this.inflight) {
        return this.inflight
      }
      this.inflight = (async () => {
        try {
          const res = await api.get('plugin/sidebar_nav')
          this.items = Array.isArray(res) ? res : []
        } catch {
          this.items = []
        } finally {
          this.loaded = true
          this.inflight = null
        }
      })()
      return this.inflight
    },

    reset() {
      this.items = []
      this.loaded = false
      this.inflight = null
    },
  },
})
