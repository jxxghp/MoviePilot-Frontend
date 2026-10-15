/**
 * 勋章分享图：竖版深色底，勋章正面居中，下面是勋章名与一行说明（等级、授予对象、时间），底部署 MoviePilot。
 * 背景固定深色而不随界面主题，图片离开页面后仍是同一张。
 */
export async function composeShareImage(options: {
  src: string
  tone: string
  title: string
  line: string
  font: string
}): Promise<Blob> {
  const width = 1080
  const height = 1350
  const medal = new Image()
  medal.src = options.src
  await medal.decode()
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.fillStyle = '#0b0c0e'
  ctx.fillRect(0, 0, width, height)
  const glow = ctx.createRadialGradient(width / 2, 560, 0, width / 2, 560, 620)
  glow.addColorStop(0, `${options.tone}2e`)
  glow.addColorStop(1, `${options.tone}00`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(medal, 90, 110, 900, 900)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#f2f3f5'
  ctx.font = `600 60px ${options.font}`
  ctx.letterSpacing = '6px'
  ctx.fillText(options.title, width / 2 + 3, 1100, width - 120)
  ctx.letterSpacing = '0px'
  ctx.fillStyle = '#9a9fa6'
  ctx.font = `400 32px ${options.font}`
  if (options.line) ctx.fillText(options.line, width / 2, 1162, width - 120)
  ctx.fillStyle = '#5f646b'
  ctx.font = `500 28px ${options.font}`
  ctx.letterSpacing = '4px'
  ctx.fillText('MoviePilot', width / 2 + 2, 1280)
  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('toBlob'))), 'image/png'),
  )
}

/** 以普通浏览器下载保存图片。 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
