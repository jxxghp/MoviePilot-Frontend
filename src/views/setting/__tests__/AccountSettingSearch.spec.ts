import AccountSettingSearch from '@/views/setting/AccountSettingSearch.vue'
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
  default: createDataApiMock({
    get: mocks.apiGet,
    post: mocks.apiPost,
  }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: mocks.toastSuccess,
  }),
}))

vi.mock('@/composables/useSilentSettingRefresh', () => ({
  useSilentSettingRefresh: mocks.useSilentSettingRefresh,
}))

function mockLoadedSettings() {
  mocks.apiGet.mockImplementation((endpoint: string) => {
    if (endpoint === 'site/') {
      return [
        { id: 1, name: 'Alpha', is_active: true },
        { id: 2, name: 'Disabled', is_active: false },
      ]
    }
    if (endpoint === 'system/setting/UserFilterRuleGroups') {
      return { success: true, data: { value: [{ name: 'HDR' }, { name: 'Remux' }] } }
    }
    if (endpoint === 'system/setting/public/IndexerSites') {
      return { success: true, data: { value: [1] } }
    }
    if (endpoint === 'system/setting/SEARCH_SOURCE') {
      return { success: true, data: { value: 'douban,bangumi' } }
    }
    if (endpoint === 'system/setting/SearchFilterRuleGroups') {
      return { success: true, data: { value: ['HDR'] } }
    }
    if (endpoint === 'system/env') {
      return {
        success: true,
        data: {
          SEARCH_MULTIPLE_NAME: true,
          DOWNLOAD_SUBTITLE: true,
          AUTO_DOWNLOAD_USER: '42',
          UNRELATED: 'ignored',
        },
      }
    }
    throw new Error(`Unexpected GET ${endpoint}`)
  })
}

async function renderSettings() {
  return renderWithProviders(AccountSettingSearch)
}

function getCard(title: string) {
  const card = screen.getByText(title).closest('.v-card')
  expect(card).not.toBeNull()
  return within(card as HTMLElement)
}

describe('AccountSettingSearch', () => {
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

  it('loads declared settings, filters disabled sites, and registers active-only refresh', async () => {
    const { rerender } = await renderSettings()

    expect(await screen.findByDisplayValue('MOVIEPILOT')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Disabled')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '多名称资源搜索' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '下载站点字幕' })).toBeChecked()

    const refreshOptions = mocks.useSilentSettingRefresh.mock.calls[0]?.[1]
    expect(refreshOptions.active.value).toBe(true)
    await rerender({ active: false })
    expect(refreshOptions.active.value).toBe(false)
  })

  it('saves media sources, rule groups, and only the owned environment keys', async () => {
    await renderSettings()
    await screen.findByDisplayValue('MOVIEPILOT')

    await fireEvent.update(screen.getByLabelText('下载任务标签'), 'UPDATED')
    await fireEvent.update(screen.getByLabelText('远程搜索自动下载用户'), '84')
    await fireEvent.click(screen.getByRole('checkbox', { name: '多名称资源搜索' }))
    await fireEvent.click(screen.getByRole('checkbox', { name: '下载站点字幕' }))

    await fireEvent.click(getCard('基础设置').getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenNthCalledWith(1, 'system/setting/SEARCH_SOURCE', 'douban,bangumi')
      expect(mocks.apiPost).toHaveBeenNthCalledWith(2, 'system/setting/SearchFilterRuleGroups', ['HDR'])
      expect(mocks.apiPost).toHaveBeenNthCalledWith(3, 'system/env', {
        SEARCH_MULTIPLE_NAME: false,
        DOWNLOAD_SUBTITLE: false,
        AUTO_DOWNLOAD_USER: '84',
        TORRENT_TAG: 'UPDATED',
      })
    })
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('搜索基础设置保存成功'))
  })

  it('stops the combined save when the media source is rejected', async () => {
    mocks.apiPost.mockResolvedValueOnce({ success: false, message: 'source rejected' })
    await renderSettings()

    await fireEvent.click(getCard('基础设置').getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('媒体搜索数据源保存失败：source rejected！'))
    expect(mocks.apiPost).toHaveBeenCalledTimes(1)
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('reports an environment business failure and an HTTP failure without reporting success', async () => {
    mocks.apiPost
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false })
    await renderSettings()

    await fireEvent.click(getCard('基础设置').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('搜索基础设置保存失败！'))
    expect(mocks.toastSuccess).not.toHaveBeenCalled()

    mocks.toastError.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await fireEvent.click(getCard('基础设置').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('搜索基础设置保存失败！'))
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
  })

  it('saves selected search sites and exposes business and HTTP failures', async () => {
    await renderSettings()
    await screen.findByText('Alpha')
    const saveSites = getCard('搜索站点').getByRole('button', { name: '保存' })

    await fireEvent.click(screen.getByText('Alpha'))

    await fireEvent.click(saveSites)
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/IndexerSites', []))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('搜索站点保存成功')

    mocks.apiPost.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.apiPost.mockResolvedValueOnce({ success: false })
    await fireEvent.click(saveSites)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('搜索站点保存失败！'))

    mocks.apiPost.mockReset()
    mocks.toastError.mockReset()
    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await fireEvent.click(saveSites)
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('搜索站点保存失败！'))
  })
})
