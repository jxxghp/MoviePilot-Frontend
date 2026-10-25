import { describe, expect, it, vi } from 'vitest'
import { NativeMenuRegistry, type NativeMenuEntry, type NativeMenuSource } from '../menu'

const context = { sessionId: 'document-one', routeRevision: 4 }

/** 使用真实注册表和可变业务状态，验证展示与执行之间的权限及生命周期边界。 */
function harness(entries?: NativeMenuEntry[]) {
  const invoke = vi.fn()
  const source: NativeMenuSource = {
    ownerId: 'subscription-12',
    menuId: 'operations',
    kind: 'card',
    title: '订阅操作',
    items: () => entries ?? [{ id: 'edit', kind: 'action', title: '编辑', icon: 'mdi-pencil', invoke }],
  }
  const registry = new NativeMenuRegistry()
  registry.setContext(context)
  const unregister = registry.register(source)
  return { registry, source, invoke, unregister }
}

/** 显式控制关闭动画完成时机，不使用定时器掩盖旧动作与导航的竞争。 */
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => (resolve = done))
  return { promise, resolve }
}

describe('原生操作菜单的默认关闭声明', () => {
  it('未提供协商后的上下文时不保留来源，也不能展示或执行', async () => {
    const { source, invoke } = harness()
    const registry = new NativeMenuRegistry()
    registry.register(source)
    expect(registry.open(source.ownerId, source.menuId)).toBeUndefined()
    expect(await registry.select('unknown', 'edit', vi.fn())).toBe(false)
    registry.setContext(context)
    expect(registry.open(source.ownerId, source.menuId)).toBeUndefined()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('完整保留名称、图标、顺序、分组、分隔、选中、加载及危险样式，只投影 JSON', () => {
    const hidden = vi.fn()
    const { registry, source } = harness([
      { id: 'edit', kind: 'action', title: '编辑', subtitle: '当前订阅', icon: 'mdi-pencil', invoke: vi.fn() },
      { id: 'hidden', kind: 'action', title: '不可见', visible: false, invoke: hidden },
      { id: 'divider', kind: 'separator' },
      {
        id: 'advanced',
        kind: 'submenu',
        title: '高级操作',
        icon: 'mdi-tools',
        items: [
          {
            id: 'defaults',
            kind: 'group',
            title: '默认规则',
            items: [
              {
                id: 'rule',
                kind: 'action',
                title: '规则一',
                color: 'info',
                selected: true,
                keepOpen: true,
                invoke: vi.fn(),
              },
            ],
          },
        ],
      },
      { id: 'refresh', kind: 'action', title: '刷新中', loading: true, invoke: vi.fn() },
      { id: 'delete', kind: 'action', title: '删除', color: 'error', invoke: vi.fn() },
    ])
    const menu = registry.open(source.ownerId, source.menuId)!
    expect(menu).toMatchObject({ kind: 'card', ownerId: source.ownerId, menuId: source.menuId, title: '订阅操作' })
    expect(menu.items.map(item => item.id)).toEqual(['edit', 'divider', 'advanced', 'refresh', 'delete'])
    expect(menu.items[0]).toMatchObject({ title: '编辑', subtitle: '当前订阅', icon: 'mdi-pencil', enabled: true })
    expect(menu.items[2].items?.[0]).toMatchObject({ kind: 'group', title: '默认规则' })
    expect(menu.items[2].items?.[0].items?.[0]).toMatchObject({
      title: '规则一',
      color: 'info',
      selected: true,
      keepOpen: true,
    })
    expect(menu.items[3]).toMatchObject({ enabled: false, loading: true })
    expect(menu.items[4]).toMatchObject({ color: 'error', destructive: true })
    const json = JSON.stringify(menu)
    expect(JSON.parse(json)).toEqual(menu)
    expect(json).not.toContain('invoke')
    expect(json).not.toContain('不可见')
    expect(hidden).not.toHaveBeenCalled()
  })

  it('独立按钮复用相同声明，多个 owner 的同名菜单及项目不会互相执行', async () => {
    const { registry, source, invoke } = harness()
    const other = vi.fn()
    registry.register({
      ...source,
      ownerId: 'toolbar',
      kind: 'standalone',
      items: () => [{ id: 'edit', kind: 'action', title: '编辑布局', invoke: other }],
    })
    const menu = registry.open('toolbar', source.menuId)!
    expect(menu.kind).toBe('standalone')
    expect(await registry.select(menu.presentationId, 'edit', vi.fn())).toBe(true)
    expect(other).toHaveBeenCalledOnce()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('返回的展示对象被修改不能增加可执行动作或替换网页回调', async () => {
    const { registry, source, invoke } = harness()
    const menu = registry.open(source.ownerId, source.menuId)!
    menu.items[0].id = 'delete'
    expect(await registry.select(menu.presentationId, 'delete', vi.fn())).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('入口预检不打断当前展示；无权限或不完整时必须保留原入口', async () => {
    const { registry, source, invoke } = harness()
    const menu = registry.open(source.ownerId, source.menuId)!
    expect(registry.canPresent(source.ownerId, source.menuId)).toBe(true)
    expect(registry.canPresent('unknown', source.menuId)).toBe(false)
    expect(await registry.select(menu.presentationId, 'edit', vi.fn())).toBe(true)
    expect(invoke).toHaveBeenCalledOnce()
    source.available = () => false
    expect(registry.canPresent(source.ownerId, source.menuId)).toBe(false)
    source.available = () => true
    source.items = () => [{ id: 'broken', kind: 'action', title: '不可用' }]
    expect(registry.canPresent(source.ownerId, source.menuId)).toBe(false)
    registry.setContext(undefined)
    expect(registry.canPresent(source.ownerId, source.menuId)).toBe(false)
  })

  it('局域网 HTTP 没有随机 UUID API 时仍可展示，跨注册表的展示票据不重复', () => {
    vi.stubGlobal('crypto', undefined)
    try {
      const first = harness()
      const second = harness()
      const one = first.registry.open(first.source.ownerId, first.source.menuId)!
      const two = second.registry.open(second.source.ownerId, second.source.menuId)!
      expect(one.presentationId).toMatch(/^menu-\d+$/)
      expect(two.presentationId).not.toBe(one.presentationId)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('原生操作菜单的执行与撤销', () => {
  it('等待菜单绘制交接再执行，并在等待期间拒绝重复选择', async () => {
    const { registry, source, invoke } = harness()
    const closed = deferred()
    const menu = registry.open(source.ownerId, source.menuId)!
    const beforeInvoke = vi.fn(() => closed.promise)
    const selection = registry.select(menu.presentationId, 'edit', beforeInvoke)
    expect(beforeInvoke).toHaveBeenCalledOnce()
    expect(invoke).not.toHaveBeenCalled()
    expect(await registry.select(menu.presentationId, 'edit', beforeInvoke)).toBe(false)
    closed.resolve()
    expect(await selection).toBe(true)
    expect(invoke).toHaveBeenCalledOnce()
    expect(await registry.select(menu.presentationId, 'edit', beforeInvoke)).toBe(false)
  })

  it.each(['hidden', 'disabled', 'loading', 'removed', 'parent', 'unavailable', 'renamed', 'reordered'])(
    '展示后业务状态变成 %s，关闭动画完成也不能触发旧动作',
    async change => {
      const invoke = vi.fn()
      const action: NativeMenuEntry = { id: 'edit', kind: 'action', title: '编辑', invoke }
      const parent: NativeMenuEntry = { id: 'parent', kind: 'submenu', title: '操作', items: [action] }
      const entries: NativeMenuEntry[] = [parent, { id: 'help', kind: 'action', title: '帮助', invoke: vi.fn() }]
      const { registry, source } = harness(entries)
      const menu = registry.open(source.ownerId, source.menuId)!
      const closed = deferred()
      const selection = registry.select(menu.presentationId, 'edit', () => closed.promise)
      if (change === 'hidden') action.visible = false
      if (change === 'disabled') action.enabled = false
      if (change === 'loading') action.loading = true
      if (change === 'removed') parent.items = []
      if (change === 'parent') parent.enabled = false
      if (change === 'unavailable') source.available = () => false
      if (change === 'renamed') action.title = '另一个操作'
      if (change === 'reordered') entries.reverse()
      closed.resolve()
      expect(await selection).toBe(false)
      expect(invoke).not.toHaveBeenCalled()
    },
  )

  it.each(['disabled', 'loading'])('父菜单 %s 时，子动作从首次展示起即不可执行', async state => {
    const invoke = vi.fn()
    const { registry, source } = harness([
      {
        id: 'advanced',
        kind: 'submenu',
        title: '高级操作',
        [state === 'disabled' ? 'enabled' : 'loading']: state !== 'disabled',
        items: [{ id: 'edit', kind: 'action', title: '编辑', invoke }],
      },
    ])
    const menu = registry.open(source.ownerId, source.menuId)!
    expect(menu.items[0].items?.[0].enabled).toBe(false)
    expect(await registry.select(menu.presentationId, 'edit', vi.fn())).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
  })

  it.each(['route', 'session', 'background', 'unmount', 'replace', 'dismiss', 'new-menu'])(
    '等待交接时发生 %s，旧选择撤销且不能重放',
    async change => {
      const { registry, source, invoke, unregister } = harness()
      const menu = registry.open(source.ownerId, source.menuId)!
      const closed = deferred()
      const selection = registry.select(menu.presentationId, 'edit', () => closed.promise)
      if (change === 'route') registry.setContext({ ...context, routeRevision: context.routeRevision + 1 })
      if (change === 'session') registry.setContext({ ...context, sessionId: 'document-two' })
      if (change === 'background') registry.setContext(undefined)
      if (change === 'unmount') unregister()
      if (change === 'replace') registry.register({ ...source })
      if (change === 'dismiss') registry.dismiss(menu.presentationId)
      if (change === 'new-menu') registry.open(source.ownerId, source.menuId)
      closed.resolve()
      expect(await selection).toBe(false)
      expect(await registry.select(menu.presentationId, 'edit', vi.fn())).toBe(false)
      expect(invoke).not.toHaveBeenCalled()
    },
  )

  it('旧组件注销和迟到关闭不清除新注册及新展示', async () => {
    const { registry, source, unregister } = harness()
    const old = registry.open(source.ownerId, source.menuId)!
    const invoke = vi.fn()
    registry.register({ ...source, items: () => [{ id: 'edit', kind: 'action', title: '新卡片编辑', invoke }] })
    unregister()
    const current = registry.open(source.ownerId, source.menuId)!
    expect(current.presentationId).not.toBe(old.presentationId)
    registry.dismiss(old.presentationId)
    expect(await registry.select(current.presentationId, 'edit', vi.fn())).toBe(true)
    expect(invoke).toHaveBeenCalledOnce()
  })

  it('范围变更必须重新登记，原上下文对象被修改不影响登记范围', () => {
    const { registry, source } = harness()
    const next = { ...context }
    registry.setContext(next)
    next.routeRevision++
    expect(registry.open(source.ownerId, source.menuId)).toBeDefined()
    registry.setContext(next)
    expect(registry.open(source.ownerId, source.menuId)).toBeUndefined()
    registry.register(source)
    expect(registry.open(source.ownerId, source.menuId)).toBeDefined()
  })

  it.each([
    { sessionId: '', routeRevision: 1 },
    { sessionId: 'invalid id', routeRevision: 1 },
    { sessionId: 'document', routeRevision: -1 },
    { sessionId: 'document', routeRevision: 1.5 },
    { sessionId: 'document', routeRevision: Number.POSITIVE_INFINITY },
  ])('拒绝无效范围并撤销当前来源 %#', invalid => {
    const { registry, source } = harness()
    registry.setContext(invalid)
    registry.register(source)
    expect(registry.open(source.ownerId, source.menuId)).toBeUndefined()
  })

  it('展示未变时执行最新业务闭包，旧闭包不会跨刷新复用', async () => {
    const { registry, source, invoke } = harness()
    const menu = registry.open(source.ownerId, source.menuId)!
    const current = vi.fn()
    source.items = () => [{ id: 'edit', kind: 'action', title: '编辑', icon: 'mdi-pencil', invoke: current }]
    expect(await registry.select(menu.presentationId, 'edit', vi.fn())).toBe(true)
    expect(current).toHaveBeenCalledOnce()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('业务回调打开下一份菜单后，旧选择结束不会清除新菜单', async () => {
    const { registry, source } = harness()
    let next: ReturnType<NativeMenuRegistry['open']>
    const invoke = vi.fn(() => {
      next = registry.open(source.ownerId, source.menuId)
    })
    source.items = () => [{ id: 'edit', kind: 'action', title: '编辑', invoke }]
    const menu = registry.open(source.ownerId, source.menuId)!
    expect(await registry.select(menu.presentationId, 'edit', vi.fn())).toBe(true)
    expect(await registry.select(next!.presentationId, 'edit', vi.fn())).toBe(true)
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('交接和业务异常交回原调用路径，票据仍然只能消费一次', async () => {
    const { registry, source, invoke } = harness()
    const menu = registry.open(source.ownerId, source.menuId)!
    await expect(
      registry.select(menu.presentationId, 'edit', () => Promise.reject(new Error('close-failed'))),
    ).rejects.toThrow('close-failed')
    expect(invoke).not.toHaveBeenCalled()
    expect(await registry.select(menu.presentationId, 'edit', vi.fn())).toBe(false)
    invoke.mockRejectedValueOnce(new Error('business-failed'))
    const next = registry.open(source.ownerId, source.menuId)!
    await expect(registry.select(next.presentationId, 'edit', vi.fn())).rejects.toThrow('business-failed')
    expect(await registry.select(next.presentationId, 'edit', vi.fn())).toBe(false)
  })
})

describe('动态菜单的完整性边界', () => {
  it.each([
    'duplicate',
    'invalid-id',
    'missing-callback',
    'control-text',
    'long-text',
    'too-many',
    'too-deep',
    'too-large',
    'empty',
    'separator-children',
    'container-callback',
  ])('%s 声明整体拒绝，不截断出一份不完整菜单', invalid => {
    const { registry, source } = harness()
    const action: NativeMenuEntry = { id: 'edit', kind: 'action', title: '编辑', invoke: vi.fn() }
    let entries = [action]
    if (invalid === 'duplicate') entries.push({ ...action })
    if (invalid === 'invalid-id') action.id = '含空格 id'
    if (invalid === 'missing-callback') action.invoke = undefined
    if (invalid === 'control-text') action.title = '编辑\u0000'
    if (invalid === 'long-text') action.title = '汉'.repeat(1000)
    if (invalid === 'too-many')
      entries = Array.from({ length: 500 }, (_, index) => ({ ...action, id: `item-${index}` }))
    if (invalid === 'too-deep') {
      entries = [action]
      for (let level = 0; level < 4; level++)
        entries = [{ id: `nested-${level}`, kind: 'submenu', title: '更多', items: entries }]
    }
    if (invalid === 'too-large')
      entries = Array.from({ length: 40 }, (_, index) => ({ ...action, id: `item-${index}`, title: '汉'.repeat(400) }))
    if (invalid === 'empty') entries = []
    if (invalid === 'separator-children') entries = [{ id: 'bad-divider', kind: 'separator', items: [action] }]
    if (invalid === 'container-callback')
      entries = [{ id: 'bad-group', kind: 'group', items: [action], invoke: vi.fn() }]
    source.items = () => entries
    expect(registry.open(source.ownerId, source.menuId)).toBeUndefined()
  })

  it('投影失败或无权限时不接管，恢复有效状态后可重新展示', () => {
    const { registry, source } = harness()
    const items = source.items
    source.items = () => {
      throw new Error('plugin-not-ready')
    }
    expect(registry.open(source.ownerId, source.menuId)).toBeUndefined()
    source.items = items
    source.available = () => false
    expect(registry.open(source.ownerId, source.menuId)).toBeUndefined()
    source.available = () => true
    expect(registry.open(source.ownerId, source.menuId)).toBeDefined()
  })
})
