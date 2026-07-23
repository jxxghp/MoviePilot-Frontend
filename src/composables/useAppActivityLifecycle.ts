import { appActivityLifecycle, type AppActivityState } from '@/utils/appActivityLifecycle'

const appActivityState = ref<AppActivityState>(appActivityLifecycle.getState())

/**
 * 提供应用级活动状态；所有消费者共享同一套全局事件监听和生命周期时钟。
 */
export function useAppActivityLifecycle() {
  const release = appActivityLifecycle.acquire()
  const unsubscribe = appActivityLifecycle.subscribe(state => {
    appActivityState.value = state
  })

  onScopeDispose(() => {
    unsubscribe()
    release()
  })

  return {
    allowsDecorativeMotion: computed(() => appActivityState.value === 'active'),
    isSuspended: computed(() => appActivityState.value === 'suspended'),
    state: readonly(appActivityState),
  }
}
