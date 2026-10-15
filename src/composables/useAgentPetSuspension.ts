import { computed, getCurrentScope, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

/**
 * 助手形象的暂时隐藏：全屏浮层（如社区勋章展台）打开时请求隐藏右下角的助手形象与气泡，关闭时归还。
 *
 * 契约：
 * - 由宿主（AgentAssistantWidget）统一执行隐藏，插件不需要也不应该感知；隐藏只是不显示，
 *   形象组件与插件状态保持挂载，归还后原样出现。
 * - 采用计数：每次请求得到一个只生效一次的归还函数，多个浮层可以同时请求，全部归还后才重新显示，
 *   重复归还不会把别人的请求抵消。
 * - 组件里优先用 useAgentPetSuspension，随作用域销毁自动归还，避免浮层异常卸载时形象一直不出现。
 */
const holders = ref(0)

/** 当前是否有浮层要求隐藏助手形象。 */
export const agentPetSuspended = computed(() => holders.value > 0)

/** 请求隐藏助手形象，返回归还函数；归还函数多次调用只生效一次。 */
export function suspendAgentPet(): () => void {
  holders.value++
  let released = false
  return () => {
    if (released) return
    released = true
    holders.value = Math.max(0, holders.value - 1)
  }
}

/** 在 active 为真期间请求隐藏助手形象，变为假或所在作用域销毁时归还。 */
export function useAgentPetSuspension(active: MaybeRefOrGetter<boolean>) {
  let release: (() => void) | null = null
  const stop = watch(
    () => toValue(active),
    value => {
      if (value && !release) release = suspendAgentPet()
      if (!value && release) {
        release()
        release = null
      }
    },
    { immediate: true },
  )
  if (getCurrentScope()) {
    onScopeDispose(() => {
      stop()
      release?.()
      release = null
    })
  }
}
