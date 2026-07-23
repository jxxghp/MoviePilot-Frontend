import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENT_PET_RANDOM_ACTION_MIN_DELAY } from '../agentPetActions'
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
})
