import { afterEach, describe, expect, it } from 'vitest'
import { createRouter, createWebHashHistory, type Router } from 'vue-router'
import { flushPromises } from '@vue/test-utils'
import { NativeRouteHistory } from '../history'

const roots = [
  { id: '/dashboard', path: '/dashboard', title: '首页', icon: 'dashboard' },
  { id: '/apps', path: '/apps', title: '更多', icon: 'apps' },
]
const cleanups: Array<() => void> = []

/** 使用真实 hash Router，确保不是只验证一份自制栈的实现镜像。 */
async function harness() {
  window.history.replaceState(null, '', '/#/dashboard')
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' }, meta: { requiresAuth: true } }],
  })
  await router.push('/dashboard')
  const history = new NativeRouteHistory(router, () => roots)
  cleanups.push(() => {
    history.stop()
    router.options.history.destroy()
  })
  return { router, history }
}

/** 在触发浏览器 pop 前先订阅完成事件，避免依赖不确定延迟。
 */
function navigateOnce(router: Router, action: () => void) {
  return new Promise<void>(resolve => {
    const remove = router.afterEach(() => {
      remove()
      resolve()
    })
    action()
  })
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

describe('网页业务路由是导航事实来源', () => {
  it('push/replace/pop 与 Tab 恢复均不要求重建文档', async () => {
    const { router, history } = await harness()
    await router.push('/media/1')
    await router.replace('/media/2')
    expect(history.navigation).toEqual({ rootId: '/dashboard', canGoBack: true, backTarget: '/dashboard' })
    await navigateOnce(router, () => router.back())
    expect(history.navigation.canGoBack).toBe(false)
    await router.push('/media/3')
    expect(history.selectRoot('/apps')).toBe(true)
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/apps')
    expect(history.selectRoot('/dashboard')).toBe(true)
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/media/3')
    expect(history.navigation.backTarget).toBe('/dashboard')
    expect(history.back(document, window)).toBe(true)
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/dashboard')
  })

  it('守卫取消不会提前改变选中入口或返回栈', async () => {
    const { router, history } = await harness()
    router.beforeEach(to => to.path !== '/apps')
    history.selectRoot('/apps')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/dashboard')
    expect(history.navigation.rootId).toBe('/dashboard')
    expect(history.navigation.canGoBack).toBe(false)
  })

  it('顶层 HTML 弹层或输入框优先消费返回，不改变业务路由', async () => {
    const { router, history } = await harness()
    await router.push('/media/1')
    const overlay = document.createElement('div')
    overlay.className = 'v-overlay--active'
    document.body.append(overlay)
    expect(history.back(document, window)).toBe(true)
    expect(router.currentRoute.value.path).toBe('/media/1')
    overlay.remove()
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    expect(history.back(document, window)).toBe(true)
    expect(document.activeElement).not.toBe(input)
    expect(router.currentRoute.value.path).toBe('/media/1')
    input.remove()
  })
})
