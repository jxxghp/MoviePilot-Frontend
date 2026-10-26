import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import TorrentFilterBar from '@/components/filter/TorrentFilterBar.vue'
import { nativeStandaloneMenus } from '../standalone'
import { NativeStandaloneMenuAdapter } from '../standaloneInteraction'

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

describe('App 原生弹窗中的 HTML 资源筛选表单', () => {
  it.each(['站点', '综合筛选'])('已协商原生操作菜单仍打开原 %s HTML 弹窗并复用原回调', async title => {
    const result = await renderFilters()
    const messages: string[] = []
    const adapter = new NativeStandaloneMenuAdapter(type => {
      messages.push(type)
      return true
    })
    adapter.setContext({ sessionId: 'filter-document', routeRevision: 1 })
    nativeStandaloneMenus.synchronize()
    try {
      const button = mobileButton(result.container, title)
      expect(nativeStandaloneMenus.targetForElement(button)).toBeUndefined()
      await fireEvent.click(button)
      expect(messages).not.toContain('standaloneMenu.open')
      expect(shared.open).toHaveBeenCalledOnce()

      const form = shared.open.mock.calls[0] as unknown as [
        unknown,
        Record<string, unknown>,
        Record<string, (...args: unknown[]) => void>,
      ]
      expect(form[1]).toMatchObject({
        filterForm: props.filterForm,
        filterOptions: props.filterOptions,
      })
      if (title === '站点') expect(form[1]).toMatchObject({ filterKey: 'site', filterTitle: '站点' })
      else expect(form[1]).toMatchObject({ filterTitles: props.filterTitles })
      form[2]['update:filterForm']('resolution', ['2160p'])
      form[2].selectAll('site')
      form[2].clearFilter('site')
      expect(result.emitted()['update:filterForm']).toEqual([['resolution', ['2160p']]])
      expect(result.emitted().selectAll).toEqual([['site']])
      expect(result.emitted().clearFilter).toEqual([['site']])
      expect(props.filterForm.site).toEqual(['Site A'])
    } finally {
      adapter.setContext(undefined)
    }
  })
})
