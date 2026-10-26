import { usePluginNativeSubscribe, type NativeSubscribe } from '@/composables/usePluginNativeSubscribe'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@/api', () => ({
  default: createDataApiMock({ get: mocks.get, post: mocks.post, delete: mocks.delete }),
  isApiRequestCancellation: () => false,
}))
vi.mock('vue-toastification', () => ({ useToast: () => ({ success: mocks.success, error: mocks.error }) }))

async function renderSubscribe() {
  let nativeSubscribe!: NativeSubscribe
  await renderWithProviders(
    defineComponent({
      setup() {
        nativeSubscribe = usePluginNativeSubscribe()
        return () => null
      },
    }),
    { initialState: { user: { permissions: { subscribe: true }, superUser: true } } },
  )
  return nativeSubscribe
}
const movie = (id: string) => ({
  media_id: id,
  media_source: 'themoviedb',
  title: `Movie ${id}`,
  type: '电影' as const,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockImplementation((url: string) => {
    if (url === 'subscribe/media/1') return { id: 100 }
    if (url.startsWith('subscribe/media/')) return {}
    if (url === 'mediaserver/exists') return {}
    if (url.startsWith('system/setting/')) return { value: {} }
    throw new Error(url)
  })
  mocks.post.mockResolvedValue({ id: 200 })
  mocks.delete.mockResolvedValue({})
})

describe('independent concurrent plugin subscriptions', () => {
  it('keeps the subscribed movie identity when an older state lookup finishes after another movie', async () => {
    let release!: (value: unknown) => void
    mocks.get.mockImplementation((url: string, options?: { params?: { media_id?: string } }) => {
      if (url === 'subscribe/media/1') return { id: 100 }
      if (url.startsWith('subscribe/media/')) return {}
      if (url === 'mediaserver/exists' && options?.params?.media_id === '1')
        return new Promise(resolve => {
          release = resolve
        })
      if (url === 'mediaserver/exists') return {}
      return { value: {} }
    })
    const subscribe = await renderSubscribe()
    const a = subscribe(movie('1'))
    await subscribe(movie('2'))
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('subscribe/', expect.objectContaining({ media_id: '2' })),
    )
    release({})
    await a
    await fireEvent.click(await screen.findByRole('button', { name: '确认' }))
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('subscribe/media/1', expect.anything()))
    expect(mocks.delete).not.toHaveBeenCalledWith('subscribe/media/2', expect.anything())
  })

  it('keeps an already-open confirmation bound to its movie while another operation starts', async () => {
    const subscribe = await renderSubscribe()
    await subscribe(movie('1'))
    const confirm = await screen.findByRole('button', { name: '确认' })
    await subscribe(movie('2'))
    await fireEvent.click(confirm)
    await waitFor(() => expect(mocks.delete).toHaveBeenCalledWith('subscribe/media/1', expect.anything()))
    expect(mocks.delete).not.toHaveBeenCalledWith('subscribe/media/2', expect.anything())
    expect(mocks.post).toHaveBeenCalledWith('subscribe/', expect.objectContaining({ media_id: '2' }))
  })
})
