import { describe, expect, it, vi } from 'vitest'
import { NativeStandaloneMenuRegistry, type NativeStandaloneMenuBinding } from '../standalone'
import type { NativeMenuBadge } from '../protocol'

const context = { sessionId: 'standalone-document', routeRevision: 2 }

/** 使用真实注册表及可变化的业务列表，测试重排、异步交接和单次选择。 */
function menuHarness() {
  const registry = new NativeStandaloneMenuRegistry()
  const token = {}
  const invoke = vi.fn()
  let entries = [
    { key: '/私有目录/甲/', title: '甲' },
    { key: '/私有目录/乙/', title: '乙' },
  ]
  const binding: NativeStandaloneMenuBinding = {
    key: 'current-directory',
    title: '路径',
    items: action => entries.map(entry => action(entry.key, { title: entry.title, invoke: () => invoke(entry.key) })),
  }
  registry.bind(token, binding)
  return {
    registry,
    token,
    binding,
    invoke,
    replace: (next: typeof entries) => {
      entries = next
    },
    activate: () => {
      registry.setContext(context)
      registry.synchronize()
    },
    open: () => {
      const target = registry.targetFor(token)!
      return registry.menus.open(target.ownerId, target.menuId)!
    },
  }
}

describe('默认关闭的独立菜单来源', () => {
  it('普通 Web/PWA/旧 App 不读取项目、执行回调或创建展示', () => {
    const registry = new NativeStandaloneMenuRegistry()
    const token = {}
    const items = vi.fn(() => [])
    registry.bind(token, { key: 'settings', items })
    registry.synchronize()
    expect(registry.targetFor(token)).toBeUndefined()
    expect(items).not.toHaveBeenCalled()
  })

  it('协商范围变化后必须同步，不能把旧来源带入新文档', () => {
    const h = menuHarness()
    h.registry.setContext(context)
    expect(h.registry.targetFor(h.token)).toBeUndefined()
    h.registry.synchronize()
    expect(h.registry.targetFor(h.token)).toBeDefined()
  })

  it.each(['', '  ', NaN, Infinity])('无效本地范围 %s 不创建可选来源', key => {
    const h = menuHarness()
    h.registry.bind(h.token, { ...h.binding, key })
    h.activate()
    expect(h.registry.targetFor(h.token)).toBeUndefined()
  })

  it('文件路径只作为本地键，桥接 ID 短且不暴露路径', () => {
    const h = menuHarness()
    h.activate()
    const menu = h.open()
    expect(menu.kind).toBe('standalone')
    expect(JSON.stringify(menu)).not.toContain('私有目录')
    expect(menu.items.every(item => item.id.length < 32)).toBe(true)
    expect(h.invoke).not.toHaveBeenCalled()
  })
})

