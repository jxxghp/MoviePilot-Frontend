import InitializePage from '@/pages/initialize.vue'
import { renderWithProviders } from '@tests/support/render'
import { screen } from '@testing-library/vue'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  api: { post: vi.fn() },
  getApiBusinessErrorMessage: vi.fn(),
  getInitializationStatus: vi.fn(),
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
  getInitializationStatus: mocks.getInitializationStatus,
  markInitialized: mocks.markInitialized,
}))

vi.mock('vue-toastification', () => ({
  useToast: () => mocks.toast,
}))

describe('initialization page', () => {
  beforeEach(() => {
    mocks.getInitializationStatus.mockReset()
    mocks.router.replace.mockReset()
  })

  it('moves service availability checks to the dedicated status page', async () => {
    mocks.getInitializationStatus.mockRejectedValue(new Error('service starting'))

    await renderWithProviders(InitializePage)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    expect(mocks.getInitializationStatus).toHaveBeenCalledOnce()
    expect(mocks.router.replace).toHaveBeenCalledWith('/service-status')
    expect(screen.getByRole('textbox', { name: '超级管理员用户名' })).toBeDisabled()
  })

  it('locks the username configured by the deployment before setup', async () => {
    mocks.getInitializationStatus.mockResolvedValue({
      initialized: false,
      configuredUsername: 'configured-admin',
    })

    await renderWithProviders(InitializePage)
    await nextTick()
    await Promise.resolve()
    await nextTick()

    const username = screen.getByRole('textbox', { name: '超级管理员用户名' })
    expect(username).toHaveValue('configured-admin')
    expect(username).toHaveAttribute('readonly')
  })
})
