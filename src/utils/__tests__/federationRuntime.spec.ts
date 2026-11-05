import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadRemote: vi.fn(),
  registerRemotes: vi.fn(),
}))

vi.mock('@module-federation/enhanced/runtime', () => ({
  loadRemote: (...args: unknown[]) => mocks.loadRemote(...args),
  registerRemotes: (...args: unknown[]) => mocks.registerRemotes(...args),
}))

/** 每个用例重新加载模块，隔离运行时注册表。 */
async function loadRuntime() {
  vi.resetModules()
  return import('@/utils/federationRuntime')
}

function esmRemote(url: string) {
  return { format: 'esm', from: 'vite', url: vi.fn(() => Promise.resolve(url)) } as const
}

describe('federationRuntime', () => {
  beforeEach(() => {
    mocks.loadRemote.mockReset()
    mocks.registerRemotes.mockReset()
  })

  it('registers an ESM remote lazily as a Module Federation module remote and loads the expose', async () => {
    const runtime = await loadRuntime()
    const config = esmRemote('https://cdn.example/demo/remoteEntry.js')
    const remoteModule = { default: { name: 'DemoPage' } }
    mocks.loadRemote.mockResolvedValue(remoteModule)

    runtime.setFederationRemote('demo', config)
    expect(config.url).not.toHaveBeenCalled()
    expect(mocks.registerRemotes).not.toHaveBeenCalled()

    await expect(runtime.getFederationRemote('demo', './Page')).resolves.toBe(remoteModule)

    expect(mocks.registerRemotes).toHaveBeenCalledWith(
      [{ name: 'demo', entry: 'https://cdn.example/demo/remoteEntry.js', type: 'module' }],
      { force: false },
    )
    expect(mocks.loadRemote).toHaveBeenCalledWith('demo/Page')
  })

  it('registers each entry once and forces re-registration when the entry URL changes', async () => {
    const runtime = await loadRuntime()
    mocks.loadRemote.mockResolvedValue({ default: 'page' })

    runtime.setFederationRemote('demo', esmRemote('/v1/remoteEntry.js'))
    await runtime.getFederationRemote('demo', './Page')
    await runtime.getFederationRemote('demo', 'Config')
    expect(mocks.registerRemotes).toHaveBeenCalledTimes(1)
    expect(mocks.loadRemote).toHaveBeenLastCalledWith('demo/Config')

    runtime.setFederationRemote('demo', esmRemote('/v2/remoteEntry.js'))
    await runtime.getFederationRemote('demo', './Page')
    expect(mocks.registerRemotes).toHaveBeenCalledTimes(2)
    expect(mocks.registerRemotes).toHaveBeenLastCalledWith(
      [{ name: 'demo', entry: '/v2/remoteEntry.js', type: 'module' }],
      { force: true },
    )
  })

  it('rejects loads of unknown remotes without touching the runtime', async () => {
    const runtime = await loadRuntime()

    await expect(runtime.getFederationRemote('missing', './Page')).rejects.toThrow(
      'Federation remote is not registered: missing',
    )
    expect(mocks.registerRemotes).not.toHaveBeenCalled()
    expect(mocks.loadRemote).not.toHaveBeenCalled()
  })

  it('rejects when the runtime resolves no module so callers can fall back to discovery', async () => {
    const runtime = await loadRuntime()
    runtime.setFederationRemote('demo', esmRemote('/remoteEntry.js'))

    mocks.loadRemote.mockResolvedValueOnce(undefined)
    await expect(runtime.getFederationRemote('demo', './Page')).rejects.toThrow(
      'Federation remote module is unavailable: demo/Page',
    )
    mocks.loadRemote.mockResolvedValueOnce(null)
    await expect(runtime.getFederationRemote('demo', './Config')).rejects.toThrow(
      'Federation remote module is unavailable: demo/Config',
    )
  })

  it('propagates runtime load failures', async () => {
    const runtime = await loadRuntime()
    runtime.setFederationRemote('demo', esmRemote('/remoteEntry.js'))
    mocks.loadRemote.mockRejectedValue(new Error('chunk failed'))

    await expect(runtime.getFederationRemote('demo', './Page')).rejects.toThrow('chunk failed')
  })

  it('unwraps default exports and passes through modules without one', async () => {
    const { unwrapFederationDefault } = await loadRuntime()
    const component = { name: 'Component' }

    expect(unwrapFederationDefault({ default: component })).toBe(component)
    expect(unwrapFederationDefault(component)).toBe(component)
    expect(unwrapFederationDefault(null)).toBeNull()
    expect(unwrapFederationDefault('text')).toBe('text')
  })
})
