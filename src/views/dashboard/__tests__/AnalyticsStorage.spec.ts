import AnalyticsStorage from '@/views/dashboard/AnalyticsStorage.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
  }),
}))

vi.mock('@/composables/useDashboardMotion', async importOriginal => {
  const actual = await importOriginal<typeof import('@/composables/useDashboardMotion')>()

  return {
    ...actual,
    useAnimatedDashboardNumber: (source: { value: number }) => source,
  }
})

const KeepAliveHarness = defineComponent({
  components: { AnalyticsStorage },
  setup() {
    const active = ref(true)

    return { active }
  },
  template: `
    <button type="button" @click="active = false">停用存储卡片</button>
    <button type="button" @click="active = true">启用存储卡片</button>
    <KeepAlive><AnalyticsStorage v-if="active" /></KeepAlive>
  `,
})

describe('analytics storage', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('normalizes numeric API values and renders total, used percent and available storage', async () => {
    mocks.apiGet.mockResolvedValue({
      data: {
        total_storage: String(2 * 1024 ** 3),
        used_storage: String(512 * 1024 ** 2),
      },
    })

    await renderWithProviders(AnalyticsStorage)

    expect(await screen.findByText('2.00 GB')).toBeInTheDocument()
    expect(screen.getByText('已使用 25.0%')).toBeInTheDocument()
    expect(screen.getByText('可用 1.50 GB / 总容量 2.00 GB')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledOnce()
    expect(mocks.apiGet).toHaveBeenCalledWith('dashboard/storage')
  })

  it('falls back to zero for invalid or null API values', async () => {
    mocks.apiGet.mockResolvedValue({
      data: {
        total_storage: 'invalid',
        used_storage: null,
      },
    })

    await renderWithProviders(AnalyticsStorage)

    expect(await screen.findByText('已使用 0.0%')).toBeInTheDocument()
    expect(screen.getByText('可用 0.00 B / 总容量 0.00 B')).toBeInTheDocument()
  })

  it('clamps over-capacity usage to 100 percent and never shows negative available storage', async () => {
    mocks.apiGet.mockResolvedValue({
      data: {
        total_storage: 1024,
        used_storage: 2048,
      },
    })

    await renderWithProviders(AnalyticsStorage)

    expect(await screen.findByText('已使用 100.0%')).toBeInTheDocument()
    expect(screen.getByText('可用 0.00 B / 总容量 1.00 KB')).toBeInTheDocument()
  })

  it('keeps the default values when the request fails', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.apiGet.mockRejectedValue(new Error('remote unavailable'))

    await renderWithProviders(AnalyticsStorage)

    await waitFor(() => expect(consoleLog).toHaveBeenCalledOnce())
    expect(screen.getByText('0.00 B')).toBeInTheDocument()
    expect(screen.getByText('已使用 0.0%')).toBeInTheDocument()
    expect(screen.getByText('可用 0.00 B / 总容量 0.00 B')).toBeInTheDocument()
  })

  it('loads once initially and refreshes once after KeepAlive reactivation', async () => {
    mocks.apiGet.mockResolvedValue({
      data: {
        total_storage: 1024,
        used_storage: 512,
      },
    })

    await renderWithProviders(KeepAliveHarness)

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledOnce())
    await fireEvent.click(screen.getByRole('button', { name: '停用存储卡片' }))
    await fireEvent.click(screen.getByRole('button', { name: '启用存储卡片' }))

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(2))
  })
})
