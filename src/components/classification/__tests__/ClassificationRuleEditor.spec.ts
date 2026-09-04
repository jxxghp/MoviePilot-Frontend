import type {
  ClassificationCategory,
  ClassificationFieldDefinition,
  ClassificationRule,
} from '@/api/mediaClassificationTypes'
import ClassificationRuleEditor from '@/components/classification/ClassificationRuleEditor.vue'
import userEvent from '@testing-library/user-event'
import { fireEvent, screen, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('vuedraggable', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'DraggableStub',
      props: { modelValue: { type: Array, default: () => [] } },
      emits: ['update:modelValue'],
      setup(props, { emit, slots }) {
        /** 模拟拖拽结束后由 vuedraggable 提交的新顺序。 */
        const reverse = () => emit('update:modelValue', [...props.modelValue].reverse())
        return () =>
          h('div', { 'data-testid': 'rule-draggable' }, [
            h('button', { 'aria-label': '模拟拖拽反转', type: 'button', onClick: reverse }, 'reverse'),
            ...(props.modelValue as ClassificationRule[]).map((element, index) => slots.item?.({ element, index })),
          ])
      },
    }),
  }
})

vi.mock('@/components/classification/ClassificationConditionBuilder.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'ClassificationConditionBuilderStub',
      props: {
        modelValue: { type: Object, required: true },
        fields: { type: Array, required: true },
        mediaTypes: { type: Array, required: true },
        sources: { type: Array, required: true },
        maxDepth: { type: Number, required: true },
      },
      emits: ['update:modelValue'],
      setup(props) {
        return () =>
          h(
            'output',
            { 'aria-label': '条件构建器状态' },
            JSON.stringify({
              maxDepth: props.maxDepth,
              mediaTypes: props.mediaTypes,
              sources: props.sources,
            }),
          )
      },
    }),
  }
})

const categories: ClassificationCategory[] = [
  { id: 'movie-cn', media_type: '电影', name: '华语电影', path: ['电影', '华语'], enabled: true, labels: [] },
  { id: 'tv-animation', media_type: '电视剧', name: '动画剧集', path: ['电视剧', '动画'], enabled: true, labels: [] },
  { id: 'music-rock', media_type: '音乐', name: '摇滚专辑', path: ['音乐', '摇滚'], enabled: true, labels: [] },
]

const fields: ClassificationFieldDefinition[] = [
  {
    id: 'media.genre_names',
    label: '类型',
    group: '媒体',
    value_type: 'string_list',
    operators: ['contains_any'],
    media_types: ['电影', '电视剧', '音乐'],
    options: [],
    allow_custom_values: true,
    source_support: { themoviedb: 'native', musicbrainz: 'partial' },
  },
]

/** 创建测试规则，覆盖分类规则和标签规则共用的数据结构。 */
function createRule(overrides: Partial<ClassificationRule> = {}): ClassificationRule {
  return {
    id: 'rule-movie',
    name: '电影规则',
    kind: 'category',
    enabled: true,
    priority: 0,
    media_types: ['电影'],
    sources: [],
    when: { all: [] },
    target: { category_id: 'movie-cn', labels: [] },
    ...overrides,
  }
}

/** 渲染规则编辑器并返回最近一次提交的规则数组。 */
async function renderEditor(rules: ClassificationRule[], options: { maxRules?: number } = {}) {
  const result = await renderWithProviders(ClassificationRuleEditor, {
    props: {
      rules,
      categories,
      fields,
      maxConditionDepth: 6,
      ...options,
    },
  })
  await screen.findByTestId('rule-draggable')
  if (rules[0]) await userEvent.click(screen.getByRole('button', { name: `编辑规则 ${rules[0].name}` }))

  return {
    ...result,
    latestRules: () => {
      const events = (result.emitted()['update:rules'] ?? []) as unknown[][]
      return events.at(-1)?.[0] as ClassificationRule[]
    },
  }
}

/** 从紧凑规则摘要的操作菜单执行排序、复制或删除。 */
async function runRuleAction(ruleName: string, action: '上移' | '下移' | '复制' | '删除'): Promise<void> {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: `规则操作 ${ruleName}` }))
  await user.click(await screen.findByText(`${action}规则 ${ruleName}`))
}

