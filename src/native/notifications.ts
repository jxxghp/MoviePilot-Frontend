import type { NativeTransport } from './protocol'

/** 使用现有登录态撤销当前安装的 APNs 及其配对网页，不新增认证或通用 API 桥。 */
export function revokeNativeNotificationBinding(token: string | null) {
  const installation = (window.MoviePilotNative as NativeTransport | undefined)?.notificationInstallation
  if (!token || !installation || !/^[a-zA-Z0-9_-]{16,64}$/.test(installation)) return
  const base = new URL(import.meta.env.VITE_API_BASE_URL, document.baseURI)
  if (base.origin !== location.origin) return
  const endpoint = new URL('notification/app', base)
  const origin = new URL(document.baseURI)
  origin.hash = ''
  origin.search = ''
  void fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'unregister', installation, origin: origin.href.replace(/\/$/, '') }),
    credentials: 'same-origin',
    keepalive: true,
    cache: 'no-store',
  }).catch(() => {
    /* 离线时只能完成本地退出，服务端绑定可在通知网页或恢复联网后解除。 */
  })
}
