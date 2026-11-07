import { useRetryableRemoteComponent } from '@/composables/useRetryableRemoteComponent'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, type Component } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('useRetryableRemoteComponent', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('offers retry after a 20-second timeout and replaces the failed wrapper with recovered content', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const loader = vi
      .fn<() => Promise<Component>>()
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce(defineComponent({ setup: () => () => h('p', '组件已恢复') }))
    const Host = defineComponent({
      setup() {
        const component = useRetryableRemoteComponent(loader)
        return () => h(component.value)
      },
    })
    const wrapper = mount(Host, {
      global: {
        stubs: {
          VAlert: { template: '<div role="alert"><slot /></div>' },
          VBtn: { template: '<button><slot /></button>' },
          VSkeletonLoader: true,
        },
      },
    })
    try {
      await vi.advanceTimersByTimeAsync(20001)
      expect(wrapper.get('[role="alert"]').text()).toContain('无法加载组件')
      await wrapper.get('button').trigger('click')
      await flushPromises()
      expect(loader).toHaveBeenCalledTimes(2)
      expect(wrapper.text()).toBe('组件已恢复')
    } finally {
      wrapper.unmount()
    }
  })
})
