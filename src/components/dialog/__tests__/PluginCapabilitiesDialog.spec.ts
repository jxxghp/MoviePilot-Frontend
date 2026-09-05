import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import type { PluginRuntimeCapabilities } from '@/api/pluginCapabilities'
import type { Plugin } from '@/api/types'
import PluginCapabilitiesDialog from '@/components/dialog/PluginCapabilitiesDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getCapabilities: vi.fn() }))

vi.mock('@/api/pluginCapabilities', async importOriginal => ({
  ...(await importOriginal<typeof import('@/api/pluginCapabilities')>()),
  getPluginRuntimeCapabilities: mocks.getCapabilities,
}))

const plugin: Plugin = {
  id: 'DemoPlugin',
  plugin_name: '演示插件',
  installed: true,
}

const capabilities: PluginRuntimeCapabilities = {
  commands: [{ cmd: '/demo', desc: '执行演示命令' }],
  actions: [
    {
      plugin_id: 'DemoPlugin',
      plugin_name: '演示插件',
      actions: [{ id: 'refresh', name: '刷新数据' }],
    },
  ],
  services: [{ id: 'daily', name: '每日任务', trigger: "cron[hour='1']" }],
}

/** 渲染插件能力弹窗并注册真实关闭按钮。 */
async function renderDialog() {
  return renderWithProviders(PluginCapabilitiesDialog, {
    props: { modelValue: true, plugin },
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
  })
}

describe('PluginCapabilitiesDialog', () => {
  beforeEach(() => {
    mocks.getCapabilities.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('loads and renders commands, actions and scheduled services', async () => {
    mocks.getCapabilities.mockResolvedValueOnce(capabilities)
    await renderDialog()

    expect(await screen.findByText('演示插件运行能力')).toBeInTheDocument()
    expect(screen.getByText('/demo')).toBeInTheDocument()
    expect(screen.getByText('执行演示命令')).toBeInTheDocument()
    expect(screen.getByText('刷新数据')).toBeInTheDocument()
    expect(screen.getByText('每日任务').closest('.v-list-item')).toHaveTextContent("daily · cron[hour='1']")
    expect(mocks.getCapabilities).toHaveBeenCalledWith('DemoPlugin')
  })

  it('shows an explicit empty state', async () => {
    mocks.getCapabilities.mockResolvedValueOnce({ actions: [], commands: [], services: [] })
    await renderDialog()

    expect(await screen.findByText('该插件当前没有注册命令、动作或定时服务')).toBeInTheDocument()
  })

  it('keeps failure local and retries the same plugin', async () => {
    mocks.getCapabilities.mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValueOnce(capabilities)
    await renderDialog()

    expect(await screen.findByText('运行能力加载失败，请稍后重试')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(mocks.getCapabilities).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('/demo')).toBeInTheDocument()
  })
})
