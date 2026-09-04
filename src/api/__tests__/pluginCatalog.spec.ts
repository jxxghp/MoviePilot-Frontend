import { fetchAllPlugins, PLUGIN_LIST_PAGE_SIZE } from '@/api/pluginCatalog'
import type { Plugin } from '@/api/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
  }),
}))

/** 构造指定数量的最小插件对象，ID 从给定序号开始递增。 */
function buildPlugins(count: number, start = 0): Plugin[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `Plugin${start + index}`,
    plugin_name: `插件 ${start + index}`,
  }))
}

describe('fetchAllPlugins', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('按最大页大小显式分页请求，并在返回不足一页时停止', async () => {
    mocks.apiGet
      .mockResolvedValueOnce(buildPlugins(PLUGIN_LIST_PAGE_SIZE))
      .mockResolvedValueOnce(buildPlugins(30, PLUGIN_LIST_PAGE_SIZE))

    const plugins = await fetchAllPlugins({ state: 'market', force: true })

    expect(plugins).toHaveLength(PLUGIN_LIST_PAGE_SIZE + 30)
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
    expect(mocks.apiGet).toHaveBeenNthCalledWith(1, 'plugin/', {
      params: { count: PLUGIN_LIST_PAGE_SIZE, force: true, page: 1, state: 'market' },
    })
    // 强制刷新只在首页发送，后续页读取已刷新的清单。
    expect(mocks.apiGet).toHaveBeenNthCalledWith(2, 'plugin/', {
      params: { count: PLUGIN_LIST_PAGE_SIZE, force: false, page: 2, state: 'market' },
    })
  })

  it('调用方显式传 force=false 时各页保持 force=false', async () => {
    mocks.apiGet
      .mockResolvedValueOnce(buildPlugins(PLUGIN_LIST_PAGE_SIZE))
      .mockResolvedValueOnce(buildPlugins(1, PLUGIN_LIST_PAGE_SIZE))

    await fetchAllPlugins({ state: 'market', force: false })

    expect(mocks.apiGet).toHaveBeenNthCalledWith(2, 'plugin/', {
      params: { count: PLUGIN_LIST_PAGE_SIZE, force: false, page: 2, state: 'market' },
    })
  })

  it('不足一页时只请求一次，且不伪造 force 参数', async () => {
    mocks.apiGet.mockResolvedValueOnce(buildPlugins(3))

    const plugins = await fetchAllPlugins({ state: 'installed' }, { feedback: 'silent' })

    expect(plugins.map(plugin => plugin.id)).toEqual(['Plugin0', 'Plugin1', 'Plugin2'])
    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
    // 数据客户端测试桩会剥离请求层的 feedback 选项，这里只断言端点与参数。
    expect(mocks.apiGet).toHaveBeenCalledWith('plugin/', {
      params: { count: PLUGIN_LIST_PAGE_SIZE, page: 1, state: 'installed' },
    })
  })

  it('后端忽略分页重复返回整页时按插件 ID 去重并停止翻页', async () => {
    mocks.apiGet.mockResolvedValue(buildPlugins(PLUGIN_LIST_PAGE_SIZE))

    const plugins = await fetchAllPlugins({ state: 'market' })

    expect(plugins).toHaveLength(PLUGIN_LIST_PAGE_SIZE)
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
  })

  it('空结果直接返回空数组', async () => {
    mocks.apiGet.mockResolvedValueOnce([])

    await expect(fetchAllPlugins({ state: 'market' })).resolves.toEqual([])
    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
  })
})
