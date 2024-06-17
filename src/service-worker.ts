import { createHandlerBoundToURL, cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

declare let self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()

// self.__WB_MANIFEST is default injection point
precacheAndRoute(self.__WB_MANIFEST)

// to allow work offline
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^(\/[\w-]+)*\/api/] }))

// 通知选项
const options = {
  icon: '/logo.png',
  vibrate: [100, 50, 100],
  actions: [{ action: 'close', title: '关闭' }],
}

// 监听 push 事件，显示通知
self.addEventListener('push', function (event) {
  console.log('notification push')
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
    const content = {
      body: payload.body || '',
      icon: payload.icon || options.icon,
      vibrate: [100, 50, 100],
      data: { url: payload.url },
      actions: options.actions,
    }
    event.waitUntil(self.registration.showNotification(payload.title, content))
  } catch (e) {
    console.error(e)
  }
})

// 安装
self.addEventListener('install', function (e) {
  console.log('worker install')
  self.skipWaiting()
})

// 激活
self.addEventListener('activate', function (e) {
  console.log('worker activate')
  e.waitUntil(self.clients.claim())
})

// 监听通知点击事件
self.addEventListener('notificationclick', function (event) {
  console.log('notification click')
  const info = event.notification
  if (event.action === 'close') {
    info.close()
  } else if (info.data?.url) {
    event.waitUntil(self.clients.openWindow(info.data?.url))
  }
})
