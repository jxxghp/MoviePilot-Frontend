import type { MediaInfo } from '@/api/types'
import MediaCardSlideView from '@/views/discover/MediaCardSlideView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { createMediaInfo } from '@tests/support/factories/media'
import { recommendMediaHandler } from '@tests/support/msw/handlers/recommend'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, h, type PropType, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const SOURCE_PATH = 'recommend/tmdb_trending'

let animationFrameCallbacks: FrameRequestCallback[] = []
let fallbackCallbacks: Array<() => void> = []
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
      type: Function as PropType<(item: MediaInfo, index: number) => string | number>,
      required: true,
    },
    items: {
      type: Array as PropType<MediaInfo[]>,
      required: true,
    },
    loading: {
      type: Boolean,
      required: true,
    },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'section',
        {
          'aria-label': '媒体横向列表',
          'data-item-count': String(props.items.length),
          'data-loading': String(props.loading),
        },
        [
          h(
            'output',
            { 'aria-label': '媒体横向列表键' },
            props.items.map((item, index) => String(props.getItemKey(item, index))).join('|'),
          ),
          props.loading
            ? h('span', { role: 'status' }, '正在加载媒体')
            : props.items.flatMap(item => slots.item?.({ item }) ?? []),
        ],
      )
  },
})

const MediaCardStub = defineComponent({
  name: 'MediaCard',
  props: {
    media: {
      type: Object as PropType<MediaInfo>,
      required: true,
    },
    width: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    return () =>
      h(
        'article',
        {
          'aria-label': `媒体卡片 ${props.media.title}`,
          'data-width': props.width,
        },
        props.media.title,
      )
  },
})

function installLoadTriggerControls() {
  const nativeSetTimeout = window.setTimeout.bind(window)
  type TimeoutHandle = ReturnType<typeof window.setTimeout>

  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom: 200,
    height: 100,
    left: 0,
    right: 100,
    toJSON: () => ({}),
    top: 100,
    width: 100,
    x: 0,
    y: 100,
  })
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    animationFrameCallbacks.push(callback)
    return animationFrameCallbacks.length
  })
  vi.spyOn(window, 'setTimeout').mockImplementation(((
    handler: TimerHandler,
    timeout?: number,
    ...args: unknown[]
  ): TimeoutHandle => {
    if (timeout === 600) {
      fallbackCallbacks.push(() => {
        if (typeof handler === 'function') handler(...args)
      })
      return fallbackCallbacks.length as unknown as TimeoutHandle
    }

    return nativeSetTimeout(handler, timeout, ...args) as unknown as TimeoutHandle
  }) as unknown as typeof window.setTimeout)
}

async function renderSlide(props: { ready?: boolean } = {}) {
  return renderWithProviders(MediaCardSlideView, {
    props: {
      apipath: SOURCE_PATH,
      linkurl: '/browse/recommend/tmdb_trending',
      ready: props.ready ?? true,
      title: '流行趋势',
    },
    global: {
      stubs: {
        MediaCard: MediaCardStub,
        VirtualSlideView: VirtualSlideViewStub,
      },
    },
  })
}

function triggerIntersection(isIntersecting = true) {
  const callback = intersectionCallbacks.at(-1)
  const boundingClientRect = document.body.getBoundingClientRect()
  expect(callback).toBeTypeOf('function')
  callback?.(
    [
      {
        boundingClientRect,
        intersectionRatio: isIntersecting ? 1 : 0,
        intersectionRect: boundingClientRect,
        isIntersecting,
        rootBounds: null,
        target: document.body,
        time: 0,
      },
    ],
    {} as IntersectionObserver,
  )
}

function triggerAnimationFrame() {
  const callback = animationFrameCallbacks.shift()
  expect(callback).toBeTypeOf('function')
  callback?.(0)
}

function triggerFallback() {
  const callback = fallbackCallbacks.shift()
  expect(callback).toBeTypeOf('function')
  callback?.()
}

function keepAliveHarness() {
  return defineComponent({
    components: { MediaCardSlideView },
    setup() {
      const active = ref(true)
      return { active }
    },
    template: `
      <button type="button" @click="active = false">停用横向列表</button>
      <button type="button" @click="active = true">启用横向列表</button>
      <KeepAlive>
        <MediaCardSlideView
          v-if="active"
          apipath="recommend/tmdb_trending"
          linkurl="/browse/recommend/tmdb_trending"
          title="流行趋势"
        />
      </KeepAlive>
    `,
  })
}

async function renderKeptAliveSlide() {
  return renderWithProviders(keepAliveHarness(), {
    global: {
      stubs: {
        MediaCard: MediaCardStub,
        VirtualSlideView: VirtualSlideViewStub,
      },
    },
  })
}

