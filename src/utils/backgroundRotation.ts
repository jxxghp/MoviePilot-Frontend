import type { AppActivityState } from '@/utils/appActivityLifecycle'

/** 壁纸在窗口失焦后继续轮换的最长时间，交互 renderer 仍由应用生命周期独立暂停。 */
export const BACKGROUND_ROTATION_GRACE_MS = 60_000

/** 壁纸轮换只在前台活动或失焦宽限期内运行，系统减少动态效果时始终停止。 */
export function shouldAllowBackgroundRotation(state: AppActivityState, graceActive: boolean, reducedMotion: boolean) {
  return !reducedMotion && (state === 'active' || graceActive)
}

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

interface BackgroundSequencePreloadOptions {
  /** 每张图片完成后重新判断队列是否仍属于当前页面与请求代次。 */
  canContinue: () => boolean
  /** 按实际轮播顺序排列的待预加载地址。 */
  urls: string[]
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

/** 当前壁纸稳定后串行预加载剩余轮播项，避免并发争抢首屏带宽。 */
export async function preloadBackgroundSequence(options: BackgroundSequencePreloadOptions) {
  const results: boolean[] = []

  for (const url of options.urls) {
    if (!options.canContinue()) break
    results.push(await options.preload(url))
  }

  return results
}
