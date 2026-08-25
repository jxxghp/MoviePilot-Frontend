import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import { useToast } from 'vue-toastification'
import router from '@/router'
import { useAuthStore } from '@/stores'
import { initializeRequestOptimizer } from '@/utils/requestOptimizer'
import { useGlobalOfflineStatus } from '@/composables/useOfflineStatus'
import i18n, { getCurrentLocale } from '@/plugins/i18n'
import {
  ApiRequestError,
  createApiClients,
  getApiBusinessErrorMessage,
  isApiBusinessFailure,
  isApiResponse,
  type ApiFeedbackMode,
  type ApiFallbackMessageKey,
  type DataApiClient,
  type PluginApiClient,
} from './client'
import { createScopedPluginApi } from './pluginInstance'

/** 带连接探测和反馈策略的 MoviePilot 请求配置。 */
export interface ConnectionAwareRequestConfig extends AxiosRequestConfig {
  feedback?: ApiFeedbackMode
  skipConnectionTracking?: boolean
}

const globalOfflineStatus = useGlobalOfflineStatus()
const toast = useToast()
const fallbackMessageKeys: Record<ApiFallbackMessageKey, string> = {
  'invalid-envelope': 'common.invalidApiResponse',
  'network-error': 'common.networkConnectionFailed',
  'request-failed': 'common.apiRequestFailed',
  timeout: 'common.requestTimeout',
}

/** 认证失效只负责代码签退；原始异常继续交给发起请求的业务界面处理。 */
function handleAuthenticationFailure(): true {
  const authStore = useAuthStore()
  if (authStore.token) {
    authStore.logout()
    void router.push('/login')
  }
  return true
}

const { api, pluginApi } = createApiClients({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  setupInstance: initializeClient,
  hooks: {
    markServerOnline: globalOfflineStatus.markServerOnline,
    reportConnectionFailure: globalOfflineStatus.reportNetworkError,
    onForbidden: handleAuthenticationFailure,
    onUnauthorized: handleAuthenticationFailure,
  },
  notifier: {
    error: message => toast.error(message),
    success: message => toast.success(message),
  },
  resolveFallbackMessage: key => i18n.global.t(fallbackMessageKeys[key]),
})
const pluginInstanceApis = new Map<string, PluginApiClient>()

declare global {
  interface Window {
    MoviePilotAPI: PluginApiClient
  }
}

/** 为两个客户端安装同一套取消、认证和语言请求头。 */
function initializeClient(instance: AxiosInstance | DataApiClient) {
  initializeRequestOptimizer(instance)
  instance.interceptors.request.use(config => {
    const authStore = useAuthStore()
    if (authStore.token) config.headers.Authorization = `Bearer ${authStore.token}`

    const locale = getCurrentLocale()
    config.headers['X-MoviePilot-Locale'] = locale
    config.headers['Accept-Language'] = locale
    return config
  })
}

/** 返回复用同一拦截器链、但把源插件 API 映射到实例命名空间的客户端。 */
function createPluginInstanceApi(instanceId: string, sourcePluginId?: string): PluginApiClient {
  if (!sourcePluginId || instanceId === sourcePluginId) return pluginApi
  const cacheKey = `${instanceId}\u0000${sourcePluginId}`
  let scopedApi = pluginInstanceApis.get(cacheKey)
  if (!scopedApi) {
    scopedApi = createScopedPluginApi(pluginApi, instanceId, sourcePluginId)
    pluginInstanceApis.set(cacheKey, scopedApi)
  }
  return scopedApi
}

// 插件远程组件接收 endpoint 的最终 payload，内部页面默认使用严格 envelope 解包客户端。
if (typeof window !== 'undefined') window.MoviePilotAPI = pluginApi

export {
  ApiRequestError,
  createPluginInstanceApi,
  getApiBusinessErrorMessage,
  isApiBusinessFailure,
  isApiResponse,
  pluginApi,
}
export type { ApiFeedbackMode, DataApiClient, PluginApiClient }

export default api
