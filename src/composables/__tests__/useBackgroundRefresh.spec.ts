import { useBackground } from '@/composables/useBackground'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addBackgroundTimer: vi.fn(),
  removeBackgroundTimer: vi.fn(),
}))

vi.mock('@/utils/backgroundManager', () => ({
  addBackgroundTimer: mocks.addBackgroundTimer,
  removeBackgroundTimer: mocks.removeBackgroundTimer,
}))

const wrappers: VueWrapper[] = []

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

async function settle() {
  await nextTick()
  await flushPromises()
  await nextTick()
}

function mountComposable<T>(createComposable: () => T) {
  let result!: T
  const Harness = defineComponent({
    name: 'UseBackgroundRefreshHarness',
    setup() {
      result = createComposable()
      return () => h('div')
    },
  })
  const wrapper = mount(Harness)
  wrappers.push(wrapper)

  return { result, wrapper }
}

describe('useBackground useTimer', () => {
  beforeEach(() => {
    mocks.addBackgroundTimer.mockReset()
    mocks.removeBackgroundTimer.mockReset()
  })

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  })

  it('在组件挂载后注册带完整选项的后台定时器', async () => {
    const callback = vi.fn()
    mountComposable(() =>
      useBackground().useTimer('timer-a', callback, 1000, {
        runInBackground: true,
        skipInitialRun: true,
      }),
    )

    await nextTick()

    expect(mocks.addBackgroundTimer).toHaveBeenCalledOnce()
    expect(mocks.addBackgroundTimer).toHaveBeenCalledWith('timer-a', callback, 1000, {
      runInBackground: true,
      skipInitialRun: true,
    })
  })

  it('在组件卸载时移除后台定时器', async () => {
    const { wrapper } = mountComposable(() => useBackground().useTimer('timer-b', vi.fn(), 2000))
    await nextTick()
    mocks.removeBackgroundTimer.mockClear()

    wrapper.unmount()

    expect(mocks.removeBackgroundTimer).toHaveBeenCalledOnce()
    expect(mocks.removeBackgroundTimer).toHaveBeenCalledWith('timer-b')
  })

  it('暴露手动移除定时器的操作', async () => {
    const { result } = mountComposable(() => useBackground().useTimer('timer-c', vi.fn(), 3000))
    await nextTick()
    mocks.removeBackgroundTimer.mockClear()

    result.remove()

    expect(mocks.removeBackgroundTimer).toHaveBeenCalledOnce()
    expect(mocks.removeBackgroundTimer).toHaveBeenCalledWith('timer-c')
  })
})

describe('useBackground useDataRefresh', () => {
  beforeEach(() => {
    mocks.addBackgroundTimer.mockReset()
    mocks.removeBackgroundTimer.mockReset()
  })

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  })

  it('immediate 模式先完成首轮加载，再注册跳过初始执行的定时器', async () => {
    const loadData = vi.fn().mockResolvedValue(undefined)
    mountComposable(() => useBackground().useDataRefresh('data-a', loadData, 4000, true))

    expect(loadData).toHaveBeenCalledOnce()
    expect(mocks.addBackgroundTimer).not.toHaveBeenCalled()

    await settle()

    expect(mocks.addBackgroundTimer).toHaveBeenCalledWith('data-a', expect.any(Function), 4000, {
      runInBackground: false,
      skipInitialRun: true,
    })
  })

  it('非 immediate 模式直接注册定时器且不执行首轮加载', async () => {
    const loadData = vi.fn().mockResolvedValue(undefined)
    mountComposable(() => useBackground().useDataRefresh('data-b', loadData, 5000, false))

    await nextTick()

    expect(loadData).not.toHaveBeenCalled()
    expect(mocks.addBackgroundTimer).toHaveBeenCalledWith('data-b', expect.any(Function), 5000, {
      runInBackground: false,
      skipInitialRun: true,
    })
  })

  it('并发 refresh 只允许一个加载执行，并在完成后释放 loading', async () => {
    const pending = deferred()
    const loadData = vi.fn(() => pending.promise)
    const { result } = mountComposable(() => useBackground().useDataRefresh('data-c', loadData, 6000, false))
    await nextTick()

    const firstRefresh = result.refresh()
    const secondRefresh = result.refresh()

    expect(loadData).toHaveBeenCalledOnce()
    expect(result.loading.value).toBe(true)

    pending.resolve()
    await Promise.all([firstRefresh, secondRefresh])

    expect(result.loading.value).toBe(false)
  })

  it('收口加载错误并恢复 loading 状态', async () => {
    const error = new Error('load failed')
    const loadData = vi.fn().mockRejectedValue(error)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = mountComposable(() => useBackground().useDataRefresh('data-d', loadData, 7000, false))
    await nextTick()

    await expect(result.refresh()).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalledWith('数据刷新失败 [data-d]:', error)
    expect(result.loading.value).toBe(false)
  })

  it('暴露 stop 操作并在卸载时清理定时器', async () => {
    const { result, wrapper } = mountComposable(() => useBackground().useDataRefresh('data-e', vi.fn(), 8000, false))
    await nextTick()
    mocks.removeBackgroundTimer.mockClear()

    result.stop()
    expect(mocks.removeBackgroundTimer).toHaveBeenCalledWith('data-e')

    mocks.removeBackgroundTimer.mockClear()
    wrapper.unmount()
    expect(mocks.removeBackgroundTimer).toHaveBeenCalledOnce()
    expect(mocks.removeBackgroundTimer).toHaveBeenCalledWith('data-e')
  })

  it('首轮异步加载未完成时卸载，完成后不得重新注册定时器', async () => {
    const initialLoad = deferred()
    const loadData = vi.fn(() => initialLoad.promise)
    const { wrapper } = mountComposable(() => useBackground().useDataRefresh('data-race', loadData, 9000, true))

    expect(loadData).toHaveBeenCalledOnce()
    wrapper.unmount()

    initialLoad.resolve()
    await settle()

    expect(mocks.addBackgroundTimer).not.toHaveBeenCalled()
  })

  it('首轮异步加载未完成时 stop，完成后不得重新注册定时器', async () => {
    const initialLoad = deferred()
    const loadData = vi.fn(() => initialLoad.promise)
    const { result } = mountComposable(() => useBackground().useDataRefresh('data-stop-race', loadData, 9000, true))

    expect(loadData).toHaveBeenCalledOnce()
    result.stop()

    initialLoad.resolve()
    await settle()

    expect(mocks.addBackgroundTimer).not.toHaveBeenCalled()
  })
})

