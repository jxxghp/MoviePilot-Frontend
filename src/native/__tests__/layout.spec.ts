import { afterEach, describe, expect, it } from 'vitest'
import { NativeLayoutAdapter, nativeChromeActive, nativeContentInsets } from '../layout'

const viewport = { innerWidth: 390, innerHeight: 844 } as Window
const layout = {
  layoutRevision: 1,
  viewportPoints: { width: 780, height: 1688 },
  contentInsets: { top: 200, bottom: 160, left: 0, right: 0 },
  systemSafeArea: { top: 100, bottom: 60, left: 0, right: 0 },
  chromeOcclusion: { top: 100, bottom: 100, left: 0, right: 0 },
  keyboardOcclusion: 600,
  consumedByNativeFrame: false,
}
const adapter = new NativeLayoutAdapter(document, viewport)
afterEach(() => adapter.setActive(false))

describe('系统布局与 HTML 菜单锚点', () => {
  it('按 viewport 比例换算 point，安全区与键盘不重复叠加', () => {
    adapter.apply(layout)
    adapter.setActive(true)
    expect(nativeChromeActive.value).toBe(true)
    expect(nativeContentInsets.value).toEqual({ top: 100, bottom: 80, left: 0, right: 0 })
    expect(document.documentElement.style.getPropertyValue('--native-keyboard-occlusion')).toBe('300px')
    adapter.apply({ ...layout, layoutRevision: 2, consumedByNativeFrame: true })
    expect(nativeContentInsets.value.bottom).toBe(0)
  })

  it('原菜单属性保持可量测，控件位置约束在可见页面且不成为焦点', () => {
    adapter.apply(layout)
    adapter.setActive(true)
    adapter.syncAnchors(['installed-filter-btn'])
    adapter.positionAnchor('installed-filter-btn', { x: 760, y: -80, width: 88, height: 88 }, 1)
    const anchor = document.querySelector<HTMLElement>('[data-menu-activator="installed-filter-btn"]')!
    expect(anchor.style.display).not.toBe('none')
    expect(anchor.style.left).toBe('346px')
    expect(anchor.style.top).toBe('0px')
    expect(parseFloat(anchor.style.left) + parseFloat(anchor.style.width)).toBe(viewport.innerWidth)
    expect(anchor.style.opacity).toBe('0')
    expect(anchor.getAttribute('aria-hidden')).toBe('true')
    expect(anchor.inert).toBe(true)
    adapter.positionAnchor('installed-filter-btn', { x: 0, y: 0, width: 1, height: 1 }, 0)
    expect(anchor.style.left).toBe('346px')
    adapter.positionAnchor('installed-filter-btn', { x: 100, y: 140, width: 88, height: 88 }, 1)
    expect(anchor.style.top).toBe('70px')
    adapter.syncAnchors([])
    expect(document.querySelector('[data-menu-activator="installed-filter-btn"]')).toBeNull()
  })

  it('拒绝无效几何并在释放时恢复默认 DOM 模式', () => {
    expect(() => adapter.apply({ ...layout, viewportPoints: { width: 0, height: 844 } })).toThrow()
    expect(() => adapter.apply({ ...layout, contentInsets: { top: NaN } })).toThrow()
    adapter.apply(layout)
    adapter.setActive(true)
    adapter.setActive(false)
    expect(document.documentElement.dataset.nativeChrome).toBeUndefined()
    expect(document.documentElement.style.getPropertyValue('--native-top')).toBe('')
  })
})
