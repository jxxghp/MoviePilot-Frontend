import AccountSettingRule from '@/views/setting/AccountSettingRule.vue'
import userEvent from '@testing-library/user-event'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  copyToClipboard: vi.fn(),
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  useSilentSettingRefresh: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    delete: mocks.apiDelete,
    get: mocks.apiGet,
    post: mocks.apiPost,
    put: mocks.apiPut,
  }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess, warning: mocks.toastWarning }),
}))

vi.mock('@/@core/utils/navigator', () => ({
  copyToClipboard: mocks.copyToClipboard,
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: mocks.openSharedDialog,
}))

vi.mock('@/composables/useSilentSettingRefresh', () => ({
  useSilentSettingRefresh: mocks.useSilentSettingRefresh,
}))

vi.mock('@/components/cards/CustomRuleCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'CustomRuleCardStub',
      props: { rule: { type: Object, required: true } },
      emits: ['close', 'change'],
      template: `
        <section :aria-label="'custom-' + rule.id">
          <span>{{ rule.id }} / {{ rule.name }}</span>
          <input
            :aria-label="'custom-id-' + rule.id"
            :value="rule.id"
            @input="$emit('change', { ...rule, id: $event.target.value }, rule.id)"
          />
          <input
            :aria-label="'custom-name-' + rule.id"
            :value="rule.name"
            @input="$emit('change', { ...rule, name: $event.target.value }, rule.id)"
          />
          <button :aria-label="'remove-custom-' + rule.id" @click="$emit('close')">remove</button>
        </section>
      `,
    }),
  }
})

vi.mock('@/components/cards/FilterRuleGroupCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'FilterRuleGroupCardStub',
      props: { group: { type: Object, required: true } },
      emits: ['close', 'change'],
      template: `
        <section :aria-label="'group-' + group.name">
          <span>{{ group.name }}</span>
          <input
            :aria-label="'group-name-' + group.name"
            :value="group.name"
            @input="$emit('change', { ...group, name: $event.target.value }, group.name)"
          />
          <button :aria-label="'remove-group-' + group.name" @click="$emit('close')">remove</button>
        </section>
      `,
    }),
  }
})

vi.mock('vuedraggable', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'DraggableStub',
      props: { modelValue: { type: Array, default: () => [] } },
      emits: ['update:modelValue'],
      setup(props, { emit, slots }) {
        const reverse = () => emit('update:modelValue', [...props.modelValue].reverse())
        return () => {
          const items = props.modelValue as Array<{ name?: string }>
          return h('div', [
            h('button', { 'aria-label': `reverse-${items[0]?.name ?? 'empty'}`, onClick: reverse }, 'reverse'),
            ...items.map(element => slots.item?.({ element })),
          ])
        }
      },
    }),
  }
})

const customRulesFixture = [
  { id: 'RULE1', name: '规则1', include: 'WEB-DL' },
  { id: 'RULE3', name: '规则3', exclude: 'CAM' },
]

const groupsFixture = [
  { name: '规则组1', rule_string: 'RULE1', media_type: '电影', category: '' },
  { name: '规则组3', rule_string: 'RULE3', media_type: '', category: '' },
]

function mockLoadedRules() {
  mocks.apiGet.mockImplementation((endpoint: string) => {
    if (endpoint === 'media/category') return { 电影: ['华语'] }
    if (endpoint === 'rule/custom') {
      return { count: customRulesFixture.length, rules: structuredClone(customRulesFixture) }
    }
    if (endpoint === 'rule/groups') {
      return { count: groupsFixture.length, rule_groups: structuredClone(groupsFixture) }
    }
    if (endpoint === 'system/setting/TorrentsPriority') {
      return { success: true, data: { value: ['site', 'seeder'] } }
    }
    throw new Error(`Unexpected GET ${endpoint}`)
  })
  mocks.apiDelete.mockResolvedValue({ success: true })
  mocks.apiPost.mockResolvedValue({ success: true })
  mocks.apiPut.mockResolvedValue({ success: true })
}

