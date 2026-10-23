import type { InjectionKey } from 'vue'
import type { AgentPetSayOptions, AgentPetSayRejectReason, AgentPetSayResult } from '@/types/agentHost'

/** 形象台词处理函数，由 AgentAssistantWidget 提供给生效形象的 AgentPetRemote。 */
export type AgentPetSayHandler = (text: unknown, options?: AgentPetSayOptions) => AgentPetSayResult

/** 只有挂在 Widget 下的形象能拿到台词入口；插件其他联邦页面不在这条注入链上。 */
export const AGENT_PET_SAY_INJECTION_KEY: InjectionKey<AgentPetSayHandler> = Symbol('agentPetSay')

/** 台词最多显示的字符数（按 Unicode 码点计），超出部分截断并补省略号。 */
export const AGENT_PET_SAY_MAX_LENGTH = 60
/** 台词显示时长的下限、上限与缺省值（毫秒）。 */
export const AGENT_PET_SAY_MIN_DURATION = 1500
export const AGENT_PET_SAY_MAX_DURATION = 6000
export const AGENT_PET_SAY_DEFAULT_DURATION = 3500
/** 两条台词之间的最小间隔（毫秒）。 */
export const AGENT_PET_SAY_MIN_INTERVAL = 1500
/** 滑动窗口内最多显示的台词条数及窗口长度（毫秒）。 */
export const AGENT_PET_SAY_WINDOW_LIMIT = 10
export const AGENT_PET_SAY_WINDOW = 60_000
/** 同一句台词的去重窗口（毫秒）。 */
export const AGENT_PET_SAY_DUPLICATE_WINDOW = 10_000

/**
 * 规整插件提交的台词：只接受字符串，合并空白并按码点截断。
 * 气泡以纯文本渲染，不剥离 Markdown 符号，避免“喵~”这类台词被改写。
 */
export function normalizeAgentPetSayText(value: unknown): string {
  if (typeof value !== 'string') return ''
  const text = value.replace(/\s+/g, ' ').trim()
  const chars = Array.from(text)
  if (chars.length <= AGENT_PET_SAY_MAX_LENGTH) return text

  return `${chars.slice(0, AGENT_PET_SAY_MAX_LENGTH - 1).join('')}…`
}

/** 把插件给的时长限制到允许范围，非法值用缺省时长。 */
export function clampAgentPetSayDuration(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return AGENT_PET_SAY_DEFAULT_DURATION

  return Math.min(AGENT_PET_SAY_MAX_DURATION, Math.max(AGENT_PET_SAY_MIN_DURATION, Math.round(value)))
}

/**
 * 台词频率限制器。只统计真正显示出来的台词，被其他原因拒绝的调用不占配额。
 * 由 AgentAssistantWidget 持有，切换形象时重置。
 */
export function createAgentPetSayLimiter(now: () => number = () => Date.now()) {
  /** 已显示台词的时间与文字，按时间升序。 */
  let history: Array<{ at: number; text: string }> = []

  function prune(current: number) {
    const horizon = current - Math.max(AGENT_PET_SAY_WINDOW, AGENT_PET_SAY_DUPLICATE_WINDOW)
    history = history.filter(item => item.at > horizon)
  }

  return {
    /** 检查本条台词能否显示，不记录。 */
    check(text: string): AgentPetSayRejectReason | null {
      const current = now()
      prune(current)
      if (history.some(item => item.text === text && current - item.at < AGENT_PET_SAY_DUPLICATE_WINDOW))
        return 'duplicate'
      const last = history.at(-1)
      if (last && current - last.at < AGENT_PET_SAY_MIN_INTERVAL) return 'rate_limited'
      if (history.filter(item => current - item.at < AGENT_PET_SAY_WINDOW).length >= AGENT_PET_SAY_WINDOW_LIMIT)
        return 'rate_limited'
      return null
    },
    /** 记录一条已显示的台词。 */
    record(text: string) {
      history.push({ at: now(), text })
    },
    reset() {
      history = []
    },
  }
}
