/** 首次初始化状态缓存，避免路由守卫在同一次加载中重复请求。 */
let initializationState: boolean | null = null
let initializationRequest: Promise<boolean> | null = null

/** 查询后端是否已经存在用户；网络异常交由调用方决定降级策略。 */
export async function getInitializationState(force = false): Promise<boolean> {
  if (!force && initializationState !== null) return initializationState
  if (!force && initializationRequest) return initializationRequest

  const baseUrl = String(import.meta.env.VITE_API_BASE_URL || '/api/v1/').replace(/\/$/, '')
  const requestUrl = baseUrl + '/login/initialization'
  initializationRequest = fetch(requestUrl, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  })
    .then(async response => {
      if (!response.ok) throw new Error('Initialization status failed: ' + response.status)
      const payload = (await response.json()) as { data?: { initialized?: unknown } }
      const initialized = payload.data?.initialized
      if (typeof initialized !== 'boolean') throw new Error('Invalid initialization status')
      initializationState = initialized
      return initialized
    })
    .finally(() => {
      initializationRequest = null
    })

  return initializationRequest
}

/** 在初始化提交成功后更新路由缓存，下一次导航直接进入登录页。 */
export function markInitialized(): void {
  initializationState = true
}

/** 测试或切换宿主实例时清除本地状态缓存。 */
export function resetInitializationState(): void {
  initializationState = null
  initializationRequest = null
}
