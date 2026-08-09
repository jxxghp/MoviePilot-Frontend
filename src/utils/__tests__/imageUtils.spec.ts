import { getDisplayImageUrl, getProxyImageUrl } from '@/utils/imageUtils'
import { describe, expect, it } from 'vitest'

describe('image URL helpers', () => {
  it('keeps ordinary remote images direct until global caching is enabled', () => {
    const image = 'https://images.example.com/album cover.jpg'

    expect(getDisplayImageUrl(image, false)).toBe(image)
    expect(getDisplayImageUrl(image, true)).toContain(`system/cache/image?url=${encodeURIComponent(image)}`)
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
})
