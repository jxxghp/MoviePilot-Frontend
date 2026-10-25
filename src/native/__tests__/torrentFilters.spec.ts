import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import TorrentFilterBar from '@/components/filter/TorrentFilterBar.vue'
import { nativeStandaloneMenus } from '../standalone'
import { NativeStandaloneMenuAdapter } from '../standaloneInteraction'
import type { NativeOperationMenu } from '../protocol'

const shared = vi.hoisted(() => ({ open: vi.fn(() => ({ close: vi.fn(), updateProps: vi.fn() })) }))
vi.mock('@/composables/useSharedDialog', () => ({ openSharedDialog: shared.open }))

const props = {
  filterForm: { site: ['Site A'], resolution: [], empty: [] } as Record<string, string[]>,
  filterOptions: { site: ['Site A', 'Site B'], resolution: ['1080p', '2160p'], empty: [] },
  filterTitles: { site: '站点', resolution: '分辨率', empty: '无选项' },
  sortField: 'time',
  sortType: 'desc' as const,
  sortTitles: { time: '发布时间' },
  totalFilteredCount: 4,
  enableAnimation: false,
}

afterEach(() => {
  nativeStandaloneMenus.setContext(undefined)
  vi.restoreAllMocks()
  shared.open.mockClear()
})

/** 只补 jsdom 缺少的布局几何，使用生产 Vuetify 按钮和原生来源注册表。 */
async function renderFilters() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 120, 44))
  return renderWithProviders(TorrentFilterBar, { props })
}

/** 移动按钮来自真实组件，不通过菜单文案猜测或在测试中重写生产者。 */
function mobileButton(container: Element, title: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('.filter-btn-mobile')].find(element =>
    element.textContent?.includes(title),
  )
  expect(button).toBeDefined()
  return button!
}

/** 显式打开当前按钮的完整声明，所有动作仍走原共享选择校验。 */
function openButton(button: HTMLElement) {
  nativeStandaloneMenus.setContext({ sessionId: 'filter-document', routeRevision: 1 })
  nativeStandaloneMenus.synchronize()
  const target = nativeStandaloneMenus.targetForElement(button)
  expect(target).toBeDefined()
  return nativeStandaloneMenus.menus.open(target!.ownerId, target!.menuId)!
}

/** 按实际项目选择一次；组和分隔不伪装为可执行业务动作。 */
async function choose(menu: NativeOperationMenu, title: string, items = menu.items) {
  const item = items.find(entry => entry.title === title)
  expect(item).toBeDefined()
  expect(await nativeStandaloneMenus.menus.select(menu.presentationId, item!.id, vi.fn())).toBe(true)
  return item!
}

describe('网页资源筛选的独立原生列表', () => {
  it('移动单项保留原清空/全选顺序、连续多选和确认，状态仍由父页控制', async () => {
    const result = await renderFilters()
    const button = mobileButton(result.container, '站点')
    let menu = openButton(button)
    expect(menu.items.map(item => item.title ?? item.kind)).toEqual([
      '清除',
      '全选',
      'separator',
      'Site A',
      'Site B',
      '确定',
    ])
    expect(menu.items.find(item => item.title === 'Site A')).toMatchObject({ selected: true, keepOpen: true })
    await choose(menu, 'Site B')
    expect(result.emitted()['update:filterForm']).toEqual([['site', ['Site A', 'Site B']]])
    expect(props.filterForm.site).toEqual(['Site A'])
    await result.rerender({ filterForm: { ...props.filterForm, site: ['Site A', 'Site B'] } })
    menu = openButton(button)
    expect(menu.items.filter(item => item.selected).map(item => item.title)).toEqual(['Site A', 'Site B'])
    await choose(menu, 'Site A')
    expect(result.emitted()['update:filterForm'].at(-1)).toEqual(['site', ['Site B']])
    await result.rerender({ filterForm: { ...props.filterForm, site: ['Site B'] } })
    menu = openButton(button)
    expect(await choose(menu, '全选')).toMatchObject({ keepOpen: true })
    expect(result.emitted().selectAll).toEqual([['site']])
    menu = openButton(button)
    await choose(menu, '清除')
    expect(result.emitted().clearFilter).toEqual([['site']])
    menu = openButton(button)
    expect(await choose(menu, '确定')).not.toHaveProperty('keepOpen', true)
    expect(shared.open).not.toHaveBeenCalled()
  })

  it('综合筛选按原分类分组，跨分类选择与清空均回到原事件且空分类不显示', async () => {
    const result = await renderFilters()
    const button = mobileButton(result.container, '综合筛选')
    let menu = openButton(button)
    const groups = menu.items.filter(item => item.kind === 'group')
    expect(groups.map(group => group.title)).toEqual(['站点', '分辨率'])
    expect(groups[0].items?.map(item => item.title ?? item.kind)).toEqual([
      '全选',
      '清除',
      'separator',
      'Site A',
      'Site B',
    ])
    expect(groups[1].items?.map(item => item.title ?? item.kind)).toEqual(['全选', 'separator', '1080p', '2160p'])
    await choose(menu, '2160p', groups[1].items)
    expect(result.emitted()['update:filterForm']).toEqual([['resolution', ['2160p']]])
    await result.rerender({ filterForm: { ...props.filterForm, resolution: ['2160p'] } })
    menu = openButton(button)
    const selected = menu.items.flatMap(group => group.items ?? []).filter(item => item.selected)
    expect(selected.map(item => item.title)).toEqual(['Site A', '2160p'])
    await choose(menu, '清除全部')
    expect(result.emitted().clearAllFilters).toEqual([[]])
  })

  it('实际点击只发送一次原生菜单，菜单背后不再打开旧筛选弹窗', async () => {
    const result = await renderFilters()
    const messages: Array<{ type: string; payload: Record<string, unknown> }> = []
    const adapter = new NativeStandaloneMenuAdapter((type, payload) => {
      messages.push({ type, payload })
      return true
    })
    adapter.setContext({ sessionId: 'filter-document', routeRevision: 1 })
    nativeStandaloneMenus.synchronize()
    try {
      const button = mobileButton(result.container, '站点')
      await fireEvent.click(button)
      await vi.waitFor(() => expect(messages.some(message => message.type === 'standaloneMenu.open')).toBe(true))
      await fireEvent.click(button)
      expect(messages.filter(message => message.type === 'standaloneMenu.open')).toHaveLength(1)
      expect(shared.open).not.toHaveBeenCalled()
    } finally {
      adapter.setContext(undefined)
    }
  })

  it('未协商和无法完整投影时保留原移动表单，卸载撤销旧选择', async () => {
    const result = await renderFilters()
    const button = mobileButton(result.container, '站点')
    expect(nativeStandaloneMenus.targetForElement(button)).toBeUndefined()
    await fireEvent.click(button)
    expect(shared.open).toHaveBeenCalledOnce()
    const menu = openButton(button)
    await result.rerender({
      filterOptions: { ...props.filterOptions, site: Array.from({ length: 100 }, (_, n) => `站点 ${n}`) },
    })
    expect(nativeStandaloneMenus.targetForElement(button)).toBeUndefined()
    expect(await nativeStandaloneMenus.menus.select(menu.presentationId, menu.items[0].id, vi.fn())).toBe(false)
    await result.rerender({ filterOptions: props.filterOptions })
    const current = openButton(button)
    result.unmount()
    expect(nativeStandaloneMenus.targetForElement(button)).toBeUndefined()
    expect(await nativeStandaloneMenus.menus.select(current.presentationId, current.items[0].id, vi.fn())).toBe(false)
  })
})
