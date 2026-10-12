import SubscribeActivityDialog from '@/components/dialog/SubscribeActivityDialog.vue'
import type { SubscriptionActivityEvent } from '@/api/types'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { createSubscribe } from '@tests/support/factories/subscribe'
import { renderWithProviders } from '@tests/support/render'
import { server } from '@tests/support/msw/server'
import { apiJson } from '@tests/support/msw/response'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

/** 隔离运行日志流连接，仍通过真实原有日志弹窗确认辅助入口。 */
vi.mock('@/views/system/LoggingView.vue', () => ({
  __esModule: true,
  default: { props: ['streamUrl'], template: '<div data-testid="runtime-source">{{ streamUrl }}</div>' },
}))

const activityUrl = 'http://localhost/api/v1/subscribe/17/activity'

/** 构造正常无结果的业务事实，概要和资源原因分别保留。 */
function refreshEvent(overrides: Partial<SubscriptionActivityEvent> = {}): SubscriptionActivityEvent {
  return {
    event_id: 'refresh-1',
    kind: 'refresh',
    source: 'automatic',
    status: 'empty',
    started_at: '2026-10-12T02:15:00Z',
    finished_at: '2026-10-12T02:15:20Z',
    counts: { sites: 6, discovered: 86, related: 3, qualified: 0, submitted: 0 },
    details: {
      rules: { resolution: '2160p' },
      resources: [
        {
          title: 'Example.S01E09.720p.WEB-DL',
          site: '站点 A',
          decision: 'rejected',
          reason: '分辨率 720p 不符合 2160p 条件',
        },
      ],
      sites: [{ id: 1, name: '站点 A', candidates: 86, status: 'checked' }],
    },
    ...overrides,
  }
}

/** 使用真实 API 响应协议与 UI 插件挂载活动弹窗。 */
async function renderActivity(history = false, width = 1436) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width })
  window.dispatchEvent(new Event('resize'))
  server.use(
    http.get('http://localhost/api/v1/subscribe/files/17', () =>
      apiJson({
        subscribe: createSubscribe({ id: 17 }),
        episodes: { 1: { library: [{}] }, 2: { download: [{}] } },
      }),
    ),
  )
  return renderWithProviders(SubscribeActivityDialog, {
    global: {
      stubs: {
        VDialogCloseBtn: {
          template: '<button aria-label="关闭运行日志" @click="$emit(\'update:modelValue\', false)">×</button>',
        },
      },
    },
    props: {
      subscription: createSubscribe({
        id: 17,
        name: '星海回声',
        type: '电视剧',
        season: 1,
        total_episode: 12,
        completed_episode: 8,
      }),
      history,
    },
  })
}

