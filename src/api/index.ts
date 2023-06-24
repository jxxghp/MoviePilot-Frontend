import router from '@/router'
import axios from 'axios'


// 创建axios实例
const api = axios.create({
  baseURL: 'http://localhost:3001/api/v1',
})

// 添加请求拦截器
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  
  // 在请求头中添加token
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }

  return config
})

// 添加响应拦截器
api.interceptors.response.use(response => {
  return response.data
}, error => {
  if (error.response.status === 403) {
    // token验证失败，跳转到登录页面
    router.push('/login')
  }
  
  return Promise.reject(error)
})

export default api
