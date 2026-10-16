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

function interestsResponse(page: MediaCommentPage, status = 200) {
  return http.get(INTERESTS_URL, () => apiJson(page, { status }))
}

function triggerIntersection(isIntersecting = true) {
  const callback = intersectionCallbacks.at(-1)
  expect(callback).toBeTypeOf('function')
  callback?.(
    [{ isIntersecting, target: document.body } as unknown as IntersectionObserverEntry],
    {} as IntersectionObserver,
  )
}

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
    server.use(
      http.get(INTERESTS_URL, () => HttpResponse.json({ detail: 'boom' }, { status: 500 })),
    )

    await renderComments()
    triggerIntersection()

    await waitFor(() => {
      expect(screen.getByText('暂无数据')).toBeTruthy()
    })
  })
})
