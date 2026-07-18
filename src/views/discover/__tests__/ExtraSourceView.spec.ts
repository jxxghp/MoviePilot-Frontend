import type { DiscoverSource, RenderProps } from '@/api/types'
import ExtraSourceView from '@/views/discover/ExtraSourceView.vue'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, type PropType, ref } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMediaListHarness, latestMediaListRequest } from './sourceViewTestUtils'

function filterControl(label: string, model: string, value: unknown): RenderProps {
  return {
    component: 'VBtn',
    text: label,
    props: {
      model,
      testValue: value,
    },
  }
}

function createSource(overrides: Partial<DiscoverSource> = {}): DiscoverSource {
  return {
    name: '扩展测试源',
    mediaid_prefix: 'fixture',
    api_path: 'plugin/fixture/discover',
    filter_params: {
      mtype: 'movie',
      genre: null,
      keyword: 'featured',
    },
    filter_ui: [
      filterControl('选择动作类型', 'genre', 'action'),
      filterControl('切换媒体类型', 'mtype', 'series'),
      filterControl('清空媒体类型', 'mtype', null),
    ],
    depends: {
      genre: ['mtype'],
    },
    ...overrides,
  }
}

const FormRenderStub = defineComponent({
  name: 'FormRender',
  props: {
    config: {
      type: Object as PropType<RenderProps>,
      required: true,
    },
    model: {
      type: Object as PropType<Record<string, unknown>>,
      required: true,
    },
  },
  setup(props) {
    return () => {
      const field = String(props.config.props?.model)
      return h(
        'button',
        {
          onClick: () => {
            props.model[field] = props.config.props?.testValue
          },
          type: 'button',
        },
        props.config.text,
      )
    }
  },
})

describe('ExtraSourceView', () => {
  let mediaList: ReturnType<typeof createMediaListHarness>

  beforeEach(() => {
    mediaList = createMediaListHarness()
  })

  async function renderSource(source: DiscoverSource = createSource()) {
    return renderWithProviders(ExtraSourceView, {
      props: { source },
      global: {
        stubs: {
          FormRender: FormRenderStub,
          MediaCardListView: mediaList.stub,
        },
      },
    })
  }

  function sourceUpdateHarness(initial: DiscoverSource, next: () => DiscoverSource) {
    return defineComponent({
      setup() {
        const source = ref(initial)
        return () => [
          h(
            'button',
            {
              onClick: () => {
                source.value = next()
              },
              type: 'button',
            },
            '刷新扩展源契约',
          ),
          h(ExtraSourceView, { source: source.value }),
        ]
      },
    })
  }

  async function renderSourceUpdateHarness(initial: DiscoverSource, next: () => DiscoverSource) {
    return renderWithProviders(sourceUpdateHarness(initial, next), {
      global: {
        stubs: {
          FormRender: FormRenderStub,
          MediaCardListView: mediaList.stub,
        },
      },
    })
  }

  it('initializes the form and list from the source contract', async () => {
    await renderSource()

    expect(latestMediaListRequest(mediaList)).toEqual({
      apipath: 'plugin/fixture/discover',
      params: {
        mtype: 'movie',
        genre: null,
        keyword: 'featured',
      },
    })
    expect(screen.getByRole('button', { name: '选择动作类型' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '切换媒体类型' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清空媒体类型' })).toBeInTheDocument()
  })

  it('restores a truthy root default and clears only fields that declare the changed dependency', async () => {
    const user = userEvent.setup()
    await renderSource()

    await user.click(screen.getByRole('button', { name: '选择动作类型' }))
    await waitFor(() => expect(latestMediaListRequest(mediaList).params.genre).toBe('action'))

    await user.click(screen.getByRole('button', { name: '切换媒体类型' }))
    await waitFor(() => {
      expect(latestMediaListRequest(mediaList).params).toEqual({
        mtype: 'series',
        genre: null,
        keyword: 'featured',
      })
    })

    await user.click(screen.getByRole('button', { name: '清空媒体类型' }))
    await waitFor(() => {
      expect(latestMediaListRequest(mediaList).params).toEqual({
        mtype: 'movie',
        genre: null,
        keyword: 'featured',
      })
    })
  })

  it('preserves user filters when a same-prefix source object keeps the same contract', async () => {
    const user = userEvent.setup()
    await renderSourceUpdateHarness(createSource(), () => createSource())

    await user.click(screen.getByRole('button', { name: '切换媒体类型' }))
    await waitFor(() => expect(latestMediaListRequest(mediaList).params.mtype).toBe('series'))
    const requestsBeforeRefresh = mediaList.requests.length
    await user.click(screen.getByRole('button', { name: '刷新扩展源契约' }))

    await waitFor(() => {
      expect(screen.getByLabelText('媒体列表请求')).toHaveAttribute('data-apipath', 'plugin/fixture/discover')
      expect(screen.getByLabelText('媒体列表请求')).toHaveTextContent(
        JSON.stringify({ mtype: 'series', genre: null, keyword: 'featured' }),
      )
    })
    expect(mediaList.requests).toHaveLength(requestsBeforeRefresh)
  })

  it('preserves user filters but restarts the list when only the API path changes', async () => {
    const user = userEvent.setup()
    await renderSourceUpdateHarness(createSource(), () =>
      createSource({ api_path: 'plugin/fixture/v2/discover' }),
    )

    await user.click(screen.getByRole('button', { name: '切换媒体类型' }))
    await waitFor(() => expect(latestMediaListRequest(mediaList).params.mtype).toBe('series'))
    const requestsBeforeRefresh = mediaList.requests.length
    await user.click(screen.getByRole('button', { name: '刷新扩展源契约' }))

    await waitFor(() => {
      expect(latestMediaListRequest(mediaList)).toEqual({
        apipath: 'plugin/fixture/v2/discover',
        params: {
          mtype: 'series',
          genre: null,
          keyword: 'featured',
        },
      })
    })
    expect(mediaList.requests).toHaveLength(requestsBeforeRefresh + 1)
  })

  it('switches to the new model when a same-prefix source changes its filter contract', async () => {
    const user = userEvent.setup()
    const nextParams = {
      category: 'series',
      year: null,
    }
    await renderSourceUpdateHarness(createSource(), () =>
      createSource({
        api_path: 'plugin/fixture/v2/discover',
        filter_params: { ...nextParams },
        filter_ui: [filterControl('选择新版分类', 'category', 'movie')],
        depends: {},
      }),
    )

    await user.click(screen.getByRole('button', { name: '刷新扩展源契约' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '选择新版分类' })).toBeInTheDocument()
      expect(screen.getByLabelText('媒体列表请求')).toHaveAttribute('data-apipath', 'plugin/fixture/v2/discover')
      expect(screen.getByLabelText('媒体列表请求')).toHaveTextContent(JSON.stringify(nextParams))
    })
  })
})
