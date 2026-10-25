import { afterEach, describe, expect, it, vi } from 'vitest'
import { nativeCardAction, NativeCardMenuRegistry, type NativeCardMenuBinding } from '../card'

const context = { sessionId: 'card-document', routeRevision: 1 }

/** 使用真实 DOM 元素与可改变的布局，验证卡片实体、滚动和卸载，而非菜单数组的副本。 */
function card(registry: NativeCardMenuRegistry, key: string | number | undefined = 'subscription-1') {
  const parent = document.createElement('section')
  const element = document.createElement('article')
  element.innerHTML = '<p>可选择的卡片文字</p><button data-native-card-menu-trigger>更多</button>'
  parent.append(element)
  document.body.append(parent)
  let rect = new DOMRect(24, 180, 170, 240)
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect)
  const invoke = vi.fn()
  const items = vi.fn(() => [nativeCardAction('edit', { title: '编辑', icon: 'mdi-pencil', invoke })])
  const binding: NativeCardMenuBinding = { key, title: '当前卡片', items }
  registry.bind(element, binding)
  return {
    element,
    parent,
    invoke,
    items,
    binding,
    move: (value: DOMRect) => {
      rect = value
    },
  }
}

/** 协商及 DOM 提交由调用方显式确认，单纯切换范围不能恢复旧页面的卡片。 */
function activate(registry: NativeCardMenuRegistry) {
  registry.setContext(context)
  registry.synchronize()
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('默认关闭的卡片来源', () => {
  it('Web、PWA 与旧 App 不读业务菜单，不改选字、按钮、事件和 DOM', () => {
    const registry = new NativeCardMenuRegistry()
    const source = card(registry)
    const before = source.element.outerHTML
    const listener = vi.fn()
    source.element.addEventListener('contextmenu', listener)
    registry.synchronize()
    expect(registry.targets()).toEqual([])
    source.element.dispatchEvent(new Event('contextmenu', { cancelable: true }))
    source.element.querySelector('button')!.click()
    expect(listener).toHaveBeenCalledOnce()
    expect(source.items).not.toHaveBeenCalled()
    expect(source.invoke).not.toHaveBeenCalled()
    expect(source.element.outerHTML).toBe(before)
  })

  it('同步位置只预检菜单，不创建展示票据或执行动作，也不提前隐藏原入口', () => {
    const registry = new NativeCardMenuRegistry()
    const source = card(registry)
    const before = source.element.outerHTML
    activate(registry)
    expect(registry.targets()).toEqual([
      {
        ownerId: expect.stringMatching(/^card-\d+$/),
        menuId: 'operations',
        rect: { x: 24, y: 180, width: 170, height: 240 },
      },
    ])
    expect(source.element.outerHTML).toBe(before)
    expect(source.invoke).not.toHaveBeenCalled()
  })

  it.each([undefined, '', '  ', NaN, Infinity])('实体 key %s 不接管，不能以卡片位置补一个业务 ID', key => {
    const registry = new NativeCardMenuRegistry()
    const source = card(registry, 'valid')
    registry.bind(source.element, { ...source.binding, key })
    activate(registry)
    expect(registry.targets()).toEqual([])
    expect(source.items).not.toHaveBeenCalled()
  })

  it('长文件路径只作为本地实体 key，跨桥 owner 为短标识', () => {
    const registry = new NativeCardMenuRegistry()
    card(registry, `/下载目录/${'媒体文件'.repeat(100)}`)
    activate(registry)
    const [target] = registry.targets()
    expect(target.ownerId.length).toBeLessThan(32)
    expect(JSON.stringify(registry.menus.open(target.ownerId, target.menuId))).not.toContain('下载目录')
  })
})

describe('卡片复用、最新状态与单次回调', () => {
  it('同 key 的进度刷新保留当前票据，最终调用最新声明的原回调', async () => {
    const registry = new NativeCardMenuRegistry()
    const source = card(registry)
    activate(registry)
    const [target] = registry.targets()
    const menu = registry.menus.open(target.ownerId, target.menuId)!
    const latest = vi.fn()
    registry.bind(source.element, {
      ...source.binding,
      items: () => [nativeCardAction('edit', { title: '编辑', icon: 'mdi-pencil', invoke: latest })],
    })
    registry.synchronize()
    expect(await registry.menus.select(menu.presentationId, 'action-edit', vi.fn())).toBe(true)
    expect(latest).toHaveBeenCalledOnce()
    expect(source.invoke).not.toHaveBeenCalled()
  })

  it('虚拟列表把同一 DOM 换成另一实体时，即使菜单相同也撤销旧选择', async () => {
    const registry = new NativeCardMenuRegistry()
    const source = card(registry)
    activate(registry)
    const [first] = registry.targets()
    const menu = registry.menus.open(first.ownerId, first.menuId)!
    registry.bind(source.element, { ...source.binding, key: 'subscription-2' })
    const [second] = registry.targets()
    expect(second.ownerId).not.toBe(first.ownerId)
    expect(await registry.menus.select(menu.presentationId, 'action-edit', vi.fn())).toBe(false)
    expect(source.invoke).not.toHaveBeenCalled()
  })

  it('两张同业务 key 卡片的 owner 仍独立，卸载一张不会注销另一张', async () => {
    const registry = new NativeCardMenuRegistry()
    const first = card(registry)
    const second = card(registry)
    activate(registry)
    const targets = registry.targets()
    expect(new Set(targets.map(item => item.ownerId)).size).toBe(2)
    registry.unbind(first.element)
    const menu = registry.menus.open(targets[1].ownerId, targets[1].menuId)!
    expect(await registry.menus.select(menu.presentationId, 'action-edit', vi.fn())).toBe(true)
    expect(first.invoke).not.toHaveBeenCalled()
    expect(second.invoke).toHaveBeenCalledOnce()
  })

  it.each(['unmount', 'detach', 'disabled', 'missing-key'])('交接时卡片变成 %s，旧业务动作失效', async change => {
    const registry = new NativeCardMenuRegistry()
    const source = card(registry)
    activate(registry)
    const [target] = registry.targets()
    const menu = registry.menus.open(target.ownerId, target.menuId)!
    const selected = registry.menus.select(menu.presentationId, 'action-edit', async () => {
      if (change === 'unmount') registry.unbind(source.element)
      if (change === 'detach') source.element.remove()
      if (change === 'disabled') source.binding.available = () => false
      if (change === 'missing-key') registry.bind(source.element, undefined)
    })
    expect(await selected).toBe(false)
    expect(source.invoke).not.toHaveBeenCalled()
  })

  it('路由或后台范围变更清除旧来源，等 DOM 提交并显式同步后才能重新登记', async () => {
    const registry = new NativeCardMenuRegistry()
    const source = card(registry)
    activate(registry)
    const [target] = registry.targets()
    const menu = registry.menus.open(target.ownerId, target.menuId)!
    registry.setContext({ ...context, routeRevision: 2 })
    expect(registry.targets()).toEqual([])
    expect(await registry.menus.select(menu.presentationId, 'action-edit', vi.fn())).toBe(false)
    registry.synchronize()
    expect(registry.targets()).toHaveLength(1)
    registry.setContext(undefined)
    registry.synchronize()
    expect(registry.targets()).toEqual([])
    expect(source.invoke).not.toHaveBeenCalled()
  })

  it('相同上下文重复通知不会打断正在展示的菜单，且保存的是上下文副本', async () => {
    const registry = new NativeCardMenuRegistry()
    card(registry)
    const current = { ...context }
    registry.setContext(current)
    registry.synchronize()
    const [target] = registry.targets()
    const menu = registry.menus.open(target.ownerId, target.menuId)!
    current.routeRevision++
    registry.setContext({ ...context })
    expect(await registry.menus.select(menu.presentationId, 'action-edit', vi.fn())).toBe(true)
  })
})

describe('实际卡片位置与完整性', () => {
  it('每次读取实际矩形，滚动和响应式宽度变化立即反映到当前位置', () => {
    const registry = new NativeCardMenuRegistry()
    const source = card(registry)
    activate(registry)
    source.move(new DOMRect(12, 40, 300, 120))
    expect(registry.targets()[0].rect).toEqual({ x: 12, y: 40, width: 300, height: 120 })
  })

  it.each(['hidden', 'inert', 'display', 'visibility', 'opacity', 'offscreen', 'invalid'])(
    '卡片或祖先 %s 时不提供原生菜单位置',
    state => {
      const registry = new NativeCardMenuRegistry()
      const source = card(registry)
      activate(registry)
      if (state === 'hidden' || state === 'inert') source.parent.setAttribute(state, '')
      if (state === 'display') source.parent.style.display = 'none'
      if (state === 'visibility') source.parent.style.visibility = 'hidden'
      if (state === 'opacity') source.parent.style.opacity = '0'
      if (state === 'offscreen') source.move(new DOMRect(0, -500, 170, 240))
      if (state === 'invalid') source.move(new DOMRect(NaN, 40, 170, 240))
      expect(registry.targets()).toEqual([])
    },
  )

  it('不完整的动态菜单保留原按钮，且不影响其它正常卡片', () => {
    const registry = new NativeCardMenuRegistry()
    const broken = card(registry)
    card(registry, 'good')
    broken.binding.items = () => [nativeCardAction('bad', { title: '动作', color: '#abcdef', invoke: vi.fn() })]
    activate(registry)
    expect(registry.targets()).toHaveLength(1)
    expect(broken.element.querySelector('button')!.hidden).toBe(false)
  })

  it('空颜色保留系统默认，原危险色、可见性和禁用状态送入共享校验', () => {
    const registry = new NativeCardMenuRegistry()
    const source = card(registry)
    source.binding.items = () => [
      nativeCardAction('edit', { title: '编辑', color: '', enabled: false, invoke: source.invoke }),
      nativeCardAction('hidden', { title: '隐藏', visible: false, invoke: source.invoke }),
      nativeCardAction('delete', { title: '删除', color: 'error', invoke: source.invoke }),
    ]
    activate(registry)
    const [target] = registry.targets()
    const menu = registry.menus.open(target.ownerId, target.menuId)!
    expect(menu.items.map(item => item.id)).toEqual(['action-edit', 'action-delete'])
    expect(menu.items[0]).toMatchObject({ enabled: false })
    expect(menu.items[0].color).toBeUndefined()
    expect(menu.items[1]).toMatchObject({ color: 'error', destructive: true })
  })
})
