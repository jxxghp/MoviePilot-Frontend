import { parsePasskeyRequest, passkeyCallback } from './protocol'
import { NativePasskeySession } from './session'

/** 专用页面清除挑战 URL 后才启动交互，不导入主 App、Router、Pinia 或认证 API。 */
function initialize(): void {
  const originalURL = location.href
  history.replaceState(null, '', location.pathname)
  const message = document.querySelector<HTMLElement>('#message')!
  const hostname = document.querySelector<HTMLElement>('#hostname')!
  const cancel = document.querySelector<HTMLButtonElement>('#cancel')!
  hostname.textContent = location.host
  try {
    if (window.top !== window) throw new Error('invalid')
    const request = parsePasskeyRequest(originalURL)
    if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials?.get) {
      message.textContent = '当前系统或连接不支持通行密钥，请返回 App。'
      cancel.hidden = false
      cancel.onclick = () => location.replace(passkeyCallback(request, 'unsupported'))
      return
    }
    const session = new NativePasskeySession(
      request,
      navigator.credentials,
      url => location.replace(url),
      status => {
        message.textContent = status === 'working' ? '请在系统提示中选择通行密钥。' : '正在返回 MoviePilot…'
      },
    )
    cancel.hidden = false
    cancel.onclick = () => session.cancel()
    window.addEventListener('pagehide', () => session.dispose(), { once: true })
    // App 内的明确点击已开始这次会话；每次页面加载只发起一次系统验证。
    void session.authenticate()
  } catch {
    message.textContent = '验证请求无效或已过期，请关闭此页面并从 App 重新发起。'
  }
}

initialize()