describe('MediaCardSlideView', () => {
  beforeEach(() => {
    animationFrameCallbacks = []
    fallbackCallbacks = []
    intersectionCallbacks = []
    installLoadTriggerControls()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it.each([
    ['IntersectionObserver', triggerIntersection],
    ['requestAnimationFrame', triggerAnimationFrame],
    ['600ms fallback', triggerFallback],
  ])('loads media through the %s entry', async (_entry, triggerLoad) => {
    const media = createMediaInfo({ title: `${_entry} 媒体` })
    const requested = vi.fn()
    server.use(recommendMediaHandler(SOURCE_PATH, [media], 200, requested))

    await renderSlide()
    await waitFor(() => {
      expect(animationFrameCallbacks).toHaveLength(1)
      expect(fallbackCallbacks).toHaveLength(1)
      expect(intersectionCallbacks).toHaveLength(1)
    })
    triggerLoad()

    expect(await screen.findByRole('article', { name: `媒体卡片 ${media.title}` })).toBeInTheDocument()
    expect(requested).toHaveBeenCalledOnce()
  })

  it('deduplicates competing observer, animation frame, and fallback loads', async () => {
    const media = createMediaInfo({ title: '竞争入口媒体' })
    const requested = vi.fn()
    server.use(recommendMediaHandler(SOURCE_PATH, [media], 200, requested))

    await renderSlide()
    await waitFor(() => expect(intersectionCallbacks).toHaveLength(1))
    triggerIntersection()
    triggerAnimationFrame()
    triggerFallback()

    expect(await screen.findByRole('article', { name: '媒体卡片 竞争入口媒体' })).toBeInTheDocument()
    expect(requested).toHaveBeenCalledOnce()
  })

  it('keeps non-empty data loading until ready and then projects cards', async () => {
    const media = createMediaInfo({ title: '等待页面就绪' })
    const requested = vi.fn()
    server.use(recommendMediaHandler(SOURCE_PATH, [media], 200, requested))

    const { rerender } = await renderSlide({ ready: false })
    triggerAnimationFrame()
    await waitFor(() => expect(requested).toHaveBeenCalledOnce())

    expect(screen.getByLabelText('媒体横向列表')).toHaveAttribute('data-loading', 'true')
    expect(screen.queryByRole('article', { name: '媒体卡片 等待页面就绪' })).not.toBeInTheDocument()

    await rerender({ ready: true })

    expect(await screen.findByRole('article', { name: '媒体卡片 等待页面就绪' })).toBeInTheDocument()
    expect(screen.getByLabelText('媒体横向列表')).toHaveAttribute('data-loading', 'false')
  })

  it('finishes an empty response without waiting for ready', async () => {
    const requested = vi.fn()
    server.use(recommendMediaHandler(SOURCE_PATH, [], 200, requested))

    await renderSlide({ ready: false })
    triggerAnimationFrame()

    await waitFor(() => expect(screen.getByLabelText('媒体横向列表')).toHaveAttribute('data-loading', 'false'))
    expect(screen.getByLabelText('媒体横向列表')).toHaveAttribute('data-item-count', '0')
    expect(requested).toHaveBeenCalledOnce()
  })

  it.each([
    ['empty response', 200],
    ['HTTP failure', 500],
  ])('retries after an initial %s when the kept-alive view is activated', async (_case, firstStatus) => {
    const requested = vi.fn()
    const recovered = createMediaInfo({ title: `恢复于 ${_case}` })
    server.use(recommendMediaHandler(SOURCE_PATH, [], firstStatus, requested))

    await renderKeptAliveSlide()
    await waitFor(() => expect(requested).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.getByLabelText('媒体横向列表')).toHaveAttribute('data-loading', 'false'))
    server.use(recommendMediaHandler(SOURCE_PATH, [recovered], 200, requested))

    await fireEvent.click(screen.getByRole('button', { name: '停用横向列表' }))
    await fireEvent.click(screen.getByRole('button', { name: '启用横向列表' }))

    expect(await screen.findByRole('article', { name: `媒体卡片 ${recovered.title}` })).toBeInTheDocument()
    expect(requested).toHaveBeenCalledTimes(2)
  })

  it('projects items with pair-based stable keys and fixed card width', async () => {
    const media = [
      createMediaInfo({ douban_id: 'unused-douban', title: 'TMDB 媒体', tmdb_id: 101 }),
      createMediaInfo({
        douban_id: 'douban-202',
        media_id: 'douban-202',
        media_source: 'douban',
        title: '豆瓣媒体',
        tmdb_id: undefined,
      }),
      createMediaInfo({
        bangumi_id: 'bangumi-303',
        douban_id: undefined,
        media_id: 'bangumi-303',
        media_source: 'bangumi',
        title: 'Bangumi 媒体',
        tmdb_id: undefined,
      }),
      createMediaInfo({
        bangumi_id: undefined,
        douban_id: undefined,
        media_id: 'bilibili-404',
        media_source: 'bilibili',
        title: 'Bilibili 媒体',
        tmdb_id: undefined,
      }),
      createMediaInfo({
        bangumi_id: undefined,
        douban_id: undefined,
        media_id: undefined,
        title: '标题回退',
        tmdb_id: undefined,
      }),
    ]
    server.use(recommendMediaHandler(SOURCE_PATH, media))

    await renderSlide()
    triggerAnimationFrame()

    await waitFor(() => expect(screen.getByLabelText('媒体横向列表')).toHaveAttribute('data-loading', 'false'))
    expect(screen.getByLabelText('媒体横向列表')).toHaveAttribute('data-item-count', '5')
    expect(screen.getByLabelText('媒体横向列表键')).toHaveTextContent(
      'themoviedb:101|douban:douban-202|bangumi:bangumi-303|bilibili:bilibili-404|themoviedb:标题回退',
    )
    expect(screen.getAllByRole('article')).toHaveLength(5)
    screen.getAllByRole('article').forEach(card => expect(card).toHaveAttribute('data-width', '9rem'))
  })
})
