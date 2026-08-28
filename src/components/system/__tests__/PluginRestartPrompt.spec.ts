import PluginRestartPrompt from '@/components/system/PluginRestartPrompt.vue'
import { usePluginRuntimeStore } from '@/stores/pluginRuntime'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

describe('PluginRestartPrompt', () => {
  it('stays hidden without a backend restart requirement', async () => {
    await renderWithProviders(PluginRestartPrompt)

    expect(screen.queryByText('插件更新需重启')).not.toBeInTheDocument()
  })

  it('shows the affected plugin and links to its installed card', async () => {
    const { pinia, router } = await renderWithProviders(PluginRestartPrompt)
    const runtimeStore = usePluginRuntimeStore(pinia)
    runtimeStore.summary = {
      failed_count: 0,
      generation: 4,
      pending_count: 0,
      ready: true,
      restart_required: true,
      restart_required_plugin_ids: ['DemoPlugin'],
    }

    expect(await screen.findByText('插件更新需重启')).toBeInTheDocument()
    expect(screen.getByText('插件「DemoPlugin」的原生依赖已更新，重启 MoviePilot 后完整生效')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: '查看插件' }))
    await waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/plugins?id=DemoPlugin'))
  })

  it('summarizes multiple affected plugins without creating another state store', async () => {
    const { pinia } = await renderWithProviders(PluginRestartPrompt)
    const runtimeStore = usePluginRuntimeStore(pinia)
    runtimeStore.summary = {
      failed_count: 0,
      generation: 5,
      pending_count: 0,
      ready: true,
      restart_required: true,
      restart_required_plugin_ids: ['DemoPlugin', 'OtherPlugin'],
    }

    expect(await screen.findByText('2 个插件的原生依赖已更新，重启 MoviePilot 后完整生效')).toBeInTheDocument()
  })
})
