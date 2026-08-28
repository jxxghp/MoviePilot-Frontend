import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceLogoPath = path.join(projectRoot, 'scripts', 'assets', 'moviepilot-logo-image2.png')
const cleanedLogoPath = path.join(projectRoot, 'scripts', 'assets', 'moviepilot-logo-master.png')

const DARK_BACKGROUND = '#07091F'
const LIGHT_BACKGROUND = '#F4F1FF'

/**
 * 清理 Image 2 输出中的棋盘格和离散像素，只保留构成 Logo 的大面积连通区域。
 */
async function cleanLogoMaster(inputPath) {
  const sourceMetadata = await sharp(inputPath).metadata()
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixelCount = info.width * info.height
  const visited = new Uint8Array(pixelCount)
  const retained = new Uint8Array(pixelCount)
  const queue = new Int32Array(pixelCount)
  const minimumComponentArea = Math.round(pixelCount * 0.0005)

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const channelOffset = pixel * 4
    const darkestChannel = Math.min(data[channelOffset], data[channelOffset + 1], data[channelOffset + 2])
    const brightestChannel = Math.max(data[channelOffset], data[channelOffset + 1], data[channelOffset + 2])
    const chroma = brightestChannel - darkestChannel

    // Image 2 偶尔会把透明棋盘格写进 RGB；高饱和紫色阈值可剔除背景并内收浅色边缘。
    if (!sourceMetadata.hasAlpha) data[channelOffset + 3] = chroma >= 96 ? 255 : 0
    if (brightestChannel < 48) data[channelOffset + 3] = 0
  }

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start]) continue

    visited[start] = 1
    if (data[start * 4 + 3] === 0) continue

    let queueLength = 1
    queue[0] = start

    for (let cursor = 0; cursor < queueLength; cursor += 1) {
      const current = queue[cursor]
      const x = current % info.width
      const y = Math.floor(current / info.width)

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const nextY = y + offsetY
        if (nextY < 0 || nextY >= info.height) continue

        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue

          const nextX = x + offsetX
          if (nextX < 0 || nextX >= info.width) continue

          const next = nextY * info.width + nextX
          if (visited[next]) continue

          visited[next] = 1
          if (data[next * 4 + 3] === 0) continue

          queue[queueLength] = next
          queueLength += 1
        }
      }
    }

    if (queueLength < minimumComponentArea) continue
    for (let cursor = 0; cursor < queueLength; cursor += 1) retained[queue[cursor]] = 1
  }

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (!retained[pixel]) data[pixel * 4 + 3] = 0
  }

  return sharp(data, { raw: info })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ adaptiveFiltering: true, compressionLevel: 9 })
    .toBuffer()
}

/**
 * 创建与确认稿一致的全幅背景；圆角由各操作系统自行裁切，不写入源图。
 */
