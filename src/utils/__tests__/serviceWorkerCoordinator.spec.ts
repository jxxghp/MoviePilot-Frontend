import {
  createServiceWorkerCoordinator,
  resolveServiceWorkerRegistration,
  type ServiceWorkerClient,
} from '@/utils/serviceWorkerCoordinator'
import { describe, expect, it, vi } from 'vitest'

describe('Service Worker coordinator', () => {
  it('普通 dev 不注册，dev:pwa 使用模块 Worker', () => {
    const documentBaseUrl = 'http://localhost:5174/moviepilot/#/dashboard'

    expect(resolveServiceWorkerRegistration('./', documentBaseUrl, true, false)).toBeNull()
    expect(resolveServiceWorkerRegistration('./', documentBaseUrl, true, true)).toEqual({
      scriptUrl: 'http://localhost:5174/moviepilot/dev-sw.js?dev-sw',
      scope: '/moviepilot/',
      type: 'module',
    })
  })

  it('production 按应用 base 注册 classic Worker', () => {
    expect(
      resolveServiceWorkerRegistration('/moviepilot/', 'https://example.com/ignored/#/dashboard', false, false),
    ).toEqual({
      scriptUrl: 'https://example.com/moviepilot/service-worker.js',
      scope: '/moviepilot/',
      type: 'classic',
    })
  })

  it('监听先于注册，重复初始化和更新复用同一个客户端', async () => {
    const events: string[] = []
    let activatedListener: ((event: { isExternal?: boolean; isUpdate?: boolean }) => void) | undefined
    const registration = {} as ServiceWorkerRegistration
    const client: ServiceWorkerClient = {
      addEventListener: vi.fn((_type, listener) => {
        events.push('listen')
        activatedListener = listener
      }),
      register: vi.fn(async () => {
        events.push('register')
        return registration
      }),
      update: vi.fn(async () => {
        events.push('update')
      }),
    }
    const createClient = vi.fn(() => client)
    const onUpdateActivated = vi.fn()
    const coordinator = createServiceWorkerCoordinator({
      registration: {
        scriptUrl: 'https://example.com/moviepilot/service-worker.js',
        scope: '/moviepilot/',
        type: 'classic',
      },
      createClient,
      onUpdateActivated,
      getController: () => null,
    })

    const firstInitialization = coordinator.initialize()
    const secondInitialization = coordinator.initialize()

    expect(firstInitialization).toBe(secondInitialization)
    await expect(firstInitialization).resolves.toBe(registration)
    expect(createClient).toHaveBeenCalledOnce()
    expect(client.register).toHaveBeenCalledOnce()
    expect(events).toEqual(['listen', 'register'])

    activatedListener?.({ isUpdate: false })
    expect(onUpdateActivated).not.toHaveBeenCalled()
    activatedListener?.({ isExternal: true })
    expect(onUpdateActivated).toHaveBeenCalledOnce()
    activatedListener?.({ isUpdate: true })
    expect(onUpdateActivated).toHaveBeenCalledOnce()

    await coordinator.update()
    expect(createClient).toHaveBeenCalledOnce()
    expect(client.register).toHaveBeenCalledOnce()
    expect(client.update).toHaveBeenCalledOnce()
    expect(events).toEqual(['listen', 'register', 'update'])
  })

  it('注册期间快速激活时通过 controller 变化补发一次更新通知', async () => {
    const previousController = {} as ServiceWorker
    const updatedWorker = {} as ServiceWorker
    let activatedListener: ((event: { isExternal?: boolean; isUpdate?: boolean }) => void) | undefined
    const client: ServiceWorkerClient = {
      addEventListener: vi.fn((_type, listener) => {
        activatedListener = listener
      }),
      register: vi.fn(async () => ({ active: updatedWorker }) as ServiceWorkerRegistration),
      update: vi.fn(),
    }
    const onUpdateActivated = vi.fn()
    const coordinator = createServiceWorkerCoordinator({
      registration: {
        scriptUrl: 'https://example.com/service-worker.js',
        scope: '/',
        type: 'classic',
      },
      createClient: () => client,
      onUpdateActivated,
      getController: () => previousController,
    })

    await coordinator.initialize()
    activatedListener?.({ isUpdate: true })

    expect(onUpdateActivated).toHaveBeenCalledOnce()
  })

  it('注册失败时只记录一次且不阻断应用启动', async () => {
    const error = new Error('register failed')
    const onError = vi.fn()
    const client: ServiceWorkerClient = {
      addEventListener: vi.fn(),
      register: vi.fn().mockRejectedValue(error),
      update: vi.fn(),
    }
    const coordinator = createServiceWorkerCoordinator({
      registration: {
        scriptUrl: 'https://example.com/service-worker.js',
        scope: '/',
        type: 'classic',
      },
      createClient: () => client,
      onUpdateActivated: vi.fn(),
      getController: () => null,
      onError,
    })

    await expect(coordinator.initialize()).resolves.toBeUndefined()
    await expect(coordinator.initialize()).resolves.toBeUndefined()
    expect(client.register).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(error)
  })
})
