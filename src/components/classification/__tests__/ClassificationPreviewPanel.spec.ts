import type { ClassificationCategory, ClassificationEvaluation } from '@/api/mediaClassificationTypes'
import ClassificationPreviewPanel from '@/components/classification/ClassificationPreviewPanel.vue'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: { get: mocks.apiGet },
}))

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
    name: '精选电影',
    path: ['电影', '精选'],
    enabled: true,
    labels: [],
  },
]

const sources = [
  { name: 'The Movie Database', media_source: 'themoviedb', media_types: ['电影', '电视剧'] },
  { name: 'MusicBrainz', media_source: 'musicbrainz', media_types: ['音乐'] },
]

/** 渲染结果预览面板，并让测试直接观察搜索请求和组件事件。 */
async function renderPanel(overrides: { result?: ClassificationEvaluation | null; loading?: boolean } = {}) {
  return renderWithProviders(ClassificationPreviewPanel, {
    props: {
      categories,
      sources,
      result: overrides.result ?? null,
      loading: overrides.loading ?? false,
    },
  })
}

/** 构造同时包含电影字段、分类结果和条件匹配说明的预览响应。 */
function createEvaluation(): ClassificationEvaluation {
  return {
    facts: {
      identity: { media_source: 'themoviedb', media_id: '550' },
      media: { type: '电影', title: '搏击俱乐部', year: 1999 },
      extensions: {},
      field_sources: {
        'media.year': {
          media_source: 'themoviedb',
          provider_id: 'host:themoviedb',
          provider_name: 'The Movie Database',
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
      labels: ['经典'],
      policy_revision: 18,
      state: 'partial',
    },
    warnings: [
      {
        code: 'missing_field',
        message: '当前媒体没有内容分级',
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
              provider_name: 'The Movie Database',
            },
          },
        ],
      },
    ],
  }
}

describe('ClassificationPreviewPanel', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('搜索并选择媒体后，直接提交搜索返回的完整媒体信息', async () => {
    const user = userEvent.setup()
    const media = {
      media_source: 'themoviedb',
      media_id: '550',
      type: '电影',
      title: '搏击俱乐部',
      year: 1999,
      original_language: 'en',
      genres: ['剧情'],
      origin_country: ['US'],
    }
    mocks.apiGet.mockResolvedValue([media])
    const panel = await renderPanel()

    expect(screen.queryByRole('textbox', { name: '媒体来源' })).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: '搜索媒体' }), '搏击俱乐部')
    await user.click(screen.getByRole('button', { name: '搜索' }))

    await waitFor(() => expect(screen.getByText('搏击俱乐部')).toBeInTheDocument())
    expect(mocks.apiGet).toHaveBeenCalledWith('media/search', {
      params: {
        title: '搏击俱乐部',
        type: 'media',
        page: 1,
        count: 20,
        media_source: ['themoviedb'],
      },
      paramsSerializer: { indexes: null },
      feedback: 'silent',
    })

    await user.click(screen.getByText('搏击俱乐部'))
    expect(screen.getByText('The Movie Database')).toBeInTheDocument()
    expect(screen.getByText('剧情')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '预览分类结果' }))

    expect(panel.emitted()['request-preview']).toEqual([
      [
        {
          input: { kind: 'media', media },
          policyMode: 'draft',
        },
      ],
    ])
  })

  it('只显示人类可读的分类、规则来源和字段名称', async () => {
    await renderPanel({ result: createEvaluation() })

    expect(screen.getByRole('region', { name: '规则建议分类' })).toHaveTextContent('科幻电影 · 电影 / 科幻')
    expect(screen.getByRole('region', { name: '生效分类' })).toHaveTextContent('精选电影 · 电影 / 精选')
    expect(screen.getByRole('region', { name: '标签' })).toHaveTextContent('经典')
    expect(screen.getByRole('region', { name: '警告' })).toHaveTextContent('当前媒体没有内容分级')
    expect(screen.getByRole('region', { name: '警告' })).toHaveTextContent('内容分级')
    expect(screen.queryByText('rule.scifi')).not.toBeInTheDocument()
    expect(screen.queryByText('missing_field')).not.toBeInTheDocument()

    const traceTable = screen.getByRole('table', { name: '规则 1 的条件命中解释' })
    expect(within(traceTable).getByText('年份')).toBeInTheDocument()
    expect(within(traceTable).getByText('大于等于')).toBeInTheDocument()
    expect(within(traceTable).getByText('1990')).toBeInTheDocument()
    expect(within(traceTable).getByText('1999')).toBeInTheDocument()
    expect(within(traceTable).getByText('The Movie Database')).toBeInTheDocument()
  })

  it('没有选择媒体时禁用预览，搜索和加载期间显示对应状态', async () => {
    const user = userEvent.setup()
    const panel = await renderPanel()

    expect(screen.getByRole('button', { name: '预览分类结果' })).toBeDisabled()
    mocks.apiGet.mockResolvedValue([])
    await user.type(screen.getByRole('textbox', { name: '搜索媒体' }), '不存在的媒体')
    await user.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByRole('status')).toHaveTextContent('没有找到可用于预览的媒体信息')

    await panel.rerender({ categories, sources, result: null, loading: true })
    expect(screen.getByRole('button', { name: '预览分类结果' })).toBeDisabled()
    expect(screen.getByRole('progressbar', { name: '正在预览分类结果' })).toBeInTheDocument()
  })
})
