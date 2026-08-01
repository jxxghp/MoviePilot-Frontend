import DashboardRecentImports from '@/views/dashboard/DashboardRecentImports.vue'
import { renderWithProviders } from '@tests/support/render'
import { screen } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

describe('dashboard recent imports', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('exposes the rendered list as a layout size source', async () => {
    mocks.apiGet.mockResolvedValue({
      data: {
        list: [{ id: 1, title: '异步入库记录' }],
      },
    })

    const { container } = await renderWithProviders(DashboardRecentImports)

    const renderedItem = await screen.findByText('异步入库记录')
    expect(container.querySelector('[data-layout-size-source]')).toContainElement(renderedItem)
  })
})
