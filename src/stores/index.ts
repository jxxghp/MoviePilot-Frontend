import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

// 创建 Pinia 实例
const pinia = createPinia()

// 使用持久化插件
pinia.use(piniaPluginPersistedstate)

export default pinia

// 所有的 store
import { useAuthStore } from './auth'
import { useUserStore } from './user'
import { useGlobalSettingsStore } from './global'
import { usePluginSidebarNavStore } from './pluginSidebarNav'

export { useAuthStore, useUserStore, useGlobalSettingsStore, usePluginSidebarNavStore }
