import UserNotification from '../UserNotification.vue'
import type { SystemNotification } from '@/api/types'
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
