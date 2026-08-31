import ServiceStatusPage from '@/pages/service-status.vue'
import { renderWithProviders } from '@tests/support/render'
import { screen } from '@testing-library/vue'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getInitializationState: vi.fn(),
  router: { replace: vi.fn() },
}))

vi.mock('@/router', () => ({
  default: mocks.router,
}))

vi.mock('@/utils/initialization', () => ({
  getInitializationState: mocks.getInitializationState,
}))

describe('service status page', () => {
  beforeEach(() => {
    mocks.getInitializationState.mockReset()
    mocks.router.replace.mockReset()
  })

  it('keeps checking until the initialized service becomes available', async () => {
    vi.useFakeTimers()
    mocks.getInitializationState.mockRejectedValueOnce(new Error('service starting')).mockResolvedValueOnce(true)

    await renderWithProviders(ServiceStatusPage)
    await nextTick()
    await Promise.resolve()

    expect(screen.getByRole('heading', { name: 'MoviePilot 正在启动' })).toBeInTheDocument()
    expect(screen.getByText('正在等待后端服务就绪，这不会影响你的账号和已有数据。')).toBeInTheDocument()
    expect(mocks.router.replace).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1500)
    await nextTick()

    expect(mocks.getInitializationState).toHaveBeenCalledTimes(2)
    expect(mocks.router.replace).toHaveBeenCalledWith('/login')
  })

  it('opens initialization only after the service confirms there is no user', async () => {
    mocks.getInitializationState.mockResolvedValue(false)

    await renderWithProviders(ServiceStatusPage)
    await nextTick()
    await Promise.resolve()

    expect(mocks.router.replace).toHaveBeenCalledWith('/initialize')
  })
})
