import SiteUserDataDialog from '@/components/dialog/SiteUserDataDialog.vue'
import type { SiteUserData } from '@/api/types'
import vuetify from '@/plugins/vuetify'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { createSite, createSiteUserData } from '@tests/support/factories/site'
import { refreshSiteUserDataHandler, siteUserDataHandler } from '@tests/support/msw/handlers/site'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { getActiveRequestsCount } from '@/utils/requestOptimizer'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { http } from 'msw'
import { apiJson } from '@tests/support/msw/response'

type ChartInput = {
  options: Record<string, unknown>
  series: { data?: unknown[]; name?: string }[]
  type: string
}

const chartInputs: ChartInput[] = []

const ApexChartStub = defineComponent({
  name: 'VApexChart',
  props: {
    options: { type: Object as PropType<Record<string, unknown>>, required: true },
    series: { type: Array as PropType<ChartInput['series']>, required: true },
    type: { type: String, required: true },
  },
  setup(props) {
    chartInputs.push(props)
    return () => h('div', { 'data-testid': `chart-${props.type}` })
  },
})

const ProgressDialogStub = defineComponent({
  name: 'ProgressDialog',
  props: { text: String },
  setup: props => () => h('div', { 'data-testid': 'refresh-progress' }, props.text),
})

const DialogCloseButtonStub = defineComponent({
  name: 'VDialogCloseBtn',
  setup:
    (_, { attrs }) =>
    () =>
      h('button', { ...attrs, 'aria-label': '关闭' }),
})

/** 创建可手动完成的请求以验证异步顺序。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

/** 通过真实 API 适配器加载站点用户数据弹窗。 */
async function renderDialog(
  initialResult: { data: SiteUserData[]; message?: string; success: boolean } = { data: [], success: true },
  status = 200,
  onRequest: () => void | Promise<void> = () => {},
) {
  const site = createSite()
  server.use(siteUserDataHandler(site.id, initialResult, status, onRequest))
  const result = await renderWithProviders(SiteUserDataDialog, {
    global: {
      stubs: {
        ProgressDialog: ProgressDialogStub,
        VApexChart: ApexChartStub,
        VDialogCloseBtn: DialogCloseButtonStub,
      },
    },
    props: { site },
  })
  return { ...result, site }
}

/** 读取图表组件接收到的生产配置与数据。 */
function getChart(type: string) {
  const chart = chartInputs.find(input => input.type === type)
  if (!chart) throw new Error(`Missing ${type} chart input`)
  return chart
}

/** 定位弹窗标题中的刷新操作。 */
function getRefreshButton() {
  const button = document.querySelector<HTMLButtonElement>('.v-card-title button')
  if (!button) throw new Error('Missing refresh button')
  return button
}

/** 定位失败提示中的重试操作。 */
function getRetryButton() {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.v-alert button')).find(element =>
    element.textContent?.includes('重试'),
  )
  if (!button) throw new Error('Missing retry button')
  return button
}

