import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import AboutDialog from '@/components/dialog/AboutDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: mocks.apiGet,
  },
}))

vi.mock('@/composables/useVersionChecker', () => ({
  clearCacheAndReload: vi.fn(),
}))

const DialogStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  },
})

describe('AboutDialog version statistics', () => {
  it('hides backend and frontend versions with fewer than ten installations', async () => {
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/env') {
        return Promise.resolve({
          data: {
            USAGE_STATISTIC_SHARE: true,
            VERSION: 'v2.0.0',
            FRONTEND_VERSION: 'v2.0.0',
          },
        })
      }
      if (path === 'dashboard/processes') return Promise.resolve([])
      if (path === 'system/versions') return Promise.resolve({ data: [] })
      if (path === 'site/supporting') return Promise.resolve({})
      if (path === 'system/usage/statistic') {
        return Promise.resolve({
          data: {
            backend_versions: [
              { version: 'backend-hidden', count: 9 },
              { version: 'backend-visible', count: 10 },
            ],
            frontend_versions: [
              { version: 'frontend-hidden', count: 0 },
              { version: 'frontend-visible', count: 11 },
            ],
          },
        })
      }
      return Promise.reject(new Error(`Unexpected API path: ${path}`))
    })

    const { container } = await renderWithProviders(AboutDialog, {
      global: {
        components: { VDialogCloseBtn: DialogCloseBtn },
        stubs: { VDialog: DialogStub },
      },
    })
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('system/env'))

    await waitFor(() => expect(container.querySelector('button.flex-shrink-0')).toBeTruthy())
    const statisticButton = container.querySelector<HTMLButtonElement>('button.flex-shrink-0')
    await fireEvent.click(statisticButton!)

    expect(await screen.findByText('backend-visible')).toBeInTheDocument()
    expect(screen.getByText('frontend-visible')).toBeInTheDocument()
    expect(screen.queryByText('backend-hidden')).not.toBeInTheDocument()
    expect(screen.queryByText('frontend-hidden')).not.toBeInTheDocument()
  })
})
