import { getBrowserLocale } from '@/plugins/i18n'
import { describe, expect, it, vi } from 'vitest'

describe('browser locale selection', () => {
  it.each([
    ['zh-TW', 'zh-TW'],
    ['zh-HK', 'zh-TW'],
    ['zh-Hant', 'zh-TW'],
    ['zh-Hant-HK', 'zh-TW'],
    ['zh-CN', 'zh-CN'],
    ['zh-Hans-SG', 'zh-CN'],
    ['en-GB', 'en-US'],
    ['EN-us', 'en-US'],
  ])('uses the full language identity for %s', (browser, expected) => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue([browser])
    expect(getBrowserLocale()).toBe(expected)
  })
  it('respects saved preference and falls through unsupported browser languages', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-FR', 'zh-TW'])
    expect(getBrowserLocale()).toBe('zh-TW')
    localStorage.setItem('MP_LOCALE', 'en-US')
    expect(getBrowserLocale()).toBe('en-US')
  })
})
