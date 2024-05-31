import axios from 'axios'
import router from '@/router'
import store from '@/store'

// 创建axios实例
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

// 添加请求拦截器
api.interceptors.request.use(config => {
  // 在请求头中添加token
  const token = store.state.auth.token
  if (token) config.headers.Authorization = `Bearer ${token}`

  return config
})

// 添加响应拦截器
api.interceptors.response.use(
  response => {
    return response.data
  },
  error => {
    if (!error.response) {
      // 请求超时
      return Promise.reject(new Error(error))
    } else if (error.response.status === 403) {
      // 清除登录状态信息
      store.dispatch('auth/clearToken')

      // token验证失败，跳转到登录页面
      router.push('/login')
    }

    return Promise.reject(new Error(error))
  },
)

export default api
