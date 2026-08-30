import AnalyticsWeeklyOverview from '@/views/dashboard/AnalyticsWeeklyOverview.vue'
import { renderWithProviders } from '@tests/support/render'
import { screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, onMounted, watch } from 'vue'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
  }),
}))

const ApexChartStub = defineComponent({
  props: { series: { type: Array, required: true } },
  emits: ['mounted', 'updated'],
  setup(props, { emit }) {
    onMounted(() => emit('mounted'))
    watch(
      () => props.series,
      () => emit('updated'),
    )

    return () => h('div', { 'data-testid': 'weekly-chart' })
  },
})

describe('analytics weekly overview', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('activates its layout size source after weekly data reaches the rendered chart', async () => {
    mocks.apiGet.mockResolvedValue([1, 2, 3, 4, 5, 6, 7])

    const { container } = await renderWithProviders(AnalyticsWeeklyOverview, {
      global: { stubs: { VApexChart: ApexChartStub } },
    })

    await waitFor(() => {
      expect(container.querySelector('.dashboard-work-content')).toHaveAttribute('data-layout-size-source')
    })
    expect(container.querySelector('.dashboard-work-chart')).toHaveClass('dashboard-chart-plot')
    expect(mocks.apiGet).toHaveBeenCalledWith('dashboard/transfer')
  })

  it('recreates the chart after the dashboard becomes active while retaining card state', async () => {
    mocks.apiGet.mockResolvedValue([1, 2, 3, 4, 5, 6, 7])

    const view = await renderWithProviders(AnalyticsWeeklyOverview, {
      props: { allowRefresh: false },
      global: { stubs: { VApexChart: ApexChartStub } },
    })

    expect(screen.queryByTestId('weekly-chart')).not.toBeInTheDocument()

    await view.rerender({ allowRefresh: true })

    expect(await screen.findByTestId('weekly-chart')).toBeInTheDocument()
    await waitFor(() => {
      expect(view.container.querySelector('.dashboard-work-content')).toHaveAttribute('data-layout-size-source')
    })
  })
})
