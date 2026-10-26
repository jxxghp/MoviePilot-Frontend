import { passkeyCallback, serializePasskeyAssertion } from './protocol'
import type { PasskeyRequest } from './protocol'

/** 独立验证会话只申请系统凭证并回传一次结果，不访问 API 或保存账户状态。 */
export class NativePasskeySession {
  private controller: AbortController | null = null
  private finished = false
  private timer: ReturnType<typeof setTimeout>

  /** 页面寿命有界；不因点击、失败或恢复页面重新延长同一挑战。 */
  constructor(
    private readonly request: PasskeyRequest,
    private readonly credentials: Pick<CredentialsContainer, 'get'>,
    private readonly navigate: (url: string) => void,
    private readonly status: (value: 'working' | 'finished') => void,
  ) {
    this.timer = setTimeout(() => this.complete('expired'), 120_000)
  }

  /** 专用页载入后请求一次验证；取消后忽略浏览器实现可能返回的迟到结果。 */
  async authenticate(): Promise<void> {
    if (this.finished || this.controller) return
    const controller = new AbortController()
    this.controller = controller
    this.status('working')
    try {
      const credential = await this.credentials.get({ publicKey: this.request.publicKey, signal: controller.signal })
      if (this.finished || controller.signal.aborted) return
      if (!credential) return this.complete('canceled')
      this.complete(serializePasskeyAssertion(credential as PublicKeyCredential, this.request))
    } catch (error) {
      if (this.finished || controller.signal.aborted) return
      const name = error instanceof DOMException || error instanceof Error ? error.name : ''
      this.complete(
        name === 'NotAllowedError' || name === 'AbortError'
          ? 'canceled'
          : name === 'NotSupportedError'
            ? 'unsupported'
            : 'failed',
      )
    }
  }

  /** 用户取消时回传一次取消结果，原 App 仍停留在原生登录表单。 */
  cancel(): void {
    this.complete('canceled')
  }

  /** 关闭或离开页面只撤销请求，禁止 pagehide 触发另一轮导航。 */
  dispose(): void {
    this.finished = true
    clearTimeout(this.timer)
    this.controller?.abort()
    this.controller = null
  }

  /** 先封闭会话再取消底层请求，防止同步 abort 事件或重复点击交付多次结果。 */
  private complete(result: Parameters<typeof passkeyCallback>[1]): void {
    if (this.finished) return
    this.dispose()
    this.status('finished')
    this.navigate(passkeyCallback(this.request, result))
  }
}
