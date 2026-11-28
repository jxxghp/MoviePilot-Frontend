import type { NotificationRule } from '@/api/channelSettings'
import ChannelInteractionExtension from '@/components/channel-platforms/ChannelInteractionExtension.vue'
import NotificationRuleDialog from '@/components/dialog/NotificationRuleDialog.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('vue-toastification', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }))

/** 平台不在内置渠道枚举中，线程格式由后端模块校验。 */
const fixtureRule: NotificationRule = {
  name: '扩展平台规则',
  kind: 'conversation',
  target: 'g-room',
  thread_id: 'thread-red',
  enabled: true,
  message_types: ['订阅'],
  audience: 'admin',
  fallback_only: false,
  legacy_usernames: [],
  owner_identity: null,
}

describe('平台能力契约', () => {
  it('未知平台按后端声明显示线程表单，并保留平台拥有的非数字线程', async () => {
    const apply = vi.fn()
    await renderWithProviders(NotificationRuleDialog, {
      props: {
        provider: 'boundary-fixture',
        kinds: ['bound', 'conversation'],
        capabilities: { thread_id: true, target_labels: { conversation: 'channelSettings.deliveryRules.channel' } },
        messageOptions: [{ value: '订阅', title: '订阅' }],
        rules: [fixtureRule],
        onApply: apply,
      },
    })
    const main = within(screen.getByText('投递规则', { exact: true }).closest('.v-card')!)
    await fireEvent.click(main.getByRole('button', { name: '编辑规则 扩展平台规则' }))
    const editor = within(screen.getByText('编辑投递规则', { exact: true }).closest('.v-card')!)
    expect(editor.getByDisplayValue('thread-red')).toBeVisible()
    await fireEvent.click(editor.getByRole('button', { name: '保存' }))
    await fireEvent.click(main.getByRole('button', { name: '保存' }))
    expect(apply).toHaveBeenCalledWith([expect.objectContaining({ thread_id: 'thread-red', target: 'g-room' })])
    expect(fixtureRule.thread_id).toBe('thread-red')
  })

  it('专属命令服务器表单通过组件扩展加载，修改只产生平台选项', async () => {
    const update = vi.fn()
    await renderWithProviders(ChannelInteractionExtension, {
      props: {
        extension: 'discord-command',
        modelValue: { command_guild_id: '123' },
        'onUpdate:modelValue': update,
      },
    })
    const field = await screen.findByDisplayValue('123')
    await fireEvent.update(field, '456')
    await waitFor(() => expect(update).toHaveBeenCalledWith({ command_guild_id: '456' }))
  })

  it('公共管理与规则组件不按平台名称决定配置或协议', () => {
    const paths = [
      'src/views/setting/ChannelFeatureSettings.vue',
      'src/components/dialog/NotificationRuleDialog.vue',
      'src/components/dialog/ChannelRuleDialog.vue',
    ]
    for (const path of paths) {
      const source = readFileSync(path, 'utf8')
      expect(source).not.toMatch(/(?:props\.|connection\.?value\?\.)?provider\s*[!=]==?\s*['"]/)
      expect(source).not.toMatch(/\[\s*['"](?:slack|discord|telegram|vocechat)['"][^\]]*\]\.includes/)
      expect(source).not.toContain('command_guild_id')
      expect(source).not.toContain('knownProviders')
    }
  })
})
