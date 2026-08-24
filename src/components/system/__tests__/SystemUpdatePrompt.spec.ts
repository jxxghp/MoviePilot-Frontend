import SystemUpdatePrompt from '@/components/system/SystemUpdatePrompt.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  finishRestart: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  startRestart: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.get,
    post: mocks.post,
  },
}))
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => ({ createConfirm: mocks.confirm }) }))
vi.mock('@/composables/useSystemRestart', () => ({
  useSystemRestartStatus: () => ({
    finishSystemRestart: mocks.finishRestart,
    startSystemRestart: mocks.startRestart,
  }),
}))
vi.mock('vue-toastification', () => ({ useToast: () => ({ error: mocks.toastError }) }))
vi.mock('vue-i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}))

const availableStatus = {
  state: 'available',
  current_version: 'v3.0.0',
  version: 'v3.1.0',
  frontend_version: null,
  downloaded_bytes: 0,
  total_bytes: 0,
  progress: 0,
  can_update: true,
  can_install: false,
}

describe('SystemUpdatePrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mocks.confirm.mockResolvedValue(true)
    mocks.get.mockResolvedValue(availableStatus)
  })

  it('asks an administrator to start the background download', async () => {
    mocks.post.mockResolvedValue({
      ...availableStatus,
      state: 'downloading',
      downloaded_bytes: 5 * 1024 * 1024,
      total_bytes: 20 * 1024 * 1024,
      progress: 25,
    })
    await renderWithProviders(SystemUpdatePrompt, { props: { enabled: true } })

    expect(await screen.findByText('systemUpdate.availableTitle')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: /systemUpdate.updateNow/ }))

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('system/update/download'))
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('5.0 MB / 20.0 MB')).toBeInTheDocument()
  })

  it('requires confirmation before restarting with a prepared update', async () => {
    mocks.get.mockResolvedValue({
      ...availableStatus,
      state: 'ready',
      downloaded_bytes: 20 * 1024 * 1024,
      total_bytes: 20 * 1024 * 1024,
      progress: 100,
      can_update: false,
      can_install: true,
    })
    mocks.post.mockResolvedValue(null)
    await renderWithProviders(SystemUpdatePrompt, { props: { enabled: true } })

    await fireEvent.click(await screen.findByRole('button', { name: /systemUpdate.restartNow/ }))

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce())
    expect(mocks.post).toHaveBeenCalledWith('system/update/install')
    expect(mocks.startRestart).toHaveBeenCalledOnce()
    expect(screen.getByText('systemUpdate.installing')).toBeInTheDocument()
  })

  it('does not query update state without administrator permission', async () => {
    await renderWithProviders(SystemUpdatePrompt, { props: { enabled: false } })
    await Promise.resolve()
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it('moves above the Agent assistant when both prompts are enabled', async () => {
    await renderWithProviders(SystemUpdatePrompt, {
      props: { avoidAgentAssistant: true, enabled: true },
    })

    const title = await screen.findByText('systemUpdate.availableTitle')
    expect(title.closest('.system-update-prompt')).toHaveClass('system-update-prompt--avoid-agent')
  })

  it('snoozes the current version for 24 hours', async () => {
    await renderWithProviders(SystemUpdatePrompt, { props: { enabled: true } })

    await fireEvent.click(await screen.findByRole('button', { name: /systemUpdate.later/ }))

    await waitFor(() => expect(screen.queryByText('systemUpdate.availableTitle')).not.toBeInTheDocument())
    const saved = JSON.parse(localStorage.getItem('moviepilot.system-update-reminder') || '{}')
    expect(saved.version).toBe('v3.1.0')
    expect(saved.snoozedUntil).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000)
  })

  it('ignores only the selected version', async () => {
    const view = await renderWithProviders(SystemUpdatePrompt, { props: { enabled: true } })
    await fireEvent.click(await screen.findByRole('button', { name: /systemUpdate.moreActions/ }))
    await fireEvent.click(await screen.findByText('systemUpdate.ignoreVersion'))
    await waitFor(() => expect(screen.queryByText('systemUpdate.availableTitle')).not.toBeInTheDocument())

    view.unmount()
    mocks.get.mockResolvedValue({ ...availableStatus, version: 'v3.2.0' })
    await renderWithProviders(SystemUpdatePrompt, { props: { enabled: true } })

    expect(await screen.findByText('systemUpdate.availableTitle')).toBeInTheDocument()
  })
})
