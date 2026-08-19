import { useGlobalOfflineStatus, type ConnectionFailureReason } from '@/composables/useOfflineStatus'
import { useServerConnectionProbe } from '@/composables/useServerConnectionProbe'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function createOfflineStatus() {
  const browserOnline = ref(true)
  const connectionReason = ref<ConnectionFailureReason | null>(null)
  const serverSuccessSequence = ref(0)
  const markConnectionChecking = vi.fn((reason?: ConnectionFailureReason) => {
    if (reason) connectionReason.value = reason
  })
  const markServerOffline = vi.fn()
  const markServerOnline = vi.fn()

  const offlineStatus = {
    browserOnline,
    connectionReason,
    markConnectionChecking,
    markServerOffline,
    markServerOnline,
    serverSuccessSequence,
  } as unknown as ReturnType<typeof useGlobalOfflineStatus>

  return { browserOnline, offlineStatus, serverSuccessSequence }
}

describe('useServerConnectionProbe', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('未登录时不探测，并用固定静默选项去重并发 ping', async () => {
    const isLoggedIn = ref(false)
    const pendingRequest = deferred<unknown>()
    const request = vi.fn(() => pendingRequest.promise)
    const probe = useServerConnectionProbe({
      isLoggedIn,
      isRestarting: ref(false),
      offlineStatus: createOfflineStatus().offlineStatus,
      request,
    })

    await expect(probe.probeServerConnection()).resolves.toBe(false)
    expect(request).not.toHaveBeenCalled()

    isLoggedIn.value = true
    const firstProbe = probe.probeServerConnection()
    const concurrentProbe = probe.probeServerConnection(true)

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('system/ping', {
      feedback: 'silent',
      skipNavigationCancellation: true,
      skipConnectionTracking: true,
      timeout: 8_000,
    })

    pendingRequest.resolve({})
    await expect(Promise.all([firstProbe, concurrentProbe])).resolves.toEqual([true, true])
  })

  it('普通失败先进入 checking，第二次失败才离线并按退避间隔重试', async () => {
    const { offlineStatus } = createOfflineStatus()
    const request = vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))
    const probe = useServerConnectionProbe({
      isLoggedIn: ref(true),
      isRestarting: ref(false),
      offlineStatus,
      request,
    })

    await expect(probe.probeServerConnection(true)).resolves.toBe(false)
    expect(offlineStatus.markConnectionChecking).toHaveBeenNthCalledWith(1, undefined)
    expect(offlineStatus.markConnectionChecking).toHaveBeenNthCalledWith(2, 'timeout')
    expect(offlineStatus.markServerOffline).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)

    await expect(probe.probeServerConnection()).resolves.toBe(false)
    expect(offlineStatus.markServerOffline).toHaveBeenCalledWith('timeout')
    expect(request).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(4_999)
    expect(request).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(request).toHaveBeenCalledTimes(3)

    probe.stopHeartbeat()
  })

  it('按浏览器状态区分离线原因，并在任意接口已成功时忽略迟到失败', async () => {
    const { browserOnline, offlineStatus, serverSuccessSequence } = createOfflineStatus()
    const pendingRequest = deferred<unknown>()
    const request = vi.fn(() => pendingRequest.promise)
    const probe = useServerConnectionProbe({
      isLoggedIn: ref(true),
      isRestarting: ref(false),
      offlineStatus,
      request,
    })

    browserOnline.value = false
    const pendingProbe = probe.probeServerConnection()
    serverSuccessSequence.value += 1
    pendingRequest.reject(new Error('offline'))

    await expect(pendingProbe).resolves.toBe(true)
    expect(offlineStatus.markConnectionChecking).not.toHaveBeenCalled()
    expect(offlineStatus.markServerOffline).not.toHaveBeenCalled()

    request.mockRejectedValueOnce(new Error('offline'))
    await expect(probe.probeServerConnection()).resolves.toBe(false)
    expect(offlineStatus.markConnectionChecking).toHaveBeenCalledWith('browser-offline')

    probe.stopHeartbeat()
  })

  it('探测期间退出登录时恢复在线状态且不安排重试', async () => {
    const isLoggedIn = ref(true)
    const pendingRequest = deferred<unknown>()
    const { offlineStatus } = createOfflineStatus()
    const probe = useServerConnectionProbe({
      isLoggedIn,
      isRestarting: ref(false),
      offlineStatus,
      request: () => pendingRequest.promise,
    })

    const pendingProbe = probe.probeServerConnection()
    isLoggedIn.value = false
    pendingRequest.reject(new Error('signed out'))

    await expect(pendingProbe).resolves.toBe(false)
    expect(offlineStatus.markServerOnline).toHaveBeenCalledOnce()
    expect(offlineStatus.markConnectionChecking).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('重启期间的失败不提示、不重试，也不累计到重启后的离线阈值', async () => {
    const isRestarting = ref(true)
    const { offlineStatus } = createOfflineStatus()
    const request = vi.fn().mockRejectedValue(new Error('restarting'))
    const probe = useServerConnectionProbe({
      isLoggedIn: ref(true),
      isRestarting,
      offlineStatus,
      request,
    })

    await probe.probeServerConnection()
    await probe.probeServerConnection()
    expect(offlineStatus.markConnectionChecking).not.toHaveBeenCalled()
    expect(offlineStatus.markServerOffline).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)

    isRestarting.value = false
    await probe.probeServerConnection()

    expect(offlineStatus.markConnectionChecking).toHaveBeenCalledWith('server-unreachable')
    expect(offlineStatus.markServerOffline).not.toHaveBeenCalled()
    probe.stopHeartbeat()
  })

  it('启动时立即探测并按五分钟心跳运行，在线恢复和停止都会清理等待任务', async () => {
    const request = vi.fn().mockResolvedValue({})
    const probe = useServerConnectionProbe({
      isLoggedIn: ref(true),
      isRestarting: ref(false),
      offlineStatus: createOfflineStatus().offlineStatus,
      request,
    })

    probe.startHeartbeat()
    await Promise.resolve()
    expect(request).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    expect(request).toHaveBeenCalledTimes(2)

    probe.startHeartbeat()
    await Promise.resolve()
    expect(request).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(0)

    request.mockRejectedValueOnce(new Error('offline'))
    await expect(probe.probeServerConnection()).resolves.toBe(false)
    expect(vi.getTimerCount()).toBe(2)

    probe.resetAfterServerOnline()
    expect(vi.getTimerCount()).toBe(1)
    probe.stopHeartbeat()
    expect(vi.getTimerCount()).toBe(0)
  })
})
