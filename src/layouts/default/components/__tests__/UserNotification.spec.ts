import UserNotification from '../UserNotification.vue'
import type { SystemNotification } from '@/api/types'
import { nativeGlobalActions } from '@/native/registry'
import { renderWithProviders } from '@tests/support/render'
import { apiJson } from '@tests/support/msw/response'
import { server } from '@tests/support/msw/server'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({ useDelayedSSE: vi.fn() }),
}))
vi.mock('vue-toastification', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))

/** 暂停首屏响应，让测试能够验证请求完成前的可见状态。 */
function deferNotifications() {
  let resolve!: (items: SystemNotification[]) => void
  const response = new Promise<SystemNotification[]>(done => {
    resolve = done
  })
  const request = vi.fn()
  server.use(
    http.get('http://localhost/api/v1/message/notification', async () => {
      request()
      return apiJson(await response)
    }),
  )
  return { resolve, request }
}

describe('UserNotification', () => {
  it('原生优先投影独立海报，旧版和历史通知兼容网页实际使用的 image 属性', async () => {
    const pending = deferNotifications()
    await renderWithProviders(UserNotification)
    const action = nativeGlobalActions.value.get('notifications')!
    const opened = action.panel!()!.onOpen!()
    await waitFor(() => expect(pending.request).toHaveBeenCalledTimes(1))
    pending.resolve([
      {
        id: 81,
        title: '有独立海报',
        image: 'https://images.example.com/backdrop.jpg',
        poster: 'https://images.example.com/poster.jpg',
      },
      { id: 82, title: '旧版图片消息', image: 'https://images.example.com/legacy-poster.jpg', poster: null },
    ])
    await opened

    const entries = action.panel!()!.sections.flatMap(section => section.items)
    expect(entries.find(item => item.title === '有独立海报')?.image).toBe('https://images.example.com/poster.jpg')
    expect(entries.find(item => item.title === '旧版图片消息')?.image).toBe('https://images.example.com/legacy-poster.jpg')
  })

  it('普通网页通知继续展示原渠道图片', async () => {
    const pending = deferNotifications()
    const { container } = await renderWithProviders(UserNotification, {
      global: { stubs: { VImg: { props: ['src'], template: '<img :src="src" />' } } },
    })
    await fireEvent.click(container.querySelector('button')!)
    pending.resolve([
      {
        id: 83,
        title: '网页媒体通知',
        image: 'https://images.example.com/backdrop.jpg',
        poster: 'https://images.example.com/poster.jpg',
      },
    ])
    expect(await screen.findByText('网页媒体通知')).toBeInTheDocument()
    await waitFor(() => {
      expect(document.querySelector('.notification-panel img')?.getAttribute('src')).toBe(
        'https://images.example.com/backdrop.jpg',
      )
    })
  })

  it.each([390, 1440])('在 %ipx 窗口首次打开时显示加载动画，响应后显示消息', async width => {
    vi.stubGlobal('innerWidth', width)
    const pending = deferNotifications()
    const { container } = await renderWithProviders(UserNotification)
    await fireEvent.click(container.querySelector('button')!)

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('加载中')
    expect(status.querySelector('[role="progressbar"]')).toBeInTheDocument()
    expect(screen.queryByText('加载更多消息')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无通知')).not.toBeInTheDocument()
    await waitFor(() => expect(pending.request).toHaveBeenCalledTimes(1))

    pending.resolve([{ id: 1, title: '测试通知', text: '通知正文', reg_time: '2026-10-10 10:00:00' }])
    expect(await screen.findByText('测试通知')).toBeInTheDocument()
    expect(screen.getByText('通知正文')).toBeInTheDocument()
    expect(document.querySelector('.notification-initial-loading')).not.toBeInTheDocument()
    expect(pending.request).toHaveBeenCalledTimes(1)
  })

  it('空响应完成后结束首屏加载，交由通知列表展示空状态', async () => {
    const pending = deferNotifications()
    const { container } = await renderWithProviders(UserNotification)
    await fireEvent.click(container.querySelector('button')!)
    expect(await screen.findByRole('status')).toHaveTextContent('加载中')
    pending.resolve([])

    await waitFor(() => expect(document.querySelector('.notification-initial-loading')).not.toBeInTheDocument())
    expect(document.querySelector('.notification-list-scroll')).toBeInTheDocument()
    expect(screen.queryByText('加载更多消息')).not.toBeInTheDocument()
  })

  it('请求失败后结束首屏加载，保留列表重试入口', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    server.use(
      http.get('http://localhost/api/v1/message/notification', () =>
        HttpResponse.json({ detail: 'failed' }, { status: 500 }),
      ),
    )
    const { container } = await renderWithProviders(UserNotification)
    await fireEvent.click(container.querySelector('button')!)
    await waitFor(() => expect(error).toHaveBeenCalled())
    await waitFor(() => expect(document.querySelector('.notification-initial-loading')).not.toBeInTheDocument())
    expect(document.querySelector('.notification-list-scroll')).toBeInTheDocument()
  })
})
