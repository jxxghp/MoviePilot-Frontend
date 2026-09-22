import { onScopeDispose, watch } from 'vue'
import type { AgentPetActionName } from './types'
import type { AgentPetPlaybackOptions } from './useAgentPetMachine'

/** 入口提供可见性和播放能力，手势识别不依赖组件布局或聊天实现。 */
interface AgentPetInteractionOptions {
  enabled: () => boolean
  play: (action: AgentPetActionName, options?: AgentPetPlaybackOptions) => boolean
  currentAction: () => AgentPetActionName | null
}

/** 按住蓄力、揉头和摇晃均来自实际指针轨迹，取消手势不会触发彩蛋。 */
export function useAgentPetInteractions(options: AgentPetInteractionOptions) {
  let holdTimer: ReturnType<typeof setTimeout> | undefined
  let hoverTimer: ReturnType<typeof setTimeout> | undefined
  let gesture: {
    x: number
    y: number
    pivotX: number
    direction: number
    turns: number
    lastTurn: number
    startedAt: number
    moved: boolean
    charged: boolean
  } | null = null
  let hoverX: number | null = null
  let hoverDirection = 0
  let strokes = 0
  let lastStroke = 0
  let lastPet = -Infinity
  const cooldowns = new Map<string, number>()

  /** 只有真正播放成功才计入冷却，忙碌时的失败尝试不吞掉下次回应。 */
  function react(action: AgentPetActionName, cooldown = 8000, priority = 1, allowWhilePressed = false) {
    if (!options.enabled() || Date.now() - (cooldowns.get(action) ?? -Infinity) < cooldown) return false
    if (!options.play(action, { priority, allowWhilePressed })) return false
    cooldowns.set(action, Date.now())
    return true
  }

  /** 清除长按等待，移动、取消和离开页面都不能留下迟到的蓄力动作。 */
  function clearHold() {
    clearTimeout(holdTimer)
    holdTimer = undefined
  }

  /** 离开机器人时取消问候并重置揉头轨迹，跨区域移动不累计。 */
  function leave() {
    clearTimeout(hoverTimer)
    hoverTimer = undefined
    hoverX = null
    hoverDirection = 0
    strokes = 0
  }

  /** 停留一小会儿才招手；正在打盹时改为抬头醒来。 */
  function enter(pointerType: string) {
    leave()
    if (pointerType !== 'mouse' || !options.enabled()) return
    hoverTimer = setTimeout(() => {
      hoverTimer = undefined
      react(options.currentAction() === 'sleep' ? 'wake' : 'wave', 20000)
    }, 700)
  }

  /** 轻轻来回抚摸时害羞，短时间反复逗弄则翻一下白眼。 */
  function stroke(x: number) {
    if (!options.enabled()) return
    if (hoverX === null || Date.now() - lastStroke > 650) {
      hoverX = x
      hoverDirection = 0
      strokes = 0
      lastStroke = Date.now()
      return
    }
    const delta = x - hoverX
    if (Math.abs(delta) < 12) return
    const direction = Math.sign(delta)
    if (hoverDirection && direction !== hoverDirection) strokes += 1
    hoverDirection = direction
    hoverX = x
    lastStroke = Date.now()
    if (strokes < 3) return
    const action = Date.now() - lastPet < 10000 ? 'eye-roll' : 'shy'
    if (react(action, 3500, 2)) lastPet = Date.now()
    strokes = 0
  }

  /** 按住 700ms 才开始蓄力，普通单击不延迟，也不改变打开聊天的语义。 */
  function begin(x: number, y: number) {
    cancel()
    if (!options.enabled()) return
    gesture = {
      x,
      y,
      pivotX: x,
      direction: 0,
      turns: 0,
      lastTurn: Date.now(),
      startedAt: Date.now(),
      moved: false,
      charged: false,
    }
    holdTimer = setTimeout(() => {
      holdTimer = undefined
      if (gesture && !gesture.moved) gesture.charged = react('charge', 0, 2, true)
    }, 700)
  }

  /** 至少 18px 的快速反向才算一次摇晃，忽略抖动和缓慢搬动。 */
  function move(x: number, y: number, pointerType: string) {
    if (!gesture) {
      if (pointerType === 'mouse') stroke(x)
      return
    }
    if (Math.hypot(x - gesture.x, y - gesture.y) >= 4) {
      gesture.moved = true
      clearHold()
    }
    const delta = x - gesture.pivotX
    if (Math.abs(delta) < 18) return
    const direction = Math.sign(delta)
    if (Date.now() - gesture.lastTurn > 550) gesture.turns = 0
    if (gesture.direction && direction !== gesture.direction) gesture.turns += 1
    gesture.direction = direction
    gesture.pivotX = x
    gesture.lastTurn = Date.now()
  }

  /** 放下后才播放反馈；摇得越多反应越夸张，长按松开则转圈庆祝。 */
  function end() {
    const finished = gesture
    clearHold()
    gesture = null
    if (!finished) return false
    if (finished.moved) {
      const turns = Date.now() - finished.lastTurn <= 550 ? finished.turns : 0
      const action =
        turns >= 6 ? 'disassemble' : turns >= 3 ? 'faint' : Date.now() - finished.startedAt > 4000 ? 'confused' : 'nod'
      react(action, 0, 2)
      return true
    }
    if (finished.charged) {
      react('spin-cheer', 0, 2)
      return true
    }
    return false
  }

  /** 丢失捕获、窗口切换和卸载只清理，不把中断当作松手完成。 */
  function cancel() {
    clearHold()
    leave()
    gesture = null
  }

  watch(
    options.enabled,
    enabled => {
      if (!enabled) cancel()
    },
    { flush: 'sync' },
  )
  onScopeDispose(cancel)
  return { begin, move, end, cancel, enter, leave, react }
}
