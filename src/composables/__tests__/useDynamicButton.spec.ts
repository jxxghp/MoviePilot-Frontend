import { dynamicButtonRegistry } from '@/composables/dynamicButtonRegistry'
import { useDynamicButton } from '@/composables/useDynamicButton'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, provide, ref, type Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  route: { path: '/old' },
}))

vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => mocks.route,
}))

const wrappers: ReturnType<typeof mount>[] = []

function mountWithRegistry(page: ReturnType<typeof defineComponent>) {
  const Host = defineComponent({
    setup() {
      provide('registerDynamicButton', dynamicButtonRegistry.register)
      provide('unregisterDynamicButton', dynamicButtonRegistry.unregister)

      return () => h(page)
    },
  })

  const wrapper = mount(Host)
  wrappers.push(wrapper)
  return wrapper
}

function createPage(icon: string | Ref<string>) {
  return defineComponent({
    setup() {
      useDynamicButton({ icon })

      return () => h('div')
    },
  })
}

beforeEach(() => {
  mocks.route.path = '/old'
  dynamicButtonRegistry.unregister()
})

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  dynamicButtonRegistry.unregister()
  delete window.__VUE_INJECT_DYNAMIC_BUTTON__
  delete window.__VUE_UNINJECT_DYNAMIC_BUTTON__
  vi.useRealTimers()
})

describe('useDynamicButton', () => {
  it('registers immediately through the shared registry before Footer mounts', () => {
    const wrapper = mountWithRegistry(createPage('mdi-old'))

    expect(dynamicButtonRegistry.registration.value).toMatchObject({
      button: { icon: 'mdi-old', routePath: '/old' },
      ownerId: expect.any(String),
    })

    wrapper.unmount()
    expect(dynamicButtonRegistry.registration.value).toBeNull()
  })

  it('keeps the newer page button after the older page is removed', async () => {
    const showOld = ref(true)
    const showNew = ref(false)
    const OldPage = createPage('mdi-old')
    const NewPage = createPage('mdi-new')
    const Host = defineComponent({
      setup() {
        provide('registerDynamicButton', dynamicButtonRegistry.register)
        provide('unregisterDynamicButton', dynamicButtonRegistry.unregister)

        return () => h('div', [showOld.value ? h(OldPage) : null, showNew.value ? h(NewPage) : null])
      },
    })
    const wrapper = mount(Host)
    wrappers.push(wrapper)

    const oldOwner = dynamicButtonRegistry.registration.value?.ownerId
    showNew.value = true
    await nextTick()
    const newOwner = dynamicButtonRegistry.registration.value?.ownerId

    expect(newOwner).not.toBe(oldOwner)
    expect(dynamicButtonRegistry.registration.value?.button.icon).toBe('mdi-new')

    showOld.value = false
    await nextTick()

    expect(dynamicButtonRegistry.registration.value?.button.icon).toBe('mdi-new')
    expect(dynamicButtonRegistry.registration.value?.ownerId).toBe(newOwner)
  })

  it('updates icon without changing the page owner', async () => {
    const icon = ref('mdi-old')
    const wrapper = mountWithRegistry(createPage(icon))
    const ownerId = dynamicButtonRegistry.registration.value?.ownerId

    icon.value = 'mdi-new'
    await nextTick()

    expect(dynamicButtonRegistry.registration.value).toMatchObject({
      button: { icon: 'mdi-new' },
      ownerId,
    })

    wrapper.unmount()
  })

  it('passes an owner to the compatible global bridge and unregisters it', () => {
    const register = vi.fn()
    const unregister = vi.fn()
    window.__VUE_INJECT_DYNAMIC_BUTTON__ = register
    window.__VUE_UNINJECT_DYNAMIC_BUTTON__ = unregister

    const Page = createPage('mdi-legacy')
    const wrapper = mount(Page)
    wrappers.push(wrapper)

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ icon: 'mdi-legacy', routePath: '/old' }),
      expect.any(String),
    )

    wrapper.unmount()

    expect(unregister).toHaveBeenCalledWith(expect.any(String))
  })
})
