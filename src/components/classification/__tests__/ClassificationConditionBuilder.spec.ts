import type {
  ClassificationConditionNode,
  ClassificationFieldDefinition,
  ClassificationFieldValueType,
  ClassificationMediaType,
  ClassificationOperator,
} from '@/api/mediaClassificationTypes'
import ClassificationConditionBuilder from '@/components/classification/ClassificationConditionBuilder.vue'
import { fireEvent, screen, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { Fragment, defineComponent, h, inject, provide, type InjectionKey, type PropType } from 'vue'
import { describe, expect, it } from 'vitest'

type ToggleHandler = (value: unknown) => void

const toggleHandlerKey: InjectionKey<ToggleHandler> = Symbol('classification-condition-toggle')

/** 把 Vuetify item 统一转换为测试可点击的标题和值。 */
function normalizeItem(item: unknown): { title: string; value: unknown } {
  if (typeof item === 'object' && item !== null && 'value' in item) {
    const record = item as { title?: unknown; value: unknown }
    return { title: String(record.title ?? record.value), value: record.value }
  }
  return { title: String(item), value: item }
}

const SelectStub = defineComponent({
  name: 'VSelect',
  inheritAttrs: false,
  props: {
    disabled: Boolean,
    items: { type: Array as PropType<unknown[]>, default: () => [] },
    label: String,
    modelValue: { type: null as unknown as PropType<unknown>, default: undefined },
    multiple: Boolean,
    returnObject: Boolean,
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    /** 模拟单选或多选，并保留目录选项的原始 JSON 类型。 */
    function selectValue(item: unknown): void {
      if (props.disabled) return
      const normalized = normalizeItem(item)
      const value = props.returnObject ? item : normalized.value
      if (!props.multiple) {
        emit('update:modelValue', value)
        return
      }
      const current = Array.isArray(props.modelValue) ? props.modelValue : []
      const exists = current.some(item => Object.is(item, value))
      emit('update:modelValue', exists ? current.filter(item => !Object.is(item, value)) : [...current, value])
    }

    return () =>
      h('fieldset', { ...attrs, 'aria-label': attrs['aria-label'] ?? props.label }, [
        h('legend', props.label),
        ...props.items.map(item => {
          const normalized = normalizeItem(item)
          return h(
            'button',
            {
              type: 'button',
              disabled: props.disabled,
              onClick: () => selectValue(item),
            },
            normalized.title,
          )
        }),
      ])
  },
})

const ComboboxStub = defineComponent({
  name: 'VCombobox',
  inheritAttrs: false,
  props: {
    label: String,
    modelValue: { type: null as unknown as PropType<unknown>, default: undefined },
    multiple: Boolean,
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    /** 把任意 modelValue 转换为测试输入框可显示的字符串。 */
    function displayValue(value: unknown): string {
      if (Array.isArray(value)) return value.map(item => String(item)).join(',')
      return value === null || value === undefined ? '' : String(value)
    }

    /** 将测试输入按控件是否多选转换为字符串或成员数组。 */
    function updateValue(event: Event): void {
      const rawValue = (event.target as HTMLInputElement).value
      emit(
        'update:modelValue',
        props.multiple
          ? rawValue
              .split(',')
              .map(item => item.trim())
              .filter(Boolean)
          : rawValue,
      )
    }

    return () =>
      h('label', { ...attrs }, [
        h('span', props.label),
        h('input', {
          'aria-label': attrs['aria-label'] ?? props.label,
          'value': displayValue(props.modelValue),
          onInput: updateValue,
        }),
      ])
  },
})

const TextFieldStub = defineComponent({
  name: 'VTextField',
  inheritAttrs: false,
  props: {
    label: String,
    modelValue: { type: null as unknown as PropType<unknown>, default: undefined },
    type: { type: String, default: 'text' },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('label', { ...attrs }, [
        h('span', props.label),
        h('input', {
          'aria-label': props.label,
          'type': props.type,
          'value': props.modelValue ?? '',
          onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
        }),
      ])
  },
})

const ButtonToggleStub = defineComponent({
  name: 'VBtnToggle',
  inheritAttrs: false,
  props: {
    disabled: Boolean,
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit, slots }) {
    /** 向内部按钮提供与 VBtnToggle 等价的值更新入口。 */
    provide(toggleHandlerKey, value => {
      if (!props.disabled) emit('update:modelValue', value)
    })
    return () => h('div', { ...attrs, role: 'group' }, slots.default?.())
  },
})