describe('useBackground useConditionalDataRefresh', () => {
  beforeEach(() => {
    mocks.addBackgroundTimer.mockReset()
    mocks.removeBackgroundTimer.mockReset()
  })

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  })

  it.each([
    [true, true, true],
    [true, false, true],
    [false, true, false],
    [false, false, false],
  ])('根据初始 condition=%s 决定是否注册定时器（immediate=%s）', async (conditionValue, immediate, shouldStart) => {
    const condition = ref(conditionValue)
    const { result } = mountComposable(() =>
      useBackground().useConditionalDataRefresh('conditional-initial', vi.fn(), condition, 1000, immediate),
    )

    await nextTick()

    expect(mocks.addBackgroundTimer).toHaveBeenCalledTimes(shouldStart ? 1 : 0)
    expect(result.isActive.value).toBe(shouldStart)
    if (shouldStart) {
      expect(mocks.addBackgroundTimer).toHaveBeenCalledWith('conditional-initial', expect.any(Function), 1000, {
        runInBackground: false,
        skipInitialRun: !immediate,
      })
    }
  })

  it('随 condition 切换启动和停止定时器', async () => {
    const condition = ref(false)
    const { result } = mountComposable(() =>
      useBackground().useConditionalDataRefresh('conditional-toggle', vi.fn(), condition),
    )
    await nextTick()

    condition.value = true
    await nextTick()
    expect(mocks.addBackgroundTimer).toHaveBeenCalledOnce()
    expect(result.isActive.value).toBe(true)

    condition.value = false
    await nextTick()
    expect(mocks.removeBackgroundTimer).toHaveBeenCalledOnce()
    expect(mocks.removeBackgroundTimer).toHaveBeenCalledWith('conditional-toggle')
    expect(result.isActive.value).toBe(false)
  })

  it('start 和 stop 具有幂等性', async () => {
    const condition = ref(true)
    const { result } = mountComposable(() =>
      useBackground().useConditionalDataRefresh('conditional-idempotent', vi.fn(), condition),
    )
    await nextTick()

    result.stop()
    mocks.addBackgroundTimer.mockClear()
    mocks.removeBackgroundTimer.mockClear()

    result.start()
    result.start()
    expect(mocks.addBackgroundTimer).toHaveBeenCalledOnce()

    result.stop()
    result.stop()
    expect(mocks.removeBackgroundTimer).toHaveBeenCalledOnce()
  })

  it('仅在 condition 为 true 时允许 refresh，并保持单飞行为', async () => {
    const condition = ref(false)
    const pending = deferred()
    const loadData = vi.fn(() => pending.promise)
    const { result } = mountComposable(() =>
      useBackground().useConditionalDataRefresh('conditional-refresh', loadData, condition, 1000, false),
    )
    await nextTick()

    await result.refresh()
    expect(loadData).not.toHaveBeenCalled()

    condition.value = true
    const firstRefresh = result.refresh()
    const secondRefresh = result.refresh()
    expect(loadData).toHaveBeenCalledOnce()
    expect(result.loading.value).toBe(true)

    pending.resolve()
    await Promise.all([firstRefresh, secondRefresh])
    expect(result.loading.value).toBe(false)
  })

  it('收口错误并在卸载时清理活动定时器', async () => {
    const condition = ref(true)
    const error = new Error('conditional load failed')
    const loadData = vi.fn().mockRejectedValue(error)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result, wrapper } = mountComposable(() =>
      useBackground().useConditionalDataRefresh('conditional-error', loadData, condition),
    )
    await nextTick()

    await expect(result.refresh()).resolves.toBeUndefined()
    expect(consoleError).toHaveBeenCalledWith('条件数据刷新失败 [conditional-error]:', error)
    expect(result.loading.value).toBe(false)

    mocks.removeBackgroundTimer.mockClear()
    wrapper.unmount()
    expect(mocks.removeBackgroundTimer).toHaveBeenCalledOnce()
    expect(mocks.removeBackgroundTimer).toHaveBeenCalledWith('conditional-error')
  })
})
