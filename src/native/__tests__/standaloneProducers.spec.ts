import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@tests/support/render'
import FileToolbar from '@/components/filebrowser/FileToolbar.vue'
import TorrentFilterBar from '@/components/filter/TorrentFilterBar.vue'
import type { DataApiClient } from '@/api'
import type { EndPoints, FileItem } from '@/api/types'
import { nativeStandaloneMenus, type NativeStandaloneMenuBinding } from '../standalone'

afterEach(() => {
  nativeStandaloneMenus.setContext(undefined)
  vi.restoreAllMocks()
})

/** 从真实 AppMenu 的登记调用取得组件身份，不在测试中重写一份菜单生产者。 */
function registeredMenu(bind: { mock: { calls: [object, NativeStandaloneMenuBinding | undefined][] } }, key: string) {
  const match = bind.mock.calls.find(([, binding]) => binding?.key === key)
  expect(match).toBeDefined()
  nativeStandaloneMenus.setContext({ sessionId: 'producer-document', routeRevision: 1 })
  nativeStandaloneMenus.synchronize()
  const target = nativeStandaloneMenus.targetFor(match![0])!
  expect(target).toBeDefined()
  return nativeStandaloneMenus.menus.open(target.ownerId, target.menuId)!
}

describe('真实业务组件的独立菜单声明', () => {
  it('文件存储菜单保留原顺序、图标与当前项禁用，选择只触发原 storagechanged 事件', async () => {
    const bind = vi.spyOn(nativeStandaloneMenus, 'bind')
    const request = vi.fn()
    const axios = Object.assign(vi.fn(), { request }) as unknown as DataApiClient
    const root: FileItem = { name: '/', path: '/', type: 'dir', storage: 'local' }
    const current: FileItem = { name: 'downloads', path: '/downloads/', type: 'dir', storage: 'local' }
    const endpoint = { method: 'post', url: '/unused' }
    const endpoints: EndPoints = {
      delete: endpoint,
      download: endpoint,
      image: endpoint,
      list: endpoint,
      mkdir: endpoint,
      rename: endpoint,
    }
    const result = await renderWithProviders(FileToolbar, {
      props: {
        axios,
        endpoints,
        item: current,
        itemstack: [root, current],
        showTreeMenu: true,
        storages: [
          { value: 'local', title: '本地', icon: 'mdi-harddisk' },
          { value: 'cloud', title: '云盘', icon: 'mdi-cloud' },
        ],
      },
    })
    const menu = registeredMenu(bind, JSON.stringify(['local', '/downloads/']))
    expect(menu.items.map(item => item.title)).toEqual(['本地', '云盘', '根目录'])
    expect(menu.items[0]).toMatchObject({ icon: 'mdi-harddisk', enabled: false })
    expect(menu.items[1]).toMatchObject({ icon: 'mdi-cloud', enabled: true })
    expect(JSON.stringify(menu)).not.toContain('/downloads/')
    expect(await nativeStandaloneMenus.menus.select(menu.presentationId, menu.items[1].id, vi.fn())).toBe(true)
    expect(result.emitted().storagechanged).toEqual([['cloud']])
    expect(request).not.toHaveBeenCalled()
  })

  it('资源排序两个布局使用原方向/字段和分隔，选择字段沿用原 update 事件', async () => {
    const bind = vi.spyOn(nativeStandaloneMenus, 'bind')
    const result = await renderWithProviders(TorrentFilterBar, {
      props: {
        filterForm: {},
        filterOptions: {},
        filterTitles: {},
        sortField: 'time',
        sortType: 'desc',
        totalFilteredCount: 4,
        sortTitles: { time: '发布时间', size: '大小' },
      },
    })
    const menu = registeredMenu(bind, 'torrent-sort')
    expect(bind.mock.calls.filter(([, binding]) => binding?.key === 'torrent-sort')).toHaveLength(2)
    expect(menu.items.map(item => item.title ?? item.kind)).toEqual(['升序', '降序', 'separator', '发布时间', '大小'])
    expect(menu.items[1]).toMatchObject({ selected: true, icon: 'mdi-sort-descending', color: 'primary' })
    expect(menu.items[3]).toMatchObject({ selected: true })
    expect(await nativeStandaloneMenus.menus.select(menu.presentationId, menu.items[4].id, vi.fn())).toBe(true)
    expect(result.emitted()['update:sortField']).toEqual([['size']])
    expect(result.emitted()['update:sortType']).toBeUndefined()
  })
})