const ButtonStub = defineComponent({
  name: 'VBtn',
  inheritAttrs: false,
  props: {
    disabled: Boolean,
    icon: { type: [String, Boolean] as PropType<string | boolean>, default: false },
    value: { default: undefined },
  },
  emits: ['click'],
  setup(props, { attrs, emit, slots }) {
    const updateToggle = inject(toggleHandlerKey, undefined)

    /** 同时模拟普通图标按钮和分段控件按钮的点击行为。 */
    function click(event: MouseEvent): void {
      if (props.disabled) return
      if (props.value !== undefined) updateToggle?.(props.value)
      emit('click', event)
    }

    return () =>
      h(
        'button',
        { ...attrs, type: 'button', disabled: props.disabled, onClick: click },
        slots.default?.() ?? (typeof props.icon === 'string' ? props.icon : ''),
      )
  },
})

const TooltipStub = defineComponent({
  name: 'VTooltip',
  inheritAttrs: false,
  props: { text: String },
  setup(props, { slots }) {
    return () => h(Fragment, [slots.activator?.({ props: { title: props.text } }), slots.default?.()])
  },
})

const PassThroughStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('div', attrs, slots.default?.())
  },
})

const componentStubs = {
  VAlert: PassThroughStub,
  VAutocomplete: SelectStub,
  VBtn: ButtonStub,
  VBtnToggle: ButtonToggleStub,
  VChip: PassThroughStub,
  VCombobox: ComboboxStub,
  VIcon: PassThroughStub,
  VSelect: SelectStub,
  VTextField: TextFieldStub,
  VTooltip: TooltipStub,
}

/** 构造覆盖指定值类型的动态字段目录项。 */
function fieldDefinition(
  id: string,
  label: string,
  valueType: ClassificationFieldValueType,
  operators: ClassificationOperator[],
  options: ClassificationFieldDefinition['options'] = [],
  mediaTypes: ClassificationMediaType[] = ['电影'],
  allowCustomValues = true,
): ClassificationFieldDefinition {
  return {
    id,
    label,
    group: id.startsWith('music.') ? '音乐' : '媒体',
    description: `${label}说明`,
    value_type: valueType,
    operators,
    media_types: mediaTypes,
    options,
    allow_custom_values: allowCustomValues,
    source_support: {
      douban: 'unavailable',
      musicbrainz: 'native',
      themoviedb: 'partial',
    },
  }
}

const fields: ClassificationFieldDefinition[] = [
  fieldDefinition('media.title', '标题', 'string', ['equals', 'starts_with', 'exists']),
  fieldDefinition(
    'media.rating',
    '分级',
    'enum',
    ['equals', 'not_equals', 'in'],
    [
      { label: 'PG', value: 'PG' },
      { label: 'R', value: 'R' },
    ],
    ['电影'],
    false,
  ),
  fieldDefinition('media.runtime', '时长', 'integer', ['gt', 'between']),
  fieldDefinition('media.score', '评分', 'number', ['gte', 'between']),
  fieldDefinition('media.year', '年份', 'year', ['gte', 'between', 'exists'], [], ['电影', '电视剧']),
  fieldDefinition('media.genre_keys', '风格', 'string_list', ['contains_any', 'contains_all', 'exists']),
  fieldDefinition('media.adult', '成人内容', 'boolean', ['equals', 'is_true', 'is_false', 'exists']),
  fieldDefinition('music.tags', '音乐标签', 'string_list', ['contains_any'], [], ['音乐']),
  {
    ...fieldDefinition('extensions.themoviedb.genre_ids', '风格（旧规则）', 'string_list', ['contains_any']),
    group: '旧规则',
    selectable: false,
    replacement_field: 'media.genre_keys',
  },
]

const defaultProps = {
  fields,
  mediaTypes: ['电影'] as ClassificationMediaType[],
  sources: ['themoviedb', 'douban'],
}

/** 渲染带生产插件和轻量输入控件的条件构建器。 */
async function renderBuilder(modelValue: ClassificationConditionNode, overrides: Record<string, unknown> = {}) {
  return renderWithProviders(ClassificationConditionBuilder, {
    props: { ...defaultProps, modelValue, ...overrides },
    global: { stubs: componentStubs },
  })
}

/** 读取最近一次受控节点更新。 */
function latestModel(result: Awaited<ReturnType<typeof renderBuilder>>): ClassificationConditionNode {
  const updates = result.emitted()['update:modelValue'] as unknown[][] | undefined
  return updates?.at(-1)?.[0] as ClassificationConditionNode
}

