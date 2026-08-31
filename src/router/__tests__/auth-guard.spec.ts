import '@/router'
import { useAuthStore } from '@/stores/auth'
import { useUserStore } from '@/stores/user'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface RouteLike {
  fullPath: string
  meta: Record<string, unknown>
  name?: string
  params?: Record<string, unknown>
  path: string
}

type NavigationGuard = (to: RouteLike, from: RouteLike, next: ReturnType<typeof vi.fn>) => Promise<void>
type AfterEachHook = () => void
type Redirect = () => string

const routerMocks = vi.hoisted(() => ({
  afterEach: undefined as AfterEachHook | undefined,
  getInitializationState: vi.fn(),
  guard: undefined as NavigationGuard | undefined,
  next: vi.fn(),
  routes: [] as Array<{ path: string; redirect?: Redirect }>,
  setRequestNavigatingState: vi.fn(),
}))

vi.mock('vue-router', () => ({
  createRouter: (options: { routes: Array<{ path: string; redirect?: Redirect }> }) => {
    routerMocks.routes = options.routes
    return {
      afterEach: (hook: AfterEachHook) => {
        routerMocks.afterEach = hook
      },
      beforeEach: (guard: NavigationGuard) => {
        routerMocks.guard = guard
      },
    }
  },
  createWebHashHistory: vi.fn(),
}))

vi.mock('@/api/nprogress', () => ({
  configureNProgress: vi.fn(),
}))

vi.mock('@/utils/initialization', () => ({
  getInitializationState: routerMocks.getInitializationState,
}))

vi.mock('@/utils/requestOptimizer', () => ({
  abortAllRequests: vi.fn(),
  initializeRequestOptimizer: vi.fn(),
  setNavigatingState: routerMocks.setRequestNavigatingState,
}))

function route(overrides: Partial<RouteLike> = {}): RouteLike {
  return {
    fullPath: '/apps',
    meta: {},
    path: '/apps',
    ...overrides,
  }
}

async function runGuard(to: RouteLike) {
  await routerMocks.guard?.(to, route({ fullPath: '/', path: '/' }), routerMocks.next)
}

describe('authentication route guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    routerMocks.next.mockReset()
    routerMocks.getInitializationState.mockReset()
    routerMocks.getInitializationState.mockResolvedValue(true)
    routerMocks.setRequestNavigatingState.mockReset()
  })

  it('routes the root according to the current session role', () => {
    const rootRedirect = routerMocks.routes.find(item => item.path === '/' && item.redirect)?.redirect
    expect(rootRedirect).toBeTypeOf('function')

    expect(rootRedirect?.()).toBe('/login')

    useAuthStore().setToken('token')
    expect(rootRedirect?.()).toBe('/apps')

    useUserStore().setSuperUser(true)
    expect(rootRedirect?.()).toBe('/dashboard')
  })

  it('records an unauthenticated protected target before redirecting to login', async () => {
    await runGuard(
      route({
        fullPath: '/subscribe/tv?tab=active',
        meta: { requiresAuth: true },
        path: '/subscribe/tv',
      }),
    )

    expect(useAuthStore().originalPath).toBe('/subscribe/tv?tab=active')
    expect(routerMocks.setRequestNavigatingState.mock.calls).toEqual([[true], [false]])
    expect(routerMocks.next).toHaveBeenCalledOnce()
    expect(routerMocks.next).toHaveBeenCalledWith('/login')
  })

  it('does not replace the saved business target while entering the login page', async () => {
    useAuthStore().setOriginalPath('/resource?keyword=test')

    await runGuard(route({ fullPath: '/login?lab=motion', path: '/login' }))

    expect(useAuthStore().originalPath).toBe('/resource?keyword=test')
    expect(routerMocks.next).toHaveBeenCalledWith()
  })

  it('redirects to initialization when the instance has no user', async () => {
    routerMocks.getInitializationState.mockResolvedValue(false)

    await runGuard(route({ fullPath: '/login', path: '/login' }))

    expect(routerMocks.next).toHaveBeenCalledOnce()
    expect(routerMocks.next).toHaveBeenCalledWith('/initialize')
    expect(routerMocks.setRequestNavigatingState).toHaveBeenLastCalledWith(false)
  })

  it('redirects to the service status page while the status endpoint is unavailable', async () => {
    routerMocks.getInitializationState.mockRejectedValue(new Error('service starting'))

    await runGuard(route({ fullPath: '/login', path: '/login' }))

    expect(routerMocks.next).toHaveBeenCalledOnce()
    expect(routerMocks.next).toHaveBeenCalledWith('/service-status')
    expect(routerMocks.setRequestNavigatingState).toHaveBeenLastCalledWith(false)
  })

  it('allows the service status page to keep checking while the endpoint remains unavailable', async () => {
    routerMocks.getInitializationState.mockRejectedValue(new Error('service starting'))
    useAuthStore().setOriginalPath('/resource?keyword=test')

    await runGuard(route({ fullPath: '/service-status', path: '/service-status' }))

    expect(routerMocks.next).toHaveBeenCalledOnce()
    expect(routerMocks.next).toHaveBeenCalledWith()
    expect(useAuthStore().originalPath).toBe('/resource?keyword=test')
  })

  it('leaves the service status page according to the confirmed initialization state', async () => {
    await runGuard(route({ fullPath: '/service-status', path: '/service-status' }))
    expect(routerMocks.next).toHaveBeenLastCalledWith('/login')

    routerMocks.next.mockClear()
    routerMocks.getInitializationState.mockResolvedValue(false)
    await runGuard(route({ fullPath: '/service-status', path: '/service-status' }))
    expect(routerMocks.next).toHaveBeenLastCalledWith('/initialize')
  })

  it('keeps initialized instances out of the initialization page', async () => {
    await runGuard(route({ fullPath: '/initialize', path: '/initialize' }))

    expect(routerMocks.next).toHaveBeenCalledOnce()
    expect(routerMocks.next).toHaveBeenCalledWith('/login')
  })

  it('allows ordinary protected routes and enforces declared permissions', async () => {
    const authStore = useAuthStore()
    const userStore = useUserStore()
    authStore.setToken('token')

    await runGuard(route({ meta: { requiresAuth: true } }))
    expect(routerMocks.next).toHaveBeenLastCalledWith()

    routerMocks.next.mockClear()
    userStore.setPermissions({ discovery: true, features: { 'discovery.recommend': false } })
    await runGuard(
      route({
        fullPath: '/recommend',
        meta: { feature: 'discovery.recommend', permission: 'discovery', requiresAuth: true },
        path: '/recommend',
      }),
    )
    expect(routerMocks.next).toHaveBeenLastCalledWith('/apps')
    expect(routerMocks.setRequestNavigatingState).toHaveBeenLastCalledWith(false)

    routerMocks.next.mockClear()
    userStore.setSuperUser(true)
    await runGuard(
      route({
        fullPath: '/recommend',
        meta: { feature: 'discovery.recommend', permission: 'discovery', requiresAuth: true },
        path: '/recommend',
      }),
    )
    expect(routerMocks.next).toHaveBeenLastCalledWith()
  })

  it('clears the navigation state after a completed route', () => {
    vi.useFakeTimers()

    routerMocks.afterEach?.()
    expect(routerMocks.setRequestNavigatingState).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(routerMocks.setRequestNavigatingState).toHaveBeenCalledWith(false)
  })
})
