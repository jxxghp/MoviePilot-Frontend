import UserNotification from '../UserNotification.vue'
import type { SystemNotification } from '@/api/types'
import { nativeGlobalActions } from '@/native/registry'
import { dispatchNativePanel, nativePanelId, projectNativePanel } from '@/native/panel'
import { renderWithProviders } from '@tests/support/render'
import { apiJson } from '@tests/support/msw/response'
import { server } from '@tests/support/msw/server'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

const background = vi.hoisted(() => ({ receive: undefined as ((event: MessageEvent) => void) | undefined }))
vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useDelayedSSE: (_url: string, receive: (event: MessageEvent) => void) => {
      background.receive = receive
    },
  }),
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
  it('连续三页无漏项，回看旧通知仍可展开，重新打开撤销上次会话的回调', async () => {
    vi.stubGlobal('MoviePilotNative', { transportVersion: 1, panelFeedsVersion: 1, postMessage: vi.fn() })
    const items = Array.from({ length: 65 }, (_, index) => ({
      id: index + 1,
      title: `通知${index + 1}`,
      text: `正文${index + 1}`.repeat(80),
      reg_time: new Date(Date.UTC(2026, 9, 24, 12) - index * 1000).toISOString(),
    }))
    const requests: number[] = []
    server.use(
      http.get('http://localhost/api/v1/message/notification', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        requests.push(page)
        return apiJson(items.slice((page - 1) * 20, page * 20))
      }),
    )
    await renderWithProviders(UserNotification)
    const action = nativeGlobalActions.value.get('notifications')!
    await action.panel!()!.onOpen!()
    const initial = projectNativePanel(action.panel!()!)
    const seen = new Set<string>()
    for (let attempt = 0; attempt < 30; attempt++) {
      const source = action.panel!()!
      const current = projectNativePanel(source)
      expect(current.panel.sections[0].items.some(item => item.id === 'previous')).toBe(false)
      const messages = current.panel.sections.slice(1).flatMap(section => section.items)
      expect(messages.length).toBeLessThanOrEqual(3)
      messages.forEach(item => seen.add(item.id))
      expect(new TextEncoder().encode(JSON.stringify(current.panel)).length).toBeLessThan(28000)
      if (!source.hasMore) break
      await source.onLoadMore!()
    }
    expect(seen).toEqual(new Set(items.map(item => nativePanelId('message', `id:${item.id}`))))
    expect(requests).toEqual([1, 2, 3, 4])
    const latest = projectNativePanel(action.panel!()!)
    const firstId = nativePanelId('message', 'id:1')
    expect(dispatchNativePanel(latest, { panelEvent: 'select', itemId: firstId, value: latest.panel.feed!.id })).toBe(
      true,
    )
    expect(projectNativePanel(action.panel!()!).callbacks.get(firstId)?.subtitle).toContain(items[0].text)
    const lastId = nativePanelId('message', 'id:65')
    await action.panel!()!.onOpen!()
    const reopened = projectNativePanel(action.panel!()!)
    expect(
      dispatchNativePanel(reopened, { panelEvent: 'select', itemId: firstId, value: initial.panel.feed!.id }),
    ).toBe(false)
    expect(
      dispatchNativePanel(reopened, { panelEvent: 'select', itemId: lastId, value: reopened.panel.feed!.id }),
    ).toBe(false)
  })

  it('单页失败不越过游标，并发触底不重复请求，重试沿用原接口', async () => {
    vi.stubGlobal('MoviePilotNative', { transportVersion: 1, panelFeedsVersion: 1, postMessage: vi.fn() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let release!: () => void
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    const requests: number[] = []
    server.use(
      http.get('http://localhost/api/v1/message/notification', async ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'))
        requests.push(page)
        if (page === 2 && requests.filter(value => value === 2).length === 1) {
          await held
          return HttpResponse.json({ detail: 'failed' }, { status: 500 })
        }
        return apiJson(
          Array.from({ length: page === 1 ? 20 : 1 }, (_, index) => ({
            id: (page - 1) * 20 + index + 1,
            title: `通知${page}-${index}`,
            text: `${page}-${index}`,
          })),
        )
      }),
    )
    await renderWithProviders(UserNotification)
    const action = nativeGlobalActions.value.get('notifications')!
    await action.panel!()!.onOpen!()
    for (let i = 0; i < 6; i++) await action.panel!()!.onLoadMore!()
    const pending = action.panel!()!.onLoadMore!()
    await waitFor(() => expect(requests).toEqual([1, 2]))
    await action.panel!()!.onLoadMore!()
    expect(requests).toEqual([1, 2])
    release()
    await pending
    const failed = action.panel!()!
    expect(failed.loadError).toBeTruthy()
    expect(failed.hasMore).toBe(true)
    await failed.onLoadMore!()
    const retried = action.panel!()!
    expect(retried.loadError).toBeUndefined()
    expect(retried.hasMore).toBe(false)
    expect(
      retried.sections.flatMap(section => section.items).some(item => item.id === nativePanelId('message', 'id:21')),
    ).toBe(true)
    expect(requests).toEqual([1, 2, 2])
  })

  it('首屏失败重试从第一条开始，不跳过尚未加载的通知', async () => {
    vi.stubGlobal('MoviePilotNative', { transportVersion: 1, panelFeedsVersion: 1, postMessage: vi.fn() })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let attempts = 0
    server.use(
      http.get('http://localhost/api/v1/message/notification', () => {
        if (++attempts === 1) return HttpResponse.json({ detail: 'failed' }, { status: 500 })
        return apiJson(Array.from({ length: 5 }, (_, index) => ({ id: index + 1, title: `通知${index + 1}` })))
      }),
    )
    await renderWithProviders(UserNotification)
    const action = nativeGlobalActions.value.get('notifications')!
    await action.panel!()!.onOpen!()
    expect(action.panel!()!.loadError).toBeTruthy()
    await action.panel!()!.onLoadMore!()
    const source = action.panel!()!
    expect(source.loadError).toBeUndefined()
    expect(source.feed!.offset).toBe(0)
    expect(source.sections.slice(1).flatMap(section => section.items.map(item => item.title))).toEqual([
      '通知1',
      '通知2',
      '通知3',
    ])
    expect(source.hasMore).toBe(true)
    expect(attempts).toBe(2)
  })

  it('SSE新消息补到首片，已展示旧消息继续保留当前业务回调', async () => {
    vi.stubGlobal('MoviePilotNative', { transportVersion: 1, panelFeedsVersion: 1, postMessage: vi.fn() })
    const pending = deferNotifications()
    await renderWithProviders(UserNotification)
    const action = nativeGlobalActions.value.get('notifications')!
    const opened = action.panel!()!.onOpen!()
    pending.resolve(
      Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        title: `旧消息${i}`,
        text: `旧正文${i}`,
        reg_time: `2026-10-24 12:00:0${8 - i}`,
      })),
    )
    await opened
    await action.panel!()!.onLoadMore!()
    background.receive!(
      new MessageEvent('message', {
        data: JSON.stringify({ id: 99, title: '实时新消息', text: '新正文', reg_time: '2026-10-25 12:00:00' }),
      }),
    )
    const current = projectNativePanel(action.panel!()!)
    expect(current.panel.feed!.offset).toBe(0)
    expect(current.panel.sections.flatMap(section => section.items).some(item => item.title === '实时新消息')).toBe(
      true,
    )
    expect(current.callbacks.has(nativePanelId('message', 'id:6'))).toBe(true)
  })

  it('三条最长展示正文及图片地址仍全部装入有界分片', async () => {
    vi.stubGlobal('MoviePilotNative', { transportVersion: 1, panelFeedsVersion: 1, postMessage: vi.fn() })
    const pending = deferNotifications()
    await renderWithProviders(UserNotification)
    const action = nativeGlobalActions.value.get('notifications')!
    const opened = action.panel!()!.onOpen!()
    pending.resolve(
      Array.from({ length: 3 }, (_, i) => ({
        id: i + 1,
        title: `${i}${'标题'.repeat(400)}`,
        text: `${i}${'正文'.repeat(4000)}`,
        image: `https://image.example/${'a'.repeat(4000)}`,
      })),
    )
    await opened
    for (const entry of action.panel!()!
      .sections.slice(1)
      .flatMap(section => section.items))
      await entry.invoke!()
    const projection = projectNativePanel(action.panel!()!)
    expect(projection.panel.sections.slice(1).flatMap(section => section.items)).toHaveLength(3)
    expect(new TextEncoder().encode(JSON.stringify(projection.panel)).length).toBeLessThan(28000)
  })

  it('原生优先投影独立海报，旧消息缺海报时保留原图片供原生竖版裁剪', async () => {
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
    expect(entries.find(item => item.title === '旧版图片消息')?.image).toBe(
      'https://images.example.com/legacy-poster.jpg',
    )
  })

  it('原生正文保留媒体信息换行，旧容器仍能读取单行副标题，点击展开继续使用原业务状态', async () => {
    const pending = deferNotifications()
    await renderWithProviders(UserNotification)
    const action = nativeGlobalActions.value.get('notifications')!
    const opened = action.panel!()!.onOpen!()
    const text = '站点：演示\n质量：WEB-DL 2160p\n大小：13.8 GB\n' + '保留完整长段落。'.repeat(30)
    pending.resolve([{ id: 84, title: '媒体通知', text, reg_time: '2026-10-24 20:00:00' }])
    await opened
    const entry = action.panel!()!
      .sections.flatMap(section => section.items)
      .find(item => item.title === '媒体通知')!
    expect(entry.body).toContain('\n站点：演示\n质量：WEB-DL 2160p\n大小：13.8 GB\n')
    const projected = projectNativePanel(action.panel!()!)
      .panel.sections.flatMap(section => section.items)
      .find(item => item.id === entry.id)!
    expect(projected.subtitle).not.toContain('\n')
    expect(projected.body).toContain('\n质量：WEB-DL 2160p\n')
    await entry.invoke!()
    const expanded = action.panel!()!
      .sections.flatMap(section => section.items)
      .find(item => item.id === entry.id)!
    expect(expanded.body).toContain(text)
  })

  it('普通网页通知优先展示独立海报，不改变原渠道图片字段', async () => {
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
        'https://images.example.com/poster.jpg',
      )
    })
  })

  it('网页历史消息没有 poster 时回退 image 并使用竖版 cover 缩略图', async () => {
    const pending = deferNotifications()
    const { container } = await renderWithProviders(UserNotification, {
      global: { stubs: { VImg: { props: ['src'], template: '<img :src="src" />' } } },
    })
    await fireEvent.click(container.querySelector('button')!)
    pending.resolve([{ id: 85, title: '历史媒体消息', image: 'https://images.example.com/backdrop.jpg' }])
    expect(await screen.findByText('历史媒体消息')).toBeInTheDocument()
    const media = document.querySelector('.notification-panel .notification-media')!
    expect(media).toBeInTheDocument()
    expect(media.querySelector('img')?.getAttribute('src')).toBe('https://images.example.com/backdrop.jpg')
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
