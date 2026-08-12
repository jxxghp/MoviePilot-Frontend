import AccountSettingSite from '@/views/setting/AccountSettingSite.vue'
import userEvent from '@testing-library/user-event'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  useSilentSettingRefresh: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({ get: mocks.apiGet, post: mocks.apiPost }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useSilentSettingRefresh', () => ({
  useSilentSettingRefresh: mocks.useSilentSettingRefresh,
}))

function mockLoadedSettings() {
  mocks.apiGet.mockImplementation((endpoint: string) => {
    if (endpoint === 'system/env') {
      return {
        success: true,
        data: {
          COOKIECLOUD_HOST: 'https://cookies.example.com',
          COOKIECLOUD_KEY: 'key',
          COOKIECLOUD_PASSWORD: 'password',
          COOKIECLOUD_AUTH_HEADER: 'header',
          COOKIECLOUD_INTERVAL: 60,
          COOKIECLOUD_ENABLE_LOCAL: false,
          COOKIECLOUD_BLACKLIST: 'blocked.example.com',
          SITEDATA_REFRESH_INTERVAL: 6,
          SITE_MESSAGE: true,
          BROWSER_EMULATION: 'flaresolverr',
          OCR_HOST: 'https://ocr.example.com',
          FLARESOLVERR_URL: 'http://solver:8191',
          UNRELATED: 'ignored',
        },
      }
    }
    if (endpoint === 'site/reset') return { success: true }
    throw new Error(`Unexpected GET ${endpoint}`)
  })
}

async function renderSettings() {
  return renderWithProviders(AccountSettingSite)
}

function getCard(title: string) {
  const card = screen.getByText(title).closest('.v-card')
  expect(card).not.toBeNull()
  return within(card as HTMLElement)
}

