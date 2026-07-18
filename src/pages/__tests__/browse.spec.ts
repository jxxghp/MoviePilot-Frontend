import BrowsePage from '@/pages/browse.vue'
import { screen } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, type PropType } from 'vue'
import { describe, expect, it } from 'vitest'

const MediaCardListViewStub = defineComponent({
  name: 'MediaCardListView',
  props: {
    apipath: String,
    params: Object as PropType<Record<string, unknown>>,
  },
  setup(props) {
    return () =>
      h('section', { 'aria-label': '媒体 browse 列表', 'data-api-path': props.apipath }, [
        h('output', { 'aria-label': '媒体 browse 查询' }, JSON.stringify(props.params)),
      ])
  },
})

const PersonCardListViewStub = defineComponent({
  name: 'PersonCardListView',
  props: {
    apipath: String,
    params: Object as PropType<Record<string, unknown>>,
  },
  setup(props) {
    return () =>
      h('section', { 'aria-label': '人物 browse 列表', 'data-api-path': props.apipath }, [
        h('output', { 'aria-label': '人物 browse 查询' }, JSON.stringify(props.params)),
      ])
  },
})

const PageContentTitleStub = defineComponent({
  name: 'VPageContentTitle',
  props: { title: String },
  setup(props) {
    return () => h('h1', props.title)
  },
})

async function renderBrowse(paths: string[], query: Record<string, string | string[] | null>) {
  return renderWithProviders(BrowsePage, {
    initialRoute: { path: '/browse', query },
    props: { paths },
    global: {
      stubs: {
        MediaCardListView: MediaCardListViewStub,
        PersonCardListView: PersonCardListViewStub,
        VPageContentTitle: PageContentTitleStub,
        VScrollToTopBtn: true,
      },
    },
  })
}

function projectedQuery(label: string) {
  return JSON.parse(screen.getByRole('status', { name: label }).textContent || '{}') as Record<string, unknown>
}

describe('browse page', () => {
  it('joins array paths and projects the complete route query to the media list', async () => {
    const query = {
      genre: ['动作', '科幻'],
      page: '7',
      sort: 'vote',
      title: '相似媒体',
      type: 'movie',
    }

    await renderBrowse(['tmdb', 'recommend', '123', 'movie'], query)

    expect(screen.getByRole('heading', { name: '相似媒体' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '媒体 browse 列表' })).toHaveAttribute(
      'data-api-path',
      'tmdb/recommend/123/movie',
    )
    expect(projectedQuery('媒体 browse 查询')).toEqual(query)
    expect(screen.queryByRole('region', { name: '人物 browse 列表' })).not.toBeInTheDocument()
  })

  it('routes person queries to the person list and prefixes the title', async () => {
    const query = {
      page: '3',
      source: 'themoviedb',
      title: '张三',
      type: 'person',
    }

    await renderBrowse(['person', 'search'], query)

    expect(screen.getByRole('heading', { name: '演员: 张三' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '人物 browse 列表' })).toHaveAttribute(
      'data-api-path',
      'person/search',
    )
    expect(projectedQuery('人物 browse 查询')).toEqual(query)
    expect(screen.queryByRole('region', { name: '媒体 browse 列表' })).not.toBeInTheDocument()
  })
})
