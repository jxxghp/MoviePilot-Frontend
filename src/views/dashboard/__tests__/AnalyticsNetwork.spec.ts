import AnalyticsNetwork from '@/views/dashboard/AnalyticsNetwork.vue'
import { renderWithProviders } from '@tests/support/render'
import { screen, waitFor } from '@testing-library/vue'
import { defineComponent, h, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface NetworkSeries {
  name: string
  data: number[]
}

interface NetworkChartOptions {
  yaxis: {
    labels: {
      formatter: (value: number) => string
    }
  }
}

interface RefreshRegistration {
  id: string
  callback: () => Promise<void>
  interval: number
  immediate: boolean
  refresh: ReturnType<typeof vi.fn<() => Promise<void>>>
}

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  chartOptions: undefined as NetworkChartOptions | undefined,
  keepAliveHandler: undefined as (() => Promise<void>) | undefined,
  refreshRegistrations: [] as RefreshRegistration[],
}))

vi.mock('@/api', () => ({
  default: { get: (...args: unknown[]) => mocks.apiGet(...args) },
}))

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useDataRefresh: (id: string, callback: () => Promise<void>, interval: number, immediate: boolean) => {
      const refresh = vi.fn(callback)
      mocks.refreshRegistrations.push({ id, callback, interval, immediate, refresh })

      return { loading: { value: false }, refresh, stop: vi.fn() }
    },
  }),
}))

vi.mock('@/composables/useKeepAliveRefresh', () => ({
  useKeepAliveRefresh: (handler: () => Promise<void>) => {
    mocks.keepAliveHandler = handler
    return { refresh: handler }
  },
}))

vi.mock('@/composables/useDashboardMotion', async importOriginal => {
  const actual = await importOriginal<typeof import('@/composables/useDashboardMotion')>()
  return {
    ...actual,
    useAnimatedDashboardNumber: (source: { value: number }) => source,
  }
})

const ApexChartStub = defineComponent({
  name: 'VApexChart',
  props: {
    height: String,
    options: {
      type: Object as PropType<NetworkChartOptions>,
      required: true,
    },
    series: {
      type: Array as PropType<NetworkSeries[]>,
      required: true,
    },
    type: String,
  },
  setup: props => () => {
    mocks.chartOptions = props.options

    return h('div', {
      'data-testid': 'network-series',
      'data-series': JSON.stringify(props.series),
    })
  },
})

function getRefreshRegistration() {
  const registration = mocks.refreshRegistrations[0]
  if (!registration) throw new Error('未注册网络状态刷新任务')
  return registration
}

function getSeries() {
  const serialized = screen.getByTestId('network-series').getAttribute('data-series')
  if (!serialized) throw new Error('图表测试探针未收到序列数据')
  return JSON.parse(serialized) as NetworkSeries[]
}

async function renderNetwork(props: { allowRefresh?: boolean } = {}) {
  return renderWithProviders(AnalyticsNetwork, {
    props,
    global: {
      stubs: { VApexChart: ApexChartStub },
    },
  })
}

describe('AnalyticsNetwork', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.chartOptions = undefined
    mocks.keepAliveHandler = undefined
    mocks.refreshRegistrations.length = 0
  })

  it('registers the expected refresh policy and skips reads when refresh is disabled', async () => {
    await renderNetwork({ allowRefresh: false })

    const registration = getRefreshRegistration()
    expect(registration).toMatchObject({
      id: 'dashboard-network',
      interval: 2000,
      immediate: true,
    })
    expect(mocks.keepAliveHandler).toBe(registration.refresh)

    await registration.refresh()

    expect(mocks.apiGet).not.toHaveBeenCalled()
    expect(getSeries().map(item => item.data)).toEqual([[0], [0]])
  })

  it('normalizes rates and updates current values and series through refresh and KeepAlive', async () => {
    mocks.apiGet.mockResolvedValueOnce(['2048', 'not-a-number']).mockResolvedValueOnce([3072, 1024 ** 2])
    await renderNetwork()

    const registration = getRefreshRegistration()
    await registration.refresh()

    expect(mocks.apiGet).toHaveBeenNthCalledWith(1, 'dashboard/network', {
      feedback: 'silent',
      skipNavigationCancellation: true,
    })
    await waitFor(() => {
      expect(screen.getByText(/上行 2\.00 KB\/s/)).toBeInTheDocument()
      expect(screen.getByText(/下行 0\.00 B\/s/)).toBeInTheDocument()
      expect(mocks.chartOptions?.yaxis.labels.formatter(1024)).toContain('KB/s')
      expect(getSeries().map(item => item.data)).toEqual([
        [0, 2048],
        [0, 0],
      ])
    })

    if (!mocks.keepAliveHandler) throw new Error('未注册 KeepAlive 刷新回调')
    await mocks.keepAliveHandler()

    expect(mocks.apiGet).toHaveBeenNthCalledWith(2, 'dashboard/network', {
      feedback: 'silent',
      skipNavigationCancellation: true,
    })
    await waitFor(() => {
      expect(screen.getByText(/上行 3\.00 KB\/s/)).toBeInTheDocument()
      expect(screen.getByText(/下行 1\.00 MB\/s/)).toBeInTheDocument()
      expect(getSeries().map(item => item.data)).toEqual([
        [0, 2048, 3072],
        [0, 0, 1024 ** 2],
      ])
    })
  })

  it('keeps only the latest 30 samples in both network series', async () => {
    let sample = 0
    mocks.apiGet.mockImplementation(async () => {
      sample += 1
      return [sample, sample * 10]
    })
    await renderNetwork()

    const { refresh } = getRefreshRegistration()
    for (let index = 0; index < 30; index += 1) await refresh()

    await waitFor(() => {
      const [upload, download] = getSeries()
      expect(upload.data).toHaveLength(30)
      expect(download.data).toHaveLength(30)
      expect(upload.data).toEqual(Array.from({ length: 30 }, (_, index) => index + 1))
      expect(download.data).toEqual(Array.from({ length: 30 }, (_, index) => (index + 1) * 10))
    })
  })

  it('preserves the last successful rates and series when a refresh fails', async () => {
    const error = new Error('network usage unavailable')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.apiGet.mockResolvedValueOnce([1024, 2048]).mockRejectedValueOnce(error)
    await renderNetwork()

    const { refresh } = getRefreshRegistration()
    await refresh()
    await refresh()

    await waitFor(() => {
      expect(screen.getByText(/上行 1\.00 KB\/s/)).toBeInTheDocument()
      expect(screen.getByText(/下行 2\.00 KB\/s/)).toBeInTheDocument()
      expect(getSeries().map(item => item.data)).toEqual([
        [0, 1024],
        [0, 2048],
      ])
    })
  })
})
