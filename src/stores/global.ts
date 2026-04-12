import { defineStore } from 'pinia'
import type { globalSettingsState } from '@/stores/types'
import { fetchGlobalSettings } from '@/utils/globalSetting'
import { useVersionChecker } from '@/composables/useVersionChecker'
import api from '@/api'

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
          const isBackendDev = Boolean(result.BACKEND_DEV)
          const skipVersionCheck = import.meta.env.DEV || isBackendDev

          if (skipVersionCheck) {
            console.log('[VersionChecker] 开发环境下跳过版本一致性检查')
            return
          }

          const { checkVersion } = useVersionChecker()
          await checkVersion(result.FRONTEND_VERSION)
        }
      } catch (error) {
        console.error('Failed to initialize global settings', error)
      } finally {
        this.loading = false
      }
    },

    // 登录后加载用户相关设置
    async loadUserSettings() {
      try {
        const result: { [key: string]: any } = await api.get('system/global/user')
        if (result.success && result.data) {
          // 合并用户设置到现有数据
          this.data = { ...this.data, ...result.data }
        }
      } catch (error) {
        console.error('Failed to load user settings', error)
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