describe('AccountSettingSite', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.useSilentSettingRefresh.mockReset()
    mockLoadedSettings()
    mocks.apiPost.mockResolvedValue({ success: true })
  })

  it('loads only declared site settings and follows active refresh state', async () => {
    const { rerender } = await renderSettings()

    expect(await screen.findByDisplayValue('https://cookies.example.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://ocr.example.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('http://solver:8191')).toBeInTheDocument()
    expect(screen.getByLabelText('搜索资源获取页数')).toHaveValue(1)
    expect(screen.getByRole('checkbox', { name: '阅读站点消息' })).toBeChecked()

    const refreshOptions = mocks.useSilentSettingRefresh.mock.calls[0]?.[1]
    expect(refreshOptions.active.value).toBe(true)
    await rerender({ active: false })
    expect(refreshOptions.active.value).toBe(false)
  })

  it('saves CookieCloud and site sections with only their owned keys', async () => {
    const user = userEvent.setup()
    const updatedCredential = 'updated-value'
    await renderSettings()
    await screen.findByDisplayValue('https://cookies.example.com')

    await fireEvent.click(screen.getByRole('checkbox', { name: '启用本地CookieCloud服务器' }))
    await fireEvent.update(screen.getByLabelText('服务地址'), 'https://new-cookies.example.com')
    await fireEvent.update(screen.getByLabelText('用户KEY'), 'new-key')
    await fireEvent.update(screen.getByLabelText('端对端加密密码'), updatedCredential)
    await fireEvent.update(screen.getByLabelText('上传认证 Header'), 'new-header')
    await fireEvent.update(screen.getByLabelText('同步域名黑名单'), 'new-blocked.example.com')
    await user.click(screen.getByLabelText('自动同步间隔'))
    await user.click(await screen.findByRole('option', { name: '每6小时' }))

    await fireEvent.click(getCard('站点同步').getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenNthCalledWith(1, 'system/env', {
        COOKIECLOUD_HOST: 'https://new-cookies.example.com',
        COOKIECLOUD_KEY: 'new-key',
        COOKIECLOUD_PASSWORD: updatedCredential,
        COOKIECLOUD_AUTH_HEADER: 'new-header',
        COOKIECLOUD_INTERVAL: 360,
        COOKIECLOUD_ENABLE_LOCAL: true,
        COOKIECLOUD_BLACKLIST: 'new-blocked.example.com',
      })
    })

    await fireEvent.update(screen.getByLabelText('搜索资源获取页数'), '4')
    await fireEvent.update(screen.getByLabelText('验证码识别服务器'), 'https://new-ocr.example.com')
    await fireEvent.update(screen.getByLabelText('FlareSolverr 服务地址'), 'http://new-solver:8191')
    await fireEvent.click(screen.getByRole('checkbox', { name: '阅读站点消息' }))
    await user.click(screen.getByLabelText('站点数据刷新间隔'))
    await user.click(await screen.findByRole('option', { name: '每12小时' }))
    await user.click(screen.getByLabelText('浏览器仿真'))
    await user.click(await screen.findByRole('option', { name: 'CloakBrowser' }))
    expect(screen.queryByLabelText('FlareSolverr 服务地址')).not.toBeInTheDocument()

    await fireEvent.click(getCard('站点选项').getByRole('button', { name: '保存' }))
    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenNthCalledWith(2, 'system/env', {
        SITEDATA_REFRESH_INTERVAL: 12,
        SITE_MESSAGE: false,
        SEARCH_RESOURCE_PAGES: 4,
        BROWSER_EMULATION: 'cloakbrowser',
        OCR_HOST: 'https://new-ocr.example.com',
        FLARESOLVERR_URL: 'http://new-solver:8191',
      })
    })
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(2)
  })

  it('exposes business and HTTP failures when saving a section', async () => {
    mocks.apiPost.mockResolvedValueOnce({ success: false })
    await renderSettings()
    const save = getCard('站点同步').getByRole('button', { name: '保存' })

    await fireEvent.click(save)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('站点设置保存失败！'))

    mocks.toastError.mockReset()
    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await fireEvent.click(save)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled())
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('requires confirmation and restores the reset action after success or business failure', async () => {
    const user = userEvent.setup()
    await renderSettings()
    const resetCard = getCard('站点重置')
    const resetButton = resetCard.getByRole('button', { name: '重置站点数据' })
    let resolveReset: ((value: { success: boolean }) => void) | undefined
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'site/reset') {
        return new Promise(resolve => {
          resolveReset = resolve
        })
      }
      throw new Error(`Unexpected GET ${endpoint}`)
    })
    expect(resetButton).toBeDisabled()

    await user.click(resetCard.getByRole('checkbox', { name: '确认删除所有站点数据并重新同步。' }))
    expect(resetButton).toBeEnabled()
    await user.click(resetButton)
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('site/reset'))
    expect(resetCard.getByRole('button', { name: '正在重置...' })).toBeDisabled()
    await user.click(resetCard.getByRole('button', { name: '正在重置...' }))
    expect(mocks.apiGet.mock.calls.filter(([endpoint]) => endpoint === 'site/reset')).toHaveLength(1)

    resolveReset?.({ success: true })
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('站点重置成功，请等待CookieCloud同步完成！'))
    expect(resetCard.getByRole('button', { name: '重置站点数据' })).toBeEnabled()

    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'site/reset') return { success: false }
      return mockLoadedSettings()
    })
    mocks.toastSuccess.mockReset()
    await user.click(resetCard.getByRole('button', { name: '重置站点数据' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('站点重置失败！'))
    expect(resetCard.getByRole('button', { name: '重置站点数据' })).toBeEnabled()
  })

  it('restores the reset action and shows failure after an HTTP error', async () => {
    await renderSettings()
    const resetCard = getCard('站点重置')
    await fireEvent.click(resetCard.getByRole('checkbox', { name: '确认删除所有站点数据并重新同步。' }))
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'site/reset') throw new Error('offline')
      throw new Error(`Unexpected GET ${endpoint}`)
    })

    await fireEvent.click(resetCard.getByRole('button', { name: '重置站点数据' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('站点重置失败！'))
    expect(resetCard.getByRole('button', { name: '重置站点数据' })).toBeEnabled()
  })
})
