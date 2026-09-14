import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGlobalSettingsStore } from '@/stores'
import { getDisplayImageUrl, getLogoUrl, getProxyImageUrl, hasLogo } from '@/utils/imageUtils'

describe('image URL helpers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps ordinary remote images direct until global caching is enabled', () => {
    const image = 'https://images.example.com/album cover.jpg'

    expect(getDisplayImageUrl(image, false)).toBe(image)
    expect(getDisplayImageUrl(image, true)).toContain(`system/cache/image?url=${encodeURIComponent(image)}`)
  })

  it('proxies Bangumi images through the backend when the setting is enabled', () => {
    const image = 'https://lain.bgm.tv/pic/cover.jpg?size=large'
    useGlobalSettingsStore().setData({
      BANGUMI_PROXY_ENABLE: true,
      BANGUMI_IMAGE_DOMAIN: 'https://image-proxy.example/?url=',
    })

    const rewrittenImage = `https://image-proxy.example/?url=${encodeURIComponent(image)}`
    expect(getDisplayImageUrl(image)).toContain(`system/img/1?imgurl=${encodeURIComponent(rewrittenImage)}`)
  })

  it('keeps Bangumi images direct when the proxy setting is disabled', () => {
    const image = 'https://img.bangumi.tv/pic/cover.jpg'
    useGlobalSettingsStore().setData({
      BANGUMI_PROXY_ENABLE: false,
      BANGUMI_IMAGE_DOMAIN: 'https://image-proxy.example/',
    })

    expect(getDisplayImageUrl(image)).toBe(image)
  })

  it('passes cache and cookie controls through the mandatory image proxy', () => {
    const image = 'https://media.example.com/private/poster.jpg'
    const proxied = getProxyImageUrl(image, { proxy: true, useCache: true, useCookies: true })

    expect(proxied).toContain(`system/img/1?imgurl=${encodeURIComponent(image)}`)
    expect(proxied).toContain('&cache=true')
    expect(proxied).toContain('&use_cookies=true')
  })

  it('does not proxy local, data, or empty image sources', () => {
    expect(getProxyImageUrl('/images/local.png', { useCache: true })).toBe('/images/local.png')
    expect(getProxyImageUrl('data:image/png;base64,abc', { useCache: true })).toBe('data:image/png;base64,abc')
    expect(getProxyImageUrl('', { useCache: true })).toBe('')
  })

  it('exposes the official DingTalk logo for notification channels', () => {
    expect(hasLogo('dingtalk')).toBe(true)
    expect(getLogoUrl('dingtalk')).toContain('dingtalk')
  })
})
