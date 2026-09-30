import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  toastInfo: vi.fn(),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ info: mocks.toastInfo }),
}))

describe('useVersionChecker', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.toastInfo.mockClear()
  })

  it.each(['v3.0.9', 'v3.0.10', 'v2.99.99', __APP_VERSION__, __APP_VERSION__.replace(/^v/, '')])(
    '浏览器版本不低于服务端 %s 时不提示或检查 Service Worker',
    async deployed => {
      const { useVersionChecker } = await import('@/composables/useVersionChecker')
      await useVersionChecker().checkVersion(deployed)
      expect(mocks.toastInfo).not.toHaveBeenCalled()
    },
  )

  it('服务端版本较新时仍提示更新', async () => {
    const { useVersionChecker } = await import('@/composables/useVersionChecker')
    await useVersionChecker().checkVersion('v99.0.0')
    expect(mocks.toastInfo).toHaveBeenCalledOnce()
  })

  it('没有可用 Service Worker 时保留版本不一致的清缓存兜底', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { useVersionChecker } = await import('@/composables/useVersionChecker')
    const { checkVersion } = useVersionChecker()

    await checkVersion('version-that-never-matches-the-build')

    expect(mocks.toastInfo).toHaveBeenCalledOnce()
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          message: expect.any(String),
          onRefresh: expect.any(Function),
          refreshText: expect.any(String),
        }),
      }),
      expect.objectContaining({
        closeButton: false,
        closeOnClick: false,
        draggable: false,
        timeout: false,
      }),
    )
    expect(consoleLog.mock.calls).toEqual([
      [expect.stringMatching(/^\[VersionChecker\] 检测到版本不一致:/)],
      ['[VersionChecker] 无 Service Worker, 直接显示通知'],
    ])
  })
})
