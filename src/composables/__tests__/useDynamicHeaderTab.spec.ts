import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, onMounted, provide, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

describe('useDynamicHeaderTab', () => {
  it('registers before mount and restores within the keep-alive activation flush', async () => {
    const register = vi.fn()
    const unregister = vi.fn()
    const mountedRegistrationCount = vi.fn()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/recommend', component: { template: '<div />' } }],
    })
    await router.push('/recommend')
    await router.isReady()

    const Page = defineComponent({
      setup() {
        const activeTab = ref('movie')
        const { registerHeaderTab } = useDynamicHeaderTab()
        registerHeaderTab({
          enableStateRestore: false,
          items: [{ tab: 'movie', title: '电影' }],
          modelValue: activeTab,
        })
        onMounted(() => mountedRegistrationCount(register.mock.calls.length))

        return {}
      },
      template: '<div>推荐页</div>',
    })
    const Host = defineComponent({
      components: { Page },
      setup() {
        const active = ref(true)
        provide('registerDynamicHeaderTab', register)
        provide('unregisterDynamicHeaderTab', unregister)

        return { active }
      },
      template: `
        <button type="button" @click="active = !active">切换</button>
        <KeepAlive><Page v-if="active" /></KeepAlive>
      `,
    })
    const wrapper = mount(Host, {
      global: {
        plugins: [router],
      },
    })

    expect(mountedRegistrationCount).toHaveBeenCalledWith(expect.any(Number))
    expect(mountedRegistrationCount.mock.calls[0][0]).toBeGreaterThan(0)
    expect(register.mock.calls.at(-1)?.[0].routePath).toBe('/recommend')

    await wrapper.get('button').trigger('click')
    expect(unregister).toHaveBeenCalledWith('/recommend')

    const registrationsBeforeActivation = register.mock.calls.length
    await wrapper.get('button').trigger('click')
    expect(register.mock.calls.length).toBeGreaterThan(registrationsBeforeActivation)

    wrapper.unmount()
  })
})
