import axios, { type AxiosError, type AxiosRequestConfig } from 'axios'
import router from '@/router'
import { useAuthStore } from '@/stores'
import { initializeRequestOptimizer } from '@/utils/requestOptimizer'
import { useGlobalOfflineStatus } from '@/composables/useOfflineStatus'
import { getCurrentLocale } from '@/plugins/i18n'

// 创建axios实例
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

export interface ConnectionAwareRequestConfig extends AxiosRequestConfig {
  skipConnectionTracking?: boolean
}

// 声明全局变量类型
declare global {
  interface Window {
    MoviePilotAPI: typeof api
  }
}

// 将 API 实例暴露到全局，供插件使用
window.MoviePilotAPI = api

// 初始化请求优化器（必须在其他拦截器之前）
initializeRequestOptimizer(api)

// 添加请求拦截器
api.interceptors.request.use(config => {
  // 认证 Store
  const authStore = useAuthStore()
  // 在请求头中添加token
  if (authStore.token) {
    config.headers.Authorization = `Bearer ${authStore.token}`
  }
  const locale = getCurrentLocale()
  config.headers['X-MoviePilot-Locale'] = locale
  config.headers['Accept-Language'] = locale
  return config
})

// 离线状态管理
const globalOfflineStatus = useGlobalOfflineStatus()

/** 将 Axios 连接错误归类为全局服务探测可识别的原因。 */
function resolveConnectionFailureReason(error: AxiosError): 'network-error' | 'timeout' | null {
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'timeout'

  if (error.code === 'NETWORK_ERROR' || error.code === 'ERR_NETWORK' || error.name === 'NetworkError') {
    return 'network-error'
  }

  return null
}

interface LocalizedApiPayload {
  detail?: unknown
  detail_i18n?: unknown
  message?: unknown
  message_i18n?: unknown
}

/** 前端展示默认使用后端提供的多语言消息，同时不改变后端接口兼容字段。 */
function normalizeLocalizedMessage(payload: any): any {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload

  const localizedPayload = payload as LocalizedApiPayload
  if (typeof localizedPayload.message_i18n === 'string' && localizedPayload.message_i18n) {
    localizedPayload.message = localizedPayload.message_i18n
  }
  if (typeof localizedPayload.detail_i18n === 'string' && localizedPayload.detail_i18n) {
    localizedPayload.detail = localizedPayload.detail_i18n
  }
  return payload
}

// 添加响应拦截器
api.interceptors.response.use(
  response => {
    // 任意 API 成功响应都可以证明 MoviePilot 服务当前可达。
    globalOfflineStatus.markServerOnline()
    return normalizeLocalizedMessage(response.data)
  },
  (error: AxiosError) => {
    if (!error.response) {
      const requestConfig = error.config as ConnectionAwareRequestConfig | undefined
      const failureReason = resolveConnectionFailureReason(error)

      // 普通请求失败只触发权威探测；探测请求自身失败由心跳管理器处理，避免递归。
      if (!requestConfig?.skipConnectionTracking && failureReason) {
        globalOfflineStatus.reportNetworkError(failureReason)
      }

      if (error.code === 'NETWORK_ERROR' || error.code === 'ERR_NETWORK') {
        // 网络连接问题
        return Promise.reject(new Error('Network connection failed, please check your network status'))
      } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        // 请求超时
        return Promise.reject(new Error('Request timeout, please try again later'))
      } else if (error.name === 'AbortError') {
        // 请求被中止（路由切换等）
        return Promise.reject(new Error('Request cancelled'))
      }
      // 其他网络错误
      return Promise.reject(new Error(error.message || 'Network error'))
    } else if (error.response.status === 403) {
      normalizeLocalizedMessage(error.response.data)
      // 认证 Store
      const authStore = useAuthStore()
      // 清除登录状态信息
      authStore.logout()
      // token验证失败，跳转到登录页面
      router.push('/login')
    } else {
      normalizeLocalizedMessage(error.response.data)
    }

    return Promise.reject(error)
  },
)

export default api
