import api, { getApiBusinessErrorMessage } from '@/api'

/** GitHub 授权流程所处的页面上下文。 */
export type GithubTokenAuthMode = 'settings' | 'initialization'

/** 后端返回的 GitHub Token 脱敏状态。 */
export interface GithubTokenStatus {
  configured: boolean
  valid: boolean | null
  source: 'oauth' | 'manual' | null
  login: string | null
  masked_token: string | null
  expires_at: number | null
  needs_reauthorization: boolean
}

/** GitHub Device Flow 的浏览器操作信息。 */
export interface GithubDeviceAuthSession {
  session_id: string
  verification_uri: string
  user_code: string
  expires_in: number
  interval_seconds: number
}

/** GitHub Device Flow 的一次轮询结果。 */
interface GithubDeviceAuthPollResult {
  state: 'pending' | 'authorized' | 'slow_down' | 'denied' | 'expired' | 'failed'
  message: string
  retry_after: number | null
  status: GithubTokenStatus | null
}

/** 统一管理设置页和初始化页共用的 GitHub Token 授权生命周期。 */
export function useGithubTokenAuth(mode: GithubTokenAuthMode) {
  const status = ref<GithubTokenStatus | null>(null)
  const session = ref<GithubDeviceAuthSession | null>(null)
  const loading = ref(false)
  const polling = ref(false)
  const error = ref('')
  const popupBlocked = ref(false)
  let pollTimer: number | null = null

  const endpoint = computed(() => (mode === 'initialization' ? 'login/github-auth' : 'github/auth'))

  /** 解析 API 错误并保留本地化业务消息。 */
  function resolveErrorMessage(reason: unknown): string {
    return getApiBusinessErrorMessage(reason) || (reason instanceof Error ? reason.message : '') || 'GitHub 授权失败'
  }

  /** 清理下一次自动轮询，避免关闭弹窗后仍继续请求。 */
  function clearPollTimer() {
    if (pollTimer !== null) {
      window.clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  /** 查询当前 Token 脱敏状态。 */
  async function refreshStatus(): Promise<GithubTokenStatus | null> {
    try {
      status.value = await api.get<GithubTokenStatus>(`${endpoint.value}/status`, { feedback: 'silent' })
      return status.value
    } catch (reason) {
      error.value = resolveErrorMessage(reason)
      return null
    }
  }

  /** 启动 GitHub Device Flow，并返回是否成功拿到设备码。 */
  async function startAuth(): Promise<boolean> {
    clearPollTimer()
    session.value = null
    error.value = ''
    popupBlocked.value = false
    loading.value = true
    try {
      session.value = await api.post<GithubDeviceAuthSession>(`${endpoint.value}/start`, undefined, {
        feedback: 'silent',
      })
      return true
    } catch (reason) {
      error.value = resolveErrorMessage(reason)
      return false
    } finally {
      loading.value = false
    }
  }

  /** 打开 GitHub 验证页面；由调用方在用户点击上下文中调用以减少弹窗拦截。 */
  function openAuthPage() {
    if (!session.value?.verification_uri) return
    const opened = window.open(session.value.verification_uri, '_blank', 'noopener,noreferrer')
    popupBlocked.value = !opened
  }

  /** 执行一次设备码轮询，并按后端建议自动安排下一次轮询。 */
  async function pollAuth() {
    if (!session.value || polling.value) return
    polling.value = true
    error.value = ''
    try {
      const result = await api.post<GithubDeviceAuthPollResult>(
        `${endpoint.value}/poll`,
        { session_id: session.value.session_id },
        { feedback: 'silent' },
      )
      if (result.status) status.value = result.status
      if (result.state === 'authorized') {
        clearPollTimer()
        session.value = null
      } else if (result.state === 'pending' || result.state === 'slow_down') {
        const delay = Math.max(result.retry_after ?? session.value.interval_seconds, 1) * 1000
        clearPollTimer()
        pollTimer = window.setTimeout(() => void pollAuth(), delay)
      } else {
        clearPollTimer()
        error.value = result.message
      }
    } catch (reason) {
      clearPollTimer()
      error.value = resolveErrorMessage(reason)
    } finally {
      polling.value = false
    }
  }

  /** 取消当前设备授权会话的前端轮询。 */
  function cancelAuth() {
    clearPollTimer()
    session.value = null
    polling.value = false
    popupBlocked.value = false
  }

  /** 保存兼容入口中的手动 PAT。 */
  async function saveManualToken(token: string): Promise<boolean> {
    error.value = ''
    loading.value = true
    try {
      status.value = await api.post<GithubTokenStatus>(`${endpoint.value}/manual`, { token }, { feedback: 'silent' })
      return true
    } catch (reason) {
      error.value = resolveErrorMessage(reason)
      return false
    } finally {
      loading.value = false
    }
  }

  /** 清除服务端保存的 GitHub Token。 */
  async function disconnect(): Promise<boolean> {
    error.value = ''
    loading.value = true
    try {
      await api.delete(`${endpoint.value}/token`, { feedback: 'silent' })
      status.value = await refreshStatus()
      return true
    } catch (reason) {
      error.value = resolveErrorMessage(reason)
      return false
    } finally {
      loading.value = false
    }
  }

  /** 组件卸载时停止设备码轮询。 */
  onBeforeUnmount(clearPollTimer)

  return {
    status,
    session,
    loading,
    polling,
    error,
    popupBlocked,
    refreshStatus,
    startAuth,
    openAuthPage,
    pollAuth,
    cancelAuth,
    saveManualToken,
    disconnect,
  }
}
