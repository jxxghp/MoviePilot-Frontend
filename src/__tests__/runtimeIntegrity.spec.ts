import AnalyticsCpu from '@/views/dashboard/AnalyticsCpu.vue'
import QuickAccess from '@/layouts/default/components/QuickAccess.vue'
import UserNotification from '@/layouts/default/components/UserNotification.vue'
import { nativeGlobalActions } from '@/native/registry'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  delete: vi.fn(),
  refresh: undefined as undefined | (() => Promise<void>),
}))
vi.mock('@/@core/utils/image', () => ({ getDominantColor: async () => '#000000' }))
vi.mock('@/api', () => ({ default: { get: mocks.get, delete: mocks.delete } }))
vi.mock('@/components/dialog/PluginDataDialog.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useDataRefresh: (_id: string, refresh: () => Promise<void>) => {
      mocks.refresh = refresh
      return { loading: ref(false), refresh }
    },
    useDelayedSSE: () => ({ isConnected: ref(false) }),
  }),
}))
vi.mock('@/composables/useDashboardMotion', () => ({ useAnimatedDashboardNumber: (source: unknown) => source }))
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => async () => true }))
vi.mock('vue-toastification', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('@/utils/badge', async () => ({
  appUnreadMessageCount: (await import('vue')).ref(0),
  clearUnreadMessages: async () => {},
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { resolve, promise }
}

describe('runtime integrity regressions', () => {
  beforeEach(() => {
    mocks.get.mockReset()
    mocks.delete.mockReset()
    mocks.refresh = undefined
  })

  it('ROOT-005 averages actual 1/5/15 minute windows including irregular samples', async () => {
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    mocks.get.mockResolvedValue(0)
    const { container } = await renderWithProviders(AnalyticsCpu, { global: { stubs: { VApexChart: true } } })
    const sample = async (at: number, usage: number) => {
      now = at
      mocks.get.mockResolvedValueOnce(usage)
      await mocks.refresh!()
      await nextTick()
    }
    await sample(0, 100)
    await sample(5 * 60_000, 40)
    await sample(11 * 60_000, 20)
    await sample(16 * 60_000, 80)
    const averages = Array.from(container.querySelectorAll('.dashboard-chart-footer strong')).map(
      item => item.textContent,
    )
    expect(averages).toEqual(['80.0', '50.0', '46.7'])
    // 请求失败仍推进时间窗，不能把很久以前的样本永远显示成最近一分钟。
    vi.spyOn(console, 'log').mockImplementation(() => {})
    now = 40 * 60_000
    mocks.get.mockRejectedValueOnce(new Error('offline'))
    await mocks.refresh!()
    await nextTick()
    expect(
      Array.from(container.querySelectorAll('.dashboard-chart-footer strong')).map(item => item.textContent),
    ).toEqual(['0.0', '0.0', '0.0'])
  })

  it('ROOT-010 survives a real Vuetify clear action and restores unfiltered plugins', async () => {
    mocks.get.mockResolvedValue([{ id: 'demo', plugin_name: 'DemoPlugin', has_page: true }])
    await renderWithProviders(QuickAccess, { props: { visible: true } })
    const input = await screen.findByRole('textbox')
    await fireEvent.update(input, 'no-match')
    const clear = document.querySelector('.plugin-search .v-field__clearable [role="button"]')!
    expect(clear).not.toBeNull()
    await fireEvent.click(clear)
    await waitFor(() => expect(input).toHaveValue(''))
    expect(await screen.findByText('DemoPlugin')).toBeInTheDocument()
  })

  it.each(['all', 'system'] as const)('ROOT-011 ignores a page begun before successful clear: %s', async scope => {
    vi.stubGlobal('MoviePilotNative', { transportVersion: 1, postMessage: vi.fn() })
    const held = deferred<unknown[]>()
    const first = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, title: `系统通知${i}`, text: 'plain' }))
    mocks.get.mockResolvedValueOnce(first).mockReturnValueOnce(held.promise)
    mocks.delete.mockResolvedValue(undefined)
    await renderWithProviders(UserNotification)
    const panel = () => nativeGlobalActions.value.get('notifications')!.panel!()!
    await panel().onOpen!()
    const inFlight = panel().onLoadMore!()
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2))
    await panel()
      .sections[0].items.find(item => item.id === 'clear')!
      .children!.find(item => item.id === `clear-${scope}`)!.invoke!()
    expect(
      panel()
        .sections.slice(1)
        .flatMap(section => section.items),
    ).toHaveLength(0)
    held.resolve([{ id: 21, title: '已清除的旧响应', text: 'stale' }])
    await inFlight
    expect(
      panel()
        .sections.slice(1)
        .flatMap(section => section.items),
    ).toHaveLength(0)
  })
})
