import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const indexHtml = readFileSync(resolve(projectRoot, 'index.html'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'))
const viteConfig = readFileSync(resolve(projectRoot, 'vite.config.ts'), 'utf8')

const iconSpecs = [
  { alpha: true, path: 'public/logo.png', size: 512 },
  { alpha: true, path: 'src/assets/images/logo.png', size: 512 },
  { alpha: false, path: 'public/icon.png', size: 1024 },
  { alpha: false, path: 'public/android-chrome-192x192.png', size: 192 },
  { alpha: false, path: 'public/android-chrome-192x192_maskable.png', size: 192 },
  { alpha: false, path: 'public/android-chrome-512x512.png', size: 512 },
  { alpha: false, path: 'public/android-chrome-512x512_maskable.png', size: 512 },
  { alpha: false, path: 'public/pwa-1024x1024.png', size: 1024 },
  { alpha: false, path: 'public/pwa-1024x1024_maskable.png', size: 1024 },
  { alpha: false, path: 'public/apple-touch-icon.png', size: 180 },
  { alpha: false, path: 'public/apple-touch-icon-precomposed.png', size: 180 },
  { alpha: false, path: 'public/apple-touch-icon-180x180.png', size: 180 },
  { alpha: false, path: 'public/apple-touch-icon-167x167.png', size: 167 },
  { alpha: false, path: 'public/apple-touch-icon-152x152.png', size: 152 },
  { alpha: false, path: 'public/mstile-150x150.png', size: 150 },
  { alpha: true, path: 'public/favicon-32x32.png', size: 32 },
  { alpha: true, path: 'public/favicon-16x16.png', size: 16 },
] as const

/**
 * 读取生成 PNG 的关键元数据，验证声明尺寸与透明通道契约。
 */
async function readIconMetadata(relativePath: string) {
  return sharp(resolve(projectRoot, relativePath)).metadata()
}

describe('PWA 跨平台图标资源', () => {
  it('生成与文件名和用途一致的 PNG 尺寸及透明通道', async () => {
    for (const icon of iconSpecs) {
      const metadata = await readIconMetadata(icon.path)

      expect(metadata.width, icon.path).toBe(icon.size)
      expect(metadata.height, icon.path).toBe(icon.size)
      expect(metadata.hasAlpha, icon.path).toBe(icon.alpha)
    }
  })

  it('在 manifest 中同时声明常规、maskable 与高分辨率图标', () => {
    expect(viteConfig).toContain("'src': './android-chrome-192x192.png'")
    expect(viteConfig).toContain("'src': './android-chrome-192x192_maskable.png'")
    expect(viteConfig).toContain("'src': './android-chrome-512x512.png'")
    expect(viteConfig).toContain("'src': './android-chrome-512x512_maskable.png'")
    expect(viteConfig).toContain("'src': './pwa-1024x1024.png'")
    expect(viteConfig).toContain("'src': './pwa-1024x1024_maskable.png'")
    expect(viteConfig.match(/'purpose': 'any'/g)).toHaveLength(3)
    expect(viteConfig.match(/'purpose': 'maskable'/g)).toHaveLength(3)
  })

  it('声明 Apple、macOS Safari 与 Windows 的平台入口', () => {
    const parsedDocument = new DOMParser().parseFromString(indexHtml, 'text/html')
    const appleSizes = [...parsedDocument.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-icon"]')]
      .map(link => link.getAttribute('sizes'))
      .sort()

    expect(appleSizes).toEqual(['152x152', '167x167', '180x180'])
    expect(parsedDocument.querySelector('link[rel="mask-icon"]')?.getAttribute('href')).toBe('/logo.svg')
    expect(parsedDocument.querySelector('meta[name="msapplication-TileImage"]')?.getAttribute('content')).toBe(
      '/mstile-150x150.png',
    )
    expect(parsedDocument.querySelector('meta[name="msapplication-config"]')?.getAttribute('content')).toBe(
      '/browserconfig.xml',
    )
  })

  it('生成包含常见 Windows 尺寸的透明多分辨率 favicon', async () => {
    const favicon = readFileSync(resolve(projectRoot, 'public/favicon.ico'))
    const imageCount = favicon.readUInt16LE(4)
    const declaredSizes = Array.from({ length: imageCount }, (_, index) => {
      const sizeByte = favicon.readUInt8(6 + index * 16)
      return sizeByte === 0 ? 256 : sizeByte
    })

    expect(favicon.readUInt16LE(2)).toBe(1)
    expect(declaredSizes).toEqual([16, 32, 48, 64, 128, 256])

    for (let index = 0; index < imageCount; index += 1) {
      const entryOffset = 6 + index * 16
      const imageLength = favicon.readUInt32LE(entryOffset + 8)
      const imageOffset = favicon.readUInt32LE(entryOffset + 12)
      const metadata = await sharp(favicon.subarray(imageOffset, imageOffset + imageLength)).metadata()

      expect(metadata.hasAlpha, `favicon entry ${declaredSizes[index]}x${declaredSizes[index]}`).toBe(true)
    }
  })

  it('在构建前可重复生成图标，并让启动图消费最新矢量 Logo', () => {
    expect(packageJson.scripts['generate:pwa-icons']).toBe('node scripts/generate-pwa-icons.mjs')
    expect(packageJson.scripts.prebuild).toContain(
      'npm run build:icons && npm run generate:pwa-icons && npm run generate:pwa-splash',
    )

    const publicLogo = readFileSync(resolve(projectRoot, 'public/logo.svg'), 'utf8')
    const sourceLogo = readFileSync(resolve(projectRoot, 'src/assets/images/logo.svg'), 'utf8')

    expect(publicLogo).toBe(sourceLogo)
    expect(publicLogo).toContain('shape-rendering:geometricPrecision')
    expect(publicLogo).not.toContain('stroke-width')
    expect(publicLogo).not.toContain('<feDropShadow')
    expect(indexHtml).toContain("const themeLogoCacheKey = 'moviepilot-themed-logo-cache-v2'")
  })
})
