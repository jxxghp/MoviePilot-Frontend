import { getPWADisplayEnvironment, isMobilePlatform, isPWADisplayMode } from '@/@core/utils/navigator'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function mockDisplayModes(...activeModes: string[]) {
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: activeModes.some(mode => query === `(display-mode: ${mode})`),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('PWA display environment', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false })
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('')
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 })
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    })
  })

  it('prioritizes window controls overlay over standalone fallback', () => {
    mockDisplayModes('window-controls-overlay', 'standalone')

    expect(getPWADisplayEnvironment()).toBe('window-controls-overlay')
    expect(isPWADisplayMode()).toBe(true)
  })

  it.each(['standalone', 'fullscreen', 'minimal-ui'])('maps %s to the standard standalone environment', mode => {
    mockDisplayModes(mode)

    expect(getPWADisplayEnvironment()).toBe('standalone')
  })

  it('supports legacy iOS and Android trusted-web-activity signals', () => {
    mockDisplayModes()
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
    expect(getPWADisplayEnvironment()).toBe('standalone')

    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false })
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('android-app://com.example.moviepilot')
    expect(getPWADisplayEnvironment()).toBe('standalone')
  })

  it('keeps a regular browser outside installed display modes', () => {
    mockDisplayModes()

    expect(getPWADisplayEnvironment()).toBe('browser')
    expect(isPWADisplayMode()).toBe(false)
  })
})

describe('mobile platform detection', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 })
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: undefined })
  })

  it('does not classify a narrow-capable desktop browser as a mobile platform', () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    })

    expect(isMobilePlatform()).toBe(false)
  })

  it('recognizes mobile UA data and iPad desktop user agents', () => {
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { mobile: true } })
    expect(isMobilePlatform()).toBe(true)

    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
    })
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 })
    expect(isMobilePlatform()).toBe(true)
  })
})
