interface PreloadedBackgroundRotationOptions {
  /** 提交前重新判断当前生命周期和请求版本是否仍允许切换。 */
  canCommit: () => boolean
  /** 将已经完成预加载的壁纸切换为活动背景。 */
  commit: () => void
  /** 预加载目标壁纸，并以布尔值表示是否可安全显示。 */
  preload: () => Promise<boolean>
}

interface BackgroundRotationImagePreloadOptions {
  /** 外层背景实际显示的壁纸地址。 */
  displayUrl: string
  /** 实时光学 renderer 确实会消费时才提供的同源纹理地址。 */
  opticalUrl?: string
  /** 执行单张图片预加载并返回可用状态。 */
  preload: (url: string) => Promise<boolean>
}

/**
 * 将壁纸预加载与最终提交分离，确保异步加载期间失效的轮换请求不会改变可见背景。
 */
export async function commitPreloadedBackgroundRotation(options: PreloadedBackgroundRotationOptions) {
  const succeeded = await options.preload()

  if (!succeeded || !options.canCommit()) return false

  options.commit()
  return true
}

/**
 * 预加载一次轮换真正依赖的壁纸；未启用光学采样时不让派生纹理阻断外层背景切换。
 */
export async function preloadBackgroundRotationImages(options: BackgroundRotationImagePreloadOptions) {
  const urls =
    options.opticalUrl && options.opticalUrl !== options.displayUrl
      ? [options.displayUrl, options.opticalUrl]
      : [options.displayUrl]
  const results = await Promise.all(urls.map(url => options.preload(url)))

  return results.every(Boolean)
}
