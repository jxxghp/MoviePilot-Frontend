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
  it('merges all APP channels into APP statistics, omits frontend versions, and hides versions below ten installs', async () => {
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === 'system/env') {
        return Promise.resolve({
          USAGE_STATISTIC_SHARE: true,
          VERSION: 'v3.2.0',
          FRONTEND_VERSION: 'v3.2.15',
        })
      }
      if (path === 'dashboard/processes') return Promise.resolve([])
      if (path === 'system/versions') return Promise.resolve([])
      if (path === 'site/supporting') return Promise.resolve({})
      if (path === 'system/usage/statistic') {
        return Promise.resolve({
          total_users: 120,
          ios_app_versions: [
            { version: 'ios-hidden', count: 9 },
            { version: 'v2.0.7', count: 4 },
            { version: '1.0.6', count: 10 },
          ],
          android_app_versions: [{ version: '2.0.7', count: 5 }],
          harmony_app_versions: [{ version: '2.0.7', count: 3 }],
          backend_versions: [
            { version: 'backend-hidden', count: 9 },
            { version: 'v3.2.0', count: 25 },
          ],
          frontend_versions: [
            { version: 'frontend-hidden', count: 0 },
            { version: 'frontend-should-not-render', count: 99 },
          ],
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

    expect(await screen.findByText('2.0.7')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('1.0.6')).toBeInTheDocument()
    expect(screen.queryByText('ios-hidden')).not.toBeInTheDocument()
    expect(screen.queryByText('backend-hidden')).not.toBeInTheDocument()
    expect(screen.queryByText('frontend-should-not-render')).not.toBeInTheDocument()
  })
})