describe('ClassificationConditionBuilder', () => {
  it('按媒体类型过滤动态字段，并只展示字段目录声明的操作符', async () => {
    const result = await renderBuilder({ field: 'media.year', operator: 'gte', value: 2000 })

    const fieldSelect = screen.getByTestId('field-select')
    expect(fieldSelect).toHaveAttribute('aria-label', '条件字段')
    expect(within(fieldSelect).getByRole('button', { name: '媒体 · 年份' })).toBeInTheDocument()
    expect(within(fieldSelect).queryByRole('button', { name: '音乐 · 音乐标签' })).not.toBeInTheDocument()
    expect(within(fieldSelect).queryByRole('button', { name: '旧规则 · 风格（旧规则）' })).not.toBeInTheDocument()

    const operatorSelect = screen.getByTestId('operator-select')
    expect(operatorSelect).toHaveAttribute('aria-label', '条件操作符')
    expect(within(operatorSelect).getByRole('button', { name: '大于等于' })).toBeInTheDocument()
    expect(within(operatorSelect).getByRole('button', { name: '介于' })).toBeInTheDocument()
    expect(within(operatorSelect).getByRole('button', { name: '存在' })).toBeInTheDocument()
    expect(within(operatorSelect).queryByRole('button', { name: '等于' })).not.toBeInTheDocument()

    await fireEvent.click(within(fieldSelect).getByRole('button', { name: '媒体 · 分级' }))
    expect(latestModel(result)).toEqual({ field: 'media.rating', operator: 'equals', value: 'PG' })

    await result.rerender({ ...defaultProps, modelValue: latestModel(result) })
    expect(within(screen.getByTestId('operator-select')).getByRole('button', { name: '不等于' })).toBeInTheDocument()
    expect(
      within(screen.getByTestId('operator-select')).queryByRole('button', { name: '介于' }),
    ).not.toBeInTheDocument()
  })

  it('保留已有退役字段的编辑语义，但不允许将其用于新条件', async () => {
    await renderBuilder({
      field: 'extensions.themoviedb.genre_ids',
      operator: 'contains_any',
      value: ['16'],
    })

    expect(
      within(screen.getByTestId('field-select')).getByRole('button', { name: '旧规则 · 风格（旧规则）' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('retired-field-hint')).toHaveTextContent('此字段只保留旧规则的原始匹配。')
    expect(screen.getByTestId('retired-field-hint')).toHaveTextContent('建议改用“风格”')
  })

  it('按 string、enum、integer、number、year、string_list、boolean 和无值操作符输出类型化值', async () => {
    const result = await renderBuilder({ field: 'media.title', operator: 'equals', value: '旧标题' })

    await fireEvent.update(within(screen.getByTestId('text-value-input')).getByRole('textbox'), '新标题')
    expect(latestModel(result)).toEqual({ field: 'media.title', operator: 'equals', value: '新标题' })

    await result.rerender({ ...defaultProps, modelValue: { field: 'media.rating', operator: 'equals', value: 'PG' } })
    expect(screen.getByTestId('select-value-input')).toHaveAttribute('aria-label', '条件值')
    await fireEvent.click(within(screen.getByTestId('select-value-input')).getByRole('button', { name: 'R' }))
    expect(latestModel(result)).toEqual({ field: 'media.rating', operator: 'equals', value: 'R' })

    await result.rerender({ ...defaultProps, modelValue: { field: 'media.runtime', operator: 'gt', value: 90 } })
    await fireEvent.update(within(screen.getByTestId('number-value-input')).getByRole('spinbutton'), '120')
    expect(latestModel(result)).toEqual({ field: 'media.runtime', operator: 'gt', value: 120 })

    await result.rerender({ ...defaultProps, modelValue: { field: 'media.score', operator: 'gte', value: 7.5 } })
    await fireEvent.update(within(screen.getByTestId('number-value-input')).getByRole('spinbutton'), '8.25')
    expect(latestModel(result)).toEqual({ field: 'media.score', operator: 'gte', value: 8.25 })

    await result.rerender({
      ...defaultProps,
      modelValue: { field: 'media.year', operator: 'between', value: [1990, 2020] },
    })
    await fireEvent.update(within(screen.getByTestId('range-start')).getByRole('spinbutton'), '2001')
    expect(latestModel(result)).toEqual({ field: 'media.year', operator: 'between', value: [2001, 2020] })

    await result.rerender({
      ...defaultProps,
      modelValue: { field: 'media.genre_keys', operator: 'contains_any', value: ['剧情'] },
    })
    expect(within(screen.getByTestId('list-value-input')).getByLabelText('条件值列表')).toBeInTheDocument()
    await fireEvent.update(within(screen.getByTestId('list-value-input')).getByRole('textbox'), '动画, 家庭')
    expect(latestModel(result)).toEqual({
      field: 'media.genre_keys',
      operator: 'contains_any',
      value: ['动画', '家庭'],
    })

    await result.rerender({ ...defaultProps, modelValue: { field: 'media.adult', operator: 'equals', value: true } })
    await fireEvent.click(within(screen.getByTestId('boolean-value-input')).getByRole('button', { name: '否' }))
    expect(latestModel(result)).toEqual({ field: 'media.adult', operator: 'equals', value: false })

    await fireEvent.click(within(screen.getByTestId('operator-select')).getByRole('button', { name: '为真' }))
    expect(latestModel(result)).toEqual({ field: 'media.adult', operator: 'is_true' })
    await result.rerender({ ...defaultProps, modelValue: latestModel(result) })
    expect(screen.getByTestId('no-value')).toHaveTextContent('此操作符无需值')
    expect(screen.queryByTestId('number-value-input')).not.toBeInTheDocument()
  })

  it('支持递归切换组类型、更新、新增和删除子条件', async () => {
    const initial: ClassificationConditionNode = {
      all: [
        { field: 'media.title', operator: 'equals', value: '原标题' },
        { field: 'media.year', operator: 'gte', value: 2020 },
      ],
    }
    const result = await renderBuilder(initial)

    const root = result.container.querySelector<HTMLElement>('section[data-depth="0"]')
    expect(root).not.toBeNull()
    expect(result.container.querySelectorAll('section[data-depth="1"]')).toHaveLength(2)

    const firstChild = result.container.querySelector<HTMLElement>('section[data-depth="1"]')
    expect(firstChild).not.toBeNull()
    await fireEvent.update(within(firstChild as HTMLElement).getByRole('textbox'), '新标题')
    expect(latestModel(result)).toEqual({
      all: [
        { field: 'media.title', operator: 'equals', value: '新标题' },
        { field: 'media.year', operator: 'gte', value: 2020 },
      ],
    })

    await result.rerender({ ...defaultProps, modelValue: latestModel(result) })
    await fireEvent.click(within(root as HTMLElement).getByRole('button', { name: '新增子条件' }))
    expect((latestModel(result) as { all: ClassificationConditionNode[] }).all).toHaveLength(3)

    await result.rerender({ ...defaultProps, modelValue: latestModel(result) })
    const deleteButtons = within(root as HTMLElement).getAllByRole('button', { name: /删除子条件/ })
    expect(deleteButtons).toHaveLength(3)
    await fireEvent.click(deleteButtons[1])
    expect((latestModel(result) as { all: ClassificationConditionNode[] }).all).toHaveLength(2)

    await result.rerender({ ...defaultProps, modelValue: latestModel(result) })
    await fireEvent.click(within(root as HTMLElement).getAllByRole('button', { name: '任一' })[0])
    expect(latestModel(result)).toHaveProperty('any')

    await result.rerender({ ...defaultProps, modelValue: latestModel(result) })
    await fireEvent.click(within(root as HTMLElement).getAllByRole('button', { name: '非' })[0])
    expect(latestModel(result)).toHaveProperty('not')
  })

  it('达到 maxDepth 后禁止继续切换为条件组', async () => {
    const result = await renderBuilder(
      { field: 'media.title', operator: 'equals', value: '标题' },
      { depth: 2, maxDepth: 2 },
    )

    expect(screen.getByTestId('depth-limit')).toHaveTextContent('已达最大组深度')
    for (const label of ['全部', '任一', '非']) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled()
    }

    await fireEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(result.emitted()['update:modelValue']).toBeUndefined()
  })

  it('仅显示所选来源中的 partial 和 unavailable 支持提示', async () => {
    const result = await renderBuilder({ field: 'media.title', operator: 'equals', value: '标题' })

    const hints = screen.getByTestId('source-support-hints')
    expect(hints).toHaveTextContent('themoviedb：部分支持')
    expect(hints).toHaveTextContent('douban：不可用')
    expect(hints).not.toHaveTextContent('musicbrainz')

    await result.rerender({
      ...defaultProps,
      modelValue: { field: 'media.title', operator: 'equals', value: '标题' },
      sources: ['musicbrainz'],
    })
    expect(screen.queryByTestId('source-support-hints')).not.toBeInTheDocument()
  })

  it('所有编辑都通过 emit 返回新节点且不改写输入 props', async () => {
    const modelValue: ClassificationConditionNode = {
      all: [
        { field: 'media.title', operator: 'equals', value: '原标题' },
        { field: 'media.year', operator: 'gte', value: 2020 },
      ],
    }
    const mediaTypes: ClassificationMediaType[] = ['电影']
    const sources = ['themoviedb', 'douban']
    const snapshots = {
      fields: structuredClone(fields),
      mediaTypes: structuredClone(mediaTypes),
      modelValue: structuredClone(modelValue),
      sources: structuredClone(sources),
    }
    const result = await renderBuilder(modelValue, { fields, mediaTypes, sources })

    await fireEvent.click(screen.getByRole('button', { name: '新增子条件' }))

    expect(latestModel(result)).not.toBe(modelValue)
    expect(modelValue).toEqual(snapshots.modelValue)
    expect(fields).toEqual(snapshots.fields)
    expect(mediaTypes).toEqual(snapshots.mediaTypes)
    expect(sources).toEqual(snapshots.sources)
  })
})
