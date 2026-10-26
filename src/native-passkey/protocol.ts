import { base64UrlToUint8Array, bufferToBase64Url } from '../@core/utils/base64'

const maximumPayloadLength = 32_768
const callbackURL = 'moviepilot://passkey/callback'
const transports = ['ble', 'hybrid', 'internal', 'nfc', 'usb', 'smart-card']

/** 此验证页只能回传固定结果，不接收事务令牌、用户资料或自定义回调地址。 */
export type PasskeyErrorCode = 'canceled' | 'expired' | 'unsupported' | 'invalid' | 'failed'

/** 已校验的单次挑战；state 仅供发起的系统认证会话关联结果。 */
export interface PasskeyRequest {
  state: string
  publicKey: PublicKeyCredentialRequestOptions
  challenge: string
  origin: string
}

/** 已有后端 finish 接口接受的 WebAuthn 断言，不包含登录令牌。 */
export interface PasskeyAssertion {
  id: string
  rawId: string
  type: 'public-key'
  response: {
    authenticatorData: string
    clientDataJSON: string
    signature: string
    userHandle: string | null
  }
}

/** 拒绝数组、null 和额外协议字段，避免输入兼任其他认证或导航通道。 */
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => !keys.includes(key))) throw new Error('invalid')
  return record
}

/** Base64URL 必须是规范无填充编码，且解码后的数据在该字段的边界内。 */
function decode(value: unknown, minimum: number, maximum: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > Math.ceil((maximum * 4) / 3)) {
    throw new Error('invalid')
  }
  const bytes = base64UrlToUint8Array(value)
  if (bytes.length < minimum || bytes.length > maximum || bufferToBase64Url(bytes.buffer) !== value) {
    throw new Error('invalid')
  }
  return bytes
}

/** 只接受 HTTPS 或本机开发来源；RP 必须是该来源自身或有边界的父域。 */
function relyingParty(value: unknown, location: URL): string {
  const host = location.hostname.toLowerCase()
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  if (location.protocol !== 'https:' && !(location.protocol === 'http:' && loopback)) throw new Error('invalid')
  const rp = value === undefined ? host : value
  if (typeof rp !== 'string' || rp.length > 253 || rp !== rp.toLowerCase() || /[^a-z0-9.\-:[\]]/.test(rp)) {
    throw new Error('invalid')
  }
  if (rp !== host && (!host.endsWith(`.${rp}`) || !rp.includes('.') || /[:[\]]/.test(rp))) {
    throw new Error('invalid')
  }
  return rp
}

/** 解析 App 传入的 fragment；不接受 query，页面启动后应立即清除原 URL。 */
export function parsePasskeyRequest(url: string): PasskeyRequest {
  const location = new URL(url)
  if (location.search || location.username || location.password || location.hash.length > maximumPayloadLength) {
    throw new Error('invalid')
  }
  const parameters = new URLSearchParams(location.hash.slice(1))
  if ([...parameters.keys()].length !== 1 || !parameters.has('request')) throw new Error('invalid')
  const payload = object(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode(parameters.get('request'), 1, 24_576))),
    ['version', 'state', 'options'],
  )
  if (payload.version !== 1) throw new Error('invalid')
  decode(payload.state, 32, 32)
  const options = object(payload.options, ['challenge', 'rpId', 'timeout', 'allowCredentials', 'userVerification'])
  const challenge = decode(options.challenge, 16, 1_024)
  const rpId = relyingParty(options.rpId, location)
  const publicKey: PublicKeyCredentialRequestOptions = { challenge: challenge.buffer, rpId, timeout: 120_000 }
  if (options.timeout !== undefined) {
    if (typeof options.timeout !== 'number' || !Number.isFinite(options.timeout) || options.timeout < 1) {
      throw new Error('invalid')
    }
    publicKey.timeout = Math.min(options.timeout, 120_000)
  }
  if (options.userVerification !== undefined) {
    if (!['required', 'preferred', 'discouraged'].includes(String(options.userVerification))) throw new Error('invalid')
    publicKey.userVerification = options.userVerification as UserVerificationRequirement
  }
  if (options.allowCredentials !== undefined) {
    if (!Array.isArray(options.allowCredentials) || options.allowCredentials.length > 64) throw new Error('invalid')
    publicKey.allowCredentials = options.allowCredentials.map(value => {
      const credential = object(value, ['id', 'type', 'transports'])
      if (credential.type !== 'public-key') throw new Error('invalid')
      const descriptor: PublicKeyCredentialDescriptor = {
        type: 'public-key',
        id: decode(credential.id, 1, 1_024).buffer,
      }
      if (credential.transports !== undefined) {
        if (
          !Array.isArray(credential.transports) ||
          credential.transports.length > 8 ||
          credential.transports.some(item => typeof item !== 'string' || !transports.includes(item))
        )
          throw new Error('invalid')
        descriptor.transports = credential.transports as AuthenticatorTransport[]
      }
      return descriptor
    })
  }
  return { state: payload.state as string, publicKey, challenge: options.challenge as string, origin: location.origin }
}

/** 序列化真实凭证并核对 challenge、origin 和认证类型；最终签名仍由既有后端验证。 */
export function serializePasskeyAssertion(credential: PublicKeyCredential, request: PasskeyRequest): PasskeyAssertion {
  if (credential.type !== 'public-key') throw new Error('invalid')
  const rawId = bufferToBase64Url(credential.rawId)
  decode(rawId, 1, 1_024)
  if (credential.id !== rawId) throw new Error('invalid')
  const response = credential.response as AuthenticatorAssertionResponse
  const authenticatorData = bufferToBase64Url(response.authenticatorData)
  const clientDataJSON = bufferToBase64Url(response.clientDataJSON)
  const signature = bufferToBase64Url(response.signature)
  decode(authenticatorData, 37, 2_048)
  const clientData = decode(clientDataJSON, 1, 4_096)
  decode(signature, 1, 2_048)
  const client = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(clientData))
  if (
    client.type !== 'webauthn.get' ||
    client.challenge !== request.challenge ||
    client.origin !== request.origin ||
    (client.crossOrigin !== undefined && client.crossOrigin !== false)
  ) {
    throw new Error('invalid')
  }
  const userHandle = response.userHandle ? bufferToBase64Url(response.userHandle) : null
  if (userHandle !== null) decode(userHandle, 1, 256)
  return {
    id: rawId,
    rawId,
    type: 'public-key',
    response: { authenticatorData, clientDataJSON, signature, userHandle },
  }
}

/** 回调始终指向固定 App 路径；不回显异常、原始输入或任何认证令牌。 */
export function passkeyCallback(request: PasskeyRequest, result: PasskeyAssertion | PasskeyErrorCode): string {
  const payload =
    typeof result === 'string'
      ? { version: 1, state: request.state, error: result }
      : { version: 1, state: request.state, credential: result }
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const encoded = bufferToBase64Url(bytes.buffer)
  if (encoded.length > maximumPayloadLength) throw new Error('invalid')
  return `${callbackURL}#result=${encoded}`
}
