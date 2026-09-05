import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import type { PluginDataSummary } from '@/api/pluginData'
import type { Plugin } from '@/api/types'
import PluginDataSummaryDialog from '@/components/dialog/PluginDataSummaryDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSummary: vi.fn() }))

vi.mock('@/api/pluginData', async importOriginal => ({
  ...(await importOriginal<typeof import('@/api/pluginData')>()),
  getPluginDataSummary: mocks.getSummary,
}))

const plugin: Plugin = { id: 'DemoPlugin', plugin_name: '演示插件', installed: true }
const summary: PluginDataSummary = {
  plugin_id: 'DemoPlugin',
  plugin_name: '演示插件',
  plugin_version: '1.0.0',
  state: true,
  count: 2,
  total_chars: 28,
  keys_truncated: false,
  keys: [
    { key: 'api_token', value_type: 'string', serialized_chars: 14, sensitive: true },
    { key: 'history', value_type: 'array', serialized_chars: 14, sensitive: false },
  ],
}

/** 渲染插件数据摘要弹窗并注册真实关闭按钮。 */
async function renderDialog() {
  return renderWithProviders(PluginDataSummaryDialog, {
    props: { modelValue: true, plugin },
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
  })
}

describe('PluginDataSummaryDialog', () => {
  beforeEach(() => {
    mocks.getSummary.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('renders key metadata without exposing any persisted values', async () => {
    mocks.getSummary.mockResolvedValueOnce(summary)
    await renderDialog()

    expect(await screen.findByText('演示插件数据诊断')).toBeInTheDocument()
    expect(screen.getByText('api_token')).toBeInTheDocument()
    expect(screen.getByText('敏感键')).toBeInTheDocument()
    expect(screen.getByText('history')).toBeInTheDocument()
    expect(screen.queryByText('secret-token')).not.toBeInTheDocument()
    expect(mocks.getSummary).toHaveBeenCalledWith('DemoPlugin')
  })

  it('shows an explicit empty state', async () => {
    mocks.getSummary.mockResolvedValueOnce({ ...summary, count: 0, total_chars: 0, keys: [] })
    await renderDialog()

    expect(await screen.findByText('该插件当前没有持久化数据')).toBeInTheDocument()
  })

  it('retries the same plugin after a local load failure', async () => {
    mocks.getSummary.mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValueOnce(summary)
    await renderDialog()

    expect(await screen.findByText('数据摘要加载失败，请稍后重试')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(mocks.getSummary).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('api_token')).toBeInTheDocument()
  })
})
