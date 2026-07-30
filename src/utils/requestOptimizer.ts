// 全局请求优化器
// 自动管理所有API请求的中断，无需手动注册

let isNavigating = false
const activeRequests = new Set<AbortController>()

// 监听路由状态
export function setNavigatingState(navigating: boolean) {
  isNavigating = navigating

  if (navigating) {
    // 路由切换时，中断所有未完成的请求
    console.log('Navigation started - aborting active requests')
    abortAllActiveRequests()
  }
}

// 中断所有活跃的请求
function abortAllActiveRequests() {
  for (const controller of activeRequests) {
    if (!controller.signal.aborted) {
      controller.abort()
    }
  }
  activeRequests.clear()
}

// 清理已完成的请求控制器
function cleanupController(controller: AbortController) {
  activeRequests.delete(controller)
}

// 初始化请求优化器
export function initializeRequestOptimizer(axiosInstance: any) {
  // 拦截请求，自动添加 AbortController
  axiosInstance.interceptors.request.use(
    (config: any) => {
      // 如果请求已经有 signal，跳过（避免覆盖手动设置的）
      if (config.signal) {
        return config
      }

      // 创建新的 AbortController
      const controller = new AbortController()
      config.signal = controller.signal

      // 将控制器添加到活跃列表
      activeRequests.add(controller)

      // 监听请求完成事件来清理控制器
      const cleanup = () => cleanupController(controller)

      // 监听中断事件
      controller.signal.addEventListener('abort', cleanup, { once: true })

      return config
    },
    (error: any) => {
      return Promise.reject(error)
    },
  )

  // 拦截响应，清理对应的控制器
  axiosInstance.interceptors.response.use(
    (response: any) => {
      // 从配置中获取 signal 对应的控制器并清理
      if (response.config?.signal) {
        const controller = Array.from(activeRequests).find(ctrl => ctrl.signal === response.config.signal)
        if (controller) {
          cleanupController(controller)
        }
      }
      return response
    },
    (error: any) => {
      // 错误时也要清理控制器
      if (error.config?.signal) {
        const controller = Array.from(activeRequests).find(ctrl => ctrl.signal === error.config.signal)
        if (controller) {
          cleanupController(controller)
        }
      }
      return Promise.reject(error)
    },
  )
}

// 获取当前活跃请求数量（调试用）
export function getActiveRequestsCount() {
  return activeRequests.size
}

// 手动中断所有请求（备用方法）
export function abortAllRequests() {
  abortAllActiveRequests()
}