describe('SubscribeActivityDialog', () => {
  it.each([1436, 390])('shows business decisions and accurate library progress at %s px', async width => {
    server.use(http.get(activityUrl, () => apiJson({ items: [refreshEvent()], next_cursor: null })))
    const { unmount } = await renderActivity(false, width)
    expect(await screen.findByText('已入库 1 / 12 集')).toBeInTheDocument()
    expect(await screen.findByText('为什么没有下载')).toBeInTheDocument()
    expect(screen.getByText('分辨率 720p 不符合 2160p 条件')).toBeInTheDocument()
    expect(screen.getByText(/86 项为共享候选，其中 3 项与此订阅相关/)).toBeInTheDocument()
    expect(screen.getByText('无可下载资源').closest('.activity-status')).toHaveClass('activity-status--neutral')
    expect(document.querySelector('.v-dialog')?.classList.contains('v-dialog--fullscreen')).toBe(width < 960)
    await fireEvent.click(screen.getByRole('button', { name: /站点处理详情/ }))
    expect(await screen.findByText('已检查候选')).toBeInTheDocument()
    await fireEvent.click(screen.getByText('本轮订阅条件（执行时快照）'))
    expect(screen.getByText('2160p')).toBeInTheDocument()
    unmount()
  })

  it('keeps waiting distinct from failures and preserves the runtime log entry', async () => {
    server.use(
      http.get(activityUrl, () =>
        apiJson({
          items: [
            refreshEvent({
              event_id: 'search-1',
              kind: 'search',
              status: 'waiting',
              details: { retry_at: '2026-10-12T02:50:00Z' },
              counts: { requested_sites: 7, sites: 8, discovered: 32, qualified: 4, submitted: 1, failed_sites: 1 },
            }),
          ],
          next_cursor: null,
        }),
      ),
    )
    await renderActivity()
    expect(await screen.findByText('等待继续')).toBeInTheDocument()
    expect(screen.getByText(/已请求 7 \/ 8 个站点/)).toBeInTheDocument()
    expect(screen.getByText('1 个站点请求未成功，详情中保留各站点结果')).toBeInTheDocument()
    expect(screen.getByText('等待继续').closest('.activity-status')).toHaveClass('activity-status--warning')
    await fireEvent.click(screen.getByRole('button', { name: /运行日志/ }))
    expect(await screen.findByTestId('runtime-source')).toHaveTextContent('/api/v1/subscribe/17/logs')
  })

  it('paginates without duplicating the expanded round', async () => {
    const cursors: (string | null)[] = []
    server.use(
      http.get(activityUrl, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('before')
        cursors.push(cursor)
        return apiJson({
          items: cursor
            ? [refreshEvent(), refreshEvent({ event_id: 'older', kind: 'created', details: {}, counts: {} })]
            : [refreshEvent()],
          next_cursor: cursor ? null : 'refresh-1',
        })
      }),
    )
    await renderActivity()
    await fireEvent.click(await screen.findByRole('button', { name: '加载更多' }))
    expect(await screen.findByText('新建订阅')).toBeInTheDocument()
    expect(screen.getAllByText('为什么没有下载')).toHaveLength(1)
    expect(cursors).toEqual([null, 'refresh-1'])
  })

  it('supports errors, retry, all-time empty state and history permissions', async () => {
    const requests: URL[] = []
    let fail = true
    server.use(
      http.get(activityUrl, ({ request }) => {
        requests.push(new URL(request.url))
        if (fail) return HttpResponse.json({ detail: 'Unavailable' }, { status: 503 })
        return apiJson({ items: [], next_cursor: null })
      }),
    )
    await renderActivity(true)
    expect(await screen.findByText('活动加载失败，请重试')).toBeInTheDocument()
    fail = false
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('当前范围内还没有订阅活动')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /运行日志/ })).toBeDisabled()
    await fireEvent.click(screen.getByRole('button', { name: '全部时间' }))
    await waitFor(() => expect(requests.at(-1)?.searchParams.has('days')).toBe(false))
    expect(requests.at(-1)?.searchParams.get('history')).toBe('true')
  })

  it('uses explicit change values and closes through the documented event', async () => {
    server.use(
      http.get(activityUrl, () =>
        apiJson({
          items: [
            refreshEvent({
              kind: 'updated',
              counts: {},
              details: { changes: [{ field: 'resolution', before: '1080p', after: '2160p' }] },
            }),
          ],
          next_cursor: null,
        }),
      ),
    )
    const { emitted } = await renderActivity()
    expect(await screen.findByText('分辨率：1080p → 2160p')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(emitted('close')).toHaveLength(1)
  })
})

it('loads details only on expansion and retries a detail failure without losing the summary', async () => {
  let calls = 0
  const event = refreshEvent({ details_loaded: false, details: {} })
  server.use(
    http.get(activityUrl, () => apiJson({ items: [event], next_cursor: null })),
    http.get(`${activityUrl}/refresh-1`, () => {
      calls += 1
      return calls === 1 ? new HttpResponse(null, { status: 503 }) : apiJson(refreshEvent())
    }),
  )
  await renderActivity()
  expect(await screen.findByText('详情加载失败，请重试')).toBeInTheDocument()
  expect(screen.getByText(/86 项共享候选/)).toBeInTheDocument()
  await fireEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(await screen.findByText('分辨率 720p 不符合 2160p 条件')).toBeInTheDocument()
  expect(calls).toBe(2)
  await fireEvent.click(screen.getByRole('button', { name: /10:15 刷新匹配/ }))
  await fireEvent.click(screen.getByRole('button', { name: /10:15 刷新匹配/ }))
  expect(calls).toBe(2)
})