describe('SiteUserDataDialog projections', () => {
  beforeEach(() => {
    chartInputs.length = 0
    // 图表明暗断言基于浅色环境，显式固定主题避免受应用默认主题影响。
    vuetify.theme.global.name.value = 'light'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('requests a bounded history and samples large seeding charts while retaining both endpoints', async () => {
    const points = Array.from({ length: 1000 }, (_, index) => [index, index * 1024 ** 3])
    const { site } = await renderDialog({ data: [createSiteUserData({ seeding_info: points })], success: true })
    await waitFor(() => expect(getChart('scatter').series[0].data).toHaveLength(200))
    expect(getChart('scatter').series[0].data?.at(0)).toEqual([0, 0])
    expect(getChart('scatter').series[0].data?.at(-1)).toEqual([999, 999])
    expect(screen.getByText('显示最近 90 条采集记录')).toBeInTheDocument()
    expect(screen.getByText('已等距采样为 200 个点')).toBeInTheDocument()

    const requests: URL[] = []
    server.use(refreshSiteUserDataHandler(site.id, { success: true, data: {} }))
    server.use(
      http.get('http://localhost/api/v1/site/userdata/:id', ({ request }) => {
        requests.push(new URL(request.url))
        return apiJson([createSiteUserData()])
      }),
    )
    await fireEvent.click(getRefreshButton())
    await waitFor(() => expect(requests).toHaveLength(1))
    expect(Object.fromEntries(requests[0].searchParams)).toMatchObject({
      page: '1',
      count: '90',
      latest_seeding_only: 'true',
    })
  })

  it('sorts history, renders the latest record, and projects positive, negative, and zero deltas', async () => {
    const older = createSiteUserData({
      bonus: 100,
      download: 4 * 1024 ** 3,
      ratio: 1.5,
      seeding: 2,
      seeding_size: 3 * 1024 ** 3,
      updated_day: '2026-07-17',
      upload: 1024 ** 3,
      user_level: 'Old',
    })
    const latest = createSiteUserData({
      bonus: 150,
      download: 2 * 1024 ** 3,
      ratio: 1.25,
      seeding: 2,
      seeding_info: [
        [10, 2 * 1024 ** 3],
        [0, 0],
      ],
      seeding_size: 4 * 1024 ** 3,
      updated_day: '2026-07-19',
      upload: 3 * 1024 ** 3,
      user_level: 'Elite',
    })
    await renderDialog({ data: [latest, older], success: true })

    await screen.findByText('Elite')

    expect(screen.getByText('150')).toBeInTheDocument()
    expect(screen.getByText('(+50)')).toHaveClass('text-success')
    expect(screen.getByText('(-0.25)')).toHaveClass('text-error')
    expect(screen.getByText('(+0)')).not.toHaveClass('text-success', 'text-error')
    expect(screen.getByText('3.00 GB')).toBeInTheDocument()
    expect(screen.getByText('(+2.00 GB)')).toHaveClass('text-success')
    expect(screen.getByText('2.00 GB')).toBeInTheDocument()
    expect(screen.getByText('(-2.00 GB)')).toHaveClass('text-error')
    expect(document.body).toHaveTextContent('2024-01-02')

    const history = getChart('line')
    expect(history.series).toEqual([
      { data: [1, 3], name: '上传量' },
      { data: [4, 2], name: '下载量' },
    ])
    expect((history.options.xaxis as { categories: string[] }).categories).toEqual(['2026-07-17', '2026-07-19'])
    expect((history.options.theme as { mode: string }).mode).toBe('light')
    expect((history.options.chart as { background: string; foreColor: string }).background).toBeTruthy()
    const formatTooltipDate = (
      history.options.tooltip as {
        x: { formatter: (value: number, options: { dataPointIndex: number; seriesIndex: number }) => string }
      }
    ).x.formatter
    for (const [dataPointIndex, date] of ['2026-07-17', '2026-07-19'].entries()) {
      for (const seriesIndex of [0, 1]) {
        expect(formatTooltipDate(dataPointIndex + 1, { dataPointIndex, seriesIndex })).toBe(
          new Date(date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
        )
      }
    }
    expect((history.options.tooltip as { y: { formatter: (value: number) => string } }).y.formatter(1234)).toBe(
      `${(1234).toLocaleString()} GB`,
    )
    expect(
      (history.options.xaxis as { labels: { formatter: (value: string) => string } }).labels.formatter('2026-07-19'),
    ).toBe(
      new Date('2026-07-19').toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
      }),
    )
    expect((history.options.yaxis as { labels: { formatter: (value: number) => string } }).labels.formatter(1234)).toBe(
      (1234).toLocaleString(),
    )

    const seeding = getChart('scatter')
    expect(seeding.series).toEqual([
      {
        data: [
          [10, 2],
          [0, 0],
        ],
        name: '体积',
      },
    ])
    expect((seeding.options.theme as { mode: string }).mode).toBe('light')
    expect((seeding.options.tooltip as { x: { formatter: (value: number) => string } }).x.formatter(1234)).toBe(
      `数量：${(1234).toLocaleString()}`,
    )
    expect((seeding.options.tooltip as { y: { formatter: (value: number) => string } }).y.formatter(2048)).toBe(
      `${(2048).toLocaleString()} GB`,
    )
    expect((seeding.options.xaxis as { labels: { formatter: (value: number) => string } }).labels.formatter(1.6)).toBe(
      '2',
    )
    expect((seeding.options.yaxis as { labels: { formatter: (value: number) => string } }).labels.formatter(2048)).toBe(
      `${(2048).toLocaleString()} GB`,
    )
  })

  it('keeps a single in-card scatter tooltip and reserves space beside the vertical axis', async () => {
    await renderDialog({
      data: [
        createSiteUserData({
          seeding_info: [
            [2, 40 * 1024 ** 3],
            [55, 1024 ** 3],
          ],
        }),
      ],
      success: true,
    })
    await screen.findByText('Elite')
    for (const type of ['line', 'scatter']) {
      expect(getChart(type).options.xaxis).toMatchObject({ tooltip: { enabled: false } })
    }
    expect(getChart('scatter').options.tooltip).toMatchObject({
      fixed: { enabled: true, position: 'topRight', offsetX: -8, offsetY: 8 },
    })
    expect(getChart('scatter').options.grid).toMatchObject({ padding: { left: 16, right: 16, top: 8 } })
  })

  it.each([undefined, null])('shows missing latest values without invented deltas for %s', async missing => {
    const latest = Object.assign(createSiteUserData({ updated_day: '2026-07-19' }), {
      bonus: missing,
      ratio: missing,
      upload: missing,
      download: missing,
      seeding: missing,
      seeding_size: missing,
      user_level: missing,
      join_at: missing,
    })
    await renderDialog({ data: [createSiteUserData(), latest], success: true })
    await screen.findByText('用户名：site-user')
    await waitFor(() => {
      for (const value of document.querySelectorAll('.site-data-summary-card h5')) {
        expect(value).toHaveTextContent(/^无$/)
        expect(value.querySelector('span')).toBeNull()
      }
    })
  })

  it.each([
    [null, 0, '∞'],
    [undefined, 0, '∞'],
    [null, null, '无'],
    [null, 123, '无'],
    [0, 0, '0 (+0)'],
    [1.23, 0, '1.23 (+1.23)'],
  ] as const)('renders ratio %s with download %s as %s', async (ratio, download, expected) => {
    const latest = Object.assign(createSiteUserData(), { ratio, download })
    await renderDialog({ data: [latest], success: true })
    await screen.findByText('用户名：site-user')

    const value = document.querySelector('.site-data-summary-card--info h5')
    expect(value?.textContent?.replace(/\s+/g, ' ').trim()).toBe(expected)
    if (ratio == null) expect(value?.querySelector('span')).toBeNull()
  })

  it('preserves valid zeroes and displays site metadata and business errors as text', async () => {
    const latest = createSiteUserData({
      bonus: 0,
      ratio: 0,
      seeding: 0,
      upload: 0,
      download: 0,
      seeding_size: 0,
      message_unread: 0,
      updated_time: '2026-07-19 12:34:56',
      err_msg: '<b>站点登录失效</b>',
    })
    await renderDialog({ data: [latest], success: true })
    await screen.findByText('<b>站点登录失效</b>')
    const alert = document.querySelector('.site-data-error')
    expect(alert).toHaveTextContent('<b>站点登录失效</b>')
    expect(alert?.querySelector('b')).toBeNull()
    expect(screen.getByText('用户名：site-user')).toBeInTheDocument()
    expect(screen.getByText('更新时间：2026-07-19 12:34:56')).toBeInTheDocument()
    expect(screen.getByText('未读消息：0')).toBeInTheDocument()
    for (const value of document.querySelectorAll('.site-data-summary-card h5'))
      expect(value).not.toHaveTextContent('无')
    expect(screen.getAllByText('(+0)')).toHaveLength(3)
    expect(screen.getAllByText('0.00 B')).toHaveLength(3)
  })

  it('does not calculate a change from an unknown baseline', async () => {
    const older = Object.assign(createSiteUserData({ updated_day: '2026-07-17' }), { bonus: null, upload: null })
    await renderDialog({
      data: [older, createSiteUserData({ bonus: 33851545, upload: 1234.56 * 1024 ** 4 })],
      success: true,
    })
    await screen.findByText('33,851,545')
    expect(screen.queryByText('(+33,851,545)')).not.toBeInTheDocument()
    expect(screen.queryByText('(+1,234.56 TB)')).not.toBeInTheDocument()
  })

  it('uses the only record as both latest data and the baseline delta', async () => {
    const only = createSiteUserData({ bonus: 42, ratio: 0, seeding: 5, updated_day: '2026-07-18' })
    await renderDialog({ data: [only], success: true })

    await screen.findByText('42')

    expect(screen.getByText('(+42)')).toHaveClass('text-success')
    expect(screen.getByText('(+0)')).not.toHaveClass('text-success', 'text-error')
    expect(screen.getByText('(+5)')).toHaveClass('text-success')
  })

  it('normalizes missing historical counters and seeding tuple values to zero', async () => {
    const sparseRecord = () =>
      createSiteUserData({
        bonus: undefined,
        download: undefined,
        ratio: undefined,
        seeding: undefined,
        seeding_info: [[undefined, undefined]],
        seeding_size: undefined,
        updated_day: undefined,
        upload: undefined,
      })
    await renderDialog({ data: [sparseRecord(), sparseRecord()], success: true })

    await waitFor(() =>
      expect(getChart('line').series).toEqual([
        { data: [0, 0], name: '上传量' },
        { data: [0, 0], name: '下载量' },
      ]),
    )
    expect(getChart('scatter').series).toEqual([{ data: [[0, 0]], name: '体积' }])
  })

  it('keeps a legal empty response renderable without fabricated values', async () => {
    const requested = vi.fn()
    await renderDialog({ data: [], success: false }, 200, requested)

    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    await waitFor(() => expect(getActiveRequestsCount()).toBe(0))
    expect(getChart('line').series).toEqual([
      { data: [], name: '上传量' },
      { data: [], name: '下载量' },
    ])
    expect(screen.getAllByText('无')).toHaveLength(8)
    expect(getChart('scatter').series).toEqual([{ data: [], name: '体积' }])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('SiteUserDataDialog refresh and recovery', () => {
  beforeEach(() => {
    chartInputs.length = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('reloads history after a successful refresh and keeps progress until both requests finish', async () => {
    const initial = createSiteUserData({ bonus: 1 })
    const refreshed = createSiteUserData({ bonus: 222, updated_day: '2026-07-19' })
    const refreshRequest = deferred<void>()
    let loadCount = 0
    const { site } = await renderDialog({ data: [initial], success: true }, 200, () => {
      loadCount += 1
    })
    server.use(refreshSiteUserDataHandler(site.id, { data: {}, success: true }, 200, () => refreshRequest.promise))
    await screen.findByText('1')

    await fireEvent.click(getRefreshButton())
    expect(document.querySelector('.v-progress-linear[aria-label="加载中"]')).toBeInTheDocument()
    server.use(
      siteUserDataHandler(site.id, { data: [refreshed], success: true }, 200, () => {
        loadCount += 1
      }),
    )
    refreshRequest.resolve()

    await screen.findByText('222')
    await waitFor(() =>
      expect(document.querySelector('.v-progress-linear[aria-label="加载中"]')).not.toBeInTheDocument(),
    )
    expect(loadCount).toBe(2)
  })

  it.each([
    ['late success', 200, { data: [createSiteUserData({ bonus: 1 })] as SiteUserData[], success: true }],
    ['late HTTP failure', 500, { data: [] as SiteUserData[], message: 'old request failed', success: false }],
  ] as const)('ignores an initial request that settles after refreshed data on %s', async (_case, status, response) => {
    const initialRequest = deferred<void>()
    const initialRequested = vi.fn()
    const initialReleased = vi.fn()
    const refreshed = createSiteUserData({ bonus: 222, updated_day: '2026-07-19' })
    const { site } = await renderDialog(response, status, async () => {
      initialRequested()
      await initialRequest.promise
      initialReleased()
    })
    await waitFor(() => expect(initialRequested).toHaveBeenCalledOnce())
    server.use(
      refreshSiteUserDataHandler(site.id, { data: {}, success: true }),
      siteUserDataHandler(site.id, { data: [refreshed], success: true }),
    )

    await fireEvent.click(getRefreshButton())
    await screen.findByText('222')

    initialRequest.resolve()
    await waitFor(() => expect(initialReleased).toHaveBeenCalledOnce())
    await waitFor(() => expect(getActiveRequestsCount()).toBe(0))
    await flushPromises()
    expect(screen.getByText('222')).toBeInTheDocument()
    expect(screen.queryByText('1')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps a refresh failure visible when the initial request settles afterwards', async () => {
    const initialRequest = deferred<void>()
    const initialRequested = vi.fn()
    const initialReleased = vi.fn()
    const refreshRequested = vi.fn()
    const { site } = await renderDialog({ data: [createSiteUserData({ bonus: 1 })], success: true }, 200, async () => {
      initialRequested()
      await initialRequest.promise
      initialReleased()
    })
    await waitFor(() => expect(initialRequested).toHaveBeenCalledOnce())
    server.use(
      refreshSiteUserDataHandler(
        site.id,
        { data: {}, message: '站点不支持刷新', success: false },
        200,
        refreshRequested,
      ),
    )

    await fireEvent.click(getRefreshButton())
    expect(await screen.findByText(/刷新站点数据失败/)).toBeInTheDocument()

    initialRequest.resolve()
    await waitFor(() => expect(initialReleased).toHaveBeenCalledOnce())
    await waitFor(() => expect(getActiveRequestsCount()).toBe(0))
    await flushPromises()

    expect(screen.getByText(/刷新站点数据失败/)).toBeInTheDocument()
    expect(refreshRequested).toHaveBeenCalledOnce()

    server.use(refreshSiteUserDataHandler(site.id, { data: {}, success: true }, 200, refreshRequested))
    await fireEvent.click(getRetryButton())

    await waitFor(() => expect(refreshRequested).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText(/刷新站点数据失败/)).not.toBeInTheDocument())
  })

  it.each([
    ['business failure', 200, { data: {}, message: '站点不支持刷新', success: false }],
    ['HTTP failure', 500, { data: {}, message: 'server down', success: false }],
  ] as const)('ends progress and exposes a retry after refresh %s', async (_case, status, response) => {
    const refreshRequested = vi.fn()
    const { site } = await renderDialog({ data: [createSiteUserData()], success: true })
    server.use(refreshSiteUserDataHandler(site.id, response, status, refreshRequested))
    await screen.findByText('Elite')

    await fireEvent.click(getRefreshButton())

    await waitFor(() => expect(refreshRequested).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(document.querySelector('.v-progress-linear[aria-label="加载中"]')).not.toBeInTheDocument(),
    )
    expect(await screen.findByText(/刷新站点数据失败/)).toBeInTheDocument()
    expect(getRetryButton()).toBeInTheDocument()

    server.use(refreshSiteUserDataHandler(site.id, { data: {}, success: true }, 200, refreshRequested))
    await fireEvent.click(getRetryButton())

    await waitFor(() => expect(refreshRequested).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText(/刷新站点数据失败/)).not.toBeInTheDocument())
  })

  it('distinguishes initial HTTP failure from empty data and retries the same site', async () => {
    let attempt = 0
    const { site } = await renderDialog({ data: [], success: false }, 500, () => {
      attempt += 1
    })

    expect(await screen.findByText(/加载站点数据失败/)).toBeInTheDocument()
    server.use(
      siteUserDataHandler(site.id, { data: [createSiteUserData({ bonus: 88 })], success: true }, 200, () => {
        attempt += 1
      }),
    )
    await fireEvent.click(getRetryButton())

    await screen.findByText('88')
    expect(attempt).toBe(2)
    expect(screen.queryByText(/加载站点数据失败/)).not.toBeInTheDocument()
  })

  it('clears an initial HTTP error when retry returns the legal empty state', async () => {
    const { site } = await renderDialog({ data: [], success: false }, 500)
    expect(await screen.findByText(/加载站点数据失败/)).toBeInTheDocument()
    server.use(siteUserDataHandler(site.id, { data: [], success: true }))

    await fireEvent.click(getRetryButton())

    await waitFor(() => expect(getActiveRequestsCount()).toBe(0))
    await waitFor(() => expect(screen.queryByText(/加载站点数据失败/)).not.toBeInTheDocument())
    expect(screen.getAllByText('无')).toHaveLength(8)
  })

  it('emits close without mutating loaded user data', async () => {
    const { emitted } = await renderDialog({ data: [createSiteUserData()], success: true })
    await screen.findByText('Elite')

    const closeButton = document.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')
    if (!closeButton) throw new Error('Missing close button')
    await fireEvent.click(closeButton)

    expect(emitted('close')).toHaveLength(1)
    expect(screen.getByText('Elite')).toBeInTheDocument()
  })
})
