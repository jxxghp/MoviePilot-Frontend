import { bufferToBase64Url } from '../../@core/utils/base64'

/** 构造公开的测试挑战，不含真实事务、账户或登录令牌。 */
export function requestPayload() {
  return {
    version: 1,
    state: bufferToBase64Url(new Uint8Array(32).fill(7).buffer),
    options: {
      challenge: bufferToBase64Url(new Uint8Array(32).fill(3).buffer),
      rpId: 'example.com',
      userVerification: 'required',
      timeout: 300_000,
      allowCredentials: [{ type: 'public-key', id: 'AQID', transports: ['internal', 'hybrid'] }],
    },
  }
}

/** 与 App 约定相同的 fragment 编码，测试查询字符串不会承载挑战。 */
export function requestURL(payload: unknown = requestPayload(), origin = 'https://media.example.com') {
  const encoded = bufferToBase64Url(new TextEncoder().encode(JSON.stringify(payload)).buffer)
  return `${origin}/native-passkey.html#request=${encoded}`
}

/** 模拟浏览器返回结构，专门测试客户端绑定；不声称这是后端签名验证。 */
export function assertionCredential(clientOverrides: Record<string, unknown> = {}): PublicKeyCredential {
  return {
    id: 'AQID',
    rawId: new Uint8Array([1, 2, 3]).buffer,
    type: 'public-key',
    response: {
      authenticatorData: new Uint8Array(37).buffer,
      clientDataJSON: new TextEncoder().encode(
        JSON.stringify({
          type: 'webauthn.get',
          challenge: requestPayload().options.challenge,
          origin: 'https://media.example.com',
          crossOrigin: false,
          ...clientOverrides,
        }),
      ).buffer,
      signature: new Uint8Array([1, 2]).buffer,
      userHandle: null,
    },
  } as unknown as PublicKeyCredential
}
