import type {
  ClassificationCategory,
  ClassificationEvaluation,
  ClassificationFieldDefinition,
} from '@/api/mediaClassificationTypes'
import ClassificationPreviewPanel from '@/components/classification/ClassificationPreviewPanel.vue'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

/** 构造事实预览测试使用的动态字段。 */
function field(
  definition: Partial<ClassificationFieldDefinition> &
    Pick<ClassificationFieldDefinition, 'id' | 'label' | 'value_type'>,
): ClassificationFieldDefinition {
  return {
    group: '共享字段',
    description: `${definition.label}说明`,
    operators: ['equals'],
    media_types: ['电影', '电视剧', '音乐'],
    options: [],
    allow_custom_values: true,
    source_support: {},
    ...definition,
  }
}

const fields: ClassificationFieldDefinition[] = [
  field({ id: 'identity.media_source', label: '媒体来源目录字段', value_type: 'string' }),
  field({
    id: 'media.type',
    label: '媒体类型目录字段',
    value_type: 'enum',
    options: [
      { label: '电影', value: '电影' },
      { label: '电视剧', value: '电视剧' },
      { label: '音乐', value: '音乐' },
    ],
  }),
  field({ id: 'media.year', label: '发行年份', value_type: 'year' }),
  field({
    id: 'music.entity_type',
    label: '音乐实体类型',
    group: '音乐',
    value_type: 'enum',
    media_types: ['音乐'],
    options: [
      { label: '专辑', value: 'album' },
      { label: '单曲', value: 'recording' },
    ],
    allow_custom_values: false,
  }),
  field({
    id: 'music.tags',
    label: '音乐标签',
    group: '音乐',
    value_type: 'string_list',
    media_types: ['音乐'],
  }),
  field({
    id: 'extensions.plugin.example.region_group',
    label: '来源地区组',
    group: '来源扩展',
    value_type: 'string',
    source_support: { 'plugin.example': 'extension' },
  }),
]

const categories: ClassificationCategory[] = [
  {
    id: 'movie.scifi',
    media_type: '电影',
    name: '科幻电影',
    path: ['电影', '科幻'],
    enabled: true,
    labels: [],
  },
  {
    id: 'movie.effective',
    media_type: '电影',
    name: '生效电影',
    path: ['电影', '精选'],
    enabled: true,
    labels: [],
  },
]

/** 渲染事实预览组件并允许覆盖外部求值状态。 */
async function renderPanel(overrides: { result?: ClassificationEvaluation | null; loading?: boolean } = {}) {
  return renderWithProviders(ClassificationPreviewPanel, {
    props: {
      fields,
      categories,
      result: overrides.result ?? null,
      loading: overrides.loading ?? false,
    },
  })
}

