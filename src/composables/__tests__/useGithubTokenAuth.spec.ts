import { useGithubTokenAuth } from '@/composables/useGithubTokenAuth'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ post: vi.fn(), changed: vi.fn() }))
vi.mock('@/api', () => ({
  default: { post: mocks.post },
  getApiBusinessErrorMessage: () => '',
}))
vi.mock('@/composables/useCommunityContribution', () => ({ notifyCommunityAuthChanged: mocks.changed }))

function mountAuth() {
  let auth!: ReturnType<typeof useGithubTokenAuth>
  const wrapper = mount(
    defineComponent({
      setup() {
        auth = useGithubTokenAuth('settings')
        return () => h('div')
      },
    }),
  )
  return { auth, wrapper }
}

const session = (id: string) => ({
  session_id: id,
  verification_uri: 'https://github.com/login/device',
  user_code: id,
  expires_in: 600,
  interval_seconds: 5,
})

describe('GitHub 授权取消与生命周期', () => {
  beforeEach(() => {
    mocks.post.mockReset()
    mocks.changed.mockReset()
  })

  it.each(['cancel', 'unmount'])('准备请求在 %s 后返回时不恢复会话或打开授权页', async action => {
    let resolve!: (value: unknown) => void
    mocks.post.mockImplementation(
      () =>
        new Promise(done => {
          resolve = done
        }),
    )
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const { auth, wrapper } = mountAuth()
    const pending = auth.startAuth()
    if (action === 'cancel') auth.cancelAuth()
    else wrapper.unmount()
    resolve(session('cancelled'))
    if (await pending) {
      auth.openAuthPage()
      void auth.pollAuth()
    }
    expect(auth.session.value).toBeNull()
    expect(open).not.toHaveBeenCalled()
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(auth.loading.value).toBe(false)
    if (wrapper.exists()) wrapper.unmount()
  })

  it('旧轮询的成功回执不清除新会话，也不发出授权成功事件', async () => {
    let finishPoll!: (value: unknown) => void
    mocks.post
      .mockResolvedValueOnce(session('old'))
      .mockImplementationOnce(
        () =>
          new Promise(done => {
            finishPoll = done
          }),
      )
      .mockResolvedValueOnce(session('new'))
    const { auth, wrapper } = mountAuth()
    await auth.startAuth()
    const pending = auth.pollAuth()
    auth.cancelAuth()
    await auth.startAuth()
    finishPoll({ state: 'authorized', status: { configured: true }, message: '', retry_after: null })
    await pending
    expect(auth.session.value?.session_id).toBe('new')
    expect(auth.status.value).toBeNull()
    expect(mocks.changed).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('重新准备授权时中止旧请求，旧失败不会结束新请求的 loading', async () => {
    const pending: Array<{ resolve: (value: unknown) => void; reject: (error: Error) => void }> = []
    mocks.post.mockImplementation(() => new Promise((resolve, reject) => pending.push({ resolve, reject })))
    const { auth, wrapper } = mountAuth()
    const first = auth.startAuth()
    const oldSignal = mocks.post.mock.calls[0][2].signal as AbortSignal
    const second = auth.startAuth()
    expect(oldSignal.aborted).toBe(true)
    pending[0].reject(new Error('old request failed'))
    expect(await first).toBe(false)
    expect(auth.loading.value).toBe(true)
    expect(auth.error.value).toBe('')
    pending[1].resolve(session('new'))
    expect(await second).toBe(true)
    expect(auth.session.value?.session_id).toBe('new')
    wrapper.unmount()
  })

  it('活动会话继续按服务端间隔轮询并正常完成授权', async () => {
    vi.useFakeTimers()
    mocks.post
      .mockResolvedValueOnce(session('active'))
      .mockResolvedValueOnce({ state: 'pending', status: null, message: '', retry_after: 2 })
      .mockResolvedValueOnce({ state: 'authorized', status: { configured: true }, message: '', retry_after: null })
    const { auth, wrapper } = mountAuth()
    expect(await auth.startAuth()).toBe(true)
    await auth.pollAuth()
    await vi.advanceTimersByTimeAsync(2000)
    expect(mocks.post).toHaveBeenCalledTimes(3)
    expect(auth.session.value).toBeNull()
    expect(auth.status.value?.configured).toBe(true)
    expect(mocks.changed).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
})