function createBackgroundSvg(size, appearance) {
  const isLight = appearance === 'light'
  const base = isLight ? LIGHT_BACKGROUND : DARK_BACKGROUND
  const glow = isLight ? '#FFFFFF' : '#3B126F'
  const middle = isLight ? '#EEE8FF' : '#17113C'
  const edge = isLight ? '#E6DEFA' : '#07091F'

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <radialGradient id="brand-glow" cx="45%" cy="35%" r="78%">
          <stop offset="0%" stop-color="${glow}" />
          <stop offset="52%" stop-color="${middle}" />
          <stop offset="100%" stop-color="${edge}" />
        </radialGradient>
        <linearGradient id="brand-depth" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${base}" stop-opacity="0.08" />
          <stop offset="100%" stop-color="${base}" stop-opacity="0.56" />
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#brand-glow)" />
      <rect width="${size}" height="${size}" fill="url(#brand-depth)" />
    </svg>
  `)
}

/**
 * 将透明 Logo 置于完整方形画布内，并按用途控制安全区比例。
 */
async function createSquareIcon(mark, size, markScale, appearance = 'dark') {
  const markSize = Math.round(size * markScale)
  const resizedMark = await sharp(mark)
    .resize(markSize, markSize, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      fit: 'contain',
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer()
  const offset = Math.round((size - markSize) / 2)
  const background = appearance === 'light' ? LIGHT_BACKGROUND : DARK_BACKGROUND

  return sharp(createBackgroundSvg(size, appearance))
    .composite([{ input: resizedMark, left: offset, top: offset }])
    .flatten({ background })
    .removeAlpha()
    .png({ adaptiveFiltering: true, compressionLevel: 9 })
    .toBuffer()
}

/**
 * 将透明母版缩放到指定画布，供页面、通知和主题标识作为无底图资源使用。
 */
async function createTransparentLogo(mark, size) {
  const markSize = Math.round(size * 0.88)
  const resizedMark = await sharp(mark)
    .resize(markSize, markSize, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      fit: 'contain',
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer()
  const offset = Math.round((size - markSize) / 2)

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resizedMark, left: offset, top: offset }])
    .png({ adaptiveFiltering: true, compressionLevel: 9 })
    .toBuffer()
}

/**
 * 将多份 PNG 尺寸封装为兼容 Windows 与浏览器的多分辨率 ICO 文件。
 */
function createIco(entries) {
  const headerSize = 6
  const directoryEntrySize = 16
  const dataOffset = headerSize + entries.length * directoryEntrySize
  const header = Buffer.alloc(dataOffset)

  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  let currentOffset = dataOffset
  entries.forEach(({ buffer, size }, index) => {
    const entryOffset = headerSize + index * directoryEntrySize
    header.writeUInt8(size === 256 ? 0 : size, entryOffset)
    header.writeUInt8(size === 256 ? 0 : size, entryOffset + 1)
    header.writeUInt8(0, entryOffset + 2)
    header.writeUInt8(0, entryOffset + 3)
    header.writeUInt16LE(1, entryOffset + 4)
    header.writeUInt16LE(32, entryOffset + 6)
    header.writeUInt32LE(buffer.length, entryOffset + 8)
    header.writeUInt32LE(currentOffset, entryOffset + 12)
    currentOffset += buffer.length
  })

  return Buffer.concat([header, ...entries.map(entry => entry.buffer)])
}

/**
 * 写入生成资产并自动创建目标目录。
 */
async function writeAsset(relativePath, buffer) {
  const outputPath = path.join(projectRoot, relativePath)
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, buffer)
}

const sourceLogo = await readFile(sourceLogoPath)
const cleanedLogo = await cleanLogoMaster(sourceLogo)
const transparentLogo = await createTransparentLogo(cleanedLogo, 512)
const standardMaster = await createSquareIcon(cleanedLogo, 1024, 0.76)

await Promise.all([
  writeAsset(path.relative(projectRoot, cleanedLogoPath), cleanedLogo),
  writeAsset(path.join('public', 'icon.png'), standardMaster),
  writeAsset(path.join('public', 'logo.png'), transparentLogo),
  writeAsset(path.join('src', 'assets', 'images', 'logo.png'), transparentLogo),
  writeAsset(path.join('public', 'icon-black.png'), await createSquareIcon(cleanedLogo, 512, 0.76)),
  writeAsset(path.join('public', 'icon-white.png'), await createSquareIcon(cleanedLogo, 512, 0.76, 'light')),
  writeAsset(path.join('public', 'android-chrome-192x192.png'), await createSquareIcon(cleanedLogo, 192, 0.76)),
  writeAsset(
    path.join('public', 'android-chrome-192x192_maskable.png'),
    await createSquareIcon(cleanedLogo, 192, 0.64),
  ),
  writeAsset(path.join('public', 'android-chrome-512x512.png'), await createSquareIcon(cleanedLogo, 512, 0.76)),
  writeAsset(
    path.join('public', 'android-chrome-512x512_maskable.png'),
    await createSquareIcon(cleanedLogo, 512, 0.64),
  ),
  writeAsset(path.join('public', 'pwa-1024x1024.png'), standardMaster),
  writeAsset(path.join('public', 'pwa-1024x1024_maskable.png'), await createSquareIcon(cleanedLogo, 1024, 0.64)),
  writeAsset(path.join('public', 'apple-touch-icon.png'), await createSquareIcon(cleanedLogo, 180, 0.72)),
  writeAsset(path.join('public', 'apple-touch-icon-precomposed.png'), await createSquareIcon(cleanedLogo, 180, 0.72)),
  writeAsset(path.join('public', 'apple-touch-icon-180x180.png'), await createSquareIcon(cleanedLogo, 180, 0.72)),
  writeAsset(path.join('public', 'apple-touch-icon-167x167.png'), await createSquareIcon(cleanedLogo, 167, 0.72)),
  writeAsset(path.join('public', 'apple-touch-icon-152x152.png'), await createSquareIcon(cleanedLogo, 152, 0.72)),
  writeAsset(path.join('public', 'mstile-150x150.png'), await createSquareIcon(cleanedLogo, 150, 0.66)),
])

const icoEntries = await Promise.all(
  [16, 32, 48, 64, 128, 256].map(async size => ({
    buffer: await createSquareIcon(cleanedLogo, size, size <= 32 ? 0.84 : 0.78),
    size,
  })),
)

await Promise.all([
  writeAsset(path.join('public', 'favicon-16x16.png'), icoEntries[0].buffer),
  writeAsset(path.join('public', 'favicon-32x32.png'), icoEntries[1].buffer),
  writeAsset(path.join('public', 'favicon.ico'), createIco(icoEntries)),
])

console.log('Generated MoviePilot icon assets for browsers, iOS, macOS, Android, Windows, and PWA installs')
