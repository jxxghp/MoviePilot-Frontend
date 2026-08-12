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
  isApiResponse,
  type ApiFeedbackMode,
  type ApiFallbackMessageKey,
  type DataApiClient,
} from './client'

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
const { api, pluginApi } = createApiClients({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  setupInstance: initializeClient,
  hooks: {
    markServerOnline: globalOfflineStatus.markServerOnline,
    reportConnectionFailure: globalOfflineStatus.reportNetworkError,
    onForbidden: () => {
      const authStore = useAuthStore()
      // 未登录的 403 可能是登录或 MFA 流程的一部分，不应触发全局登出跳转。
      if (!authStore.token) return
      authStore.logout()
      void router.push('/login')
    },
  },
  notifier: {
    error: message => toast.error(message),
    success: message => toast.success(message),
  },
  resolveFallbackMessage: key => i18n.global.t(fallbackMessageKeys[key]),
})

declare global {
  interface Window {
    MoviePilotAPI: AxiosInstance
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

// 插件远程组件依赖完整 envelope ABI，内部页面则默认使用已解包的数据客户端。
if (typeof window !== 'undefined') window.MoviePilotAPI = pluginApi

export { ApiRequestError, getApiBusinessErrorMessage, isApiResponse, pluginApi }
export type { ApiFeedbackMode, DataApiClient }

export default api
