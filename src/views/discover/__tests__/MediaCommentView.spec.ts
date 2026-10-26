import type { MediaCommentPage } from '@/api/types'
import MediaCommentView from '@/views/discover/MediaCommentView.vue'
import { screen, waitFor } from '@testing-library/vue'
import { server } from '@tests/support/msw/server'
import { renderWithProviders } from '@tests/support/render'
import { HttpResponse, http } from 'msw'
import { apiJson } from '@tests/support/msw/response'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 组件会附带 start/count 查询参数，使用通配路径匹配避免逐条枚举查询串
const INTERESTS_URL = '*/api/v1/douban/interests/20276229/*'
const REVIEWS_URL = '*/api/v1/douban/reviews/20276229/*'

let intersectionCallbacks: IntersectionObserverCallback[] = []

/** 提供由用例控制进入视口时机的观察器。 */
class IntersectionObserverMock implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '300px'
  readonly thresholds = [0]

  /** 保存回调以模拟评论区域进入视口。 */
  constructor(callback: IntersectionObserverCallback) {
    intersectionCallbacks.push(callback)
  }

  /** 测试结束后无需释放真实观察器。 */
  disconnect() {}
  /** 测试使用显式回调触发观察。 */
  observe() {}
  /** 返回没有待处理观察记录的状态。 */
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
  /** 测试没有真实元素订阅需要移除。 */
  unobserve() {}
}

/** 创建返回指定短评分页的离线处理器。 */
function interestsResponse(page: MediaCommentPage, status = 200) {
  return http.get(INTERESTS_URL, () => apiJson(page, { status }))
}

/** 触发评论区域的可见性变化。 */
function triggerIntersection(isIntersecting = true) {
  const callback = intersectionCallbacks.at(-1)
  expect(callback).toBeTypeOf('function')
  callback?.(
    [{ isIntersecting, target: document.body } as unknown as IntersectionObserverEntry],
    {} as IntersectionObserver,
  )
}

/** 使用生产 UI 与翻译插件渲染电影评论。 */
async function renderComments() {
  return renderWithProviders(MediaCommentView, {
    props: {
      doubanid: '20276229',
      type: '电影',
    },
  })
}

