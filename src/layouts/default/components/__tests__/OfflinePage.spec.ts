import OfflinePage from '@/layouts/default/components/OfflinePage.vue'
import { useGlobalOfflineStatus } from '@/composables/useOfflineStatus'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  isRestarting: { value: false },
  warning: vi.fn(),
}))

vi.mock('@/composables/useSystemRestart', () => ({
  useSystemRestartStatus: () => ({ isRestarting: mocks.isRestarting }),
}))

vi.mock('vue-i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.error, warning: mocks.warning }),
}))

describe('OfflinePage', () => {
  const status = useGlobalOfflineStatus()
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    mocks.error.mockReset()
    mocks.warning.mockReset()
    mocks.isRestarting.value = false
    status.markServerOnline()
    wrapper = mount(OfflinePage)
  })

  afterEach(() => {
    wrapper?.unmount()
    status.markServerOnline()
  })

  it('同一轮 checking 状态只提示一次，并使用非阻断警告', async () => {
    status.markConnectionChecking('network-error')
    await nextTick()

    expect(mocks.warning).toHaveBeenCalledWith('app.connectionChecking：app.connectionCheckingMessage', {
      timeout: 5000,
    })

    status.markConnectionChecking('timeout')
    await nextTick()

    expect(mocks.warning).toHaveBeenCalledTimes(1)
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it('按离线原因显示错误，并允许不同离线状态分别提示', async () => {
    status.markServerOffline('timeout')
    await nextTick()

    expect(mocks.error).toHaveBeenNthCalledWith(1, 'app.serviceUnavailable：app.serviceTimeoutMessage', {
      timeout: 7000,
    })

    status.markServerOffline('browser-offline')
    await nextTick()

    expect(mocks.error).toHaveBeenNthCalledWith(2, 'app.serviceUnavailable：app.browserOfflineMessage', {
      timeout: 7000,
    })

    status.markServerOffline('server-unreachable')
    await nextTick()

    expect(mocks.error).toHaveBeenNthCalledWith(3, 'app.serviceUnavailable：app.serviceUnavailableMessage', {
      timeout: 7000,
    })
    expect(mocks.warning).not.toHaveBeenCalled()
  })

  it('在线恢复后允许下一轮 checking 再次提示', async () => {
    status.markConnectionChecking()
    await nextTick()
    expect(mocks.warning).toHaveBeenCalledTimes(1)

    status.markServerOnline()
    await nextTick()
    status.markConnectionChecking()
    await nextTick()

    expect(mocks.warning).toHaveBeenCalledTimes(2)
  })

  it('重启期间不提示，但在线恢复仍清空上一轮去重状态', async () => {
    status.markConnectionChecking()
    await nextTick()
    expect(mocks.warning).toHaveBeenCalledTimes(1)

    mocks.isRestarting.value = true
    status.markServerOffline('timeout')
    await nextTick()
    expect(mocks.error).not.toHaveBeenCalled()
    expect(mocks.warning).toHaveBeenCalledTimes(1)

    status.markServerOnline()
    await nextTick()
    expect(mocks.error).not.toHaveBeenCalled()
    expect(mocks.warning).toHaveBeenCalledTimes(1)

    mocks.isRestarting.value = false
    status.markConnectionChecking()
    await nextTick()

    expect(mocks.warning).toHaveBeenCalledTimes(2)
  })
})
