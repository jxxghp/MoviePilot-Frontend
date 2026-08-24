import InvokePluginAction from '@/components/workflow/InvokePluginAction.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

vi.mock('@vue-flow/core', async () => {
  const { defineComponent: defineVueComponent, h: createElement } = await import('vue')
  return {
    Handle: defineVueComponent({ setup: () => () => createElement('span') }),
    Position: { Left: 'left', Right: 'right' },
  }
})

type SelectItem = { title: string; value: string }

const SelectStub = defineComponent({
  name: 'VSelect',
  props: {
    items: { type: Array as PropType<SelectItem[]>, default: () => [] },
    label: { type: String, default: '' },
    modelValue: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup:
    (props, { emit }) =>
    () =>
      h('label', [
        h('span', props.label),
        h(
          'select',
          {
            'aria-label': props.label,
            onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value),
            value: props.modelValue,
          },
          props.items.map(item => h('option', { value: item.value }, item.title)),
        ),
      ]),
})

const TextareaStub = defineComponent({
  name: 'VTextarea',
  props: {
    label: { type: String, default: '' },
    modelValue: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup:
    (props, { emit }) =>
    () =>
      h('label', [
        h('span', props.label),
        h('textarea', {
          'aria-label': props.label,
          onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
          value: props.modelValue,
        }),
      ]),
})

const BoxStub = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h('div', slots.default?.()),
})

function createData(overrides: Record<string, unknown> = {}) {
  return {
    action_id: 'refresh',
    action_params: { force: true },
    plugin_id: 'plugin-a',
    ...overrides,
  }
}

async function renderAction(data = createData()) {
  return renderWithProviders(InvokePluginAction, {
    props: { data, id: 'action-1' },
    global: {
      stubs: {
        VAvatar: BoxStub,
        VCard: BoxStub,
        VCardItem: BoxStub,
        VCardSubtitle: BoxStub,
        VCardText: BoxStub,
        VCardTitle: BoxStub,
        VCol: BoxStub,
        VDivider: true,
        VIcon: true,
        VRow: BoxStub,
        VSelect: SelectStub,
        VTextarea: TextareaStub,
      },
    },
  })
}

describe('InvokePluginAction', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset().mockResolvedValue([
      {
        actions: [
          { id: 'refresh', name: '刷新缓存' },
          { id: 'sync', name: '同步数据' },
        ],
        plugin_id: 'plugin-a',
        plugin_name: '插件 A',
      },
      {
        actions: [{ id: 'cleanup', name: '清理数据' }],
        plugin_id: 'plugin-b',
        plugin_name: '插件 B',
      },
    ])
  })

  it('maps the public plugin action id contract to the selected plugin options', async () => {
    const data = createData()
    await renderAction(data)

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('workflow/plugin/actions'))
    const pluginSelect = screen.getByLabelText('插件')
    const actionSelect = screen.getByLabelText('动作ID')
    expect(
      within(pluginSelect)
        .getAllByRole('option')
        .map(option => option.getAttribute('value')),
    ).toEqual(['plugin-a', 'plugin-b'])
    expect(
      within(actionSelect)
        .getAllByRole('option')
        .map(option => option.getAttribute('value')),
    ).toEqual(['refresh', 'sync'])

    await fireEvent.update(pluginSelect, 'plugin-b')
    await waitFor(() =>
      expect(within(screen.getByLabelText('动作ID')).getByRole('option', { name: '清理数据' })).toHaveValue('cleanup'),
    )
    await fireEvent.update(actionSelect, 'cleanup')
    expect(data).toEqual(expect.objectContaining({ action_id: 'cleanup', plugin_id: 'plugin-b' }))
  })

  it('round-trips object parameters and preserves invalid JSON for correction', async () => {
    const data = createData()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await renderAction(data)

    const params = screen.getByLabelText('动作参数')
    expect(params).toHaveValue('{\n  "force": true\n}')

    await fireEvent.update(params, '{"force":false,"limit":2}')
    expect(data.action_params).toEqual({ force: false, limit: 2 })

    await fireEvent.update(params, '{invalid')
    expect(data.action_params).toBe('{invalid')
    expect(consoleError).toHaveBeenCalled()

    await fireEvent.update(params, '')
    expect(data.action_params).toEqual({})
  })

  it('keeps existing configuration when plugin actions fail to load', async () => {
    const error = new Error('plugin actions unavailable')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const data = createData({ action_params: 'raw parameters' })
    mocks.apiGet.mockRejectedValueOnce(error)

    await renderAction(data)

    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(error))
    expect(screen.getByLabelText('插件')).toBeEmptyDOMElement()
    expect(screen.getByLabelText('动作ID')).toBeEmptyDOMElement()
    expect(screen.getByLabelText('动作参数')).toHaveValue('raw parameters')
    expect(data).toEqual({ action_id: 'refresh', action_params: 'raw parameters', plugin_id: 'plugin-a' })
  })
})
