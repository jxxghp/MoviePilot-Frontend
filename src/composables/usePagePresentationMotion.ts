import { readonly, ref, type Ref } from 'vue'

/** 供玻璃渲染层读取路由内容已经提交的版本。 */
export interface PagePresentationMotionReader {
  /** 页面没有入场动画，因此不需要等待几何确认。 */
  acknowledgeGeometryReady: (motionEpoch: number, timestamp?: number) => boolean
  /** 保留稳定的非活动状态，供现有材质层兼容读取。 */
  active: Readonly<Ref<boolean>>
  /** 当前路由呈现版本，旧表面采样不能覆盖新页面。 */
  epoch: Readonly<Ref<number>>
  /** 页面始终以完整透明度呈现。 */
  opacity: Readonly<Ref<number>>
  /** 每次路由内容提交后递增，提示材质层刷新表面。 */
  revision: Readonly<Ref<number>>
}

const active = ref(false)
const epoch = ref(0)
const opacity = ref(1)
const revision = ref(0)
const routeKey = ref('')

/** 清理旧版本可能遗留的页面动画样式。 */
function cancel() {
  const root = document.documentElement
  delete root.dataset.pagePresentationMotion
  root.style.removeProperty('--mp-page-motion-opacity')
  root.style.removeProperty('--mp-page-motion-translate-y')
}

/** 路由立即呈现，同时通知玻璃材质层刷新新页面的表面几何。 */
function start(nextRouteKey: string) {
  cancel()
  epoch.value += 1
  routeKey.value = nextRouteKey
  revision.value += 1
}

const reader: PagePresentationMotionReader = {
  acknowledgeGeometryReady: () => false,
  active: readonly(active),
  epoch: readonly(epoch),
  opacity: readonly(opacity),
  revision: readonly(revision),
}

/** 提供页面路由与玻璃材质层共享的即时呈现状态。 */
export function usePagePresentationMotion() {
  return {
    cancel,
    reader,
    routeKey: readonly(routeKey),
    start,
  }
}
