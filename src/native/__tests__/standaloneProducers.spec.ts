import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@tests/support/render'
import FileToolbar from '@/components/filebrowser/FileToolbar.vue'
import type { DataApiClient } from '@/api'
import type { EndPoints, FileItem } from '@/api/types'
import { nativeStandaloneMenus, type NativeStandaloneMenuBinding } from '../standalone'

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 140, 44))
})

afterEach(() => {
  nativeStandaloneMenus.setContext(undefined)
  vi.restoreAllMocks()
})

/** 从真实 AppMenu 的登记调用取得组件身份，不在测试中重写一份菜单生产者。 */
function registeredMenu(
  bind: { mock: { calls: [object, NativeStandaloneMenuBinding | undefined, (() => HTMLElement | undefined)?][] } },
  key: string,
) {
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
})
