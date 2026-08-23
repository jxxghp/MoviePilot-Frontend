import type { Person } from '@/api/types'
import PersonCardSlideView from '@/views/discover/PersonCardSlideView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http } from 'msw'
import { apiJson } from '@tests/support/msw/response'
import { defineComponent, h, type PropType, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const API_URL = 'http://localhost/api/v1/recommend/tmdb_person'
let intersectionCallbacks: IntersectionObserverCallback[] = []

class IntersectionObserverMock implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '300px'
  readonly thresholds = [0]

  constructor(callback: IntersectionObserverCallback) {
    intersectionCallbacks.push(callback)
  }

  disconnect() {}
  observe() {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
  unobserve() {}
}

const VirtualSlideViewStub = defineComponent({
  name: 'VirtualSlideView',
  props: {
    getItemKey: {
      type: Function as PropType<(item: Person) => string | number | undefined>,
      required: true,
    },
    items: {
      type: Array as PropType<Person[]>,
      required: true,
    },
    loading: {
      type: Boolean,
      required: true,
    },
  },
  setup(props, { slots }) {
    return () =>
      h('section', { 'aria-label': '人物横向列表', 'data-loading': String(props.loading) }, [
        h('output', { 'aria-label': '人物键' }, props.items.map(item => String(props.getItemKey(item))).join('|')),
        props.loading
          ? h('span', { role: 'status' }, '正在加载人物')
          : props.items.flatMap(item => slots.item?.({ item }) ?? []),
      ])
  },
})

const PersonCardStub = defineComponent({
  name: 'PersonCard',
  props: {
    person: {
      type: Object as PropType<Person>,
      required: true,
    },
    width: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    return () =>
      h('article', { 'aria-label': `人物卡片 ${props.person.name}`, 'data-width': props.width }, props.person.name)
  },
})

function personResponse(people: Person[], status = 200, onRequest: () => void = () => {}) {
  return http.get(API_URL, () => {
    onRequest()
    if (status >= 400) return HttpResponse.json(people, { status })
    return apiJson(people, { status })
  })
}

function triggerIntersection(isIntersecting = true) {
  const callback = intersectionCallbacks.at(-1)
  expect(callback).toBeTypeOf('function')
  callback?.(
    [{ isIntersecting, target: document.body } as unknown as IntersectionObserverEntry],
    {} as IntersectionObserver,
  )
}

async function renderSlide() {
  return renderWithProviders(PersonCardSlideView, {
    props: {
      apipath: 'recommend/tmdb_person',
      linkurl: '/browse/recommend/tmdb_person',
      title: '热门人物',
    },
    global: {
      stubs: {
        PersonCard: PersonCardStub,
        VirtualSlideView: VirtualSlideViewStub,
      },
    },
  })
}

function keepAliveHarness() {
  return defineComponent({
    components: { PersonCardSlideView },
    setup() {
      const active = ref(true)
      return { active }
    },
    template: `
      <button type="button" @click="active = false">停用人物列表</button>
      <button type="button" @click="active = true">启用人物列表</button>
      <KeepAlive>
        <PersonCardSlideView
          v-if="active"
          apipath="recommend/tmdb_person"
          linkurl="/browse/recommend/tmdb_person"
          title="热门人物"
        />
      </KeepAlive>
    `,
  })
}

describe('PersonCardSlideView', () => {
  beforeEach(() => {
    intersectionCallbacks = []
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('loads once after intersection and projects stable person cards', async () => {
    const requested = vi.fn()
    server.use(
      personResponse(
        [
          { id: 101, name: '人物甲', source: 'themoviedb' },
          { id: 202, name: '人物乙', source: 'themoviedb' },
        ],
        200,
        requested,
      ),
    )

    await renderSlide()
    expect(screen.getByLabelText('人物横向列表')).toHaveAttribute('data-loading', 'true')
    expect(requested).not.toHaveBeenCalled()

    triggerIntersection(false)
    expect(requested).not.toHaveBeenCalled()
    triggerIntersection()

    expect(await screen.findByRole('article', { name: '人物卡片 人物甲' })).toHaveAttribute('data-width', '9rem')
    expect(screen.getByRole('article', { name: '人物卡片 人物乙' })).toHaveAttribute('data-width', '9rem')
    expect(screen.getByLabelText('人物键')).toHaveTextContent('101|202')
    expect(screen.getByLabelText('人物横向列表')).toHaveAttribute('data-loading', 'false')
    expect(requested).toHaveBeenCalledOnce()
  })

  it('retries an empty or failed load when the kept-alive view is activated', async () => {
    const requested = vi.fn()
    server.use(personResponse([], 500, requested))

    await renderWithProviders(keepAliveHarness(), {
      global: {
        stubs: {
          PersonCard: PersonCardStub,
          VirtualSlideView: VirtualSlideViewStub,
        },
      },
    })
    triggerIntersection()
    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    server.use(personResponse([{ id: 303, name: '重试人物', source: 'themoviedb' }], 200, requested))

    await fireEvent.click(screen.getByRole('button', { name: '停用人物列表' }))
    await fireEvent.click(screen.getByRole('button', { name: '启用人物列表' }))

    expect(await screen.findByRole('article', { name: '人物卡片 重试人物' })).toBeInTheDocument()
    expect(requested).toHaveBeenCalledTimes(2)
  })
})
