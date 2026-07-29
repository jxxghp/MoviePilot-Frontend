/** 建立带 CORS 响应头的浏览器缓存，必要时修复旧的非 CORS 缓存条目。 */
export async function preloadCorsImage(url: string): Promise<boolean> {
  const request = async (cache: RequestCache) => {
    const source = new URL(url, window.location.href)
    const response = await fetch(source, {
      cache,
      credentials: source.origin === window.location.origin ? 'same-origin' : 'omit',
      mode: 'cors',
    })
    if (!response.ok) return false

    await response.blob()
    return true
  }

  try {
    if (await request('force-cache')) return true
  } catch {
    // 缓存中的非 CORS 响应可能使首次读取失败，重新验证后再决定是否回退。
  }

  try {
    return await request('reload')
  } catch {
    return false
  }
}
