import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeCardMenuAdapter } from '../cardInteraction'
import { NativeCardMenuRegistry, nativeCardAction, type NativeCardMenuBinding } from '../card'
import type { NativeEnvelope, NativeOperationMenu } from '../protocol'

const scope = { sessionId: 'card-document', routeRevision: 1 }
const cleanups: Array<() => void> = []

/** 实际 DOM 来源配合受控几何，验证长按通道的时序和原业务回调。 */
function harness(active = true) {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 1),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const registry = new NativeCardMenuRegistry()
  const element = document.createElement('article')
  element.innerHTML =
    '<p>当前媒体</p><button data-native-card-menu-trigger>更多</button><input aria-label="文件名"><a href="#test">媒体链接</a>'
  document.body.append(element)
  let rect = new DOMRect(20, 140, 170, 240)
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect)
  const hit = vi.fn(() => element.querySelector('p'))
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: hit })
  const invoke = vi.fn()
  let enabled = true
  let keepOpen = false
  const binding: NativeCardMenuBinding = {
    key: 2501,
    title: '当前媒体',
    items: () => [nativeCardAction('edit', { title: '编辑', enabled, keepOpen, icon: 'mdi-pencil', invoke })],
  }
  registry.bind(element, binding)
  const messages: Array<{ type: string; payload: Record<string, unknown> }> = []
  const post = vi.fn((type: string, payload: Record<string, unknown>) => {
    messages.push({ type, payload })
    return true
  })
  const adapter = new NativeCardMenuAdapter(post, registry)
  if (active) adapter.setContext(scope)
  cleanups.push(() => adapter.setContext(undefined))
  return {
    element,
    registry,
    binding,
    invoke,
    post,
    adapter,
    messages,
    hit,
    move: () => {
      rect = new DOMRect(20, 120, 170, 240)
    },
    disable: () => {
      enabled = false
    },
    keepOpen: () => {
      keepOpen = true
    },
    menu: () =>
      messages.findLast(message => message.type === 'cardMenu.prepare' || message.type === 'cardMenu.accessible')
        ?.payload.menu as NativeOperationMenu,
  }
}

/** jsdom 没有 PointerEvent 构造器，保留真实捕获/冒泡路径而只补触摸字段。 */
function pointer(element: Element, type: string, extra: Record<string, unknown> = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 50, clientY: 170, button: 0 })
  Object.defineProperties(
    event,
    Object.fromEntries(
      Object.entries({ pointerId: 1, isPrimary: true, ...extra }).map(([key, value]) => [key, { value }]),
    ),
  )
  element.dispatchEvent(event)
}

/** 等待 Vue 菜单关闭和双绘制帧；不依赖实际两秒等待。 */
async function paint() {
  await vi.advanceTimersByTimeAsync(20)
}

