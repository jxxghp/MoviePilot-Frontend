import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { KeepAlive, defineComponent, h, nextTick, onActivated, ref, type Ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useKeepAliveRefresh, type KeepAliveRefreshContext } from '@/composables/useKeepAliveRefresh'

type RefreshHandler = (context?: KeepAliveRefreshContext) => void | Promise<void>

interface RefreshHarnessOptions {
  active?: boolean
  refreshOnActivated?: boolean
  refreshOnTabActivated?: boolean
  refresh?: RefreshHandler
  activateSetsActive?: boolean
}

interface RefreshHarness {
  wrapper: VueWrapper
  active: Ref<boolean>
  show: Ref<boolean>
  refresh: ReturnType<typeof vi.fn>
  manualRefresh: (context?: KeepAliveRefreshContext) => Promise<void>
}

const wrappers: VueWrapper[] = []

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
})

async function settle() {
  await nextTick()
  await flushPromises()
  await nextTick()
  await flushPromises()
}

function createRefreshHarness(options: RefreshHarnessOptions = {}): RefreshHarness {
  const active = ref(options.active ?? true)
  const show = ref(true)
  const refresh = vi.fn(options.refresh ?? (() => undefined))
  let manualRefresh: RefreshHarness['manualRefresh'] = async () => undefined

  const Page = defineComponent({
    name: 'KeepAliveRefreshPage',
    setup() {
      manualRefresh = useKeepAliveRefresh(refresh, {
        active: options.active === undefined ? undefined : active,
        refreshOnActivated: options.refreshOnActivated,
        refreshOnTabActivated: options.refreshOnTabActivated,
      }).refresh

      if (options.activateSetsActive) {
        let activationCount = 0
        onActivated(() => {
          activationCount += 1
          if (activationCount === 2) active.value = true
        })
      }

      return () => h('div', 'keep-alive-refresh-page')
    },
  })

  const Host = defineComponent({
    name: 'KeepAliveRefreshHost',
    setup() {
      return () => h(KeepAlive, null, { default: () => (show.value ? h(Page) : null) })
    },
  })

  const wrapper = mount(Host)
  wrappers.push(wrapper)

  return { wrapper, active, show, refresh, manualRefresh }
}

