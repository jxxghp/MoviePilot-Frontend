import api from '@/api'

// 创建一个专用的AbortController，用于globalSetting请求
const globalSettingController = new AbortController()

export async function fetchGlobalSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/global', {
      params: {
        token: 'moviepilot',
      },
      // 手动设置signal，防止reqestOptimizer添加可中断的controller
      signal: globalSettingController.signal,
    })
    return result.data || {}
  } catch (error) {
    console.error('Failed to fetch global settings', error)
    throw error
  }
}
