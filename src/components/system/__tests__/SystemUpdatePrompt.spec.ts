import SystemUpdatePrompt from '@/components/system/SystemUpdatePrompt.vue'
import type { SystemUpdateStatus } from '@/api/types'
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
  updateStatus: null as { value: SystemUpdateStatus | null } | null,
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
vi.mock('@/composables/useSystemUpdateStatus', async () => {
  const { ref } = await import('vue')
  const status = ref<SystemUpdateStatus | null>(null)
  mocks.updateStatus = status
  return {
    SYSTEM_UPDATE_MENU_EVENT: 'moviepilot:system-update-menu',
    useSystemUpdateStatus: () => ({
      status,
      setStatus: (nextStatus: SystemUpdateStatus) => {
        status.value = nextStatus
      },
      startPolling: vi.fn(),
      stopPolling: vi.fn(),
    }),
  }
})
vi.mock('vue-toastification', () => ({ useToast: () => ({ error: mocks.toastError }) }))
vi.mock('vue-i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}))

const availableStatus: SystemUpdateStatus = {
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
    mocks.updateStatus!.value = availableStatus
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

    expect(await screen.findByText('systemUpdate.applicationAvailableTitle')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: /systemUpdate.updateNow/ }))

    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('system/update/download', { target: 'application' }))
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('5.0 MB / 20.0 MB')).toBeInTheDocument()
  })

  it('requires confirmation before restarting with a prepared update', async () => {
    mocks.updateStatus!.value = {
      ...availableStatus,
      state: 'ready',
      downloaded_bytes: 20 * 1024 * 1024,
      total_bytes: 20 * 1024 * 1024,
      progress: 100,
      can_update: false,
      can_install: true,
    }
    mocks.post.mockResolvedValue(null)
    await renderWithProviders(SystemUpdatePrompt, { props: { enabled: true } })

    await fireEvent.click(await screen.findByRole('button', { name: /systemUpdate.restartNow/ }))

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce())
    expect(mocks.post).toHaveBeenCalledWith('system/update/install', { target: 'application' })
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

    const title = await screen.findByText('systemUpdate.applicationAvailableTitle')
    expect(title.closest('.system-update-prompt')).toHaveClass('system-update-prompt--avoid-agent')
  })

  it('snoozes the current version for 24 hours', async () => {
    await renderWithProviders(SystemUpdatePrompt, { props: { enabled: true } })

    await fireEvent.click(await screen.findByRole('button', { name: /systemUpdate.later/ }))

    await waitFor(() => expect(screen.queryByText('systemUpdate.applicationAvailableTitle')).not.toBeInTheDocument())
    const saved = JSON.parse(localStorage.getItem('moviepilot.system-update-reminders') || '{}')
    expect(saved.application.version).toBe('v3.1.0')
    expect(saved.application.snoozedUntil).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000)
  })

  it('ignores only the selected version', async () => {
    const view = await renderWithProviders(SystemUpdatePrompt, { props: { enabled: true } })
    await fireEvent.click(await screen.findByRole('button', { name: /systemUpdate.moreActions/ }))
    await fireEvent.click(await screen.findByText('systemUpdate.ignoreVersion'))
    await waitFor(() => expect(screen.queryByText('systemUpdate.applicationAvailableTitle')).not.toBeInTheDocument())

    view.unmount()
    mocks.updateStatus!.value = { ...availableStatus, version: 'v3.2.0' }
    await renderWithProviders(SystemUpdatePrompt, { props: { enabled: true } })

    expect(await screen.findByText('systemUpdate.applicationAvailableTitle')).toBeInTheDocument()
  })

  it('renders application and resource updates as separate upgrade types', async () => {
    mocks.updateStatus!.value = {
      ...availableStatus,
      updates: [
        { ...availableStatus, type: 'application', state: 'idle', can_update: false },
        {
          type: 'resources',
          state: 'available',
          current_auth_version: '3.0.2',
          auth_version: '3.0.3',
          current_indexer_version: '3.0.7',
          indexer_version: '3.0.8',
          downloaded_bytes: 0,
          total_bytes: 0,
          progress: 0,
          can_update: true,
          can_install: false,
        },
      ],
    }

    await renderWithProviders(SystemUpdatePrompt, { props: { enabled: true } })

    expect(await screen.findByText('systemUpdate.resourcesAvailableTitle')).toBeInTheDocument()
    expect(screen.getByText('systemUpdate.authResourceLabel: 3.0.2 → 3.0.3')).toBeInTheDocument()
    expect(screen.getByText('systemUpdate.indexerResourceLabel: 3.0.7 → 3.0.8')).toBeInTheDocument()
  })

  it('uses the same resource confirmation flow when opened from the avatar menu', async () => {
    mocks.updateStatus!.value = {
      ...availableStatus,
      updates: [
        {
          type: 'resources',
          state: 'available',
          version: '10',
          auth_version: '3.0.3',
          indexer_version: '3.0.8',
          downloaded_bytes: 0,
          total_bytes: 0,
          progress: 0,
          can_update: true,
          can_install: false,
        },
      ],
    }
    mocks.post.mockResolvedValue({ ...mocks.updateStatus!.value, state: 'downloading' })
    await renderWithProviders(SystemUpdatePrompt, { props: { enabled: true } })

    window.dispatchEvent(new CustomEvent('moviepilot:system-update-menu', { detail: { target: 'resources' } }))

    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce())
    expect(mocks.post).toHaveBeenCalledWith('system/update/download', { target: 'resources' })
  })
})
