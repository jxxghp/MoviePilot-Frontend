import { readonly, ref } from 'vue'

function detectInitialLaunchLoading() {
  if (typeof document === 'undefined') return true

  return document.documentElement.getAttribute('data-launch-loading') === 'true' || Boolean(document.getElementById('loading-bg'))
}

// 启动屏的全局状态，供 Teleport 到 body 的组件避开 iOS PWA 启动阶段的固定层闪烁。
const isLaunchLoading = ref(detectInitialLaunchLoading())

export function completeLaunchLoading() {
  isLaunchLoading.value = false
}

export function useLaunchLoading() {
  return {
    isLaunchLoading: readonly(isLaunchLoading),
  }
}
