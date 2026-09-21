import GithubTokenPrompt from '@/components/github/GithubTokenPrompt.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  getApiBusinessErrorMessage: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: { get: mocks.apiGet },
  getApiBusinessErrorMessage: mocks.getApiBusinessErrorMessage,
}))

describe('GithubTokenPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    mocks.apiGet.mockReset()
    mocks.getApiBusinessErrorMessage.mockReset()
    mocks.apiGet.mockResolvedValue({
      configured: false,
      valid: null,
      source: null,
      login: null,
      masked_token: null,
      expires_at: null,
      needs_reauthorization: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it('shows once and permanently suppresses the prompt after dismissal', async () => {
    await renderWithProviders(GithubTokenPrompt, {
      initialRoute: '/dashboard',
      initialState: {
        auth: { token: 'access-token' },
        user: { superUser: true },
      },
    })

    await vi.advanceTimersByTimeAsync(5_000)
    await waitFor(() => expect(screen.getByText('设置 GitHub Token')).toBeInTheDocument())

    await fireEvent.click(screen.getByRole('button', { name: '永久关闭提示' }))

    expect(localStorage.getItem('github-token-prompt-dismissed')).toBe('1')
    expect(screen.queryByText('设置 GitHub Token')).not.toBeInTheDocument()
  })
})
