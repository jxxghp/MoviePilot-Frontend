import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { NativeRouteHistory } from '../history'
import { NativeChromeSession } from '../session'
import { NativeSheetAdapter } from '../sheet'
import type { NativeEnvelope, NativeSnapshot } from '../protocol'

const cleanups: Array<() => Promise<void>> = []

/** 使用真实 Router、弹窗 DOM 与桥接分派，重现搜索关闭弹窗后连续变更路由的交接。 */
async function harness() {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    queueMicrotask(() => callback(0))
    return 1
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/browse', '/resource'].map(path => ({ path, component: {}, meta: { requiresAuth: true } })),
  })
  await router.push('/browse')
  const roots = [{ id: '/browse', path: '/browse', title: '发现', icon: 'browse' }]
  const history = new NativeRouteHistory(router, () => roots)
  const root = document.createElement('div')
  root.className = 'v-overlay--active v-dialog'
  root.innerHTML = '<div class="v-card-item"><div class="v-card-title">选择站点</div></div><button>搜索</button>'
  document.body.innerHTML = '<main>媒体卡片</main>'
  document.body.append(root)
  const adapter = new NativeSheetAdapter(document)
  adapter.setActive(true)
  const sheet = adapter.read('发现')!
  const messages: NativeEnvelope[] = []
  const execute = vi.fn((message: NativeEnvelope) => {
    adapter.read('搜索结果')
    return adapter.executeWhenPainted(message.type, message.payload)
  })
  const session = new NativeChromeSession({
    target: window,
    transport: { transportVersion: 1, postMessage: message => messages.push(message) },
    readState: () => ({
      routeRevision: history.revision.value,
      snapshot: {
        route: { fullPath: router.currentRoute.value.fullPath, ...history.navigation, title: '搜索结果' },
        roots,
        actions: [],
        chrome: { topVisible: true, bottomVisible: true, theme: 'system' },
      } satisfies NativeSnapshot,
    }),
    setActive: active => adapter.setActive(active),
    applyLayout: vi.fn(),
    lifecycle: vi.fn(),
    execute,
  })
  cleanups.push(async () => {
    await session.stop()
    history.stop()
  })
  let sequence = 0
  /** 所有宿主消息通过实际事件入口，并可保留发出时的路由编号。 */
  async function send(type: string, payload: Record<string, unknown>, extra: Partial<NativeEnvelope> = {}) {
    const requestId = `host-${++sequence}`
    window.dispatchEvent(
      new CustomEvent('moviepilot:native-message', {
        detail: {
          protocol: 'moviepilot.chrome',
          major: 1,
          type,
          requestId,
          sessionId: 'session-1',
          routeRevision: history.revision.value,
          payload,
          ...extra,
        },
      }),
    )
    await flushPromises()
    return messages.find(message => message.type === 'command.result' && message.payload.requestId === requestId)
  }
  session.start()
  await send('host.configure', {
    sessionId: 'session-1',
    major: 1,
    capabilities: ['navigation.v1', 'actions.v1', 'layout.v1', 'menu.v1'],
  })
  await send('chrome.prepare', { layoutRevision: 1 })
  await send('presentation.attach', { id: sheet.id })
  execute.mockClear()
  return { router, history, root, adapter, sheet, session, messages, execute, send }
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('搜索跳转与原生弹窗归还', () => {
  it('搜索和清理查询参数连续导航后，仍能归还同一会话已接管的弹窗', async () => {
    const { router, history, root, sheet, session, messages, send } = await harness()
    const revision = history.revision.value
    root.remove()
    await router.push({ path: '/resource', query: { title: '测试电影', sites: '1,2' } })
    await router.replace({ path: '/resource', query: {} })
    session.publish()
    expect(history.revision.value).toBeGreaterThan(revision)
    const reply = await send('presentation.detach', { id: sheet.id }, { routeRevision: revision })
    expect(reply?.payload).toMatchObject({ accepted: true })
    expect(document.documentElement.hasAttribute('data-native-sheet')).toBe(false)
    expect(document.querySelector('[data-native-sheet-background]')).toBeNull()
    expect(router.currentRoute.value.fullPath).toBe('/resource')
    expect(messages.some(message => message.type === 'chrome.failed')).toBe(false)
  })

  it.each([
    'presentation.prepare',
    'presentation.attach',
    'presentation.dismiss',
    'presentation.action',
    'action.invoke',
  ])('旧路由的 %s 仍不能执行', async type => {
    const { router, history, sheet, execute, send } = await harness()
    const revision = history.revision.value
    await router.push('/resource')
    const reply = await send(type, { id: sheet.id }, { routeRevision: revision })
    expect(reply?.payload).toMatchObject({ accepted: false, error: 'stale_route' })
    expect(execute).not.toHaveBeenCalled()
    expect(document.documentElement.hasAttribute('data-native-sheet')).toBe(true)
  })

  it('归还仍校验会话、路由上界与实际接管 ID，旧弹窗不能移除新弹窗', async () => {
    const { history, adapter, sheet, send } = await harness()
    expect(await send('presentation.detach', { id: sheet.id }, { sessionId: 'expired' })).toBeUndefined()
    const future = await send('presentation.detach', { id: sheet.id }, { routeRevision: history.revision.value + 1 })
    expect(future?.payload).toMatchObject({ accepted: false, error: 'stale_route' })
    const next = document.createElement('div')
    next.className = 'v-overlay--active v-dialog'
    next.style.zIndex = '2100'
    document.body.append(next)
    const current = adapter.read('新弹窗')!
    await send('presentation.attach', { id: current.id })
    const reply = await send('presentation.detach', { id: sheet.id }, { routeRevision: 0 })
    expect(reply?.payload.accepted).toBe(false)
    expect(next.hasAttribute('data-native-sheet-current')).toBe(true)
  })
})
