import { mount } from '@vue/test-utils'
import { h } from 'vue'
import { describe, expect, it } from 'vitest'
import type { AgentPetDeclaration } from '@/types/agentHost'
import AgentPetAvatar from '../AgentPetAvatar.vue'

function createPet(overrides: Partial<AgentPetDeclaration> = {}): AgentPetDeclaration {
  return {
    plugin_id: 'PetPlugin',
    source_plugin_id: 'PetPlugin',
    plugin_name: '桌宠',
    key: 'girl',
    name: '小映',
    mode: 'stage',
    component: 'AgentPet',
    api_version: 1,
    preview_url: '/preview.png',
    avatar_url: '/avatar.png',
    ...overrides,
  }
}

function mountAvatar(pet: AgentPetDeclaration | null) {
  return mount(AgentPetAvatar, {
    props: { pet },
    slots: { default: () => h('span', { class: 'builtin-mark' }) },
  })
}

describe('AgentPetAvatar', () => {
  it('keeps the builtin mark when no plugin pet is active', () => {
    const wrapper = mountAvatar(null)

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.builtin-mark').exists()).toBe(true)
  })

  it('tries avatar_url, then preview_url, then falls back to the builtin mark when images fail', async () => {
    const wrapper = mountAvatar(createPet())

    expect(wrapper.get('img').attributes('src')).toBe('/avatar.png')
    expect(wrapper.get('img').attributes('alt')).toBe('小映')

    await wrapper.get('img').trigger('error')
    expect(wrapper.get('img').attributes('src')).toBe('/preview.png')

    await wrapper.get('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('.builtin-mark').exists()).toBe(true)
  })

  it('uses preview_url when the pet has no avatar and retries after switching pets', async () => {
    const wrapper = mountAvatar(createPet({ avatar_url: null }))
    expect(wrapper.get('img').attributes('src')).toBe('/preview.png')

    await wrapper.get('img').trigger('error')
    expect(wrapper.find('.builtin-mark').exists()).toBe(true)

    await wrapper.setProps({ pet: createPet({ key: 'other', avatar_url: '/other.png' }) })
    expect(wrapper.get('img').attributes('src')).toBe('/other.png')
  })
})