async function deactivateAndReactivate(show: Ref<boolean>) {
  show.value = false
  await nextTick()
  show.value = true
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('useKeepAliveRefresh', () => {
  it('does not refresh during ordinary KeepAlive mount or its first activation', async () => {
    const harness = createRefreshHarness()

    await settle()

    expect(harness.refresh).not.toHaveBeenCalled()
  })

  it('refreshes on the second KeepAlive activation with the activated context', async () => {
    const harness = createRefreshHarness()

    await settle()
    await deactivateAndReactivate(harness.show)
    await settle()

    expect(harness.refresh).toHaveBeenCalledTimes(1)
    expect(harness.refresh).toHaveBeenCalledWith({ silent: true, source: 'activated' })
  })

  it('blocks inactive refreshes and refreshes once when a mounted tab becomes active', async () => {
    const harness = createRefreshHarness({ active: false })

    await settle()
    await harness.manualRefresh()
    await deactivateAndReactivate(harness.show)
    await settle()

    expect(harness.refresh).not.toHaveBeenCalled()

    harness.active.value = true
    await settle()

    expect(harness.refresh).toHaveBeenCalledTimes(1)
    expect(harness.refresh).toHaveBeenCalledWith({ silent: true, source: 'tab' })
  })

  it('can disable refreshes on KeepAlive activation', async () => {
    const harness = createRefreshHarness({ refreshOnActivated: false })

    await settle()
    await deactivateAndReactivate(harness.show)
    await settle()

    expect(harness.refresh).not.toHaveBeenCalled()
  })

  it('can disable refreshes on tab activation', async () => {
    const harness = createRefreshHarness({ active: false, refreshOnTabActivated: false })

    await settle()
    harness.active.value = true
    await settle()

    expect(harness.refresh).not.toHaveBeenCalled()
  })

  it('coalesces KeepAlive and tab activation in the same tick', async () => {
    const harness = createRefreshHarness({ active: false, activateSetsActive: true })

    await settle()
    await deactivateAndReactivate(harness.show)
    await settle()

    expect(harness.refresh).toHaveBeenCalledTimes(1)
    expect(harness.refresh).toHaveBeenCalledWith({ silent: true, source: 'activated' })
  })

  it('exposes manual refresh with a default context and preserves an explicit context', async () => {
    const harness = createRefreshHarness()

    await settle()
    await harness.manualRefresh()
    await harness.manualRefresh({ silent: false, source: 'tab' })

    expect(harness.refresh.mock.calls).toEqual([
      [{ silent: true, source: 'manual' }],
      [{ silent: false, source: 'tab' }],
    ])
  })

  it('coalesces concurrent refreshes into at most one pending follow-up', async () => {
    const first = deferred()
    const second = deferred()
    const harness = createRefreshHarness({
      refresh: vi
        .fn<RefreshHandler>()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise),
    })

    await settle()
    const initialRefresh = harness.manualRefresh({ silent: true, source: 'activated' })
    const pendingRefresh = harness.manualRefresh({ silent: false, source: 'tab' })
    const duplicatePendingRefresh = harness.manualRefresh({ silent: true, source: 'manual' })

    await pendingRefresh
    await duplicatePendingRefresh
    expect(harness.refresh).toHaveBeenCalledTimes(1)

    first.resolve()
    await vi.waitFor(() => expect(harness.refresh).toHaveBeenCalledTimes(2))
    expect(harness.refresh).toHaveBeenCalledTimes(2)
    expect(harness.refresh).toHaveBeenNthCalledWith(2, { silent: true, source: 'manual' })

    second.resolve()
    await initialRefresh
    await settle()
    expect(harness.refresh).toHaveBeenCalledTimes(2)
  })

  it('uses the context that triggered a pending follow-up', async () => {
    const first = deferred()
    const second = deferred()
    const harness = createRefreshHarness({
      refresh: vi
        .fn<RefreshHandler>()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise),
    })

    await settle()
    const initialRefresh = harness.manualRefresh({ silent: true, source: 'activated' })
    await Promise.resolve()
    const pendingRefresh = harness.manualRefresh({ silent: false, source: 'tab' })

    first.resolve()
    await vi.waitFor(() => expect(harness.refresh).toHaveBeenCalledTimes(2))
    expect(harness.refresh).toHaveBeenNthCalledWith(2, { silent: false, source: 'tab' })

    second.resolve()
    await pendingRefresh
    await initialRefresh
  })

  it('does not permanently retain pending state after a failed follow-up', async () => {
    const first = deferred()
    const second = deferred()
    const harness = createRefreshHarness({
      refresh: vi
        .fn<RefreshHandler>()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise)
        .mockImplementationOnce(() => undefined),
    })

    await settle()
    const initialRefresh = harness.manualRefresh({ silent: true, source: 'activated' })
    const pendingRefresh = harness.manualRefresh({ silent: false, source: 'tab' })

    first.resolve()
    await vi.waitFor(() => expect(harness.refresh).toHaveBeenCalledTimes(2))
    second.reject(new Error('follow-up failed'))

    await expect(initialRefresh).rejects.toThrow('follow-up failed')
    await pendingRefresh

    await harness.manualRefresh({ silent: true, source: 'manual' })
    expect(harness.refresh).toHaveBeenCalledTimes(3)
    expect(harness.refresh).toHaveBeenNthCalledWith(3, { silent: true, source: 'manual' })
  })

  it('skips a pending follow-up when the tab becomes inactive first', async () => {
    const first = deferred()
    const harness = createRefreshHarness({
      active: true,
      refresh: vi.fn<RefreshHandler>().mockImplementationOnce(() => first.promise),
    })

    await settle()
    const initialRefresh = harness.manualRefresh({ silent: true, source: 'manual' })
    const pendingRefresh = harness.manualRefresh({ silent: true, source: 'tab' })
    harness.active.value = false

    first.resolve()
    await initialRefresh
    await pendingRefresh
    await settle()

    expect(harness.refresh).toHaveBeenCalledTimes(1)
  })
})
