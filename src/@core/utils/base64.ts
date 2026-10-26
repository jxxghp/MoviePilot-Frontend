/** 将二进制转换为无填充 Base64URL；只处理数据，不读取浏览器或应用会话。 */
export function bufferToBase64Url(buffer: ArrayBufferLike): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/** 将 Base64URL 转为字节；协议使用者另行校验字母表、规范形式和长度。 */
export function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64Url.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
}
