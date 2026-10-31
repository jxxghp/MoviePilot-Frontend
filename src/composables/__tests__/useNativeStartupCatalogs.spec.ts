import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api', () => ({ default: { get } }))
let scope: EffectScope | undefined

/** 运行真实目录加载器与原生启动屏障，仅替换 HTTP 响应和系统时钟。 */
async function harness(available = true) {
  const { useNativeStartupCatalogs } = await import('../useNativeStartupCatalogs')
  const enabled = ref(available)
  scope = effectScope()
  const ready = scope.run(() => useNativeStartupCatalogs(enabled))!
  await vi.advanceTimersByTimeAsync(0)
  return { enabled, ready }
}

/** 两个目录使用现有接口的成功 payload，不预先修改就绪标记。 */
function successfulResponse(path: string) {
  return path === 'media/source' ? [] : { modules: [] }
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  get.mockReset()
  get.mockImplementation(async (path: string) => successfulResponse(path))
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  scope?.stop()
  scope = undefined
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('原生启动目录恢复', () => {
  it('两个目录成功后放行导航，不在后台继续轮询', async () => {
    const h = await harness()
    expect(h.ready.value).toBe(true)
    expect(get).toHaveBeenCalledTimes(2)
    expect(get.mock.calls.every(([, config]) => config.timeout === 8000)).toBe(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it.each(['media/source', 'system/module-catalog'])('首次 %s 失败后只重试失败目录，成功前不放行', async path => {
    let failed = false
    get.mockImplementation(async (requested: string) => {
      if (requested === path && !failed) {
        failed = true
        throw new Error('合成临时连接故障')
      }
      return successfulResponse(requested)
    })
    const h = await harness()
    expect(h.ready.value).toBe(false)
    expect(get).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1499)
    expect(get).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(h.ready.value).toBe(true)
    expect(get.mock.calls.map(([requested]) => requested).filter(requested => requested === path)).toHaveLength(2)
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('持续失败最多请求四轮，保持屏障并交由原生恢复入口处理', async () => {
    get.mockRejectedValue(new Error('合成持续故障'))
    const h = await harness()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.ready.value).toBe(false)
    expect(get).toHaveBeenCalledTimes(8)
  })

  it('未认证时不查询，退出认证后撤销待重试任务', async () => {
    get.mockRejectedValue(new Error('合成临时连接故障'))
    const h = await harness(false)
    expect(get).not.toHaveBeenCalled()
    h.enabled.value = true
    await vi.advanceTimersByTimeAsync(0)
    expect(get).toHaveBeenCalledTimes(2)
    h.enabled.value = false
    await vi.advanceTimersByTimeAsync(10_000)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('进入后台暂停重试，回到前台重新检测并恢复', async () => {
    get.mockRejectedValue(new Error('合成临时连接故障'))
    const h = await harness()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(get).toHaveBeenCalledTimes(2)
    get.mockImplementation(async (path: string) => successfulResponse(path))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(h.ready.value).toBe(true)
    expect(get).toHaveBeenCalledTimes(4)
  })

  it('卸载后迟到的失败不再安排新请求', async () => {
    let reject: (error: Error) => void = () => {}
    get.mockReturnValue(new Promise((_, rejectRequest) => (reject = rejectRequest)))
    const h = await harness()
    scope!.stop()
    reject(new Error('已卸载文档的迟到故障'))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(h.ready.value).toBe(false)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('复用全局初始化正在加载的目录，不并行发送第二份请求', async () => {
    let complete: (value: unknown) => void = () => {}
    get.mockReturnValue(new Promise(resolve => (complete = resolve)))
    const { loadMediaSources } = await import('../useMediaSources')
    const { loadModuleCatalog } = await import('../useModuleCatalog')
    const loading = Promise.all([loadMediaSources(), loadModuleCatalog()])
    const h = await harness()
    expect(get).toHaveBeenCalledTimes(2)
    complete({ modules: [] })
    await loading
    await vi.advanceTimersByTimeAsync(0)
    expect(h.ready.value).toBe(true)
    expect(get).toHaveBeenCalledTimes(2)
  })
})
