// 只记忆本标签页内已完整呈现的地址，不持有图片/DOM，也不替代浏览器的真实加载状态。
const revealedPosters = new Set<string>()
const MAX_REVEALED_POSTERS = 512

/** 查询并刷新最近使用顺序；调用方只能据此省略重复入场，不能提前判定图片已加载。 */
export function wasMediaPosterRevealed(src: string): boolean {
  if (!revealedPosters.delete(src)) return false

  revealedPosters.add(src)
  return true
}

/** 当前图片完成可见覆盖后登记，长列表按最近使用顺序淘汰，避免随浏览页数增长。 */
export function rememberMediaPosterReveal(src: string) {
  if (!src) return

  revealedPosters.delete(src)
  revealedPosters.add(src)
  if (revealedPosters.size > MAX_REVEALED_POSTERS) {
    const oldest = revealedPosters.values().next().value
    if (oldest !== undefined) revealedPosters.delete(oldest)
  }
}

/** 加载失败时取消呈现记忆，后续同地址重试仍按首次成功处理。 */
export function forgetMediaPosterReveal(src: string) {
  revealedPosters.delete(src)
}

/** 释放当前标签页的海报呈现记忆。 */
export function clearMediaPosterPresentationCache() {
  revealedPosters.clear()
}
