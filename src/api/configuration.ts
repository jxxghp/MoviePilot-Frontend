import api from '@/api'
import { getSharedData } from '@/utils/sharedDataCache'

/** 在卡片、详情和设置面板之间共用配置请求，调用方仍持有可编辑的独立副本。 */
export function getSharedConfiguration<T>(path: string, refresh = false) {
  return getSharedData(`configuration:${path}`, () => api.get<T>(path), undefined, refresh)
}
