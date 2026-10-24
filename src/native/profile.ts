/** 上传头像可能是较大的 data URI；仅为 App 转成有界缩略图，网页原头像保持不变。 */
export async function nativeProfileAvatar(reference: string): Promise<string | undefined> {
  if (!reference.startsWith('data:')) return reference
  if (
    reference.length > 1_200_000 ||
    !/^data:image\/(?:png|jpeg|gif|webp|ico|x-icon);base64,[A-Za-z0-9+/]+=*$/u.test(reference)
  )
    return undefined
  const image = new Image()
  try {
    image.src = reference
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight) return undefined
    for (const size of [96, 64]) {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const context = canvas.getContext('2d')
      if (!context) return undefined
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, size, size)
      const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight)
      const width = image.naturalWidth * scale
      const height = image.naturalHeight * scale
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
      const thumbnail = canvas.toDataURL('image/jpeg', 0.8)
      if (thumbnail.length <= 8192) return thumbnail
    }
  } catch {
    // 头像失败只使用系统占位，不影响账号菜单或原网页图片。
  } finally {
    image.src = ''
  }
  return undefined
}