async function renderRuleSettings() {
  return renderWithProviders(AccountSettingRule)
}

function getCard(title: string) {
  const card = screen.getByText(title).closest('.v-card')
  expect(card).not.toBeNull()
  return within(card as HTMLElement)
}

function getCommandButtons(title: string) {
  const card = screen.getByText(title).closest('.v-card')
  expect(card).not.toBeNull()
  return Array.from((card as HTMLElement).querySelectorAll<HTMLButtonElement>('button.v-btn'))
}

function getImportSave(callIndex: number) {
  return mocks.openSharedDialog.mock.calls[callIndex]?.[2]?.save as (type: string, value: { value: string }) => void
}

describe('AccountSettingRule', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.apiDelete.mockReset()
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiPut.mockReset()
    mocks.copyToClipboard.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastWarning.mockReset()
    mocks.useSilentSettingRefresh.mockReset()
    mocks.copyToClipboard.mockResolvedValue(true)
    mockLoadedRules()
  })

  it('loads rules, groups, priority, and follows active refresh state', async () => {
    const { rerender } = await renderRuleSettings()

    expect(await screen.findByText('RULE1 / 规则1')).toBeInTheDocument()
    expect(screen.getByText('规则组1')).toBeInTheDocument()
    expect(screen.getByLabelText('当前使用下载优先规则')).toHaveValue('site, seeder')

    const refreshOptions = mocks.useSilentSettingRefresh.mock.calls[0]?.[1]
    expect(refreshOptions.active.value).toBe(true)
    await rerender({ active: false })
    expect(refreshOptions.active.value).toBe(false)
  })

  it('saves custom rules, groups, and torrent priority in current order', async () => {
    const user = userEvent.setup()
    await renderRuleSettings()
    await screen.findByText('RULE1 / 规则1')

    await user.click(screen.getByRole('button', { name: 'reverse-规则1' }))
    await user.click(getCard('自定义规则').getByRole('button', { name: '保存' }))
    expect(mocks.apiPut).toHaveBeenCalledWith('rule/custom/reorder', {
      rule_ids: ['RULE3', 'RULE1'],
      expected_rule_ids: ['RULE1', 'RULE3'],
    })

    await user.click(screen.getByRole('button', { name: 'reverse-规则组1' }))
    await user.click(getCard('优先级规则组').getByRole('button', { name: '保存' }))
    expect(mocks.apiPut).toHaveBeenCalledWith('rule/groups/reorder', {
      group_names: ['规则组3', '规则组1'],
      expected_group_names: ['规则组1', '规则组3'],
    })

    await user.click(getCard('下载规则').getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/TorrentsPriority', ['site', 'seeder'])
  })

  it('adds unique automatic names and removes the selected items', async () => {
    const user = userEvent.setup()
    await renderRuleSettings()
    await screen.findByText('RULE1 / 规则1')

    await user.click(getCommandButtons('自定义规则')[1])
    expect(screen.getByText('RULE4 / 规则4')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'remove-custom-RULE1' }))
    expect(screen.queryByText('RULE1 / 规则1')).not.toBeInTheDocument()

    await user.click(getCommandButtons('优先级规则组')[1])
    expect(screen.getByText('规则组4')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'remove-group-规则组1' }))
    expect(screen.queryByText('规则组1')).not.toBeInTheDocument()
  })

  it('reconciles custom rule deletions, edits, and additions through incremental endpoints', async () => {
    const user = userEvent.setup()
    await renderRuleSettings()
    await screen.findByText('RULE1 / 规则1')

    const idInput = screen.getByLabelText('custom-id-RULE1')
    const nameInput = screen.getByLabelText('custom-name-RULE1')
    await fireEvent.update(idInput, 'RULE2')
    await fireEvent.update(nameInput, '规则2')
    await user.click(screen.getByRole('button', { name: 'remove-custom-RULE3' }))
    await user.click(getCommandButtons('自定义规则')[1])
    await user.click(getCard('自定义规则').getByRole('button', { name: '保存' }))

    expect(mocks.apiDelete).toHaveBeenCalledWith('rule/custom/RULE3')
    expect(mocks.apiPut).toHaveBeenCalledWith('rule/custom/RULE1', {
      new_rule_id: 'RULE2',
      name: '规则2',
    })
    expect(mocks.apiPost).toHaveBeenCalledWith('rule/custom', {
      rule_id: 'RULE3',
      name: '规则3',
      include: undefined,
      exclude: undefined,
      size_range: undefined,
      seeders: undefined,
      publish_time: undefined,
    })
  })

  it('blocks empty and duplicate custom rule identifiers or names', async () => {
    const user = userEvent.setup()
    await renderRuleSettings()
    await screen.findByText('RULE1 / 规则1')
    const save = getCard('自定义规则').getByRole('button', { name: '保存' })
    const idInput = screen.getByLabelText('custom-id-RULE1')
    const nameInput = screen.getByLabelText('custom-name-RULE1')

    await fireEvent.update(idInput, '')
    await user.click(save)
    expect(mocks.toastError).toHaveBeenCalledWith('存在空ID的规则，无法保存，请修改！')

    await fireEvent.update(idInput, 'RULE3')
    await user.click(save)
    expect(mocks.toastError).toHaveBeenCalledWith('存在重复规则ID！无法保存，请修改！')

    await fireEvent.update(idInput, 'RULE1')
    await fireEvent.update(nameInput, '')
    await user.click(save)
    expect(mocks.toastError).toHaveBeenCalledWith('存在空名字的规则，无法保存，请修改！')

    await fireEvent.update(nameInput, '规则3')
    await user.click(save)
    expect(mocks.toastError).toHaveBeenCalledWith('存在重复规则名称！无法保存，请修改！')
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })

  it('blocks empty and duplicate rule group names', async () => {
    const user = userEvent.setup()
    await renderRuleSettings()
    await screen.findByText('规则组1')
    const save = getCard('优先级规则组').getByRole('button', { name: '保存' })
    const nameInput = screen.getByLabelText('group-name-规则组1')

    await fireEvent.update(nameInput, '')
    await user.click(save)
    expect(mocks.toastError).toHaveBeenCalledWith('存在空名字的规则组！无法保存，请修改！')

    await fireEvent.update(nameInput, '规则组3')
    await user.click(save)
    expect(mocks.toastError).toHaveBeenCalledWith('存在重复规则组名称！无法保存，请修改！')
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })

  it('imports only contract fields for custom rules and rule groups', async () => {
    const user = userEvent.setup()
    await renderRuleSettings()
    await screen.findByText('规则组1')

    await user.click(getCommandButtons('自定义规则')[2])
    getImportSave(0)('custom', {
      value: JSON.stringify([{ id: 'RULE9', name: '规则9', include: 'REMUX', unexpected: 'ignored' }]),
    })
    expect(await screen.findByText('RULE9 / 规则9')).toBeInTheDocument()
    await user.click(getCard('自定义规则').getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenLastCalledWith('rule/custom', {
      rule_id: 'RULE9',
      name: '规则9',
      include: 'REMUX',
      exclude: undefined,
      size_range: undefined,
      seeders: undefined,
      publish_time: undefined,
    })

    await user.click(getCommandButtons('优先级规则组')[2])
    getImportSave(1)('group', {
      value: JSON.stringify([{ name: '规则组9', rule_string: 'RULE9', media_type: '电影', extra: true }]),
    })
    expect(await screen.findByText('规则组9')).toBeInTheDocument()
    await user.click(getCard('优先级规则组').getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenLastCalledWith('rule/groups', {
      name: '规则组9',
      rule_string: 'RULE9',
      media_type: '电影',
      category: undefined,
    })
  })

  it('rejects malformed or structurally invalid imports without mutating rules', async () => {
    const user = userEvent.setup()
    await renderRuleSettings()
    await screen.findByText('RULE1 / 规则1')

    await user.click(getCommandButtons('自定义规则')[2])
    getImportSave(0)('custom', { value: '{bad json' })
    expect(mocks.toastError).toHaveBeenCalledWith('导入规则失败！无法解析输入的数据！')
    expect(screen.queryByText('RULE9 / 规则9')).not.toBeInTheDocument()

    getImportSave(0)('unknown', { value: JSON.stringify([{ id: 'RULE9', name: '规则9' }]) })
    expect(mocks.toastError).toHaveBeenCalledWith('导入规则失败！未知的数据类型！')
    expect(screen.queryByText('RULE9 / 规则9')).not.toBeInTheDocument()

    getImportSave(0)('custom', { value: JSON.stringify([{ name: '缺少ID' }]) })
    expect(mocks.toastError).toHaveBeenCalledWith('导入失败！发现有规则不存在ID，可能属于优先级规则组！')

    await user.click(getCommandButtons('优先级规则组')[2])
    getImportSave(1)('group', { value: JSON.stringify([{ id: 'RULE1', name: '不合法规则组' }]) })
    expect(mocks.toastError).toHaveBeenCalledWith('导入失败！发现有规则存在相同ID，可能属于自定义规则！')
    expect(screen.queryByText('不合法规则组')).not.toBeInTheDocument()
  })

  it('shares and clears each collection through its command group', async () => {
    const user = userEvent.setup()
    await renderRuleSettings()
    await screen.findByText('RULE1 / 规则1')

    await user.click(getCommandButtons('自定义规则')[3])
    expect(mocks.copyToClipboard).toHaveBeenCalledWith(JSON.stringify(customRulesFixture))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('自定义规则已复制到剪贴板！'))
    await user.click(getCommandButtons('自定义规则')[4])
    expect(screen.queryByText('RULE1 / 规则1')).not.toBeInTheDocument()

    mocks.copyToClipboard.mockResolvedValueOnce(false)
    await user.click(getCommandButtons('优先级规则组')[3])
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('优先级规则组复制失败：可能是浏览器不支持或被用户阻止！'),
    )
    await user.click(getCommandButtons('优先级规则组')[4])
    expect(screen.queryByText('规则组1')).not.toBeInTheDocument()
  })

  it('reports business and HTTP failures for each save responsibility', async () => {
    const user = userEvent.setup()
    await renderRuleSettings()
    await screen.findByText('RULE1 / 规则1')

    await fireEvent.update(screen.getByLabelText('custom-name-RULE1'), '规则一')
    mocks.apiPut.mockResolvedValueOnce({ success: false })
    await user.click(getCard('自定义规则').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('自定义规则保存失败！'))
    expect(await screen.findByText('RULE1 / 规则1')).toBeInTheDocument()

    mocks.toastError.mockClear()
    await fireEvent.update(screen.getByLabelText('custom-name-RULE1'), '规则一')
    mocks.apiPut.mockRejectedValueOnce(new Error('offline'))
    await user.click(getCard('自定义规则').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('自定义规则保存失败！'))

    mocks.toastError.mockClear()
    await fireEvent.update(screen.getByLabelText('group-name-规则组1'), '规则组一')
    mocks.apiPut.mockResolvedValueOnce({ success: false })
    await user.click(getCard('优先级规则组').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('优先级规则组保存失败！'))
    expect(await screen.findByText('规则组1')).toBeInTheDocument()

    mocks.toastError.mockClear()
    await fireEvent.update(screen.getByLabelText('group-name-规则组1'), '规则组一')
    mocks.apiPut.mockRejectedValueOnce(new Error('offline'))
    await user.click(getCard('优先级规则组').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('优先级规则组保存失败！'))

    mocks.toastError.mockClear()
    mocks.apiPost.mockResolvedValueOnce({ success: false })
    await user.click(getCard('下载规则').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('优先规则保存失败！'))

    mocks.toastError.mockClear()
    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await user.click(getCard('下载规则').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('优先规则保存失败！'))
  })
})
