import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeStandaloneMenuAdapter } from '../standaloneInteraction'
import { NativeStandaloneMenuRegistry } from '../standalone'
import type { NativeEnvelope, NativeOperationMenu } from '../protocol'

const scope = { sessionId: 'standalone-document', routeRevision: 1 }
const cleanups: Array<() => void> = []

/** 用真实按钮和事件捕获路径验证接管，仅对 jsdom 缺少的几何与绘制时钟提供受控值。 */
function harness(active = true) {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 1),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const registry = new NativeStandaloneMenuRegistry()
  const element = document.createElement('button')
  element.innerHTML = '<span>排序</span>'
  document.body.append(element)
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 30, 120, 44))
  const originalClick = vi.fn()
  element.addEventListener('click', originalClick)
  const invoke = vi.fn(() => {
    selected = !selected
  })
  let selected = false
  let enabled = true
  let keepOpen = false
  const token = {}
  registry.bind(
    token,
    {
      key: 'sort',
      title: '排序',
      items: action => [
        action('title', { title: '标题', selected, enabled, keepOpen, icon: 'mdi-sort-ascending', invoke }),
      ],
    },
    () => element,
  )
  const messages: Array<{ type: string; payload: Record<string, unknown> }> = []
  const post = vi.fn((type: string, payload: Record<string, unknown>) => {
    messages.push({ type, payload })
    return true
  })
  const adapter = new NativeStandaloneMenuAdapter(post, registry)
  if (active) adapter.setContext(scope)
  cleanups.push(() => adapter.setContext(undefined))
  return {
    adapter,
    registry,
    element,
    invoke,
    originalClick,
    messages,
    post,
    disable: () => {
      enabled = false
    },
    keepOpen: () => {
      keepOpen = true
    },
    menu: () =>
      messages.findLast(item => ['standaloneMenu.open', 'standaloneMenu.refresh'].includes(item.type))?.payload
        .menu as NativeOperationMenu,
  }
}

/** 绘制交接仍通过真实异步帧，只加速等待时间。 */
async function paint() {
  await vi.advanceTimersByTimeAsync(20)
}

/** 系统消息只包含本轮单次票据及动作标识。 */
function message(menu: NativeOperationMenu, type: string, itemId?: string): NativeEnvelope {
  return {
    protocol: 'moviepilot.chrome',
    major: 1,
    type,
    requestId: 'system-menu',
    ...scope,
    payload: { presentationId: menu.presentationId, ...(itemId ? { itemId } : {}) },
  }
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('独立菜单点击与系统选择', () => {
  it('未启用时保留原点击且不读取或发送菜单', async () => {
    const h = harness(false)
    h.element.click()
    await paint()
    expect(h.originalClick).toHaveBeenCalledOnce()
    expect(h.post).not.toHaveBeenCalled()
  })

  it('实际激活器子节点点击只展示一次原生列表，不触发原 HTML 展开', async () => {
    const h = harness()
    await paint()
    h.element.querySelector('span')!.click()
    h.element.click()
    await paint()
    expect(h.originalClick).not.toHaveBeenCalled()
    expect(h.messages.filter(item => item.type === 'standaloneMenu.open')).toHaveLength(1)
    expect(h.menu()).toMatchObject({
      kind: 'standalone',
      title: '排序',
      items: [{ title: '标题', icon: 'mdi-sort-ascending' }],
    })
    expect(h.invoke).not.toHaveBeenCalled()
  })

  it('系统动画结算后的选择沿用原回调，重复和迟到选择不能重放', async () => {
    const h = harness()
    await paint()
    h.element.click()
    await paint()
    const menu = h.menu()
    await h.adapter.receive(message(menu, 'standaloneMenu.opened'))
    const selected = h.adapter.receive(message(menu, 'standaloneMenu.select', menu.items[0].id))
    await h.adapter.receive(message(menu, 'standaloneMenu.select', menu.items[0].id))
    expect(h.invoke).not.toHaveBeenCalled()
    await paint()
    await selected
    expect(h.invoke).toHaveBeenCalledOnce()
    await h.adapter.receive(message(menu, 'standaloneMenu.select', menu.items[0].id))
    expect(h.invoke).toHaveBeenCalledOnce()
  })

  it('保持展开动作刷新为新的单次票据，并保留更新后的原选中状态', async () => {
    const h = harness()
    h.keepOpen()
    await paint()
    h.element.click()
    await paint()
    const menu = h.menu()
    const selected = h.adapter.receive(message(menu, 'standaloneMenu.select', menu.items[0].id))
    await paint()
    await selected
    const refreshed = h.menu()
    expect(refreshed.presentationId).not.toBe(menu.presentationId)
    expect(refreshed.items[0].selected).toBe(true)
    expect(h.messages.some(item => item.type === 'standaloneMenu.refresh')).toBe(true)
    expect(h.invoke).toHaveBeenCalledOnce()
    await h.adapter.receive(message(menu, 'standaloneMenu.dismissed'))
    expect(h.registry.menus.isCurrent(refreshed.presentationId)).toBe(true)
  })

  it('系统取消只撤销菜单，下一次点击可重新展示', async () => {
    const h = harness()
    await paint()
    h.element.click()
    await paint()
    const menu = h.menu()
    await h.adapter.receive(message(menu, 'standaloneMenu.dismissed'))
    h.element.click()
    await paint()
    expect(h.menu().presentationId).not.toBe(menu.presentationId)
    expect(h.invoke).not.toHaveBeenCalled()
  })

  it('宿主不接收或没有回包时有界撤销，后续点击不会永久失效', async () => {
    const h = harness()
    await paint()
    h.post.mockReturnValueOnce(false)
    h.element.click()
    await paint()
    h.element.click()
    await paint()
    const menu = h.menu()
    await vi.advanceTimersByTimeAsync(3100)
    expect(h.registry.menus.isCurrent(menu.presentationId)).toBe(false)
    h.element.click()
    await paint()
    expect(h.menu().presentationId).not.toBe(menu.presentationId)
    expect(h.invoke).not.toHaveBeenCalled()
  })

  it.each(['scope', 'unmount', 'hidden', 'disabled', 'permission'])(
    '%s 在异步选择交接期间变化后不能执行原动作',
    async reason => {
      const h = harness()
      await paint()
      h.element.click()
      await paint()
      const menu = h.menu()
      const selected = h.adapter.receive(message(menu, 'standaloneMenu.select', menu.items[0].id))
      if (reason === 'scope') h.adapter.setContext(undefined)
      if (reason === 'unmount') h.element.remove()
      if (reason === 'hidden') h.element.hidden = true
      if (reason === 'disabled') h.element.disabled = true
      if (reason === 'permission') h.disable()
      await paint()
      await selected
      expect(h.invoke).not.toHaveBeenCalled()
    },
  )

  it('当前按钮隐藏时主动关闭系统列表，解除接管后原点击恢复', async () => {
    const h = harness()
    await paint()
    h.element.click()
    await paint()
    const menu = h.menu()
    h.element.hidden = true
    await paint()
    expect(
      h.messages.some(
        item => item.type === 'standaloneMenu.invalidate' && item.payload.presentationId === menu.presentationId,
      ),
    ).toBe(true)
    h.element.hidden = false
    h.adapter.setContext(undefined)
    h.element.click()
    expect(h.originalClick).toHaveBeenCalledOnce()
  })
})
