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

  it.each(['', 'Existing'])('名称 %s 无效时展示本地化校验文案并阻止保存', async name => {
    const onChange = vi.fn()
    const server = { ...plexServer, name }
    await renderWithProviders(MediaServerInfoDialog, {
      props: {
        modelValue: true,
        mediaserver: server,
        mediaservers: [server, { ...plexServer, name: 'Existing' }],
        onChange,
      },
      global: { stubs: { VDialogCloseBtn: true } },
    })
    await fireEvent.click(screen.getByRole('button', { name: '确认' }))
    expect(mocks.toastError).toHaveBeenCalledWith(name ? '【Existing】已存在，请替换为其他名称' : '必填，不可重名')
    expect(onChange).not.toHaveBeenCalled()
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

  it('guides new UGREEN setup with mode cards and adapts fields when switching modes', async () => {
    const onChange = vi.fn()
    const freshUgreenServer: MediaServerConf = {
      name: '绿联影视',
      type: 'ugreen',
      enabled: true,
      config: {},
      sync_libraries: ['all'],
    }

    await renderWithProviders(MediaServerInfoDialog, {
      props: {
        modelValue: true,
        mediaserver: freshUgreenServer,
        mediaservers: [freshUgreenServer],
        onChange,
      },
      global: { stubs: { VDialogCloseBtn: true } },
    })

    const internalCard = await screen.findByRole('radio', { name: /绿联 NAS 账号/ })
    const mediaServiceCard = screen.getByRole('radio', { name: /媒体库服务（Emby 兼容）/ })
    expect(internalCard).toHaveAttribute('aria-checked', 'true')
    expect(mediaServiceCard).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByLabelText('绿联系统账号')).toBeInTheDocument()
    expect(screen.getAllByText('扫描模式').length).toBeGreaterThan(0)

    await fireEvent.click(mediaServiceCard)

    expect(mediaServiceCard).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('媒体库服务账号')).toBeInTheDocument()
    expect(screen.queryAllByText('扫描模式')).toHaveLength(0)
    expect(screen.getByText(/自签名 HTTPS 证书/)).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          mode: 'media_service',
          scan_mode: 'supplement_missing',
          verify_ssl: true,
        }),
      }),
      '绿联影视',
    )
  })

  it('preserves legacy UGREEN auto mode and explicit internal mode on save', async () => {
    const onLegacyChange = vi.fn()
    const legacyUgreenServer: MediaServerConf = {
      name: '绿联影视',
      type: 'ugreen',
      enabled: true,
      config: {
        host: 'https://nas.example:9443',
        username: 'tester',
        password: 'secret',
      },
      sync_libraries: ['all'],
    }

    const { unmount } = await renderWithProviders(MediaServerInfoDialog, {
      props: {
        modelValue: true,
        mediaserver: legacyUgreenServer,
        mediaservers: [legacyUgreenServer],
        onChange: onLegacyChange,
      },
      global: { stubs: { VDialogCloseBtn: true } },
    })

    expect(await screen.findByText(/自动识别模式/)).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    expect(onLegacyChange).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          mode: 'auto',
          scan_mode: 'supplement_missing',
          verify_ssl: true,
        }),
      }),
      '绿联影视',
    )
    unmount()

    const explicitInternalServer: MediaServerConf = {
      ...legacyUgreenServer,
      config: {
        ...legacyUgreenServer.config,
        mode: 'internal',
        verify_ssl: false,
      },
    }
    const onExplicitChange = vi.fn()
    await renderWithProviders(MediaServerInfoDialog, {
      props: {
        modelValue: true,
        mediaserver: explicitInternalServer,
        mediaservers: [explicitInternalServer],
        onChange: onExplicitChange,
      },
      global: { stubs: { VDialogCloseBtn: true } },
    })

    expect(await screen.findByRole('radio', { name: /绿联 NAS 账号/ })).toHaveAttribute('aria-checked', 'true')
    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    expect(onExplicitChange).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          mode: 'internal',
          verify_ssl: false,
        }),
      }),
      '绿联影视',
    )
  })
})
