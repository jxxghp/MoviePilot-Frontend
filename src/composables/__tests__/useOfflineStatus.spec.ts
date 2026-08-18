import { useGlobalOfflineStatus, useOfflineStatus } from '@/composables/useOfflineStatus'
import { beforeEach, describe, expect, it } from 'vitest'

describe('useOfflineStatus', () => {
  const status = useGlobalOfflineStatus()

  beforeEach(() => {
    status.markServerOnline()
  })

  it('在所有消费者之间共享连接状态，并为组件暴露只读操作边界', () => {
    const anotherGlobalStatus = useGlobalOfflineStatus()
    const componentStatus = useOfflineStatus()

    expect(anotherGlobalStatus.connectionStatus).toBe(status.connectionStatus)
    expect(anotherGlobalStatus.connectionReason).toBe(status.connectionReason)
    expect(componentStatus.connectionReason).toBe(status.connectionReason)
    expect(componentStatus).not.toHaveProperty('markServerOffline')

    status.markServerOffline('timeout')
    expect(componentStatus.isOnline.value).toBe(false)
    expect(componentStatus.isChecking.value).toBe(false)
    expect(componentStatus.isOffline.value).toBe(true)
    expect(componentStatus.canPerformNetworkAction.value).toBe(false)

    const initialCheckRequestId = status.connectionCheckRequestId.value
    componentStatus.requestConnectionCheck('network-error')
    expect(status.connectionStatus.value).toBe('checking')
    expect(status.connectionReason.value).toBe('network-error')
    expect(status.connectionCheckRequestId.value).toBe(initialCheckRequestId + 1)
  })

  it('区分待确认与离线状态，并只在确认离线后阻断网络操作', () => {
    status.markConnectionChecking('timeout')

    expect(status.connectionStatus.value).toBe('checking')
    expect(status.connectionReason.value).toBe('timeout')
    expect(status.isOnline.value).toBe(false)
    expect(status.isChecking.value).toBe(true)
    expect(status.isOffline.value).toBe(false)
    expect(status.canPerformNetworkAction.value).toBe(true)

    status.markServerOffline()

    expect(status.connectionStatus.value).toBe('offline')
    expect(status.connectionReason.value).toBe('server-unreachable')
    expect(status.isOffline.value).toBe(true)
    expect(status.canPerformNetworkAction.value).toBe(false)

    status.markServerOnline()

    expect(status.connectionStatus.value).toBe('online')
    expect(status.connectionReason.value).toBeNull()
    expect(status.isOnline.value).toBe(true)
    expect(status.canPerformNetworkAction.value).toBe(true)
  })

  it('为网络错误和主动检查递增探测序列，并为成功响应递增恢复序列', () => {
    const initialCheckRequestId = status.connectionCheckRequestId.value
    const initialSuccessSequence = status.serverSuccessSequence.value

    status.reportNetworkError()
    expect(status.connectionStatus.value).toBe('checking')
    expect(status.connectionReason.value).toBe('network-error')
    expect(status.connectionCheckRequestId.value).toBe(initialCheckRequestId + 1)

    status.requestConnectionCheck('browser-offline')
    expect(status.connectionReason.value).toBe('browser-offline')
    expect(status.connectionCheckRequestId.value).toBe(initialCheckRequestId + 2)

    status.requestConnectionCheck()
    expect(status.connectionReason.value).toBe('browser-offline')
    expect(status.connectionCheckRequestId.value).toBe(initialCheckRequestId + 3)

    status.markServerOnline()
    expect(status.serverSuccessSequence.value).toBe(initialSuccessSequence + 1)
  })
})