describe('ClassificationPreviewPanel', () => {
  it('按字段目录编辑音乐与扩展事实，并在切换活动策略时保持稳定来源身份', async () => {
    const user = userEvent.setup()
    const result = await renderPanel()

    const sourceInput = screen.getByRole('textbox', { name: '媒体来源' })
    const mediaIdInput = screen.getByRole('textbox', { name: '媒体 ID' })
    await user.type(sourceInput, 'plugin.example')
    await user.type(mediaIdInput, 'release-42')
    await user.type(screen.getByRole('spinbutton', { name: '发行年份' }), '2024')

    expect(screen.queryByRole('combobox', { name: '音乐实体类型' })).not.toBeInTheDocument()
    expect(screen.queryByText('媒体来源目录字段')).not.toBeInTheDocument()
    expect(screen.queryByText('媒体类型目录字段')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '音乐' }))
    expect(sourceInput).toHaveValue('plugin.example')
    expect(mediaIdInput).toHaveValue('release-42')

    await user.click(screen.getByRole('combobox', { name: '音乐实体类型' }))
    await user.click(await screen.findByRole('option', { name: '专辑' }))
    await user.type(screen.getByRole('combobox', { name: '音乐标签' }), 'ambient{Enter}')
    await user.type(screen.getByRole('textbox', { name: '来源地区组' }), 'east-asia')
    await user.click(screen.getByRole('button', { name: '活动策略' }))
    await user.click(screen.getByRole('button', { name: '执行事实预览' }))

    await waitFor(() => expect(result.emitted()['request-preview']).toHaveLength(1))
    const previewEvents = result.emitted()['request-preview'] as unknown[][] | undefined
    expect(previewEvents?.[0]?.[0]).toEqual({
      input: {
        kind: 'facts',
        facts: {
          identity: { media_source: 'plugin.example', media_id: 'release-42' },
          media: { type: '音乐', year: 2024 },
          music: { entity_type: 'album', tags: ['ambient'] },
          extensions: { 'plugin.example': { region_group: 'east-asia' } },
          field_sources: {},
        },
      },
      policyMode: 'active',
    })
  })

  it('展示推荐与生效分类、状态、revision、警告及逐条件 expected/actual/path', async () => {
    const evaluation: ClassificationEvaluation = {
      facts: {
        identity: { media_source: 'themoviedb', media_id: '550' },
        media: { type: '电影', year: 1999 },
        extensions: {},
        field_sources: {
          'media.year': {
            media_source: 'themoviedb',
            provider_id: 'host:themoviedb',
            provider_name: 'TheMovieDb',
          },
        },
      },
      result: {
        recommended: {
          category_id: 'movie.scifi',
          category_path: ['电影', '科幻'],
          rule_id: 'rule.scifi',
          source: 'automatic',
        },
        effective: {
          category_id: 'movie.effective',
          category_path: ['电影', '精选'],
          rule_id: null,
          source: 'fallback',
        },
        labels: ['经典', '高分'],
        policy_revision: 18,
        state: 'partial',
      },
      warnings: [
        {
          code: 'missing_field',
          message: '来源未提供内容分级',
          path: ['facts', 'media', 'content_rating'],
          field: 'media.content_rating',
          source: 'themoviedb',
        },
      ],
      trace: [
        {
          rule_id: 'rule.scifi',
          matched: true,
          conditions: [
            {
              field: 'media.year',
              operator: 'gte',
              expected: 1990,
              actual: 1999,
              matched: true,
              path: ['rules', 0, 'when', 'all', 0],
              source: {
                media_source: 'themoviedb',
                provider_id: 'host:themoviedb',
                provider_name: 'TheMovieDb',
              },
            },
            {
              field: 'media.content_rating',
              operator: 'exists',
              matched: false,
              path: ['rules', 0, 'when', 'all', 1],
            },
          ],
        },
      ],
    }

    await renderPanel({ result: evaluation })

    expect(screen.getByText('部分完成')).toBeInTheDocument()
    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '推荐分类' })).toHaveTextContent('科幻电影 · 电影 / 科幻 · movie.scifi')
    expect(screen.getByRole('region', { name: '生效分类' })).toHaveTextContent(
      '生效电影 · 电影 / 精选 · movie.effective',
    )
    expect(screen.getByRole('region', { name: '标签' })).toHaveTextContent('经典高分')
    expect(screen.getByRole('region', { name: '警告' })).toHaveTextContent('missing_field：来源未提供内容分级')
    expect(screen.getByRole('region', { name: '警告' })).toHaveTextContent('facts.media.content_rating')

    const traceTable = screen.getByRole('table', { name: '规则 rule.scifi 的条件命中解释' })
    expect(within(traceTable).getByText('1990')).toBeInTheDocument()
    expect(within(traceTable).getByText('1999')).toBeInTheDocument()
    expect(within(traceTable).getByText('TheMovieDb · themoviedb')).toHaveAttribute('title', 'host:themoviedb')
    expect(within(traceTable).getAllByText('未提供')).toHaveLength(3)
    expect(within(traceTable).getAllByText('media.content_rating')).toHaveLength(1)
    expect(within(traceTable).getByText('rules[0].when.all[1]')).toBeInTheDocument()
    expect(within(traceTable).getByLabelText('条件命中')).toBeInTheDocument()
    expect(within(traceTable).getByLabelText('条件未命中')).toBeInTheDocument()
  })

  it('缺少稳定身份时拒绝发出请求，并在加载期间禁用重复预览', async () => {
    const user = userEvent.setup()
    const result = await renderPanel()

    await user.click(screen.getByRole('button', { name: '执行事实预览' }))
    expect(screen.getByRole('alert')).toHaveTextContent('媒体来源不能为空')
    expect(result.emitted()['request-preview']).toBeUndefined()

    await result.rerender({ fields, categories, result: null, loading: true })
    expect(screen.getByRole('button', { name: '执行事实预览' })).toBeDisabled()
    expect(screen.getByRole('progressbar', { name: '正在执行事实预览' })).toBeInTheDocument()
  })
})
