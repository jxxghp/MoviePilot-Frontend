import AccountSettingSubscribe from '@/views/setting/AccountSettingSubscribe.vue'
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
    if (endpoint === 'site/') {
      return [
        { id: 3, name: 'RSS Alpha', is_active: true },
        { id: 4, name: 'RSS Disabled', is_active: false },
      ]
    }
    if (endpoint === 'system/setting/UserFilterRuleGroups') {
      return { success: true, data: { value: [{ name: 'HDR' }, { name: 'Remux' }] } }
    }
    if (endpoint === 'system/setting/RssSites') return { success: true, data: { value: [3] } }
    if (endpoint === 'system/setting/SubscribeFilterRuleGroups') {
      return { success: true, data: { value: ['HDR'] } }
    }
    if (endpoint === 'system/setting/BestVersionFilterRuleGroups') {
      return { success: true, data: { value: ['Remux'] } }
    }
    if (endpoint === 'system/env') {
      return {
        success: true,
        data: {
          SUBSCRIBE_SEARCH: true,
          SUBSCRIBE_SEARCH_INTERVAL: 72,
          SUBSCRIBE_RSS_INTERVAL: 20,
          LOCAL_EXISTS_SEARCH: true,
          UNRELATED: 'ignored',
        },
      }
    }
    throw new Error(`Unexpected GET ${endpoint}`)
  })
}

async function renderSettings() {
  return renderWithProviders(AccountSettingSubscribe)
}

function getCard(title: string) {
  const card = screen.getByText(title).closest('.v-card')
  expect(card).not.toBeNull()
  return within(card as HTMLElement)
}

describe('AccountSettingSubscribe', () => {
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

  it('loads owned settings, filters inactive sites, and follows active refresh state', async () => {
    const { rerender } = await renderSettings()

    expect(await screen.findByText('RSS Alpha')).toBeInTheDocument()
    expect(screen.queryByText('RSS Disabled')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '订阅定时搜索' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '检查文件系统资源' })).toBeChecked()
    expect(screen.getByLabelText('订阅模式')).toBeInTheDocument()
    expect(screen.getByLabelText('订阅搜索时间间隔')).toBeInTheDocument()

    const refreshOptions = mocks.useSilentSettingRefresh.mock.calls[0]?.[1]
    expect(refreshOptions.active.value).toBe(true)
    await rerender({ active: false })
    expect(refreshOptions.active.value).toBe(false)
  })

  it('saves rule groups and only the owned subscription environment keys', async () => {
    const user = userEvent.setup()
    await renderSettings()
    await screen.findByText('RSS Alpha')

    await user.click(screen.getByRole('checkbox', { name: '订阅定时搜索' }))
    await user.click(screen.getByRole('checkbox', { name: '检查文件系统资源' }))

    await user.click(screen.getByLabelText('订阅模式'))
    await user.click(await screen.findByText('自动'))
    await user.click(screen.getByLabelText('站点RSS周期'))
    await user.click(await screen.findByText('半小时'))
    await user.click(screen.getByLabelText('订阅优先级规则组'))
    await user.click(await screen.findByRole('option', { name: 'Remux' }))

    await user.click(getCard('基础设置').getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenNthCalledWith(1, 'system/setting/SubscribeFilterRuleGroups', ['HDR', 'Remux'])
      expect(mocks.apiPost).toHaveBeenNthCalledWith(2, 'system/setting/BestVersionFilterRuleGroups', ['Remux'])
      expect(mocks.apiPost).toHaveBeenNthCalledWith(3, 'system/env', {
        SUBSCRIBE_MODE: 'spider',
        SUBSCRIBE_SEARCH: false,
        SUBSCRIBE_SEARCH_INTERVAL: 72,
        SUBSCRIBE_RSS_INTERVAL: 30,
        LOCAL_EXISTS_SEARCH: false,
      })
    })
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('订阅基础设置保存成功'))
  })

  it('reports environment business and HTTP failures from the combined settings save', async () => {
    mocks.apiPost
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false })
    await renderSettings()
    const save = getCard('基础设置').getByRole('button', { name: '保存' })

    await fireEvent.click(save)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('订阅基础设置保存失败！'))
    expect(mocks.apiPost).toHaveBeenNthCalledWith(3, 'system/env', expect.objectContaining({ SUBSCRIBE_MODE: 'auto' }))
    expect(mocks.toastSuccess).not.toHaveBeenCalled()

    mocks.apiPost.mockReset()
    mocks.toastError.mockReset()
    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await fireEvent.click(save)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('订阅基础设置保存失败！'))
  })

  it('saves selected RSS sites and exposes business and HTTP failures', async () => {
    await renderSettings()
    await screen.findByText('RSS Alpha')
    const saveSites = getCard('订阅站点').getByRole('button', { name: '保存' })

    await fireEvent.click(screen.getByText('RSS Alpha'))

    await fireEvent.click(saveSites)
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/RssSites', []))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('订阅站点保存成功')

    mocks.apiPost.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.apiPost.mockResolvedValueOnce({ success: false })
    await fireEvent.click(saveSites)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('订阅站点保存失败！'))

    mocks.apiPost.mockReset()
    mocks.toastError.mockReset()
    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await fireEvent.click(saveSites)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('订阅站点保存失败！'))
  })
})
