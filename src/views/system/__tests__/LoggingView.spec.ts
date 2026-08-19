import LoggingView from '@/views/system/LoggingView.vue'
import { fireEvent, screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addMessageListener: vi.fn(),
  removeMessageListener: vi.fn(),
  useSSE: vi.fn(),
}))

vi.mock('@/composables/useBackground', async () => {
  const { ref } = await import('vue')

  return {
    useBackground: () => ({
      useSSE: (...args: unknown[]) => {
        mocks.useSSE(...args)
        return {
          isConnected: ref(false),
          manager: {
            addMessageListener: mocks.addMessageListener,
            removeMessageListener: mocks.removeMessageListener,
          },
        }
      },
    }),
  }
})

describe('LoggingView', () => {
  let scrollTo: ReturnType<typeof vi.fn>
  const originalScrollTo = HTMLElement.prototype.scrollTo

  async function advanceTimers(ms: number) {
    vi.advanceTimersByTime(ms)
    await nextTick()
  }

  async function renderLogging(logfile = 'moviepilot.log') {
    return renderWithProviders(LoggingView, {
      props: { logfile },
      global: {
        stubs: {
          LoadingBanner: {
            props: ['text'],
            template: '<div>{{ text }}</div>',
          },
        },
      },
    })
  }

  async function mountReady(logfile = 'moviepilot.log') {
    const result = await renderLogging(logfile)
    await advanceTimers(200)
    const handler = mocks.useSSE.mock.calls.at(-1)?.[1] as (event: MessageEvent) => void
    expect(handler).toEqual(expect.any(Function))
    return { ...result, handler }
  }

  async function emitAndFlush(handler: (event: MessageEvent) => void, data: unknown) {
    handler(new MessageEvent('message', { data }))
    await advanceTimers(80)
  }

  function recordBodies(container: Element) {
    return [...container.querySelectorAll('.logging-record-body')].map(element => element.textContent?.trim() ?? '')
  }

  beforeEach(() => {
    vi.useFakeTimers()
    mocks.addMessageListener.mockReset()
    mocks.removeMessageListener.mockReset()
    mocks.useSSE.mockReset()
    scrollTo = vi.fn()
    HTMLElement.prototype.scrollTo = scrollTo
  })

  afterEach(() => {
    HTMLElement.prototype.scrollTo = originalScrollTo
  })

  it('先展示初始化状态，延迟结束后进入等待日志状态并忽略空消息', async () => {
    await renderLogging()

    expect(screen.getByText('正在初始化 ...')).toBeInTheDocument()

    await advanceTimers(199)
    expect(screen.getByText('正在初始化 ...')).toBeInTheDocument()

    await advanceTimers(1)
    const handler = mocks.useSSE.mock.calls[0][1] as (event: MessageEvent) => void
    handler(new MessageEvent('message', { data: '' }))
    await advanceTimers(80)

    expect(screen.getByText('等待日志输出...')).toBeInTheDocument()
    expect(document.querySelectorAll('.logging-record-line')).toHaveLength(0)
  })

  it('把编码后的日志文件名、listener identity 和后台恢复参数交给 SSE 边界', async () => {
    await renderLogging('plugins/example app.log')

    expect(mocks.useSSE).toHaveBeenCalledWith(
      '/api/v1/system/logging?logfile=plugins%2Fexample%20app.log',
      expect.any(Function),
      'logging-plugins/example app.log',
      {
        backgroundCloseDelay: 5_000,
        connectDelay: 300,
        maxReconnectAttempts: 3,
        reconnectDelay: 3_000,
      },
    )
  })

  it('解析常见日志格式、规范化级别并保留无法结构化的原始行', async () => {
    const { container, handler } = await mountReady()

    await emitAndFlush(
      handler,
      [
        '\u001B[31mINFO: [Core] 2026-08-19 10:00:00,000 app.jobs - Python message\u001B[0m',
        '【warn】 [Plugin] 2026-08-19 10:00:00,050 plugin.worker - Bracket message',
        '2026-08-19 10:00:00,090 [ERROR] [Api] api.route - Timestamp message',
        '[DEBUG]: 2026-08-19 10:00:00,095 scheduler.task - Inline message',
        'plain fallback line',
      ].join('\n'),
    )

    expect(recordBodies(container)).toEqual([
      '10:00:00,000 Python message',
      '10:00:00,050 Bracket message',
      '10:00:00,090 Timestamp message',
      '10:00:00,095 Inline message',
      'plain fallback line',
    ])
    expect([...container.querySelectorAll('.logging-record-level')].map(node => node.textContent?.trim())).toEqual([
      'INFO:',
      'WARNING:',
      'ERROR:',
      'DEBUG:',
      'LOG:',
    ])
    expect([...container.querySelectorAll('.logging-record-app')].map(node => node.textContent?.trim())).toEqual([
      '[Core]',
      '[Plugin]',
      '[Api]',
    ])
    expect(container.textContent).not.toContain('\u001B[31m')
  })

  it('按秒级时间、级别和相邻间隔分组，并在边界变化时拆分记录', async () => {
    const { container, handler } = await mountReady()

    await emitAndFlush(
      handler,
      [
        'INFO: 2026-08-19 10:00:00,000 first.source - first',
        'INFO: 2026-08-19 10:00:00,080 second.source - second',
        'INFO: 2026-08-19 10:00:00,250 second.source - gap boundary',
        'ERROR: 2026-08-19 10:00:00,260 second.source - level boundary',
      ].join('\n'),
    )

    const records = container.querySelectorAll('.logging-record')
    expect(records).toHaveLength(3)
    expect(records[0].querySelectorAll('.logging-record-line')).toHaveLength(2)
    expect(records[0].querySelector('.logging-record-accent')).toHaveClass('is-burst')
    expect(records[1].querySelectorAll('.logging-record-line')).toHaveLength(1)
    expect(records[2].querySelector('.logging-record-level')).toHaveTextContent('ERROR:')
  })

  it('按级别与大小写无关关键字过滤，并支持从来源字段命中', async () => {
    const { container, handler } = await mountReady()

    await emitAndFlush(
      handler,
      [
        'INFO: [Core] 2026-08-19 10:00:00,000 worker.first - alpha result',
        'ERROR: [Plugin] 2026-08-19 10:00:01,000 worker.second - beta result',
      ].join('\n'),
    )

    await fireEvent.update(screen.getByPlaceholderText('搜索日志内容'), ' WORKER.SECOND ')
    expect(recordBodies(container)).toEqual(['10:00:01,000 beta result'])

    await fireEvent.update(screen.getByPlaceholderText('搜索日志内容'), '')
    await fireEvent.click(screen.getByRole('button', { name: 'ERROR' }))
    expect(recordBodies(container)).toEqual(['10:00:01,000 beta result'])
    expect(screen.queryByText('alpha result', { exact: false })).not.toBeInTheDocument()

    await fireEvent.update(screen.getByPlaceholderText('搜索日志内容'), 'missing')
    expect(screen.getByText('没有符合条件的数据')).toBeInTheDocument()
  })

  it('只为可选的自定义级别增加筛选入口，隐藏跟踪和致命级别入口', async () => {
    const { handler } = await mountReady()

    await emitAndFlush(
      handler,
      [
        '【NOTICE】 2026-08-19 10:00:00,000 notice.source - notice line',
        '【TRACE】 2026-08-19 10:00:01,000 trace.source - trace line',
        '【fatal】 2026-08-19 10:00:02,000 fatal.source - fatal line',
      ].join('\n'),
    )

    expect(screen.getByRole('button', { name: 'NOTICE' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'TRACE' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'CRITICAL' })).not.toBeInTheDocument()
    expect(screen.getByText('notice line', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('trace line', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('fatal line', { exact: false })).toBeInTheDocument()
  })

  it('合并短时间内到达的消息并把展示行数限制在最后 600 行', async () => {
    const { container, handler } = await mountReady()
    const lines = Array.from({ length: 605 }, (_, index) => `line-${String(index).padStart(3, '0')}`)

    handler(new MessageEvent('message', { data: lines.slice(0, 300).join('\n') }))
    handler(new MessageEvent('message', { data: lines.slice(300).join('\n') }))

    await advanceTimers(79)
    expect(container.querySelectorAll('.logging-record-line')).toHaveLength(0)

    await advanceTimers(1)
    const renderedLines = container.querySelectorAll('.logging-record-line')
    expect(renderedLines).toHaveLength(600)
    expect(container).not.toHaveTextContent('line-004')
    expect(container).toHaveTextContent('line-005')
    expect(container).toHaveTextContent('line-604')
  })

  it('离开尾部时累计新日志，跳到最新后恢复跟随并平滑滚动', async () => {
    const { container, handler } = await mountReady()
    const viewport = container.querySelector('.logging-shell') as HTMLElement
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: { configurable: true, value: 100, writable: true },
    })

    await fireEvent.scroll(viewport)
    await emitAndFlush(
      handler,
      'INFO: 2026-08-19 10:00:00,000 source - one\nINFO: 2026-08-19 10:00:01,000 source - two',
    )

    const jumpButton = screen.getByRole('button', { name: '查看最新 (2)' })
    expect(jumpButton).toBeInTheDocument()

    await fireEvent.click(jumpButton)
    await nextTick()

    expect(screen.queryByRole('button', { name: '查看最新 (2)' })).not.toBeInTheDocument()
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1_000, behavior: 'smooth' })

    viewport.scrollTop = 100
    await fireEvent.scroll(viewport)
    await emitAndFlush(handler, 'INFO: 2026-08-19 10:00:02,000 source - three')
    expect(screen.getByRole('button', { name: '查看最新 (1)' })).toBeInTheDocument()

    viewport.scrollTop = 800
    await fireEvent.scroll(viewport)
    expect(screen.queryByRole('button', { name: '查看最新 (1)' })).not.toBeInTheDocument()
  })

  it('暂停时立即刷新缓冲并断开连接，恢复后使用新连接继续接收日志', async () => {
    const { container, handler } = await mountReady()
    handler(new MessageEvent('message', { data: 'INFO: 2026-08-19 10:00:00,000 source - buffered before pause' }))

    await fireEvent.click(screen.getByTitle('暂停日志流'))

    expect(recordBodies(container)).toEqual(['10:00:00,000 buffered before pause'])
    expect(mocks.removeMessageListener).toHaveBeenCalledWith('logging-moviepilot.log')
    expect(screen.getByTitle('恢复日志流')).toBeInTheDocument()

    await fireEvent.click(screen.getByTitle('恢复日志流'))
    expect(mocks.addMessageListener).toHaveBeenCalledWith('logging-moviepilot.log', handler)
    const resumedHandler = mocks.addMessageListener.mock.calls[0][1] as (event: MessageEvent) => void
    await emitAndFlush(resumedHandler, 'ERROR: 2026-08-19 10:00:01,000 source - after resume')

    expect(recordBodies(container)).toEqual(['10:00:00,000 buffered before pause', '10:00:01,000 after resume'])
    expect(screen.getByTitle('暂停日志流')).toBeInTheDocument()
  })

  it('卸载时清空尚未刷新的组件缓冲定时器', async () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')
    const { handler, unmount } = await mountReady()
    handler(new MessageEvent('message', { data: 'INFO: 2026-08-19 10:00:00,000 source - pending' }))
    const pendingTimers = vi.getTimerCount()

    expect(pendingTimers).toBeGreaterThan(0)
    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBeLessThan(pendingTimers)
  })
})
