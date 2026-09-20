import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import appleSplashSpecs from '../../scripts/pwa-splash-specs.json'

const projectRoot = process.cwd()
const indexHtml = readFileSync(resolve(projectRoot, 'index.html'), 'utf8')
const splashDirectory = resolve(projectRoot, 'public/splash')

describe('PWA 启动屏资源', () => {
  it('为每个横竖屏资源声明静态 iOS 启动图链接', () => {
    const splashAssets = readdirSync(splashDirectory)
      .filter(fileName => fileName.endsWith('.jpg'))
      .sort()
    const parsedDocument = new DOMParser().parseFromString(indexHtml, 'text/html')
    const launchLinks = [...parsedDocument.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-startup-image"]')]
    const declaredAssets = launchLinks.map(link => link.getAttribute('href')?.split('/').pop()).sort()

    expect(splashAssets).toHaveLength(40)
    expect(declaredAssets).toEqual(splashAssets)
    splashAssets.forEach(fileName => expect(existsSync(resolve(splashDirectory, fileName))).toBe(true))

    appleSplashSpecs.forEach(({ width: portraitWidth, height: portraitHeight, scaleFactor }) => {
      const deviceWidth = portraitWidth / scaleFactor
      const deviceHeight = portraitHeight / scaleFactor
      const portraitMedia = `(device-width: ${deviceWidth}px) and (device-height: ${deviceHeight}px) and (-webkit-device-pixel-ratio: ${scaleFactor}) and (orientation: portrait)`
      const landscapeMedia = `(device-width: ${deviceWidth}px) and (device-height: ${deviceHeight}px) and (-webkit-device-pixel-ratio: ${scaleFactor}) and (orientation: landscape)`

      expect(
        launchLinks.some(
          link =>
            link.getAttribute('href') === `/splash/apple-splash-${portraitWidth}-${portraitHeight}.jpg` &&
            link.media === portraitMedia,
        ),
      ).toBe(true)
      expect(
        launchLinks.some(
          link =>
            link.getAttribute('href') === `/splash/apple-splash-${portraitHeight}-${portraitWidth}.jpg` &&
            link.media === landscapeMedia,
        ),
      ).toBe(true)
    })
  })

  it('保持启动层背景、可见回退和动效降级配置一致', () => {
    expect(indexHtml.toLowerCase()).toContain('--initial-loader-bg: #0e1116')
    expect(indexHtml).toContain('prefers-reduced-motion: reduce')
    expect(indexHtml).toContain('inset: 0;')
    expect(indexHtml).toContain('inset-block-end: calc(env(safe-area-inset-bottom, 0px) + 48px)')
    expect(indexHtml).toContain('document.documentElement.dataset.launchStartedAt')
    expect(indexHtml).toContain('materio-initial-resolved-theme')
    expect(indexHtml).toContain('getCachedLaunchBackground')
    expect(indexHtml).toContain('opacity: 1')
    expect(indexHtml).not.toContain('apple-mobile-web-app-orientations')
    expect(indexHtml).not.toContain('name="screen-orientation"')
    expect(indexHtml).not.toContain('name="x5-orientation"')
  })

  it('原生启动图退场后保留同色交接层，普通浏览器继续使用网页动态加载层', () => {
    const detectionStart = indexHtml.indexOf('function hasActiveNativeLaunchScreen()')
    const detectionEnd = indexHtml.indexOf('const launchThemePalettes', detectionStart)
    const detectionSource = indexHtml.slice(detectionStart, detectionEnd)

    expect(detectionStart).toBeGreaterThanOrEqual(0)
    expect(detectionEnd).toBeGreaterThan(detectionStart)
    expect(detectionSource).toContain("'(display-mode: standalone)'")
    expect(detectionSource).toContain("'(display-mode: fullscreen)'")
    expect(detectionSource).toContain("'(display-mode: minimal-ui)'")
    expect(detectionSource).toContain("'(display-mode: window-controls-overlay)'")
    expect(detectionSource).toContain('window.navigator.standalone === true')
    expect(detectionSource).toContain("document.referrer.startsWith('android-app://')")
    expect(indexHtml).toContain('dataset.nativeLaunchScreen')
    expect(indexHtml).toContain("html[data-native-launch-screen='true'] #loading-bg .loading-shell")
    expect(indexHtml).toContain('visibility: hidden;')
    expect(indexHtml).not.toContain("document.documentElement.removeAttribute('data-launch-loading')")
    expect(indexHtml).toContain("if (document.documentElement.dataset.nativeLaunchScreen === 'true') return")
    expect(indexHtml).not.toContain("document.getElementById('loading-bg')?.remove()")
    expect(indexHtml).toContain(
      '<body style="margin: 0; overscroll-behavior: none; -webkit-overflow-scrolling: touch">',
    )
  })

  it('让原生启动图和网页启动层共享物理屏幕中心', () => {
    const generatorSource = readFileSync(resolve(projectRoot, 'scripts/generate-pwa-splash.mjs'), 'utf8')
    expect(generatorSource).toContain('left: Math.round((width - logoSize) / 2)')
    expect(generatorSource).toContain('top: Math.round((height - logoSize) / 2)')
    expect(indexHtml).toContain('Keep the brand mark in the physical screen center')
  })
})
