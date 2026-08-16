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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

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

function getChart(type: string) {
  const chart = chartInputs.find(input => input.type === type)
  if (!chart) throw new Error(`Missing ${type} chart input`)
  return chart
}

function getRefreshButton() {
  const button = document.querySelector<HTMLButtonElement>('.v-card-title button')
  if (!button) throw new Error('Missing refresh button')
  return button
}

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
    expect((history.options.tooltip as { x: { formatter: (value: string) => string } }).x.formatter('2026-07-19')).toBe(
      new Date('2026-07-19').toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
      }),
    )
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
    expect(screen.getByText('无')).toBeInTheDocument()
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
    expect(screen.getByTestId('refresh-progress')).toHaveTextContent('正在刷新站点数据...')
    server.use(
      siteUserDataHandler(site.id, { data: [refreshed], success: true }, 200, () => {
        loadCount += 1
      }),
    )
    refreshRequest.resolve()

    await screen.findByText('222')
    await waitFor(() => expect(screen.queryByTestId('refresh-progress')).not.toBeInTheDocument())
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
    await waitFor(() => expect(screen.queryByTestId('refresh-progress')).not.toBeInTheDocument())
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
    expect(screen.getByText('无')).toBeInTheDocument()
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
