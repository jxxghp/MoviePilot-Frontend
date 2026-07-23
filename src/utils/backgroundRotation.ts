interface PreloadedBackgroundRotationOptions {
  /** 提交前重新判断当前生命周期和请求版本是否仍允许切换。 */
  canCommit: () => boolean
  /** 将已经完成预加载的壁纸切换为活动背景。 */
  commit: () => void
  /** 预加载目标壁纸，并以布尔值表示是否可安全显示。 */
  preload: () => Promise<boolean>
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
