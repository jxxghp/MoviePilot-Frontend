import CacheView from '@/views/system/CacheView.vue'
import { screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    delete: vi.fn(),
    get: mocks.apiGet,
    post: vi.fn(),
  },
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: vi.fn(), warning: vi.fn() }),
}))

vi.mock('@/composables/usePWA', () => ({
  usePWA: () => ({ appMode: true }),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: vi.fn(),
}))

describe('CacheView data client contract', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.toastError.mockReset()
  })

  it('renders the unwrapped torrent cache data returned by the default API client', async () => {
    mocks.apiGet.mockResolvedValue({
      count: 1,
      sites: 1,
      data: [
        {
          domain: 'example.com',
          hash: 'cache-entry-1',
          media_name: '已识别媒体',
          site_name: '示例站点',
          size: 1024,
          title: '缓存直返条目',
        },
      ],
    })

    await renderWithProviders(CacheView, {
      global: {
        stubs: {
          VDataTable: {
            props: ['items'],
            template: '<div><span v-for="item in items" :key="item.hash">{{ item.title }}</span></div>',
          },
        },
      },
      initialState: {
        globalSettings: {
          data: { RECOGNIZE_SOURCE: 'themoviedb' },
        },
      },
    })

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('torrent/cache', { feedback: 'silent' }))
    expect(await screen.findByText('缓存直返条目')).toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})