describe('业务语义标识与撤销', () => {
  it('重排保持各业务项目 ID，不能用数组下标代替原对象', () => {
    const h = menuHarness()
    h.activate()
    const before = h.open()
    h.replace([
      { key: '/私有目录/乙/', title: '乙' },
      { key: '/私有目录/甲/', title: '甲' },
    ])
    expect(h.registry.menus.isCurrent(before.presentationId)).toBe(false)
    const after = h.open()
    expect(after.items.map(item => item.id)).toEqual([before.items[1].id, before.items[0].id])
  })

  it('同范围同声明刷新后，选择执行最新原回调且只执行一次', async () => {
    const h = menuHarness()
    h.activate()
    const menu = h.open()
    const latest = vi.fn()
    h.registry.bind(h.token, {
      ...h.binding,
      items: action => [
        action('/私有目录/甲/', { title: '甲', invoke: latest }),
        action('/私有目录/乙/', { title: '乙', invoke: vi.fn() }),
      ],
    })
    expect(await h.registry.menus.select(menu.presentationId, menu.items[0].id, vi.fn())).toBe(true)
    expect(await h.registry.menus.select(menu.presentationId, menu.items[0].id, vi.fn())).toBe(false)
    expect(latest).toHaveBeenCalledOnce()
    expect(h.invoke).not.toHaveBeenCalled()
  })

  it('删除再添加同键项目会生成新 ID，不重放过期选择', async () => {
    const h = menuHarness()
    h.activate()
    const before = h.open()
    h.replace([{ key: '/私有目录/乙/', title: '乙' }])
    h.open()
    h.replace([{ key: '/私有目录/甲/', title: '甲' }])
    const after = h.open()
    expect(after.items[0].id).not.toBe(before.items[0].id)
    expect(await h.registry.menus.select(before.presentationId, before.items[0].id, vi.fn())).toBe(false)
  })

  it('不同菜单实例即使同范围和同文案也不共享身份', () => {
    const h = menuHarness()
    h.activate()
    const other = {}
    h.registry.bind(other, h.binding)
    expect(h.registry.targetFor(other)?.ownerId).not.toBe(h.registry.targetFor(h.token)?.ownerId)
  })

  it.each(['scope', 'unmount', 'route', 'session', 'background', 'permission'])(
    '%s 撤销异步交接中的选择',
    async reason => {
      const h = menuHarness()
      h.activate()
      const menu = h.open()
      let resume!: () => void
      const barrier = new Promise<void>(resolve => {
        resume = resolve
      })
      const selected = h.registry.menus.select(menu.presentationId, menu.items[0].id, () => barrier)
      if (reason === 'scope') h.registry.bind(h.token, { ...h.binding, key: 'another-directory' })
      if (reason === 'unmount') h.registry.unbind(h.token)
      if (reason === 'route') h.registry.setContext({ ...context, routeRevision: 3 })
      if (reason === 'session') h.registry.setContext({ ...context, sessionId: 'another-document' })
      if (reason === 'background') h.registry.setContext(undefined)
      if (reason === 'permission') h.registry.bind(h.token, { ...h.binding, available: () => false })
      resume()
      expect(await selected).toBe(false)
      expect(h.invoke).not.toHaveBeenCalled()
    },
  )

  it('保留原分隔、子菜单、禁用、选中、保持展开和危险语义', () => {
    const h = menuHarness()
    h.registry.bind(h.token, {
      key: 'status',
      items: action => [
        action('selected', {
          title: '最新',
          icon: 'mdi-sort-descending',
          selected: true,
          keepOpen: true,
          invoke: vi.fn(),
        }),
        { id: 'divider', kind: 'separator' },
        {
          id: 'advanced',
          kind: 'submenu',
          title: '高级操作',
          enabled: false,
          items: [action('delete', { title: '删除', color: 'error', invoke: vi.fn() })],
        },
      ],
    })
    h.activate()
    const menu = h.open()
    expect(menu.items[0]).toMatchObject({ title: '最新', selected: true, keepOpen: true })
    expect(menu.items[1]).toEqual({ id: 'divider', kind: 'separator' })
    expect(menu.items[2].items?.[0]).toMatchObject({ title: '删除', enabled: false, destructive: true, color: 'error' })
  })

  it.each(['duplicate', 'oversize', 'invalid-key'])('完整菜单 %s 时拒绝接管，不丢失尾部动作', kind => {
    const h = menuHarness()
    h.registry.bind(h.token, {
      key: 'invalid',
      items: action =>
        Array.from({ length: kind === 'oversize' ? 97 : 2 }, (_, number) =>
          action(kind === 'duplicate' ? 'same' : kind === 'invalid-key' ? '' : `field-${number}`, {
            title: '项目',
            invoke: vi.fn(),
          }),
        ),
    })
    h.activate()
    expect(h.registry.targetFor(h.token)).toBeUndefined()
  })

  it('状态徽标独立保留，徽标数量变化也会撤销旧声明', () => {
    const h = menuHarness()
    let count = 2
    h.registry.bind(h.token, {
      key: 'security',
      items: action => [
        action('passkey', {
          title: '通行密钥',
          subtitle: '无密码登录',
          icon: 'material-symbols:passkey',
          badge: { title: `${count} 个密钥`, color: 'success' },
          invoke: vi.fn(),
        }),
      ],
    })
    h.activate()
    const menu = h.open()
    expect(menu.items[0]).toMatchObject({
      title: '通行密钥',
      subtitle: '无密码登录',
      badge: { title: '2 个密钥', color: 'success' },
    })
    count = 3
    expect(h.registry.menus.isCurrent(menu.presentationId)).toBe(false)
  })

  it.each([{ title: '' }, { title: 'x'.repeat(257) }, { title: '状态\u0001' }, { title: '启用', color: 'raw-css' }])(
    '拒绝非法状态徽标 %j，不能丢弃状态后接管菜单',
    badge => {
      const h = menuHarness()
      h.registry.bind(h.token, {
        key: 'security',
        items: action => [action('passkey', { title: '通行密钥', badge: badge as NativeMenuBadge, invoke: vi.fn() })],
      })
      h.activate()
      expect(h.registry.targetFor(h.token)).toBeUndefined()
    },
  )
})
