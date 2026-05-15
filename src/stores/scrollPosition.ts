/**
 * 滚动位置持久化 store
 * 用途：解决「Scroll-back Blank / 回滚白屏」问题
 *
 * 工作机制：
 *   - 在长列表页面 onBeforeRouteLeave 时保存当前 scrollTop + 已加载数据
 *   - 在 onMounted 时检查是否有缓存，若有则恢复数据 + 滚动位置
 *   - 即使 keep-alive 把组件踢出（项目配置 :max="12"），数据/滚动位置仍可恢复
 *
 * 持久化策略：
 *   - sessionStorage：仅当前浏览器会话有效，不污染长期存储
 *   - 单条记录有 TTL（默认 30 分钟），过期自动作废
 */

import { defineStore } from 'pinia'

interface ScrollSnapshot<T = unknown> {
  scrollTop: number
  items: T[]
  /** 业务侧用于恢复分页状态的额外数据 */
  meta?: Record<string, any>
  savedAt: number
}

const TTL_MS = 30 * 60 * 1000 // 30 分钟

export const useScrollPositionStore = defineStore('scrollPosition', {
  state: () => ({
    snapshots: {} as Record<string, ScrollSnapshot<any>>,
  }),

  actions: {
    save<T>(key: string, snapshot: Omit<ScrollSnapshot<T>, 'savedAt'>) {
      this.snapshots[key] = { ...snapshot, savedAt: Date.now() }
    },

    restore<T>(key: string): ScrollSnapshot<T> | null {
      const snap = this.snapshots[key] as ScrollSnapshot<T> | undefined
      if (!snap) return null
      // 过期作废
      if (Date.now() - snap.savedAt > TTL_MS) {
        delete this.snapshots[key]
        return null
      }
      return snap
    },

    clear(key: string) {
      delete this.snapshots[key]
    },

    clearAll() {
      this.snapshots = {}
    },

    /** 清除所有过期项（启动时可调用） */
    cleanExpired() {
      const now = Date.now()
      for (const key of Object.keys(this.snapshots)) {
        if (now - this.snapshots[key].savedAt > TTL_MS) {
          delete this.snapshots[key]
        }
      }
    },
  },

  persist: {
    // sessionStorage：浏览器会话级，不污染 localStorage
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    pick: ['snapshots'],
  } as any,
})
