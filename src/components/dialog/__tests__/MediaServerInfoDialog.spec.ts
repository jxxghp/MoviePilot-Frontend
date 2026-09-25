import MediaServerInfoDialog from '@/components/dialog/MediaServerInfoDialog.vue'
import type { MediaServerConf } from '@/api/types'
import { fireEvent, screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: { get: (...args: unknown[]) => mocks.apiGet(...args) },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError }),
}))

const plexServer: MediaServerConf = {
  name: 'Plex',
  type: 'plex',
  enabled: true,
  config: { host: 'http://plex.local:32400', token: 'token' },
  sync_libraries: ['all'],
}

describe('MediaServerInfoDialog Plex timeout', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset().mockResolvedValue([])
    mocks.toastError.mockReset()
  })

  it('shows the 30-second default and saves the configured Plex timeout', async () => {
    const onChange = vi.fn()

    await renderWithProviders(MediaServerInfoDialog, {
      props: {
        modelValue: true,
        mediaserver: plexServer,
        mediaservers: [plexServer],
        onChange,
      },
      global: { stubs: { VDialogCloseBtn: true } },
    })

    const timeoutInput = await screen.findByLabelText('Plex 请求超时（秒）')
    expect(timeoutInput).toHaveValue(30)
    await fireEvent.update(timeoutInput, '120')
    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ timeout: 120 }),
      }),
      'Plex',
    )
  })
})
