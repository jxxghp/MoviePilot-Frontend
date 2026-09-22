import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_PET_RANDOM_ACTION_MIN_DELAY,
  getAgentPetActionDuration,
  pickAgentPetRandomAction,
} from '../agentPetActions'
import { useAgentPetMachine } from '../useAgentPetMachine'

describe('useAgentPetMachine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('runs finite random actions and clears the queue when decorative motion stops', async () => {
    const active = ref(true)
    const docked = ref(false)
    const dragging = ref(false)
    const pressed = ref(false)
    const thinking = ref(false)
    const scope = effectScope()
    const machine = scope.run(() =>
      useAgentPetMachine({
        active,
        docked,
        dragging,
        pressed,
        scheduleAutoDock: vi.fn(),
        shouldAutoDock: () => false,
        thinking,
      }),
    )

    expect(machine).toBeDefined()

    machine?.scheduleRandomAction()
    vi.advanceTimersByTime(AGENT_PET_RANDOM_ACTION_MIN_DELAY)

    expect(machine?.currentAction.value).toBe('wave')

    // 播放时长必须完整走完，之后再留出空闲间隔，不能连续播放或提前截断。
    vi.advanceTimersByTime(getAgentPetActionDuration('wave') - 1)
    expect(machine?.currentAction.value).toBe('wave')
    vi.advanceTimersByTime(1)
    expect(machine?.currentAction.value).toBeNull()
    vi.advanceTimersByTime(AGENT_PET_RANDOM_ACTION_MIN_DELAY - 1)
    expect(machine?.currentAction.value).toBeNull()
    vi.advanceTimersByTime(1)
    expect(machine?.currentAction.value).toBe('sit')

    active.value = false
    await nextTick()

    expect(machine?.currentAction.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)

    active.value = true
    await nextTick()
    vi.advanceTimersByTime(AGENT_PET_RANDOM_ACTION_MIN_DELAY)

    expect(machine?.currentAction.value).not.toBeNull()

    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('favours sleepy idle behaviour without selecting disruptive stunts or repeating the last action', () => {
    const counts = new Map<string, number>()

    // 遍历等距随机样本验证整段选择区间，避免只测随机数为零的第一项。
    for (let sample = 0; sample < 110; sample += 1) {
      vi.mocked(Math.random).mockReturnValue((sample + 0.5) / 110)
      const action = pickAgentPetRandomAction(null)
      counts.set(action, (counts.get(action) ?? 0) + 1)
      expect(pickAgentPetRandomAction(action)).not.toBe(action)
    }

    expect([...counts.keys()].sort()).toEqual(['confused', 'peek', 'shy', 'sit', 'sleep', 'stretch', 'wave'])
    expect(counts.get('sleep')).toBeGreaterThan(counts.get('wave') ?? 0)
    expect(counts.get('stretch')).toBeGreaterThan(counts.get('wave') ?? 0)
  })
})
