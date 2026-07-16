import i18n from '@/plugins/i18n'
import vuetify from '@/plugins/vuetify'
import { createTestingPinia } from '@pinia/testing'
import { render } from '@testing-library/vue'
import { setActivePinia } from 'pinia'
import { defineComponent, h, type Component } from 'vue'
import { createMemoryHistory, createRouter, type RouteLocationRaw } from 'vue-router'
import { vi } from 'vitest'

type TestingLibraryRenderOptions = NonNullable<Parameters<typeof render>[1]>

export interface RenderWithProvidersOptions extends Omit<TestingLibraryRenderOptions, 'global'> {
  global?: TestingLibraryRenderOptions['global']
  initialRoute?: RouteLocationRaw
  initialState?: Record<string, Record<string, unknown>>
  stubActions?: boolean
}

const EmptyRoute = defineComponent({
  name: 'EmptyTestRoute',
  setup: () => () => h('div'),
})

/** 使用独立 Router、Pinia 和生产 UI 插件渲染业务组件。 */
export async function renderWithProviders(component: Component, options: RenderWithProvidersOptions = {}) {
  const {
    global: globalOptions,
    initialRoute = '/',
    initialState = {},
    stubActions = true,
    ...renderOptions
  } = options
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: EmptyRoute }],
  })
  await router.push(initialRoute)
  i18n.global.locale.value = 'zh-CN'

  const pinia = createTestingPinia({
    createSpy: vi.fn,
    initialState,
    stubActions,
  })
  setActivePinia(pinia)

  const result = render(component, {
    ...renderOptions,
    global: {
      ...globalOptions,
      plugins: [vuetify, i18n, pinia, router, ...(globalOptions?.plugins ?? [])],
    },
  })
  await router.isReady()

  return { ...result, pinia, router }
}