describe('MediaCommentView', () => {
  beforeEach(() => {
    intersectionCallbacks = []
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('loads interests after intersection and renders author, text and rating', async () => {
    server.use(
      interestsResponse({
        start: 0,
        count: 1,
        total: 101153,
        items: [
          {
            id: '3055283274',
            comment: '还行  可是古巴的007女郎比女主好看啊',
            rating: 4,
            vote_count: 7652,
            create_time: '2021-10-29 12:00:00',
            author: { id: '221011676', name: '陀螺凡达可' },
          },
        ],
      }),
    )

    await renderComments()
    triggerIntersection()

    await waitFor(() => {
      expect(screen.getByText('陀螺凡达可')).toBeTruthy()
    })
    // 正文含连续空格，testing-library 会归一化空白，用正则匹配避免误判
    expect(screen.getByText(/还行\s+可是古巴的007女郎比女主好看啊/)).toBeTruthy()
    expect(screen.getByText('2021-10-29 12:00:00')).toBeTruthy()
    expect(screen.getByText('7652 有用')).toBeTruthy()
    expect(screen.getByRole('button', { name: '加载更多' })).toBeTruthy()
  })

  it('proxies douban avatars through the backend image endpoint', async () => {
    server.use(
      interestsResponse({
        start: 0,
        count: 2,
        total: 2,
        items: [
          {
            id: '1',
            comment: '有头像',
            author: { id: '1', name: '陀螺凡达可', avatar: 'https://img2.doubanio.com/icon/up1-2.jpg' },
          },
          {
            id: '2',
            comment: '无头像',
            author: { id: '2', name: '阿北' },
          },
        ],
      }),
    )

    await renderWithProviders(MediaCommentView, {
      props: { doubanid: '20276229', type: '电影' },
      // jsdom 不会触发 VImg 的懒加载观察，用简化桩暴露最终 src
      global: {
        stubs: {
          VImg: { props: ['src'], template: '<img :src="src" />' },
        },
      },
    })
    triggerIntersection()
    await waitFor(() => {
      expect(screen.getByText('有头像')).toBeTruthy()
    })
    // 豆瓣头像域名直连会返回 418，必须经后端代理，否则头像区域留空
    const avatarImg = document.querySelector('.comment-item img') as HTMLImageElement | null
    expect(avatarImg).not.toBeNull()
    const src = avatarImg?.getAttribute('src') ?? ''
    expect(src).toContain('system/img/0?imgurl=')
    expect(decodeURIComponent(src)).toContain('img2.doubanio.com/icon/up1-2.jpg')
    // 无头像时回退到昵称首字，避免出现空白占位
    expect(screen.getByText('阿')).toBeTruthy()
  })

  it('switches to reviews and requests the reviews endpoint', async () => {
    const interestsRequested = vi.fn()
    const reviewsRequested = vi.fn()
    server.use(
      http.get(INTERESTS_URL, () => {
        interestsRequested()
        return apiJson({ start: 0, count: 0, total: 0, items: [] })
      }),
      http.get(REVIEWS_URL, () => {
        reviewsRequested()
        return apiJson({
          start: 0,
          count: 1,
          total: 956,
          items: [
            {
              id: '13923501',
              title: '《无暇赴死》或许很好',
              abstract: '以下严重剧透注意。',
              rating: 3,
              useful_count: 2166,
              author: { id: '1', name: 'Argenore' },
            },
          ],
        })
      }),
    )

    await renderComments()
    triggerIntersection()
    await waitFor(() => {
      expect(interestsRequested).toHaveBeenCalled()
    })

    const { fireEvent } = await import('@testing-library/vue')
    await fireEvent.click(screen.getByText('影评'))

    await waitFor(() => {
      expect(reviewsRequested).toHaveBeenCalled()
    })
    expect(screen.getByText('《无暇赴死》或许很好')).toBeTruthy()
    expect(screen.getByText('以下严重剧透注意。')).toBeTruthy()
    // 摘要必须是普通块级节点：VListItemSubtitle 的 -webkit-line-clamp 会截断正文
    const abstractNode = screen.getByText('以下严重剧透注意。')
    expect(abstractNode.classList.contains('comment-text')).toBe(true)
    expect(abstractNode.classList.contains('v-list-item-subtitle')).toBe(false)
    expect(screen.getByText('2166 有用')).toBeTruthy()
  })

  it('shows empty state when the endpoint returns no items', async () => {
    server.use(interestsResponse({ start: 0, count: 0, total: 0, items: [] }))

    await renderComments()
    triggerIntersection()

    await waitFor(() => {
      expect(screen.getByText('暂无数据')).toBeTruthy()
    })
  })

  it('keeps the page usable when the endpoint fails', async () => {
    server.use(http.get(INTERESTS_URL, () => HttpResponse.json({ detail: 'boom' }, { status: 500 })))

    await renderComments()
    triggerIntersection()

    await waitFor(() => {
      expect(screen.getByText('暂无数据')).toBeTruthy()
    })
  })

  it('appends an in-flight page once across rapid tab switches and uses the next real offset', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const offsets: string[] = []
    server.use(
      http.get(INTERESTS_URL, async ({ request }) => {
        const start = new URL(request.url).searchParams.get('start')!
        offsets.push(start)
        if (start === '0') await gate
        return apiJson({
          start: Number(start),
          count: 1,
          total: 3,
          items: [{ id: start, comment: `comment-${start}` }],
        })
      }),
      http.get(REVIEWS_URL, () => apiJson({ start: 0, count: 0, total: 0, items: [] })),
    )
    await renderComments()
    triggerIntersection()
    await waitFor(() => expect(offsets).toEqual(['0']))
    const { fireEvent } = await import('@testing-library/vue')
    await fireEvent.click(screen.getByText('影评'))
    await fireEvent.click(screen.getByText('短评'))
    release()
    await screen.findByText('comment-0')
    await waitFor(() => expect(screen.getByRole('button', { name: '加载更多' })).toBeEnabled())
    expect(screen.getAllByText('comment-0')).toHaveLength(1)
    await fireEvent.click(screen.getByRole('button', { name: '加载更多' }))
    await screen.findByText('comment-1')
    expect(offsets).toEqual(['0', '1'])
  })
})