it('explains a queued search and refreshes its terminal state without collapsing details', async () => {
  let completed = false
  server.use(
    http.get(activityUrl, () =>
      apiJson({
        items: [
          refreshEvent({
            event_id: 'queued',
            kind: 'search',
            status: completed ? 'completed' : 'waiting',
            counts: completed ? { submitted: 1, related: 1, qualified: 1 } : {},
            details: completed ? {} : { phase: 'queued', retry_at: '2026-10-12T02:50:00Z' },
          }),
        ],
        next_cursor: null,
      }),
    ),
  )
  const intervals = vi.spyOn(globalThis, 'setInterval')
  const { unmount } = await renderActivity()
  expect(await screen.findByText('已安排搜索')).toBeInTheDocument()
  expect(screen.getByText('搜索请求已安排，系统会按顺序处理')).toBeInTheDocument()
  expect(screen.queryByText(/已请求 0 \/ 0/)).not.toBeInTheDocument()
  await fireEvent.click(screen.getByRole('button', { name: /10:15 订阅搜索/ }))
  expect(await screen.findByText('搜索已安排，等待开始处理')).toBeInTheDocument()
  completed = true
  const interval = intervals.mock.calls.find(([, delay]) => delay === 15_000)?.[0]
  expect(typeof interval).toBe('function')
  if (typeof interval === 'function') interval()
  expect(await screen.findByText('已成功提交 1 项资源到下载器')).toBeInTheDocument()
  expect(screen.getByText('本轮处理结果')).toBeInTheDocument()
  unmount()
  intervals.mockRestore()
})

it.each([
  ['N', '未开始'],
  ['R', '订阅中'],
  ['S', '已暂停'],
  ['P', '待定中'],
])('uses the existing subscription meaning for state %s', async (state, label) => {
  server.use(
    http.get(activityUrl, () =>
      apiJson({
        items: [
          refreshEvent({
            kind: 'status',
            counts: {},
            details: { changes: [{ field: 'state', before: null, after: state }] },
          }),
        ],
        next_cursor: null,
      }),
    ),
  )
  await renderActivity()
  expect(await screen.findByText(`状态：未设置 → ${label}`)).toBeInTheDocument()
})

it('keeps expanded details during unchanged summary polling', async () => {
  let details = 0
  let summaries = 0
  server.use(
    http.get(activityUrl, () => {
      summaries += 1
      return apiJson({ items: [refreshEvent({ details_loaded: false, details: {} })], next_cursor: null })
    }),
    http.get(`${activityUrl}/refresh-1`, () => {
      details += 1
      return apiJson(refreshEvent())
    }),
  )
  const intervals = vi.spyOn(globalThis, 'setInterval')
  const { unmount } = await renderActivity()
  expect(await screen.findByText('分辨率 720p 不符合 2160p 条件')).toBeInTheDocument()
  const interval = intervals.mock.calls.find(([, delay]) => delay === 15_000)?.[0]
  if (typeof interval === 'function') interval()
  await waitFor(() => expect(summaries).toBe(2))
  await waitFor(() => expect(document.querySelector('.activity-scroll')).toHaveAttribute('aria-busy', 'false'))
  expect(screen.getByText('分辨率 720p 不符合 2160p 条件')).toBeInTheDocument()
  expect(document.querySelector('.activity-detail .activity-empty')).toBeNull()
  expect(details).toBe(1)
  unmount()
  intervals.mockRestore()
})
