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

/** 带连接探测和反馈策略的 MoviePilot 请求配置。 */
export interface ConnectionAwareRequestConfig extends AxiosRequestConfig {
  feedback?: ApiFeedbackMode
  skipConnectionTracking?: boolean
}

const globalOfflineStatus = useGlobalOfflineStatus()
const toast = useToast()
// 会话失效后短暂窗口内的 401 都是同一次 token 作废的连带失败，统一静默避免刷屏。
const SESSION_EXPIRED_SUPPRESSION_MS = 5000
let sessionExpiredAt = 0
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
    onUnauthorized: () => {
      const authStore = useAuthStore()
      if (!authStore.token) {
        // 无 token 的 401（如登录页验证失败）交给调用方自行展示；
        // 但刚登出后的在途请求属于同一会话失效，继续静默。
        return Date.now() - sessionExpiredAt < SESSION_EXPIRED_SUPPRESSION_MS
      }
      // 后端重启会使旧 token 作废：只提示一次并统一登出，不逐条弹英文错误。
      sessionExpiredAt = Date.now()
      authStore.logout()
      toast.error(i18n.global.t('common.sessionExpired'))
      void router.push('/login')
      return true
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

// 插件远程组件接收 endpoint 的最终 payload，内部页面默认使用严格 envelope 解包客户端。
if (typeof window !== 'undefined') window.MoviePilotAPI = pluginApi

export { ApiRequestError, getApiBusinessErrorMessage, isApiBusinessFailure, isApiResponse, pluginApi }
export type { ApiFeedbackMode, DataApiClient, PluginApiClient }

export default api
