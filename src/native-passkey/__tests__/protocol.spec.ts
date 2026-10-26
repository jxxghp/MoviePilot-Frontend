import { describe, expect, it } from 'vitest'
import { parsePasskeyRequest, passkeyCallback, serializePasskeyAssertion } from '../protocol'
import { assertionCredential, requestPayload, requestURL } from './fixtures'

describe('native passkey protocol', () => {
  it('decodes an ancestor RP and caps the browser lifetime without changing verification requirements', () => {
    const request = parsePasskeyRequest(requestURL())
    expect([...new Uint8Array(request.publicKey.challenge as ArrayBuffer)]).toEqual(Array(32).fill(3))
    expect(request.publicKey).toMatchObject({ rpId: 'example.com', timeout: 120_000, userVerification: 'required' })
    expect(request.publicKey.allowCredentials?.[0]).toMatchObject({
      type: 'public-key',
      transports: ['internal', 'hybrid'],
    })
  })

  it('supports discoverable credentials and a loopback development origin', () => {
    const payload = requestPayload()
    const options = { challenge: payload.options.challenge }
    const request = parsePasskeyRequest(requestURL({ ...payload, options }, 'http://localhost:5287'))
    expect(request.publicKey.rpId).toBe('localhost')
    expect(request.publicKey.allowCredentials).toBeUndefined()
  })

  it.each([
    'http://media.example.com',
    'https://example.com.evil.invalid',
    'https://notexample.com',
    'https://user:password@media.example.com',
  ])('rejects an insecure, unrelated or credential-bearing origin: %s', origin => {
    expect(() => parsePasskeyRequest(requestURL(requestPayload(), origin))).toThrow()
  })

  it.each([
    { version: 2 },
    { state: 'AQID' },
    { state: `${requestPayload().state}=` },
    { transaction_token: 'never-accepted' },
    { callback: 'https://evil.invalid' },
    { options: null },
    { options: [] },
  ])('rejects incompatible or secret-bearing envelopes: %j', override => {
    expect(() => parsePasskeyRequest(requestURL({ ...requestPayload(), ...override }))).toThrow()
  })

  it.each([
    { challenge: '' },
    { challenge: 'AQID' },
    { challenge: 'x'.repeat(2_000) },
    { rpId: 'com' },
    { rpId: 'EXAMPLE.COM' },
    { rpId: 'https://example.com' },
    { timeout: -1 },
    { timeout: '1000' },
    { userVerification: 'always' },
    { extensions: { appid: 'https://evil.invalid' } },
    { allowCredentials: [{}] },
    { allowCredentials: Array(65).fill({ type: 'public-key', id: 'AQID' }) },
    { allowCredentials: [{ type: 'public-key', id: 'AQID', transports: ['unexpected'] }] },
  ])('rejects malformed or excessive WebAuthn options: %j', override => {
    const payload = requestPayload()
    expect(() =>
      parsePasskeyRequest(requestURL({ ...payload, options: { ...payload.options, ...override } })),
    ).toThrow()
  })

  it('rejects query, duplicate fragment fields and oversized input', () => {
    const url = requestURL()
    expect(() => parsePasskeyRequest(url.replace('#', '?transaction_token=private#'))).toThrow()
    expect(() => parsePasskeyRequest(`${url}&request=AQID`)).toThrow()
    expect(() => parsePasskeyRequest(`${url}&callback=moviepilot://elsewhere`)).toThrow()
    expect(() => parsePasskeyRequest(`https://media.example.com/#request=${'a'.repeat(32_768)}`)).toThrow()
  })

  it.each([
    { type: 'webauthn.create' },
    { challenge: 'different' },
    { origin: 'https://evil.invalid' },
    { origin: 'https://media.example.com:443/' },
    { crossOrigin: true },
  ])('refuses assertions that do not belong to this top-level request: %j', override => {
    expect(() => serializePasskeyAssertion(assertionCredential(override), parsePasskeyRequest(requestURL()))).toThrow()
  })

  it('refuses mismatched credential identifiers and truncated authenticator data', () => {
    const request = parsePasskeyRequest(requestURL())
    expect(() =>
      serializePasskeyAssertion({ ...assertionCredential(), id: 'BAUG' } as PublicKeyCredential, request),
    ).toThrow()
    const credential = assertionCredential()
    Object.assign(credential.response, { authenticatorData: new Uint8Array(36).buffer })
    expect(() => serializePasskeyAssertion(credential, request)).toThrow()
  })

  it('returns only the assertion and state to the fixed App callback', () => {
    const request = parsePasskeyRequest(requestURL())
    const assertion = serializePasskeyAssertion(assertionCredential(), request)
    const url = new URL(passkeyCallback(request, assertion))
    expect(`${url.protocol}//${url.host}${url.pathname}`).toBe('moviepilot://passkey/callback')
    expect(url.search).toBe('')
    const encoded = new URLSearchParams(url.hash.slice(1)).get('result')!
    const data = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')))
    expect(data).toEqual({ version: 1, state: request.state, credential: assertion })
    expect(Object.keys(data.credential.response)).toEqual([
      'authenticatorData',
      'clientDataJSON',
      'signature',
      'userHandle',
    ])
    expect(passkeyCallback(request, 'canceled')).not.toContain('transaction_token')
  })
})
