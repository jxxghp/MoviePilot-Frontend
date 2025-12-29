import { defineStore } from 'pinia'
import type { globalSettingsState } from '@/stores/types'
import { fetchGlobalSettings } from '@/utils/globalSetting'
import { useVersionChecker } from '@/composables/useVersionChecker'

export const useGlobalSettingsStore = defineStore('globalSettings', {
  state: (): globalSettingsState => ({
    data: {},
    initialized: false,
    loading: false,
  }),

  actions: {
    async initialize() {
      if (this.initialized || this.loading) return

      this.loading = true
      try {
        const result = await fetchGlobalSettings()
        this.data = result || {}
        this.initialized = true

        // 检查版本更新
        if (result.FRONTEND_VERSION) {
          const { checkVersion } = useVersionChecker()
          await checkVersion(result.FRONTEND_VERSION)
        }
      } catch (error) {
        console.error('Failed to initialize global settings', error)
      } finally {
        this.loading = false
      }
    },

    setData(data: { [key: string]: any }) {
      this.data = data
      this.initialized = true
    },

    get(key: string) {
      return this.data[key]
    },

    reset() {
      this.data = {}
      this.initialized = false
      this.loading = false
    },
  },

  getters: {
    isInitialized: state => state.initialized,
    isLoading: state => state.loading,
    getData: state => state.data,
    globalSettings: state => state.data,
  },
})
