import { defineComponent, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { agentPetSuspended, suspendAgentPet, useAgentPetSuspension } from '@/composables/useAgentPetSuspension'

describe('useAgentPetSuspension', () => {
  it('suspends while any holder is active and survives repeated releases', () => {
    expect(agentPetSuspended.value).toBe(false)
    const first = suspendAgentPet()
    const second = suspendAgentPet()
    expect(agentPetSuspended.value).toBe(true)
    first()
    first()
    expect(agentPetSuspended.value).toBe(true)
    second()
    expect(agentPetSuspended.value).toBe(false)
  })

  it('follows an active flag and releases when the owner unmounts', async () => {
    const open = ref(true)
    const Owner = defineComponent({
      setup() {
        useAgentPetSuspension(open)
        return () => null
      },
    })
    const wrapper = mount(Owner)
    expect(agentPetSuspended.value).toBe(true)
    open.value = false
    await nextTick()
    expect(agentPetSuspended.value).toBe(false)
    open.value = true
    await nextTick()
    expect(agentPetSuspended.value).toBe(true)
    wrapper.unmount()
    expect(agentPetSuspended.value).toBe(false)
  })
})
