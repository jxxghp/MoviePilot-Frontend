import type { Plugin } from '@/api/types'
import PluginLogDialog from '@/components/dialog/PluginLogDialog.vue'
import { onAgentAssistantDiagnostic } from '@/utils/agentAssistantDiagnostic'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { afterEach, describe, expect, it, vi } from 'vitest'

// 只验证标题栏动作，不加载日志内容。
vi.mock('@/views/system/LoggingView.vue', () => ({
  default: { name: 'LoggingView', template: '<div />' },
}))

const plugin: Plugin = {
  id: 'MyPlugin',
  plugin_name: '演示插件',
  plugin_desc: '用于测试插件日志诊断入口',
  plugin_version: '1.0.0',
  plugin_author: 'MoviePilot',
  installed: true,
  state: true,
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PluginLogDialog', () => {
  it('opens the plugin log and download URLs from the title actions', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const user = userEvent.setup()
    await renderWithProviders(PluginLogDialog, {
      props: { plugin },
      global: { stubs: { LoggingView: true, VDialogCloseBtn: true } },
    })

    await user.click(await screen.findByText('下载'))
    await user.click(screen.getByText('在新窗口中打开'))

    expect(open.mock.calls).toEqual([
      [expect.stringMatching(/system\/logging\/download\/myplugin$/), '_blank'],
      [expect.stringMatching(/system\/logging\?length=-1&logfile=plugins\/myplugin\.log$/), '_blank'],
    ])
  })

  it('requests a read-only diagnosis for the current plugin log', async () => {
    const prompts: string[] = []
    const stopDiagnostics = onAgentAssistantDiagnostic(({ prompt }) => prompts.push(prompt))
    const user = userEvent.setup()
    const view = await renderWithProviders(PluginLogDialog, {
      props: { plugin },
      global: { stubs: { LoggingView: true, VDialogCloseBtn: true } },
    })

    await user.click(await screen.findByText('AI 诊断'))

    expect(prompts).toEqual([expect.stringContaining('plugins/myplugin.log')])
    expect(view.emitted('update:modelValue')).toEqual([[false]])
    stopDiagnostics()
  })
})
