import { changePluginSource, installPluginFromSource } from '@/api/pluginSource'
import { abortAllRequests, getActiveRequestsCount, setNavigatingState } from '@/utils/requestOptimizer'
import { server } from '@tests/support/msw/server'
import { apiFailureJson, apiJson } from '@tests/support/msw/response'
import { http } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

// 保留真实 Axios 和路由取消拦截器，隔离应用启动时的认证与路由初始化。
vi.mock('@/api', async () => {
  const { createApiClients } = await import('@/api/client')
  const { initializeRequestOptimizer } = await import('@/utils/requestOptimizer')
  return {
    default: createApiClients({ baseURL: 'http://localhost/api/v1/', setupInstance: initializeRequestOptimizer }).api,
  }
})

/** 控制安装返回时机，验证切页发生在请求执行期间。 */
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('plugin installation navigation lifecycle', () => {
  afterEach(() => {
    setNavigatingState(false)
    abortAllRequests()
  })

  it.each([
    {
      path: 'plugin/source/DemoPlugin/install',
      install: () => installPluginFromSource('DemoPlugin', { repo_url: 'https://github.com/example/plugins' }),
    },
    {
      path: 'plugin/source/DemoPlugin',
      install: () =>
        changePluginSource('DemoPlugin', { repo_url: 'https://github.com/example/plugins', expected_revision: 1 }),
    },
  ])('$path survives navigation and preserves the final business result', async ({ path, install }) => {
    const started = deferred()
    const completed = deferred()
    let signal!: AbortSignal
    server.use(
      http.post(`http://localhost/api/v1/${path}`, async ({ request }) => {
        signal = request.signal
        started.resolve()
        await completed.promise
        return apiJson({ restart_required: true })
      }),
    )
    const result = install()
    try {
      await started.promise
      setNavigatingState(true)
      setNavigatingState(false)
      expect(signal.aborted).toBe(false)
      expect(getActiveRequestsCount()).toBe(0)
    } finally {
      completed.resolve()
    }
    await expect(result).resolves.toEqual({ restart_required: true })
  })

  it('still reports a real install failure after navigation', async () => {
    const started = deferred()
    const completed = deferred()
    server.use(
      http.post('http://localhost/api/v1/plugin/source/DemoPlugin/install', async () => {
        started.resolve()
        await completed.promise
        return apiFailureJson('依赖安装失败')
      }),
    )
    const result = installPluginFromSource('DemoPlugin', { repo_url: 'https://github.com/example/plugins' })
    const assertion = expect(result).rejects.toThrow('依赖安装失败')
    await started.promise
    setNavigatingState(true)
    setNavigatingState(false)
    completed.resolve()
    await assertion
  })
})
