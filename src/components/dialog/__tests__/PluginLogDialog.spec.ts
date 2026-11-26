import type { Plugin } from '@/api/types'
import PluginLogDialog from '@/components/dialog/PluginLogDialog.vue'
import { NativeSheetAdapter } from '@/native/sheet'
import { onAgentAssistantDiagnostic } from '@/utils/agentAssistantDiagnostic'
import { screen, waitFor } from '@testing-library/vue'
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

const adminAssistantState = {
  globalSettings: {
    data: {
      AI_AGENT_ENABLE: true,
      AI_AGENT_HIDE_ENTRY: false,
    },
  },
  user: {
    superUser: true,
  },
}

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-native-sheet')
})

describe('PluginLogDialog', () => {
  it('opens the plugin log and download URLs from accessible title action buttons', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const user = userEvent.setup()
    await renderWithProviders(PluginLogDialog, {
      props: { plugin },
      initialState: adminAssistantState,
      global: { stubs: { LoggingView: true, VDialogCloseBtn: true } },
    })

    const header = document.querySelector('.logging-dialog-header')
    expect(header?.querySelector('.logging-dialog-title')).not.toBeNull()
    expect(header?.querySelectorAll('.logging-dialog-title__actions > button.logging-dialog-action')).toHaveLength(3)

    await user.click(await screen.findByRole('button', { name: '下载' }))
    await user.click(screen.getByRole('button', { name: '在新窗口中打开' }))

    expect(open.mock.calls).toEqual([
      [expect.stringMatching(/system\/logging\/download\/myplugin$/), '_blank'],
      [expect.stringMatching(/system\/logging\?length=-1&logfile=plugins\/myplugin\.log$/), '_blank'],
    ])
  })

  it('projects an isolated sheet title and all actions for native hosts and requests read-only diagnosis', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const prompts: string[] = []
    const stopDiagnostics = onAgentAssistantDiagnostic(({ prompt }) => prompts.push(prompt))
    const view = await renderWithProviders(PluginLogDialog, {
      props: { plugin },
      initialState: adminAssistantState,
      global: { stubs: { LoggingView: true, VDialogCloseBtn: true } },
    })

    const adapter = new NativeSheetAdapter(document)
    await waitFor(() => expect(adapter.read('插件')?.title).toBe('插件日志'))
    const sheet = adapter.read('插件')!
    expect(sheet.actions).toEqual([
      expect.objectContaining({ title: '下载', icon: 'mdi-download', enabled: true }),
      expect.objectContaining({ title: '在新窗口中打开', icon: 'mdi-open-in-new', enabled: true }),
      expect.objectContaining({ title: 'AI 诊断', icon: 'mdi-robot-happy-outline', enabled: true }),
    ])

    adapter.execute('presentation.attach', { id: sheet.id })
    for (const action of sheet.actions) {
      expect(adapter.execute('presentation.action', { id: sheet.id, actionId: action.id })).toBe(true)
    }

    expect(open.mock.calls).toEqual([
      [expect.stringMatching(/system\/logging\/download\/myplugin$/), '_blank'],
      [expect.stringMatching(/system\/logging\?length=-1&logfile=plugins\/myplugin\.log$/), '_blank'],
    ])
    expect(prompts).toEqual([expect.stringContaining('plugins/myplugin.log')])
    expect(view.emitted('update:modelValue')).toEqual([[false]])
    stopDiagnostics()
    adapter.reset()
    view.unmount()
  })

  it.each([
    {
      label: 'assistant is disabled',
      initialState: { globalSettings: { data: { AI_AGENT_ENABLE: false } }, user: { superUser: true } },
    },
    {
      label: 'assistant entry is hidden',
      initialState: {
        globalSettings: { data: { AI_AGENT_ENABLE: true, AI_AGENT_HIDE_ENTRY: true } },
        user: { superUser: true },
      },
    },
    {
      label: 'user is not a superuser',
      initialState: {
        globalSettings: { data: { AI_AGENT_ENABLE: true, AI_AGENT_HIDE_ENTRY: false } },
        user: { superUser: false },
      },
    },
  ])('hides the AI diagnosis action when $label', async ({ initialState }) => {
    await renderWithProviders(PluginLogDialog, {
      props: { plugin },
      initialState,
      global: { stubs: { LoggingView: true, VDialogCloseBtn: true } },
    })

    expect(await screen.findByRole('button', { name: '下载' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'AI 诊断' })).not.toBeInTheDocument()
  })
})
