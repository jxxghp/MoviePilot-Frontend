import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import {
  getAgentPetActionDuration,
  getAgentPetRandomActionDelay,
  pickAgentPetRandomAction,
} from './agentPetActions'
import type { AgentPetActionName } from './types'

interface AgentPetMachineOptions {
  active: MaybeRefOrGetter<boolean>
  thinking: MaybeRefOrGetter<boolean>
  docked: Ref<boolean>
  dragging: Ref<boolean>
  pressed: Ref<boolean>
  shouldAutoDock: () => boolean
  scheduleAutoDock: () => void
}

/** 管理桌面宠物的空闲动作队列，避免入口组件直接维护动画计时器。 */
export function useAgentPetMachine(options: AgentPetMachineOptions) {
  const currentAction = ref<AgentPetActionName | null>(null)

  let lastAction: AgentPetActionName | null = null
  let randomActionTimer: number | null = null
  let actionEndTimer: number | null = null

  /** 判断当前交互状态是否适合播放空闲趣味动作。 */
  function canRunRandomAction() {
    return (
      toValue(options.active) &&
      !options.docked.value &&
      !options.dragging.value &&
      !options.pressed.value &&
      !toValue(options.thinking)
    )
  }

  /** 清理等待中的随机动作计时器。 */
  function clearRandomActionTimer() {
    if (randomActionTimer === null) return

    window.clearTimeout(randomActionTimer)
    randomActionTimer = null
  }

  /** 清理正在播放动作的结束计时器。 */
  function clearActionEndTimer() {
    if (actionEndTimer === null) return

    window.clearTimeout(actionEndTimer)
    actionEndTimer = null
  }

  /** 停止当前动作并清理全部宠物动作计时器。 */
  function clearAction() {
    clearRandomActionTimer()
    clearActionEndTimer()
    currentAction.value = null
  }

  /** 完成当前动作后恢复空闲态，并按贴边规则决定是否自动收起。 */
  function finishRandomAction() {
    clearActionEndTimer()
    currentAction.value = null

    if (!options.docked.value && options.shouldAutoDock()) {
      options.scheduleAutoDock()
      return
    }

    scheduleRandomAction()
  }

  /** 立即播放指定动作，供通知、交互或外部 renderer 编排主动触发。 */
  function playAction(action: AgentPetActionName) {
    clearRandomActionTimer()
    clearActionEndTimer()
    currentAction.value = action
    actionEndTimer = window.setTimeout(finishRandomAction, getAgentPetActionDuration(action))
  }

  /** 播放一个随机趣味动作，由 renderer 根据动作名呈现具体动画。 */
  function runRandomAction() {
    if (!canRunRandomAction()) return

    const action = pickAgentPetRandomAction(lastAction)

    lastAction = action
    playAction(action)
  }

  /** 安排下一次随机动作，只在宠物可见且空闲时生效。 */
  function scheduleRandomAction() {
    clearRandomActionTimer()
    if (!canRunRandomAction() || currentAction.value || actionEndTimer !== null) return

    randomActionTimer = window.setTimeout(() => {
      randomActionTimer = null
      runRandomAction()
    }, getAgentPetRandomActionDelay())
  }

  /** 根据入口交互状态同步随机动作队列。 */
  function syncSchedule() {
    if (canRunRandomAction()) {
      if (!currentAction.value && randomActionTimer === null && actionEndTimer === null) scheduleRandomAction()
      return
    }

    clearAction()
  }

  watch(
    [() => toValue(options.active), () => toValue(options.thinking), options.docked, options.dragging, options.pressed],
    syncSchedule,
  )

  onScopeDispose(clearAction)

  return {
    clearAction,
    currentAction,
    playAction,
    scheduleRandomAction,
    syncSchedule,
  }
}
