import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import appleSplashSpecs from './pwa-splash-specs.json' with { type: 'json' }

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const logoPath = path.join(projectRoot, 'public', 'logo.svg')
const outputDirectory = path.join(projectRoot, 'public', 'splash')
const background = '#0E1116'

async function createSplash(width, height, scaleFactor, outputPath, format) {
  // Match the DOM loader's `min(160px, 36vw)` in CSS pixels, then convert it
  // to physical pixels for the selected Apple launch image.
  const logoSize = Math.round(Math.min(160, (width / scaleFactor) * 0.36) * scaleFactor)
  const logo = await sharp(logoPath).resize(logoSize, logoSize, { fit: 'contain' }).png().toBuffer()
  const image = sharp({
    create: {
      width,
      height,
      channels: 4,
      background,
    },
  }).composite([
    {
      input: logo,
      left: Math.round((width - logoSize) / 2),
      top: Math.round((height - logoSize) / 2),
    },
  ])

  if (format === 'png') {
    await image.png({ compressionLevel: 9 }).toFile(outputPath)
    return
  }

  await image.flatten({ background }).jpeg({ quality: 88, progressive: true }).toFile(outputPath)
}

await mkdir(outputDirectory, { recursive: true })

for (const { width: portraitWidth, height: portraitHeight, scaleFactor } of appleSplashSpecs) {
  const landscapeWidth = portraitHeight
  const landscapeHeight = portraitWidth

  await createSplash(
    portraitWidth,
    portraitHeight,
    scaleFactor,
    path.join(outputDirectory, `apple-splash-${portraitWidth}-${portraitHeight}.jpg`),
    'jpg',
  )
  await createSplash(
    landscapeWidth,
    landscapeHeight,
    scaleFactor,
    path.join(outputDirectory, `apple-splash-${landscapeWidth}-${landscapeHeight}.jpg`),
    'jpg',
  )
}

// Keep the previous fallback filename for older deployments and bookmarked
// entries that may still reference it. Its palette matches the new assets.
await createSplash(750, 1334, 2, path.join(outputDirectory, 'apple-splash.png'), 'png')

console.log(
  `Generated ${appleSplashSpecs.length * 2 + 1} PWA splash assets in ${path.relative(projectRoot, outputDirectory)}`,
)
