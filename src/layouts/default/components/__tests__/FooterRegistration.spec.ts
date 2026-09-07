import { DOMWrapper, shallowMount } from '@vue/test-utils'
import { nextTick, reactive, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createVuetify } from 'vuetify'
import Footer from '../Footer.vue'
import { dynamicButtonRegistry } from '@/composables/dynamicButtonRegistry'

const mocks = vi.hoisted(() => ({ route: { path: '/dashboard' } }))
vi.mock('vue-router', async original => ({
  ...(await original<typeof import('vue-router')>()),
  useRoute: () => reactive(mocks.route),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: ref('zh-CN') }) }))
vi.mock('vuetify', async original => ({
  ...(await original<typeof import('vuetify')>()),
  useDisplay: () => ({ smAndDown: ref(false) }),
}))
vi.mock('@/composables/usePWA', () => ({ usePWA: () => ({ appMode: ref(true) }) }))
vi.mock('@/composables/useLaunchLoading', () => ({ useLaunchLoading: () => ({ isLaunchLoading: ref(false) }) }))
vi.mock('@/stores', () => ({ useUserStore: () => ({ userID: 1, superUser: true, permissions: {} }) }))
vi.mock('@/router/i18n-menu', () => ({ getNavMenus: () => [] }))

const wrappers: ReturnType<typeof shallowMount>[] = []
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  dynamicButtonRegistry.unregister()
  delete window.__VUE_INJECT_DYNAMIC_BUTTON__
  delete window.__VUE_UNINJECT_DYNAMIC_BUTTON__
  vi.useRealTimers()
})

describe('Footer shared registration integration', () => {
  function accessory() {
    const element = document.querySelector<HTMLElement>('[data-footer-nav-role="accessory"]')
    if (!element) throw new Error('Dock accessory must remain mounted')
    return new DOMWrapper(element)
  }

  function mountFooter() {
    const wrapper = shallowMount(Footer, {
      global: {
        plugins: [createVuetify()],
        renderStubDefaultSlot: true,
        stubs: { Teleport: false, VCard: false },
      },
    })
    wrappers.push(wrapper)
    return wrapper
  }

  it('loads the real registry and keeps its accessory element across replacements and absence', async () => {
    vi.useFakeTimers()
    mountFooter()
    const element = accessory().element
    const action = vi.fn()
    expect(accessory().classes()).toContain('footer-nav-card--collapsed')

    window.__VUE_INJECT_DYNAMIC_BUTTON__?.({ icon: 'mdi-plus', action, show: true }, 'first')
    await nextTick()
    expect(accessory().element).toBe(element)
    expect(accessory().classes()).not.toContain('footer-nav-card--collapsed')

    window.__VUE_INJECT_DYNAMIC_BUTTON__?.({ icon: 'mdi-cog', action, show: true }, 'second')
    window.__VUE_UNINJECT_DYNAMIC_BUTTON__?.('first')
    await nextTick()
    expect(dynamicButtonRegistry.registration.value?.ownerId).toBe('second')
    expect(accessory().element).toBe(element)

    window.__VUE_UNINJECT_DYNAMIC_BUTTON__?.('second')
    await nextTick()
    expect(accessory().attributes('aria-hidden')).toBe('true')
    expect(accessory().classes()).not.toContain('footer-nav-card--collapsed')
    await vi.advanceTimersByTimeAsync(120)
    expect(accessory().element).toBe(element)
    expect(accessory().classes()).toContain('footer-nav-card--collapsed')
  })

  it('hands off the visual shell without re-entry while stale commands are disabled immediately', async () => {
    vi.useFakeTimers()
    mountFooter()
    window.__VUE_INJECT_DYNAMIC_BUTTON__?.({ icon: 'mdi-plus', action: vi.fn(), show: true }, 'first')
    await nextTick()
    window.__VUE_UNINJECT_DYNAMIC_BUTTON__?.('first')
    await nextTick()
    expect(accessory().attributes('aria-hidden')).toBe('true')
    await vi.advanceTimersByTimeAsync(60)
    window.__VUE_INJECT_DYNAMIC_BUTTON__?.({ icon: 'mdi-cog', action: vi.fn(), show: true }, 'second')
    await vi.advanceTimersByTimeAsync(200)
    expect(accessory().classes()).not.toContain('footer-nav-card--collapsed')
    expect(accessory().attributes('aria-hidden')).toBeUndefined()
  })

  it('does not clear the current bridge or command when an older Footer unmounts', () => {
    const old = mountFooter()
    mountFooter()
    const current = window.__VUE_INJECT_DYNAMIC_BUTTON__
    current?.({ icon: 'mdi-plus', action: vi.fn(), show: true }, 'current')
    old.unmount()
    expect(window.__VUE_INJECT_DYNAMIC_BUTTON__).toBe(current)
    expect(dynamicButtonRegistry.registration.value?.ownerId).toBe('current')
  })
})
