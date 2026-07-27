import type { AppActivityState } from '@/utils/appActivityLifecycle'

/** 壁纸在窗口失焦后继续轮换的最长时间，交互 renderer 仍由应用生命周期独立暂停。 */
export const BACKGROUND_ROTATION_GRACE_MS = 60_000

type RandomSource = () => number

/** 壁纸轮换只在前台活动或失焦宽限期内运行，系统减少动态效果时始终停止。 */
export function shouldAllowBackgroundRotation(state: AppActivityState, graceActive: boolean, reducedMotion: boolean) {
  return !reducedMotion && (state === 'active' || graceActive)
}

/**
 * 为每个前端页面生命周期生成稳定的随机候选顺序；相同来源列表在重试和状态恢复时不会再次洗牌。
 */
export function createBackgroundCandidateOrderResolver(random: RandomSource = Math.random) {
  let sourceUrls: string[] | null = null
  let orderedUrls: string[] = []

  return (urls: string[]) => {
    const sourceChanged =
      !sourceUrls || sourceUrls.length !== urls.length || sourceUrls.some((url, index) => url !== urls[index])
    if (!sourceChanged) return [...orderedUrls]

    sourceUrls = [...urls]
    orderedUrls = [...urls]
    for (let index = orderedUrls.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1))
      ;[orderedUrls[index], orderedUrls[swapIndex]] = [orderedUrls[swapIndex], orderedUrls[index]]
    }

    return [...orderedUrls]
  }
}

interface BackgroundRotationImagePreloadOptions {
  /** 外层背景实际显示的壁纸地址。 */
  displayUrl: string
  /** 实时光学 renderer 确实会消费时才提供的同源纹理地址。 */
  opticalUrl?: string
  /** 执行单张图片预加载并返回可用状态。 */
  preload: (url: string) => Promise<boolean>
}

interface FirstAvailableBackgroundOptions {
  /** 当前页面生命周期已确定顺序的候选壁纸。 */
  urls: string[]
  /** 当前加载批次仍可提交时返回 true。 */
  canContinue: () => boolean
  /** 执行单张图片预加载并返回可用状态。 */
  preload: (url: string) => Promise<boolean>
}

/** 按当前候选顺序寻找首张可用壁纸，单项失败或过期批次不会提交可见状态。 */
export async function findFirstAvailableBackground(options: FirstAvailableBackgroundOptions) {
  for (let index = 0; index < options.urls.length; index += 1) {
    if (!options.canContinue()) return null
    const available = await options.preload(options.urls[index])
    if (!options.canContinue()) return null
    if (available) return index
  }

  return null
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
