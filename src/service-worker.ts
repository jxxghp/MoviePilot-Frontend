import { createHandlerBoundToURL, cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

declare let self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()

// self.__WB_MANIFEST is default injection point
precacheAndRoute(self.__WB_MANIFEST)

// to allow work offline
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api/] }))

// 通知选项
const options = {
  icon: '/logo.png',
}

// 监听 push 事件，显示通知
self.addEventListener('push', function (event) {
  if (!event.data) {
    return
  }
  // 解析获取推送消息
  let payload
  try {
    payload = event.data?.json()
  } catch (err) {
    console.log(err)
    payload = {
      title: event.data?.text(),
    }
  }
  // 根据推送消息生成桌面通知并展现出来
  try {
    let promise = self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon ?? options.icon,
      data: {
        url: payload.url,
      },
    })
    event.waitUntil(promise)
  } catch (e) {
    console.error(e)
  }
})

self.skipWaiting()
clientsClaim()
