import RecommendPage from '@/pages/recommend.vue'
import { DEFAULT_PERMISSIONS } from '@/utils/permission'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import {
  recommendConfigHandler,
  recommendSourcesHandler,
  saveRecommendConfigHandler,
} from '@tests/support/msw/handlers/recommend'
import { server } from '@tests/support/msw/server'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  closeDialog: vi.fn(),
  openSharedDialog: vi.fn(),
  registerHeaderTab: vi.fn(),
  useDynamicButton: vi.fn(),
}))

vi.mock('@/composables/useDynamicHeaderTab', () => ({
  useDynamicHeaderTab: () => ({ registerHeaderTab: mocks.registerHeaderTab }),
}))

vi.mock('@/composables/useDynamicButton', () => ({
  useDynamicButton: (options: unknown) => mocks.useDynamicButton(options),
}))

vi.mock('@/composables/usePWA', async () => {
  const { ref } = await import('vue')
  return {
    usePWA: () => ({ appMode: ref(false) }),
  }
})

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: (...args: unknown[]) => mocks.openSharedDialog(...args),
}))

const MediaCardSlideViewStub = defineComponent({
  name: 'MediaCardSlideView',
  props: {
    apipath: { type: String, required: true },
    ready: { type: Boolean, required: true },
    title: { type: String, required: true },
  },
  template: '<section data-testid="recommend-view" :data-api-path="apipath" :data-ready="ready">{{ title }}</section>',
})

interface SharedDialogEvents {
  save: (payload?: { enabled?: Record<string, boolean> }) => Promise<void>
}

async function renderRecommend(options: { superUser?: boolean; discovery?: boolean } = {}) {
  return renderWithProviders(RecommendPage, {
    initialRoute: '/recommend',
    initialState: {
      user: {
        permissions: { ...DEFAULT_PERMISSIONS, discovery: options.discovery ?? true },
        superUser: options.superUser ?? false,
      },
    },
    global: {
      stubs: {
        MediaCardSlideView: MediaCardSlideViewStub,
        VScrollToTopBtn: true,
      },
    },
  })
}