/** 系统回包仍含当前文档及路由，适配器不从界面文案推导动作。 */
function message(menu: NativeOperationMenu, type: string, itemId?: string): NativeEnvelope {
  return {
    protocol: 'moviepilot.chrome',
    major: 1,
    type,
    requestId: 'native-menu',
    sessionId: scope.sessionId,
    routeRevision: scope.routeRevision,
    payload: { presentationId: menu.presentationId, ...(itemId ? { itemId } : {}) },
  }
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('卡片原生交互的能力和入口边界', () => {
  it('默认关闭不改 DOM、入口或选字，也不安装长按拦截', async () => {
    const h = harness(false)
    const before = h.element.outerHTML
    pointer(h.element, 'pointerdown')
    await paint()
    expect(h.element.outerHTML).toBe(before)
    expect(h.messages).toEqual([])
  })

  it('只对完整来源加局部接管和无障碍按钮，释放立即恢复', async () => {
    const h = harness()
    await paint()
    expect(h.element.hasAttribute('data-native-card-menu-ready')).toBe(true)
    expect(h.element.querySelectorAll('[data-native-card-menu-accessible]')).toHaveLength(1)
    h.adapter.setContext(undefined)
    expect(h.element.hasAttribute('data-native-card-menu-ready')).toBe(false)
    expect(h.element.querySelector('[data-native-card-menu-accessible]')).toBeNull()
    expect(h.element.querySelector('[data-native-card-menu-trigger]')).not.toBeNull()
  })

  it.each(['input', 'a', '[data-native-card-menu-trigger]'])('不接管卡片内 %s 的独立触摸', async selector => {
    const h = harness()
    await paint()
    pointer(h.element.querySelector(selector)!, 'pointerdown')
    await paint()
    expect(h.messages).toEqual([])
  })

  it('覆盖层命中、非主指针及右键不生成展示票据', async () => {
    const h = harness()
    await paint()
    h.hit.mockReturnValue(document.body as unknown as HTMLParagraphElement)
    pointer(h.element, 'pointerdown')
    h.hit.mockReturnValue(h.element.querySelector('p'))
    pointer(h.element, 'pointerdown', { isPrimary: false })
    pointer(h.element, 'pointerdown', { button: 2 })
    await paint()
    expect(h.messages).toEqual([])
  })

  it('无障碍按钮走原生菜单，不触发卡片短按', async () => {
    const h = harness()
    const cardClick = vi.fn()
    h.element.addEventListener('click', cardClick)
    await paint()
    ;(h.element.querySelector('[data-native-card-menu-accessible]') as HTMLButtonElement).click()
    await paint()
    expect(h.messages.at(-1)?.type).toBe('cardMenu.accessible')
    expect(cardClick).not.toHaveBeenCalled()
    expect(h.invoke).not.toHaveBeenCalled()
  })
})

describe('手势准备、系统关闭和单次业务交接', () => {
  it('短按只准备和撤销，原短按点击仍可发生', async () => {
    const h = harness()
    const cardClick = vi.fn()
    h.element.addEventListener('click', cardClick)
    await paint()
    pointer(h.element, 'pointerdown')
    await paint()
    expect(h.menu().items[0].title).toBe('编辑')
    pointer(h.element, 'pointerup')
    h.element.click()
    expect(h.messages.at(-1)?.type).toBe('cardMenu.invalidate')
    expect(cardClick).toHaveBeenCalledOnce()
    expect(h.invoke).not.toHaveBeenCalled()
  })

  it('手指移动、滚动和两秒未展示都撤销候选', async () => {
    const h = harness()
    await paint()
    pointer(h.element, 'pointerdown')
    await paint()
    pointer(h.element, 'pointermove', { clientY: 210 })
    expect(h.messages.at(-1)?.type).toBe('cardMenu.invalidate')
    pointer(h.element, 'pointerdown')
    await paint()
    h.element.dispatchEvent(new Event('scroll'))
    expect(h.messages.at(-1)?.type).toBe('cardMenu.invalidate')
    pointer(h.element, 'pointerdown')
    await paint()
    await vi.advanceTimersByTimeAsync(2100)
    expect(h.messages.at(-1)?.type).toBe('cardMenu.invalidate')
    expect(h.invoke).not.toHaveBeenCalled()
  })

  it('原生识别造成的 pointercancel 不误撤销，真正展示后不受准备超时影响', async () => {
    const h = harness()
    await paint()
    pointer(h.element, 'pointerdown')
    await paint()
    const menu = h.menu()
    pointer(h.element, 'pointercancel')
    await h.adapter.receive(message(menu, 'cardMenu.opened'))
    await vi.advanceTimersByTimeAsync(2100)
    expect(h.registry.menus.isCurrent(menu.presentationId)).toBe(true)
    await h.adapter.receive(message(menu, 'cardMenu.dismissed'))
    const cardClick = vi.fn()
    h.element.addEventListener('click', cardClick)
    h.element.click()
    expect(cardClick).not.toHaveBeenCalled()
    expect(h.invoke).not.toHaveBeenCalled()
  })

  it('选择等待绘制交接，重复系统消息只执行一次原动作', async () => {
    const h = harness()
    await paint()
    pointer(h.element, 'pointerdown')
    await paint()
    const menu = h.menu()
    await h.adapter.receive(message(menu, 'cardMenu.opened'))
    const pending = h.adapter.receive(message(menu, 'cardMenu.select', 'action-edit'))
    await h.adapter.receive(message(menu, 'cardMenu.select', 'action-edit'))
    expect(h.invoke).not.toHaveBeenCalled()
    await paint()
    await pending
    expect(h.invoke).toHaveBeenCalledOnce()
  })

  it.each(['route', 'entity', 'permission', 'position'])('交接时 %s 变化拒绝旧动作', async change => {
    const h = harness()
    await paint()
    pointer(h.element, 'pointerdown')
    await paint()
    const menu = h.menu()
    const pending = h.adapter.receive(message(menu, 'cardMenu.select', 'action-edit'))
    if (change === 'route') h.adapter.setContext({ ...scope, routeRevision: 2 })
    if (change === 'entity') h.registry.bind(h.element, { ...h.binding, key: 2502 })
    if (change === 'permission') h.disable()
    if (change === 'position') {
      h.move()
      h.element.dispatchEvent(new Event('scroll'))
    }
    await paint()
    await pending
    expect(h.invoke).not.toHaveBeenCalled()
  })

  it('保留菜单以新票据刷新，旧关闭消息不会取消新票据', async () => {
    const h = harness()
    h.keepOpen()
    await paint()
    pointer(h.element, 'pointerdown')
    await paint()
    const old = h.menu()
    await h.adapter.receive(message(old, 'cardMenu.opened'))
    const pending = h.adapter.receive(message(old, 'cardMenu.select', 'action-edit'))
    await paint()
    await pending
    const fresh = h.messages.at(-1)?.payload.menu as NativeOperationMenu
    expect(h.messages.at(-1)?.type).toBe('cardMenu.refresh')
    expect(fresh.presentationId).not.toBe(old.presentationId)
    await h.adapter.receive(message(old, 'cardMenu.dismissed'))
    expect(h.registry.menus.isCurrent(fresh.presentationId)).toBe(true)
  })
})
