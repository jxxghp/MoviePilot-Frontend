import type { DashboardSystemInfo as DashboardSystemInfoData, SystemUpdateStatus } from '@/api/types'
import DashboardSystemInfo from '@/views/dashboard/DashboardSystemInfo.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  checkStatus: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

const checking = ref(false)

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useDataRefresh: (_id: string, callback: () => Promise<void>) => {
      void callback()
      return { loading: ref(false) }
    },
  }),
}))

vi.mock('@/composables/useSystemUpdateStatus', () => ({
  useSystemUpdateStatus: () => ({ checking, checkStatus: mocks.checkStatus }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

const systemInfo: DashboardSystemInfoData = {
  hostname: 'moviepilot',
  operating_system: 'Linux',
  runtime: 3600,
  version: 'v3.0.0',
}

/** 构造主动检查接口的最小聚合状态。 */
function updateStatus(state: SystemUpdateStatus['state']): SystemUpdateStatus {
  return {
    state,
    current_version: 'v3.0.0',
    version: state === 'available' ? 'v3.1.0' : null,
    frontend_version: null,
    downloaded_bytes: 0,
    total_bytes: 0,
    progress: 0,
    can_update: state === 'available',
    can_install: false,
  }
}

describe('DashboardSystemInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checking.value = false
    mocks.apiGet.mockResolvedValue(systemInfo)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('checks updates through the structured endpoint and reports an available version', async () => {
    mocks.checkStatus.mockResolvedValue(updateStatus('available'))
    await renderWithProviders(DashboardSystemInfo)

    await fireEvent.click(await screen.findByRole('button', { name: '检查更新' }))

    await waitFor(() => expect(mocks.checkStatus).toHaveBeenCalledOnce())
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已发现可用更新')
  })

  it('reports the up-to-date state without opening a second update surface', async () => {
    mocks.checkStatus.mockResolvedValue(updateStatus('idle'))
    await renderWithProviders(DashboardSystemInfo)

    await fireEvent.click(await screen.findByRole('button', { name: '检查更新' }))

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('当前已是最新版本'))
  })

  it('reports a failed check and remains retryable', async () => {
    mocks.checkStatus.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(updateStatus('idle'))
    await renderWithProviders(DashboardSystemInfo)
    const button = await screen.findByRole('button', { name: '检查更新' })

    await fireEvent.click(button)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('检查更新失败，请稍后重试'))
    await fireEvent.click(button)

    await waitFor(() => expect(mocks.checkStatus).toHaveBeenCalledTimes(2))
  })
})
