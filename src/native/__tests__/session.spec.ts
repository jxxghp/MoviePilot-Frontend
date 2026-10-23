import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { NativeChromeSession, type NativeSessionOptions } from '../session'
import type { NativeEnvelope, NativeSnapshot } from '../protocol'

const snapshot: NativeSnapshot = {
  route: { fullPath: '/apps', rootId: '/apps', title: '更多', canGoBack: false },
  roots: [{ id: '/apps', path: '/apps', title: '更多', icon: 'apps' }],
  actions: [],
  chrome: { topVisible: true, bottomVisible: true, theme: 'system' },
}
const cleanups: Array<() => Promise<void>> = []

/** 用宿主固定入口发送消息，不越过会话的实际事件监听路径。 */
async function send(type: string, payload: Record<string, unknown> = {}, extra: Partial<NativeEnvelope> = {}) {
  window.dispatchEvent(
    new CustomEvent('moviepilot:native-message', {
      detail: {
        protocol: 'moviepilot.chrome',
        major: 1,
        type,
        requestId: 'native-1',
        sessionId: 'session-1',
        routeRevision: 1,
        payload,
        ...extra,
      },
    }),
  )
  await flushPromises()
}

/** 每个测试拥有独立回调和文档会话，便于验证重复分派与权限代次变化。 */
function harness(overrides: Partial<NativeSessionOptions> = {}) {
  const messages: NativeEnvelope[] = []
  const options: NativeSessionOptions = {
    target: window,
    transport: { transportVersion: 1, postMessage: message => messages.push(message) },
    readState: () => ({ routeRevision: 1, snapshot }),
    setActive: vi.fn(),
    applyLayout: vi.fn(),
    execute: vi.fn(() => true),
    lifecycle: vi.fn(),
    ...overrides,
  }
  const session = new NativeChromeSession(options)
  cleanups.push(() => session.stop())
  session.start()
  return { session, options, messages }
}

