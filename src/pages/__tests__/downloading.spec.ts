import DownloadingPage from '@/pages/downloading.vue'
import { fireEvent, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { computed, defineComponent, h, unref, type ComputedRef } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appMode: false,
  apiGet: vi.fn(),
  openSharedDialog: vi.fn(),
  registerHeaderTab: vi.fn(),
  useDynamicButton: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
  },
}))

vi.mock('@/composables/useDynamicHeaderTab', () => ({
  useDynamicHeaderTab: () => ({ registerHeaderTab: mocks.registerHeaderTab }),
}))

vi.mock('@/composables/useDynamicButton', () => ({
  useDynamicButton: (options: unknown) => mocks.useDynamicButton(options),
}))

vi.mock('@/composables/usePWA', () => ({
  usePWA: () => ({ appMode: computed(() => mocks.appMode) }),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

vi.mock('@/composables/useKeepAliveRefresh', () => ({
  useKeepAliveRefresh: vi.fn(),
}))

const DownloadingListViewStub = defineComponent({
  name: 'DownloadingListView',
  props: {
    active: Boolean,
    name: String,
    type: String,
  },
  setup(props) {
    return () => h('div', `${props.name}:${props.type}:${props.active}`)
  },
})

async function renderPage(appMode: boolean) {
  mocks.appMode = appMode
  mocks.apiGet.mockResolvedValue([{ name: 'qb-main', type: 'qbittorrent' }])
  return renderWithProviders(DownloadingPage, {
    initialRoute: '/downloading',
    global: {
      stubs: {
        DownloadingListView: DownloadingListViewStub,
        NoDataFound: true,
      },
    },
  })
}

function getDynamicButtonConfig() {
  const config = mocks.useDynamicButton.mock.calls.at(-1)?.[0]
  if (!config) throw new Error('Dynamic button was not registered')
  return config as {
    icon: string
    color?: string
    onClick: () => void
    permission: string
    show: ComputedRef<boolean>
  }
}

describe('Downloading page history action', () => {
  beforeEach(() => {
    mocks.appMode = false
    mocks.apiGet.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.registerHeaderTab.mockReset()
    mocks.useDynamicButton.mockReset()
  })

  it('renders a compact desktop FAB that opens download history', async () => {
    await renderPage(false)

    await waitFor(() => expect(document.body).toHaveTextContent('qb-main:qbittorrent:true'))
    await waitFor(() => expect(document.querySelector('.compact-fab button')).toBeInTheDocument())
    expect(document.querySelector('.compact-fab--primary')).toBeInTheDocument()
    await fireEvent.click(document.querySelector('.compact-fab button') as HTMLButtonElement)

    expect(mocks.openSharedDialog).toHaveBeenCalledWith(expect.any(Object), {}, {}, { closeOn: ['close'] })
  })

  it('uses the mobile dynamic button instead of the desktop FAB', async () => {
    await renderPage(true)
    const dynamicButton = getDynamicButtonConfig()

    expect(document.querySelector('.compact-fab')).not.toBeInTheDocument()
    expect(dynamicButton.icon).toBe('mdi-history')
    expect(dynamicButton.color).toBeUndefined()
    expect(dynamicButton.permission).toBe('manage')
    expect(unref(dynamicButton.show)).toBe(true)

    dynamicButton.onClick()
    expect(mocks.openSharedDialog).toHaveBeenCalledWith(expect.any(Object), {}, {}, { closeOn: ['close'] })
  })
})
