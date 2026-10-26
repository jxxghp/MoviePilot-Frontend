import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 执行 App 内真实启动函数，边界仅替换路由、请求、渲染和时钟。 */
function launchHarness(pendingStage: string | null) {
  const source = readFileSync(resolve('src/App.vue'), 'utf8').split('<script lang="ts" setup>')[1].split('</script>')[0]
  const ast = ts.createSourceFile('App.ts', source, ts.ScriptTarget.Latest, true)
  const names = new Set(['getLaunchNow', 'getRemainingLaunchBudget', 'waitForLaunchTask', 'waitForInitialContentReady'])
  const code = ast.statements
    .filter(node => ts.isFunctionDeclaration(node) && names.has(node.name!.text))
    .map(node => node.getText(ast))
    .join('\n')
  const never = new Promise<void>(() => {})
  const stage = (name: string) => (pendingStage === name ? never : Promise.resolve())
  const initialize = vi.fn(() => stage('auth'))
  const context = {
    LAUNCH_MAX_WAIT_MS: 1200,
    launchStartedAt: Date.now(),
    initialRouteReadyPromise: stage('route'),
    initialBackgroundLoadPromise: stage('background'),
    initializeAuthenticatedState: initialize,
    globalLoadingStateManager: { waitForAllComplete: () => stage('loading') },
    nextTick: () => Promise.resolve(),
    performance: { now: () => Date.now() },
    console,
    window: {
      setTimeout,
      clearTimeout,
      requestAnimationFrame: (callback: () => void) => {
        if (pendingStage !== 'paint') setTimeout(callback, 0)
      },
    },
  }
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  // 只执行上方固定名单中可信检出源码的函数；上下文不提供 require、文件或网络出口。
  // eslint-disable-next-line sonarjs/code-eval
  const ready = runInNewContext(`${compiled}\nwaitForInitialContentReady`, context) as () => Promise<void>
  return { ready, initialize }
}

describe('App startup deadline', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it.each(['route', 'background', 'auth', 'loading', 'paint'])(
    'ROOT-004 releases startup when %s never settles',
    async stage => {
      const app = launchHarness(stage)
      let ready = false
      void app.ready().then(() => {
        ready = true
      })
      await vi.advanceTimersByTimeAsync(1250)
      expect(ready).toBe(true)
    },
  )
  it('retains normal initialization and cleans the unused deadline timer', async () => {
    const app = launchHarness(null)
    let ready = false
    void app.ready().then(() => {
      ready = true
    })
    await vi.advanceTimersByTimeAsync(20)
    expect(ready).toBe(true)
    expect(app.initialize).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