/** 宿主协商和布局确认都必须经事件入口完成。 */
async function activate() {
  await send('host.configure', {
    sessionId: 'session-1',
    major: 1,
    capabilities: ['navigation.v1', 'actions.v1', 'layout.v1', 'menu.v1'],
  })
  await send('chrome.prepare', { layoutRevision: 7 })
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

describe('原生导航接管事务', () => {
  it('先保留网页，只有完整配置与布局确认后才提交接管', async () => {
    const { options, messages } = harness()
    expect(messages[0].type).toBe('web.ready')
    expect(options.setActive).not.toHaveBeenCalled()
    await send('chrome.prepare', { layoutRevision: 1 })
    expect(options.setActive).not.toHaveBeenCalled()
    await activate()
    expect(messages.map(message => message.type)).toEqual(['web.ready', 'navigation.state', 'chrome.accepted'])
    expect(options.applyLayout).toHaveBeenCalledBefore(options.setActive as ReturnType<typeof vi.fn>)
    expect(options.setActive).toHaveBeenCalledWith(true)
    expect(messages.at(-1)?.payload.layoutRevision).toBe(7)
  })

  it('过期会话和过期路由不能执行动作，重复请求只分派一次', async () => {
    const { options, messages } = harness()
    await activate()
    await send('action.invoke', {}, { sessionId: 'old' })
    await send('action.invoke', {}, { routeRevision: 0, requestId: 'old-route' })
    expect(options.execute).not.toHaveBeenCalled()
    expect(messages.find(message => message.payload.requestId === 'old-route')?.payload.error).toBe('stale_route')
    await send('action.invoke', {}, { requestId: 'once' })
    await send('action.invoke', {}, { requestId: 'once' })
    expect(options.execute).toHaveBeenCalledTimes(1)
    expect(
      messages.filter(message => message.type === 'command.result' && message.payload.requestId === 'once'),
    ).toHaveLength(2)
  })

  it('仍在等待回调的重复命令也不会重复分派', async () => {
    let finish!: (value: boolean) => void
    const { options } = harness({
      execute: vi.fn(
        () =>
          new Promise<boolean>(resolve => {
            finish = resolve
          }),
      ),
    })
    await activate()
    await send('action.invoke', {}, { requestId: 'waiting' })
    await send('action.invoke', {}, { requestId: 'waiting' })
    expect(options.execute).toHaveBeenCalledTimes(1)
    finish(true)
    await flushPromises()
  })

  it('结果缓存周转不会驱逐仍在执行的请求并重复分派', async () => {
    let finish!: (value: boolean) => void
    const execute = vi.fn((message: NativeEnvelope) =>
      message.requestId === 'waiting'
        ? new Promise<boolean>(resolve => {
            finish = resolve
          })
        : true,
    )
    harness({ execute })
    await activate()
    await send('action.invoke', {}, { requestId: 'waiting' })
    for (let index = 0; index < 260; index++) await send('action.invoke', {}, { requestId: `finished-${index}` })
    await send('action.invoke', {}, { requestId: 'waiting' })
    expect(execute.mock.calls.filter(([message]) => message.requestId === 'waiting')).toHaveLength(1)
    finish(true)
    await flushPromises()
  })

  it('恢复网页 DOM 完成后才确认释放，之后命令失效', async () => {
    const { options, messages } = harness()
    await activate()
    await send('chrome.release')
    expect(options.setActive).toHaveBeenLastCalledWith(false)
    expect(messages.at(-1)?.type).toBe('chrome.released')
    await send('action.invoke')
    expect(options.execute).not.toHaveBeenCalled()
  })

  it('失配能力或布局错误保持网页模式', async () => {
    const { options } = harness({
      applyLayout: () => {
        throw new Error('invalid')
      },
    })
    await send('host.configure', { sessionId: 'session-1', major: 1, capabilities: [] })
    expect(options.setActive).not.toHaveBeenCalled()
    await activate()
    expect(options.setActive).not.toHaveBeenCalledWith(true)
    expect(options.setActive).toHaveBeenCalledWith(false)
  })

  it('准备与释放交错时不会迟到接管', async () => {
    let finish!: () => void
    const { messages } = harness({
      setActive: value =>
        value
          ? new Promise<void>(resolve => {
              finish = resolve
            })
          : undefined,
    })
    await send('host.configure', {
      sessionId: 'session-1',
      major: 1,
      capabilities: ['navigation.v1', 'actions.v1', 'layout.v1', 'menu.v1'],
    })
    await send('chrome.prepare', { layoutRevision: 7 })
    await send('chrome.release')
    finish()
    await flushPromises()
    expect(messages.some(message => message.type === 'chrome.accepted')).toBe(false)
  })

  it('身份轮换后拒绝旧文档关联，并能从适配失败中确认恢复网页', async () => {
    const { session, options, messages } = harness()
    await activate()
    session.identityChanged()
    expect(messages.at(-1)?.type).toBe('session.state')
    await send('host.rekey', { sessionId: 'session-2' })
    expect(messages.at(-1)?.sessionId).toBe('session-2')
    await send('action.invoke', {}, { requestId: 'old-user' })
    expect(options.execute).not.toHaveBeenCalled()
    session.fallback()
    await flushPromises()
    expect(messages.at(-1)?.type).toBe('chrome.failed')
    await send('chrome.release', {}, { sessionId: 'session-2' })
    expect(messages.at(-1)?.type).toBe('chrome.released')
  })

  it('当前注册无法形成快照时撤销接管且不执行命令，不遗留未处理的结果拒绝', async () => {
    const { options, messages } = harness()
    await activate()
    options.readState = () => {
      throw new Error('unsupported_header_registration')
    }
    await send('action.invoke', {}, { requestId: 'broken-registration' })
    expect(options.execute).not.toHaveBeenCalled()
    expect(options.setActive).toHaveBeenLastCalledWith(false)
    expect(messages.at(-1)?.type).toBe('chrome.failed')
    expect(messages.at(-1)?.routeRevision).toBe(1)
    await send('chrome.release')
    expect(messages.at(-1)?.type).toBe('chrome.released')
  })
})