describe('recommend page', () => {
  beforeEach(() => {
    mocks.openSharedDialog.mockReturnValue({
      close: mocks.closeDialog,
      id: 1,
      updateProps: vi.fn(),
    })
  })

  it('uses local configuration and merges extra sources without duplicates', async () => {
    let remoteConfigRequests = 0
    localStorage.setItem('MP_RECOMMEND', JSON.stringify({ '流行趋势': true, '自定义来源': true }))
    server.use(
      recommendConfigHandler({}, 200, () => {
        remoteConfigRequests += 1
      }),
      recommendSourcesHandler([
        { api_path: 'recommend/tmdb_trending', name: '重复来源', type: '榜单' },
        { api_path: 'recommend/custom', name: '自定义来源', type: '扩展' },
      ]),
    )
    await renderRecommend()

    expect(await screen.findByText('自定义来源')).toBeInTheDocument()
    expect(screen.getAllByTestId('recommend-view')).toHaveLength(2)
    expect(screen.queryByText('重复来源')).not.toBeInTheDocument()
    expect(remoteConfigRequests).toBe(0)
  })

  it('loads remote configuration when local configuration is absent', async () => {
    const remoteConfig = { '流行趋势': false, '正在热映': true }
    const configRequested = vi.fn()
    const sourcesRequested = vi.fn()
    server.use(
      recommendConfigHandler(remoteConfig, 200, configRequested),
      recommendSourcesHandler([], 200, sourcesRequested),
    )

    await renderRecommend()

    await waitFor(() => expect(configRequested).toHaveBeenCalledOnce())
    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByText('流行趋势')).not.toBeInTheDocument())
    expect(screen.getByText('正在热映')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('MP_RECOMMEND') || '{}')).toEqual(remoteConfig)
  })

  it.each([
    ['damaged JSON', '{damaged'],
    ['null', 'null'],
    ['an array', '[]'],
    ['a non-boolean field', JSON.stringify({ '流行趋势': 'enabled' })],
  ])('clears %s local configuration and falls back to the server', async (_case, storedConfig) => {
    const configRequested = vi.fn()
    const sourcesRequested = vi.fn()
    localStorage.setItem('MP_RECOMMEND', storedConfig)
    server.use(
      recommendConfigHandler({ '流行趋势': true }, 200, configRequested),
      recommendSourcesHandler([], 200, sourcesRequested),
    )

    await renderRecommend()

    await waitFor(() => expect(configRequested).toHaveBeenCalledOnce())
    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledOnce())
    await waitFor(() => expect(localStorage.getItem('MP_RECOMMEND')).toBe(JSON.stringify({ '流行趋势': true })))
    expect(screen.getByText('流行趋势')).toBeInTheDocument()
  })

  it('keeps defaults and does not persist an invalid remote configuration', async () => {
    const configRequested = vi.fn()
    const sourcesRequested = vi.fn()
    server.use(
      recommendConfigHandler({ '流行趋势': 'enabled' }, 200, configRequested),
      recommendSourcesHandler([], 200, sourcesRequested),
    )

    await renderRecommend()

    await waitFor(() => expect(configRequested).toHaveBeenCalledOnce())
    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledOnce())
    expect(screen.getByText('流行趋势')).toBeInTheDocument()
    expect(localStorage.getItem('MP_RECOMMEND')).toBeNull()
  })

  it('saves settings through the shared dialog boundary', async () => {
    const savedConfig = vi.fn()
    const sourcesRequested = vi.fn()
    const user = userEvent.setup()
    localStorage.setItem('MP_RECOMMEND', JSON.stringify({ '流行趋势': true }))
    server.use(recommendSourcesHandler([], 200, sourcesRequested), saveRecommendConfigHandler(savedConfig))
    await renderRecommend()
    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledOnce())
    await waitFor(() => expect(document.querySelector('.compact-fab')).not.toBeNull())
    const settingsButton = document.querySelector<HTMLButtonElement>('.compact-fab')

    expect(settingsButton).not.toBeNull()
    await user.click(settingsButton as HTMLButtonElement)
    expect(mocks.openSharedDialog).toHaveBeenCalledOnce()
    const dialogEvents = mocks.openSharedDialog.mock.calls[0][2] as SharedDialogEvents
    const nextConfig = { '流行趋势': false, '正在热映': true }

    await dialogEvents.save({ enabled: nextConfig })

    expect(savedConfig).toHaveBeenCalledWith(nextConfig)
    expect(localStorage.getItem('MP_RECOMMEND')).toBe(JSON.stringify(nextConfig))
    expect(mocks.closeDialog).toHaveBeenCalledOnce()
  })

  it.each([
    { discovery: false, superUser: false, visible: false },
    { discovery: false, superUser: true, visible: true },
  ])('applies discovery permission to the desktop settings entry', async ({ discovery, superUser, visible }) => {
    const sourcesRequested = vi.fn()
    localStorage.setItem('MP_RECOMMEND', JSON.stringify({ '流行趋势': true }))
    server.use(recommendSourcesHandler([], 200, sourcesRequested))

    await renderRecommend({ discovery, superUser })
    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledOnce())

    expect(Boolean(document.querySelector('.compact-fab'))).toBe(visible)
  })

  it('keeps built-in content when remote requests fail', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    server.use(recommendConfigHandler({}, 500), recommendSourcesHandler([], 500))

    await renderRecommend()

    await waitFor(() => expect(consoleError).toHaveBeenCalled())
    await waitFor(() => expect(consoleLog).toHaveBeenCalled())
    expect(screen.getByText('流行趋势')).toBeInTheDocument()
  })

  it('clears its delayed-render timer when unmounted', async () => {
    const setTimeout = vi.spyOn(window, 'setTimeout')
    const clearTimeout = vi.spyOn(window, 'clearTimeout')
    const sourcesRequested = vi.fn()
    localStorage.setItem('MP_RECOMMEND', JSON.stringify({ '流行趋势': true }))
    server.use(recommendSourcesHandler([], 200, sourcesRequested))
    const { unmount } = await renderRecommend()

    await waitFor(() => expect(sourcesRequested).toHaveBeenCalledOnce())
    await fireEvent.click(screen.getByText('流行趋势'))
    const componentTimerIndexes = setTimeout.mock.calls
      .map(([, delay], index) => ({ delay, index }))
      .filter(({ delay }) => delay === 400)
    expect(componentTimerIndexes).toHaveLength(1)
    const componentTimer = setTimeout.mock.results[componentTimerIndexes[0].index].value
    unmount()

    expect(clearTimeout).toHaveBeenCalledWith(componentTimer)
  })
})
