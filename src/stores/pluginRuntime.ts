import { defineStore } from 'pinia'
import api from '@/api'
import type { PluginRuntimeSummary } from '@/api/types'

const SETTLING_POLL_INTERVAL = 2000
const SETTLED_POLL_INTERVAL = 15000

/**
 * 维护登录会话内的插件运行态摘要，并将后端代际变化转换为前端可消费的协调信号。
 */
export const usePluginRuntimeStore = defineStore('pluginRuntime', {
  state: () => ({
    summary: null as PluginRuntimeSummary | null,
    /** 首次取得摘要及后续代际变化都会递增，消费者无需推断初始代际值。 */
    reconciliation: 0,
    active: false,
    inflight: null as Promise<void> | null,
    requestGeneration: 0,
    pollTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  }),

  actions: {
    start() {
      if (this.active) return

      this.active = true
      document.addEventListener('visibilitychange', this.handleVisibilityChange)
      void this.refresh()
    },

    stop() {
      const wasActive = this.active
      this.active = false
      this.requestGeneration++
      this.clearPollTimer()
      if (wasActive) document.removeEventListener('visibilitychange', this.handleVisibilityChange)
      this.summary = null
      this.inflight = null
    },

    async refresh(): Promise<void> {
      if (this.inflight) return this.inflight

      const requestGeneration = ++this.requestGeneration
      const request = this.fetchSummary(requestGeneration)
      this.inflight = request
      return request
    },

    async fetchSummary(requestGeneration: number): Promise<void> {
      try {
        const summary = await api.get<PluginRuntimeSummary>('plugin/runtime', { feedback: 'silent' })
        if (requestGeneration !== this.requestGeneration) return

        const previousGeneration = this.summary?.generation
        if (previousGeneration !== undefined && summary.generation < previousGeneration) return

        this.summary = summary
        if (previousGeneration === undefined || summary.generation !== previousGeneration) {
          this.reconciliation++
        }
      } catch (error) {
        if (requestGeneration === this.requestGeneration) console.error(error)
      } finally {
        if (requestGeneration === this.requestGeneration) {
          this.inflight = null
          this.schedulePoll()
        }
      }
    },

    schedulePoll() {
      this.clearPollTimer()
      if (!this.active || document.hidden) return

      const interval = this.summary?.ready === false ? SETTLING_POLL_INTERVAL : SETTLED_POLL_INTERVAL
      this.pollTimer = setTimeout(() => {
        this.pollTimer = undefined
        void this.refresh()
      }, interval)
    },

    clearPollTimer() {
      if (this.pollTimer === undefined) return
      clearTimeout(this.pollTimer)
      this.pollTimer = undefined
    },

    handleVisibilityChange() {
      if (document.hidden) {
        this.clearPollTimer()
        return
      }
      void this.refresh()
    },
  },
})
