import DashboardRender from '@/components/render/DashboardRender.vue'
import { renderWithProviders } from '@tests/support/render'
import { screen } from '@testing-library/vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'

const ApexChartStub = defineComponent({
  name: 'VApexChart',
  setup: () => () => h('div', { 'data-testid': 'plugin-chart' }),
})

describe('DashboardRender', () => {
  it('recreates nested plugin charts across dashboard activation without removing surrounding content', async () => {
    const view = await renderWithProviders(DashboardRender, {
      props: {
        active: true,
        config: {
          component: 'VRow',
          content: [
            { component: 'VCol', content: [{ component: 'VApexChart' }] },
            { component: 'VCol', text: '保留的插件内容' },
          ],
        },
      },
      global: { stubs: { VApexChart: ApexChartStub } },
    })

    expect(screen.getByTestId('plugin-chart')).toBeInTheDocument()
    expect(screen.getByText('保留的插件内容')).toBeInTheDocument()

    await view.rerender({ active: false })

    expect(screen.queryByTestId('plugin-chart')).not.toBeInTheDocument()
    expect(screen.getByText('保留的插件内容')).toBeInTheDocument()

    await view.rerender({ active: true })

    expect(screen.getByTestId('plugin-chart')).toBeInTheDocument()
  })
})
