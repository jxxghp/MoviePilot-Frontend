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
    /** 当前可提交代际的请求；普通 ensure 复用，force 会启动新代 */
    inflight: null as Promise<void> | null,
    /** 请求代际；reset 或 force 会使更早请求永久失去提交资格 */
    generation: 0,
  }),

  actions: {
    /**
     * 确保侧栏导航数据已加载；已缓存则直接返回，同代普通调用共享请求。
     * @param force 为 true 时忽略缓存并立即启动新代请求
     */
    async ensureSidebarNav(force = false): Promise<void> {
      if (!force && this.loaded) {
        return
      }
      if (!force && this.inflight) {
        return this.inflight
      }
      const generation = ++this.generation
      this.inflight = this._doFetchSidebarNav(generation)
      return this.inflight
    },

    async _doFetchSidebarNav(generation: number): Promise<void> {
      const maxRetries = 1
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const res = await api.get<PluginSidebarNavItem[]>('plugin/sidebar_nav', { feedback: 'silent' })
          if (generation !== this.generation) return
          this.items = Array.isArray(res) ? res : []
          this.loaded = true
          this.inflight = null
          return
        } catch {
          if (generation !== this.generation) return
          if (attempt < maxRetries) {
            // 短暂延迟后重试，应对登录后导航过渡期的请求中断
            await new Promise(resolve => setTimeout(resolve, 500))
            if (generation !== this.generation) return
          }
        }
      }
      // 重试全部失败，不缓存失败状态以允许后续调用方再次尝试
      if (generation !== this.generation) return
      this.inflight = null
    },

    reset() {
      this.generation++
      this.items = []
      this.loaded = false
      this.inflight = null
    },
  },
})
