import {
  injectRemoteModule,
  loadRemoteAppPageComponent,
  loadRemoteComponent,
  loadRemoteComponentFromModule,
  loadRemoteComponents,
  type RemoteModule,
} from '@/utils/federationLoader'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  getRemote: vi.fn(),
  setRemote: vi.fn(),
  unwrapDefault: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

vi.mock('virtual:__federation__', () => ({
  __federation_method_getRemote: (...args: unknown[]) => mocks.getRemote(...args),
  __federation_method_setRemote: (...args: unknown[]) => mocks.setRemote(...args),
  __federation_method_unwrapDefault: (...args: unknown[]) => mocks.unwrapDefault(...args),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function configureRuntimeRegistry() {
  const registered = new Set<string>()
  mocks.getRemote.mockImplementation(async (id: string) => {
    if (!registered.has(id)) throw new Error(`${id} is not registered`)
    return { default: `${id} page` }
  })
  mocks.setRemote.mockImplementation((id: string) => {
    registered.add(id)
  })
}

describe('federationLoader', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.getRemote.mockReset()
    mocks.setRemote.mockReset()
    mocks.unwrapDefault.mockReset()
    mocks.unwrapDefault.mockImplementation(module => (module as { default: unknown }).default)
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('loads an already registered remote and unwraps its default export without discovery', async () => {
    const remoteModule = { default: { name: 'RemotePage' } }
    mocks.getRemote.mockResolvedValue(remoteModule)

    await expect(loadRemoteComponent('demo', 'Config')).resolves.toBe(remoteModule.default)

    expect(mocks.getRemote).toHaveBeenCalledWith('demo', './Config')
    expect(mocks.unwrapDefault).toHaveBeenCalledWith(remoteModule)
    expect(mocks.apiGet).not.toHaveBeenCalled()
    expect(mocks.setRemote).not.toHaveBeenCalled()
  })

  it('single-flights discovery and registration for concurrent loads of the same unknown remote', async () => {
    const remoteComponent = { name: 'RemotePage' }
    let registered = false

    mocks.apiGet.mockResolvedValue([{ id: 'demo', url: '/plugins/demo/remoteEntry.js' }])
    mocks.getRemote.mockImplementation(async () => {
      if (!registered) throw new Error('remote is not registered')
      return { default: remoteComponent }
    })
    mocks.setRemote.mockImplementation(() => {
      registered = true
    })

    await expect(Promise.all([loadRemoteComponent('demo'), loadRemoteComponent('demo')])).resolves.toEqual([
      remoteComponent,
      remoteComponent,
    ])

    expect(mocks.apiGet).toHaveBeenCalledTimes(1)
    expect(mocks.setRemote).toHaveBeenCalledTimes(1)
  })

  it('starts a new discovery after a successful registration flight has settled', async () => {
    let registered = false
    mocks.apiGet.mockResolvedValue([{ id: 'demo', url: '/plugins/demo/remoteEntry.js' }])
    mocks.getRemote.mockImplementation(async () => {
      if (!registered) throw new Error('remote is not registered')
      return { default: 'demo page' }
    })
    mocks.setRemote.mockImplementation(() => {
      registered = true
    })

    await expect(loadRemoteComponent('demo')).resolves.toBe('demo page')
    registered = false
    await expect(loadRemoteComponent('demo')).resolves.toBe('demo page')

    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
    expect(mocks.setRemote).toHaveBeenCalledTimes(2)
  })

  it('shares a failed discovery flight and allows a later call to recover', async () => {
    const failedDiscovery = deferred<RemoteModule[]>()
    let registered = false
    mocks.apiGet
      .mockImplementationOnce(() => failedDiscovery.promise)
      .mockResolvedValueOnce([{ id: 'demo', url: '/plugins/demo/remoteEntry.js' }])
    mocks.getRemote.mockImplementation(async () => {
      if (!registered) throw new Error('remote is not registered')
      return { default: 'demo page' }
    })
    mocks.setRemote.mockImplementation(() => {
      registered = true
    })

    const firstLoad = loadRemoteComponent('demo')
    const secondLoad = loadRemoteComponent('demo')
    await vi.waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(1))
    failedDiscovery.reject(new Error('discovery failed'))

    const failedLoads = await Promise.allSettled([firstLoad, secondLoad])
    expect(failedLoads.map(result => result.status)).toEqual(['rejected', 'rejected'])
    expect(mocks.apiGet).toHaveBeenCalledTimes(1)

    await expect(loadRemoteComponent('demo')).resolves.toBe('demo page')
    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
    expect(mocks.setRemote).toHaveBeenCalledTimes(1)
  })

  it('lets different unknown remotes complete independently', async () => {
    const alphaDiscovery = deferred<RemoteModule[]>()
    const betaDiscovery = deferred<RemoteModule[]>()
    configureRuntimeRegistry()
    mocks.apiGet
      .mockImplementationOnce(() => alphaDiscovery.promise)
      .mockImplementationOnce(() => betaDiscovery.promise)

    let alphaSettled = false
    const alphaLoad = loadRemoteComponent('alpha').then(value => {
      alphaSettled = true
      return value
    })
    const betaLoad = loadRemoteComponent('beta')

    await vi.waitFor(() => expect(mocks.apiGet).toHaveBeenCalledTimes(2))
    betaDiscovery.resolve([{ id: 'beta', url: '/plugins/beta/remoteEntry.js' }])

    await expect(betaLoad).resolves.toBe('beta page')
    expect(alphaSettled).toBe(false)

    alphaDiscovery.resolve([{ id: 'alpha', url: '/plugins/alpha/remoteEntry.js' }])
    await expect(alphaLoad).resolves.toBe('alpha page')
    expect(mocks.setRemote).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['an empty discovery response', () => Promise.resolve([])],
    ['a failed discovery request', () => Promise.reject(new Error('discovery failed'))],
  ])('rejects when an unknown remote cannot be found after %s', async (_name, discover) => {
    mocks.getRemote.mockRejectedValue(new Error('remote is not registered'))
    mocks.apiGet.mockImplementation(discover)

    await expect(loadRemoteComponent('missing')).rejects.toThrow('无法找到远程模块信息: missing')
    expect(mocks.setRemote).not.toHaveBeenCalled()
  })

  it('loads a component from explicit remote metadata after registering it', async () => {
    const component = { name: 'ExplicitPage' }
    mocks.getRemote.mockResolvedValue({ default: component })

    await expect(
      loadRemoteComponentFromModule({ id: 'explicit', url: 'https://cdn.example/remoteEntry.js' }, 'Dashboard'),
    ).resolves.toBe(component)

    expect(mocks.setRemote).toHaveBeenCalledOnce()
    expect(mocks.getRemote).toHaveBeenCalledWith('explicit', './Dashboard')
  })

  it('registers remote metadata with the resolved ESM runtime contract', async () => {
    injectRemoteModule({ id: 'explicit', url: 'https://cdn.example/remoteEntry.js' })

    expect(mocks.setRemote).toHaveBeenCalledWith(
      'explicit',
      expect.objectContaining({ format: 'esm', from: 'vite', url: expect.any(Function) }),
    )
    const config = mocks.setRemote.mock.calls[0]?.[1] as { url: () => Promise<string> }
    await expect(config.url()).resolves.toBe('https://cdn.example/remoteEntry.js')
  })

  it('initializes every discovered remote and tolerates empty or failed discovery', async () => {
    mocks.apiGet.mockResolvedValueOnce([
      { id: 'alpha', url: '/plugins/alpha/remoteEntry.js' },
      { id: 'beta', url: '/plugins/beta/remoteEntry.js' },
    ])
    await loadRemoteComponents()
    expect(mocks.setRemote).toHaveBeenCalledTimes(2)

    mocks.setRemote.mockClear()
    mocks.apiGet.mockResolvedValueOnce([])
    await expect(loadRemoteComponents()).resolves.toBeUndefined()
    expect(mocks.setRemote).not.toHaveBeenCalled()

    mocks.apiGet.mockResolvedValueOnce(null)
    await expect(loadRemoteComponents()).resolves.toBeUndefined()
    expect(mocks.setRemote).not.toHaveBeenCalled()

    mocks.apiGet.mockRejectedValueOnce(new Error('discovery failed'))
    await expect(loadRemoteComponents()).resolves.toBeUndefined()
    expect(mocks.setRemote).not.toHaveBeenCalled()
  })

  it('contains a registration failure during remote initialization', async () => {
    mocks.apiGet.mockResolvedValue([{ id: 'broken', url: '/plugins/broken/remoteEntry.js' }])
    mocks.setRemote.mockImplementation(() => {
      throw new Error('registration failed')
    })

    await expect(loadRemoteComponents()).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith('加载远程组件失败:', expect.any(Error))
  })

  it('uses AppPage then Page for the main navigation entry', async () => {
    const appPageError = new Error('AppPage failed')
    mocks.apiGet.mockResolvedValue([{ id: 'demo', url: '/plugins/demo/remoteEntry.js' }])
    mocks.getRemote.mockImplementation(async (_id: string, componentName: string) => {
      if (componentName === './AppPage') throw appPageError
      return { default: 'legacy page' }
    })

    await expect(loadRemoteAppPageComponent('demo')).resolves.toBe('legacy page')
    expect(mocks.getRemote.mock.calls.map(call => call[1])).toEqual(['./AppPage', './AppPage', './Page'])
  })

  it('tries the PascalCase nav expose before the generic fallbacks', async () => {
    mocks.getRemote.mockResolvedValue({ default: 'tool page' })

    await expect(loadRemoteAppPageComponent('demo', '  my_tool-name  ')).resolves.toBe('tool page')
    expect(mocks.getRemote).toHaveBeenCalledWith('demo', './AppPageMyToolName')
    expect(mocks.apiGet).not.toHaveBeenCalled()
  })

  it.each([
    ['blank', '   '],
    ['separator-only', '_-  '],
  ])('uses the generic AppPage candidate for a %s nav key', async (_name, navKey) => {
    mocks.getRemote.mockResolvedValue({ default: 'generic app page' })

    await expect(loadRemoteAppPageComponent('demo', navKey)).resolves.toBe('generic app page')
    expect(mocks.getRemote).toHaveBeenCalledWith('demo', './AppPage')
  })

  it('preserves candidate fallback when a specialized expose rejects', async () => {
    mocks.apiGet.mockResolvedValue([{ id: 'demo', url: '/plugins/demo/remoteEntry.js' }])
    mocks.getRemote.mockImplementation(async (_id: string, componentName: string) => {
      if (componentName === './AppPage') return { default: 'generic app page' }
      throw new Error('specialized expose failed')
    })

    await expect(loadRemoteAppPageComponent('demo', 'settings')).resolves.toBe('generic app page')
    expect(mocks.getRemote.mock.calls.map(call => call[1])).toEqual([
      './AppPageSettings',
      './AppPageSettings',
      './AppPage',
    ])
  })

  it('rejects with the final candidate error when no AppPage expose can load', async () => {
    mocks.apiGet.mockResolvedValue([{ id: 'demo', url: '/plugins/demo/remoteEntry.js' }])
    mocks.getRemote.mockImplementation(async (_id: string, componentName: string) => {
      throw new Error(`${componentName} failed`)
    })

    await expect(loadRemoteAppPageComponent('demo', 'main')).rejects.toThrow('./Page failed')
    expect(mocks.getRemote.mock.calls.map(call => call[1])).toEqual(['./AppPage', './AppPage', './Page', './Page'])
  })
})
