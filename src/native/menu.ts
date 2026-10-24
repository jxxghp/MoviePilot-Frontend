import { nativeChromeActive } from './layout'

const closers = new Set<() => void>()

/** 菜单注册原有关闭回调；组件卸载时释放，不跨桥传递 Vue 状态。 */
export function registerNativeMenuClose(close: () => void) {
  closers.add(close)
  return () => closers.delete(close)
}

/** 新 Sheet 出现时先结束网页菜单状态；普通网页与旧容器不受影响。 */
export function closeNativeMenus() {
  if (!nativeChromeActive.value || window.MoviePilotNative?.sheetsVersion !== 1) return
  for (const close of closers) close()
}
