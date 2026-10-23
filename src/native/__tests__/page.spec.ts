import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, KeepAlive, ref, toValue } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { nativePageHeaders, useNativePageHeader } from '../page'

let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  expect(nativePageHeaders.value.size).toBe(0)
})

describe('页面标题与原生操作的作用域', () => {
  it('异步标题与禁用状态保持响应，KeepAlive 失活立即撤销旧回调，返回时重新登记', async () => {
    const title = ref('加载中')
    const disabled = ref(false)
    const invoke = vi.fn()
    const first = defineComponent({
      setup() {
        useNativePageHeader({
          title,
          actions: computed(() => [{ title: '筛选', icon: 'mdi-filter', disabled: disabled.value, action: invoke }]),
        })
        return () => h('main', 'first')
      },
    })
    const second = defineComponent({
      setup() {
        useNativePageHeader({ title: '第二页' })
        return () => h('main', 'second')
      },
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/first', component: first },
        { path: '/second', component: second },
      ],
    })
    await router.push('/first')
    wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterView,
            {},
            {
              default: ({ Component }: { Component: object }) => h(KeepAlive, {}, () => h(Component)),
            },
          ),
      }),
      { global: { plugins: [router] } },
    )
    await flushPromises()
    const original = [...nativePageHeaders.value.values()][0]
    expect(nativePageHeaders.value.size).toBe(1)
    title.value = '真实详情标题'
    disabled.value = true
    expect(toValue(original.title)).toBe('真实详情标题')
    expect(toValue(original.actions)?.[0].disabled).toBe(true)

    await router.push('/second')
    await flushPromises()
    expect([...nativePageHeaders.value.values()].map(entry => entry.routePath)).toEqual(['/second'])
    title.value = '后台更新'
    expect([...nativePageHeaders.value.values()].some(entry => toValue(entry.title) === '后台更新')).toBe(false)
    expect(invoke).not.toHaveBeenCalled()

    await router.push('/first')
    await flushPromises()
    const returned = [...nativePageHeaders.value.values()][0]
    expect(returned.ownerId).toBe(original.ownerId)
    expect(toValue(returned.title)).toBe('后台更新')
    expect(nativePageHeaders.value.size).toBe(1)
  })
})
