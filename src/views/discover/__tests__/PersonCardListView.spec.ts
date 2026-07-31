import type { Person } from '@/api/types'
import PersonCardListView from '@/views/discover/PersonCardListView.vue'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http } from 'msw'
import { defineComponent, h, onMounted, ref, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const LIST_PATH = 'test/discover/people'
const LIST_URL = new URL(LIST_PATH, 'http://localhost/api/v1/').href

type InfiniteScrollStatus = 'empty' | 'error' | 'ok'
const initialLoadMargins: number[] = []

const InfiniteScrollStub = defineComponent({
  name: 'VInfiniteScroll',
  props: {
    margin: {
      type: Number,
      required: true,
    },
  },
  emits: ['load'],
  setup(props, { emit, slots }) {
    const status = ref<'empty' | 'error' | 'idle' | 'loading'>('idle')

    function load() {
      initialLoadMargins.push(props.margin)
      status.value = 'loading'
      emit('load', {
        done(nextStatus: InfiniteScrollStatus) {
          status.value = nextStatus === 'ok' ? 'idle' : nextStatus
        },
      })
    }

    onMounted(load)

    return () =>
      h('section', { 'aria-label': '人物无限列表', 'data-margin': String(props.margin) }, [
        h('output', { 'aria-label': '人物无限列表状态' }, status.value),
        status.value === 'error'
          ? slots.error?.({
              side: 'end',
              props: { color: undefined, onClick: load },
            })
          : null,
        slots.default?.(),
      ])
  },
})

const ProgressiveCardGridStub = defineComponent({
  name: 'ProgressiveCardGrid',
  props: {
    items: {
      type: Array as PropType<Person[]>,
      required: true,
    },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'section',
        props.items.flatMap(item => slots.default?.({ item }) ?? []),
      )
  },
})

const PersonCardStub = defineComponent({
  name: 'PersonCard',
  props: {
    person: {
      type: Object as PropType<Person>,
      required: true,
    },
  },
  setup(props) {
    return () => h('article', props.person.name)
  },
})

const LoadingBannerStub = defineComponent({
  name: 'LoadingBanner',
  template: '<div role="status">正在加载人物列表</div>',
})

async function renderList() {
  return renderWithProviders(PersonCardListView, {
    props: { apipath: LIST_PATH },
    global: {
      stubs: {
        LoadingBanner: LoadingBannerStub,
        NoDataFound: true,
        PersonCard: PersonCardStub,
        ProgressiveCardGrid: ProgressiveCardGridStub,
        VInfiniteScroll: InfiniteScrollStub,
      },
    },
  })
}

describe('PersonCardListView', () => {
  beforeEach(() => {
    initialLoadMargins.length = 0
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(600)
    vi.spyOn(document.body, 'scrollHeight', 'get').mockReturnValue(900)
  })

  it('loads people with the configured prefetch margin', async () => {
    server.use(
      http.get(LIST_URL, () =>
        HttpResponse.json([{ id: 101, name: '探索人物', source: 'themoviedb' } satisfies Person]),
      ),
    )

    await renderList()

    expect(await screen.findByText('探索人物')).toBeInTheDocument()
    expect(screen.getByLabelText('人物无限列表')).toHaveAttribute('data-margin', '600')
    expect(initialLoadMargins[0]).toBe(0)
  })

  it('shows an inline retry and retries the same page after a request failure', async () => {
    let requests = 0
    server.use(
      http.get(LIST_URL, () => {
        requests++
        if (requests === 1) return HttpResponse.json({ detail: 'failed' }, { status: 500 })
        return HttpResponse.json([{ id: 202, name: '人物重试结果', source: 'themoviedb' } satisfies Person])
      }),
    )
    const user = userEvent.setup()

    await renderList()
    const retry = await screen.findByRole('button', { name: '重试' })
    expect(screen.queryByText('正在加载人物列表')).not.toBeInTheDocument()
    await user.click(retry)

    expect(await screen.findByText('人物重试结果')).toBeInTheDocument()
    expect(requests).toBe(2)
  })
})
