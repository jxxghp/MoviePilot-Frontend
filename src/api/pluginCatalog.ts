import api from './index'
import type { ApiFeedbackMode } from './client'
import type { Plugin } from './types'

/** 后端集合接口允许的最大单页数量，与 `COLLECTION_MAX_PAGE_SIZE` 保持一致。 */
export const PLUGIN_LIST_PAGE_SIZE = 200

/** 插件清单页数上限，防止后端忽略分页参数时无限翻页。 */
const PLUGIN_LIST_MAX_PAGES = 50

export type PluginListState = 'all' | 'installed' | 'market'

export interface PluginListParams {
  state: PluginListState
  force?: boolean
}

export interface PluginListOptions {
  feedback?: ApiFeedbackMode
}

/**
 * 分页拉取完整插件清单。
 *
 * `GET /plugin/` 省略分页参数时后端只返回前 `max_results`（默认 50）条，
 * Web 端的市场、已安装列表和搜索都需要完整清单，因此按最大页大小逐页读取，
 * 直到返回不足一页或不再出现新插件为止。
 *
 * `force` 只随第一页发送：后端在首页完成强制刷新后，后续页读取同一份已刷新的清单，
 * 避免一次刷新触发多次完整的市场拉取，也避免各页来自不同的刷新结果。
 */
export async function fetchAllPlugins(params: PluginListParams, options: PluginListOptions = {}): Promise<Plugin[]> {
  const plugins: Plugin[] = []
  const seenIds = new Set<string>()

  for (let page = 1; page <= PLUGIN_LIST_MAX_PAGES; page += 1) {
    const chunk: Plugin[] = await api.get('plugin/', {
      ...options,
      params: {
        ...params,
        ...(params.force && page > 1 ? { force: false } : {}),
        page,
        count: PLUGIN_LIST_PAGE_SIZE,
      },
    })
    if (!Array.isArray(chunk) || chunk.length === 0) break

    const fresh = chunk.filter(plugin => !seenIds.has(plugin.id))
    fresh.forEach(plugin => seenIds.add(plugin.id))
    plugins.push(...fresh)

    if (fresh.length === 0 || chunk.length < PLUGIN_LIST_PAGE_SIZE) break
  }

  return plugins
}