/** 打开 Vuetify 下拉框并选择一个选项。 */
async function selectOption(label: string, option: string) {
  const user = userEvent.setup()
  const visibleOption = screen.queryByRole('option', { name: option })
  if (visibleOption) {
    await user.click(visibleOption)
    return
  }

  await user.click(screen.getByLabelText(label))
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('ClassificationRuleEditor', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('新增、复制和删除规则，并为副本生成独立稳定 ID', async () => {
    const user = userEvent.setup()
    const editor = await renderEditor([createRule()])

    await user.click(screen.getByRole('button', { name: '新增分类规则' }))
    expect(editor.latestRules()).toEqual([
      expect.objectContaining({ id: 'rule-movie', priority: 0 }),
      expect.objectContaining({ id: 'rule-2', name: '新规则 2', priority: 1 }),
    ])

    await runRuleAction('电影规则', '复制')
    expect(editor.latestRules()).toEqual([
      expect.objectContaining({ id: 'rule-movie', priority: 0 }),
      expect.objectContaining({ id: 'rule-movie-copy', name: '电影规则 副本', priority: 1 }),
      expect.objectContaining({ id: 'rule-2', priority: 2 }),
    ])

    await runRuleAction('电影规则 副本', '删除')
    expect(editor.latestRules().map(rule => [rule.id, rule.priority])).toEqual([
      ['rule-movie', 0],
      ['rule-2', 1],
    ])
  })

  it('通过上下按钮和拖拽重排，并始终按顺序重算 priority', async () => {
    const user = userEvent.setup()
    const editor = await renderEditor([
      createRule(),
      createRule({ id: 'rule-music', name: '音乐规则', priority: 1, media_types: ['音乐'] }),
      createRule({ id: 'rule-tv', name: '剧集规则', priority: 2, media_types: ['电视剧'] }),
    ])

    await runRuleAction('电影规则', '下移')
    expect(editor.latestRules().map(rule => [rule.id, rule.priority])).toEqual([
      ['rule-music', 0],
      ['rule-movie', 1],
      ['rule-tv', 2],
    ])

    await user.click(screen.getByRole('button', { name: '模拟拖拽反转' }))
    expect(editor.latestRules().map(rule => [rule.id, rule.priority])).toEqual([
      ['rule-tv', 0],
      ['rule-movie', 1],
      ['rule-music', 2],
    ])
  })

  it('编辑名称、稳定 ID、启停状态、媒体类型和来源', async () => {
    const user = userEvent.setup()
    const editor = await renderEditor([createRule()])

    await fireEvent.update(screen.getByLabelText('规则名称 1'), '音乐来源规则')
    await fireEvent.update(screen.getByLabelText('规则编号 1'), 'rule-music-source')
    await user.click(screen.getByRole('checkbox', { name: '启用规则 音乐来源规则' }))
    await selectOption('媒体类型 音乐来源规则', '音乐')
    await selectOption('数据来源 音乐来源规则', 'musicbrainz')

    expect(editor.latestRules()[0]).toEqual(
      expect.objectContaining({
        id: 'rule-music-source',
        name: '音乐来源规则',
        enabled: false,
        media_types: ['电影', '音乐'],
        sources: ['musicbrainz'],
      }),
    )
  })

  it('切换规则开关时保留条件组的有效分支', async () => {
    const user = userEvent.setup()
    const condition = {
      all: null,
      any: [{ field: 'media.genre_names', operator: 'contains_any', value: ['动画'] }],
      not: null,
    } as ClassificationRule['when']
    const editor = await renderEditor([createRule({ when: condition })])

    await user.click(screen.getByRole('checkbox', { name: '启用规则 电影规则' }))

    expect(editor.latestRules()[0]).toEqual(
      expect.objectContaining({
        enabled: false,
        when: { any: [{ field: 'media.genre_names', operator: 'contains_any', value: ['动画'] }] },
      }),
    )
  })

  it('按媒体类型过滤分类目标，并在目标失效时自动清空', async () => {
    const user = userEvent.setup()
    const editor = await renderEditor([createRule()])

    await user.click(screen.getByLabelText('分类目标 电影规则'))
    expect(await screen.findByRole('option', { name: '华语电影 · 电影 / 华语' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '摇滚专辑 · 音乐 / 摇滚' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    await selectOption('媒体类型 电影规则', '音乐')
    expect(editor.latestRules()[0]?.target.category_id).toBe('movie-cn')

    await selectOption('媒体类型 电影规则', '电影')
    expect(editor.latestRules()[0]?.media_types).toEqual(['音乐'])
    expect(editor.latestRules()[0]?.target.category_id).toBeNull()

    await selectOption('分类目标 电影规则', '摇滚专辑 · 音乐 / 摇滚')
    expect(editor.latestRules()[0]?.target.category_id).toBe('music-rock')
  })

  it('切换为标签规则后清理分类目标并编辑标签输出', async () => {
    const user = userEvent.setup()
    const editor = await renderEditor([createRule()])

    const ruleRegion = within(screen.getByRole('article', { name: '规则 1：电影规则' }))
    await user.click(ruleRegion.getByRole('button', { name: '标签' }))
    expect(editor.latestRules()[0]).toEqual(
      expect.objectContaining({ kind: 'label', target: { category_id: null, labels: [] } }),
    )
    expect(screen.queryByLabelText('分类目标 电影规则')).not.toBeInTheDocument()

    const labelInput = screen.getByLabelText('标签输出 电影规则')
    await user.click(labelInput)
    await user.type(labelInput, '演唱会{Enter}')
    expect(editor.latestRules()[0]?.target.labels).toEqual(['演唱会'])
  })

  it('达到 maxRules 后禁用新增和复制且不产生额外规则', async () => {
    const user = userEvent.setup()
    const editor = await renderEditor([createRule()], { maxRules: 1 })
    const addButton = screen.getByRole('button', { name: '新增分类规则' })

    expect(addButton).toBeDisabled()
    await user.click(addButton)
    await runRuleAction('电影规则', '复制')
    expect(editor.emitted()['update:rules']).toBeUndefined()
  })
})
