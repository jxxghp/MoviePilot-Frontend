export function removeEl(selector: string) {
  if (selector) {
    const el = document.querySelector(selector)
    el?.parentNode?.removeChild(el)
  }
}

export function useDefer(maxFrameCount = 1) {
  const frameCount = ref(0)
  const refreshFrameCount = () => {
    requestAnimationFrame(() => {
      frameCount.value++
      if (frameCount.value < maxFrameCount)
        refreshFrameCount()
    })
  }
  refreshFrameCount()
  return function (showInFrameCount: number) {
    return frameCount.value >= showInFrameCount
  }
}
