import InitializePage from '@/pages/initialize.vue'
import { renderWithProviders } from '@tests/support/render'
import { screen } from '@testing-library/vue'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  api: { post: vi.fn() },
  getApiBusinessErrorMessage: vi.fn(),
  getInitializationState: vi.fn(),
  markInitialized: vi.fn(),
  router: { replace: vi.fn() },
  toast: { success: vi.fn() },
}))

vi.mock('@/api', () => ({
  default: mocks.api,
  getApiBusinessErrorMessage: mocks.getApiBusinessErrorMessage,
}))

vi.mock('@/router', () => ({
  default: mocks.router,
}))

vi.mock('@/utils/initialization', () => ({
  getInitializationState: mocks.getInitializationState,
  markInitialized: mocks.markInitialized,
}))

vi.mock('vue-toastification', () => ({
  useToast: () => mocks.toast,
}))

describe('initialization page', () => {
  beforeEach(() => {
    mocks.getInitializationState.mockReset()
    mocks.router.replace.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for the backend and retries before enabling the form', async () => {
    vi.useFakeTimers()
    mocks.getInitializationState.mockRejectedValueOnce(new Error('service starting')).mockResolvedValueOnce(false)

    await renderWithProviders(InitializePage)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    expect(screen.getByText('服务正在启动，稍后将自动重试…')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '超级管理员用户名' })).toBeDisabled()

    await vi.advanceTimersByTimeAsync(1500)
    await nextTick()

    expect(mocks.getInitializationState).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('服务正在启动，稍后将自动重试…')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '超级管理员用户名' })).toBeEnabled()
  })
})
