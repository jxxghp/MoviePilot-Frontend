import type { ScheduleInfo, TransferQueue } from '@/api/types'
import i18n from '@/plugins/i18n'
import AnalyticsScheduler from '@/views/dashboard/AnalyticsScheduler.vue'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import type { Ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface RefreshRegistration {
  callback: () => Promise<void>
  id: string
  immediate: boolean
  interval: number
}

type DashboardTransferQueue = Pick<TransferQueue, 'season'> & {
  media: Pick<TransferQueue['media'], 'media_id' | 'media_source' | 'title' | 'title_year'>
  tasks: Array<Pick<TransferQueue['tasks'][number], 'state'>>
}

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  getScheduleProgressText: vi.fn(),
  getScheduleProgressValue: vi.fn(),
  refreshRegistrations: [] as RefreshRegistration[],
  scheduleSource: undefined as Ref<ScheduleInfo[]> | undefined,
  useScheduleProgress: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
  }),
}))

vi.mock('@/composables/useBackground', () => ({
  useBackground: () => ({
    useDataRefresh: (id: string, callback: () => Promise<void>, interval: number, immediate: boolean) => {
      mocks.refreshRegistrations.push({ callback, id, immediate, interval })
    },
  }),
}))

vi.mock('@/composables/useScheduleProgress', async importOriginal => {
  const actual = await importOriginal<typeof import('@/composables/useScheduleProgress')>()

  return {
    ...actual,
    useScheduleProgress: (schedules: Ref<ScheduleInfo[]>, refreshId: string) => {
      mocks.useScheduleProgress(schedules, refreshId)
      mocks.scheduleSource = schedules
      expect(refreshId).toBe('dashboard-scheduler-progress')

      return {
        getScheduleProgressText: mocks.getScheduleProgressText,
        getScheduleProgressValue: mocks.getScheduleProgressValue,
        refreshRunningProgress: vi.fn(),
      }
    },
  }
})

function mountScheduler(props: { allowRefresh?: boolean } = {}) {
  i18n.global.locale.value = 'zh-CN'

  return shallowMount(AnalyticsScheduler, {
    props,
    global: {
      plugins: [i18n],
      renderStubDefaultSlot: true,
    },
  })
}

function dashboardRefresh() {
  const registration = mocks.refreshRegistrations.find(item => item.id === 'dashboard-scheduler')
  if (!registration) throw new Error('dashboard scheduler refresh was not registered')

  return registration
}

function listItems(wrapper: VueWrapper) {
  return wrapper.findAllComponents({ name: 'VListItem' })
}

function listItemByText(wrapper: VueWrapper, text: string) {
  const item = listItems(wrapper).find(candidate => candidate.text().includes(text))
  if (!item) throw new Error(`list item not found: ${text}`)

  return item
}

describe('AnalyticsScheduler', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.getScheduleProgressText.mockReset()
    mocks.getScheduleProgressText.mockReturnValue('')
    mocks.getScheduleProgressValue.mockReset()
    mocks.getScheduleProgressValue.mockReturnValue(0)
    mocks.refreshRegistrations.splice(0)
    mocks.scheduleSource = undefined
    mocks.useScheduleProgress.mockReset()
  })

  it('registers its refresh contract and skips both requests while refresh is disabled', async () => {
    mountScheduler({ allowRefresh: false })

    expect(mocks.useScheduleProgress).toHaveBeenCalledOnce()
    expect(dashboardRefresh()).toMatchObject({
      id: 'dashboard-scheduler',
      interval: 3000,
      immediate: true,
    })

    await dashboardRefresh().callback()

    expect(mocks.apiGet).not.toHaveBeenCalled()
  })

  it('loads the schedule and transfer queue through the registered refresh callback', async () => {
    const schedules = [
      {
        id: 'cookiecloud',
        name: 'CookieCloud',
        provider: '内置服务',
        status: '等待',
      },
    ] satisfies ScheduleInfo[]
    const queue = [] satisfies DashboardTransferQueue[]
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'dashboard/schedule') return schedules
      if (url === 'transfer/queue') return queue
      throw new Error(`Unexpected GET ${url}`)
    })
    const wrapper = mountScheduler()

    await dashboardRefresh().callback()
    await flushPromises()

    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
    expect(mocks.apiGet).toHaveBeenNthCalledWith(1, 'dashboard/schedule')
    expect(mocks.apiGet).toHaveBeenNthCalledWith(2, 'transfer/queue')
    expect(mocks.scheduleSource?.value).toEqual(schedules)
    expect(wrapper.text()).toContain('CookieCloud')
  })

  it('sorts running schedules first and applies localized and empty fallbacks', async () => {
    mocks.getScheduleProgressText.mockImplementation((schedule: ScheduleInfo) =>
      schedule.id === 'running' ? '已处理 2 项' : '',
    )
    mocks.getScheduleProgressValue.mockReturnValue(40)
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'dashboard/schedule') {
        return [
          {
            id: 'waiting-localized',
            name: 'Waiting raw',
            name_i18n: '本地化等待任务',
            provider: 'Provider raw',
            provider_i18n: '本地化提供者',
            status: '等待',
            status_i18n: '已排队',
          },
          {
            id: 'running',
            name: 'Running raw',
            name_i18n: '本地化运行任务',
            provider: 'Running provider',
            status: '正在运行',
            status_i18n: '后端运行文案',
          },
          {
            id: 'fallback',
            name: '',
            provider: '',
            status: '',
          },
        ] satisfies ScheduleInfo[]
      }
      if (url === 'transfer/queue') return []
      throw new Error(`Unexpected GET ${url}`)
    })
    const wrapper = mountScheduler()

    await dashboardRefresh().callback()
    await flushPromises()

    const items = listItems(wrapper)
    expect(items.map(item => item.text())).toEqual([
      expect.stringContaining('本地化运行任务'),
      expect.stringContaining('本地化等待任务'),
      expect.stringContaining('后台任务'),
    ])
    expect(items[0].text()).toContain('已处理 2 项')
    expect(items[0].text()).toContain('进行中')
    expect(items[0].text()).not.toContain('后端运行文案')
    expect(items[1].text()).toContain('本地化提供者')
    expect(items[1].text()).toContain('已排队')
    expect(items[2].text()).toContain('等待中')
  })

  it('derives transfer progress and stable keys from queue identity', async () => {
    const runningTransfer = {
      media: { media_source: 'tmdb', media_id: '42', title_year: '运行中的电影 (2026)' },
      season: 2,
      tasks: [{ state: 'completed' }, { state: 'running' }, { state: 'waiting' }],
    } satisfies DashboardTransferQueue
    const completedTransfer = {
      media: { media_source: 'douban', media_id: 'movie-7', title: '已完成的电影' },
      tasks: [{ state: 'completed' }, { state: 'completed' }],
    } satisfies DashboardTransferQueue
    let queue = [runningTransfer, completedTransfer]
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === 'dashboard/schedule') return []
      if (url === 'transfer/queue') return queue
      throw new Error(`Unexpected GET ${url}`)
    })
    const wrapper = mountScheduler()

    await dashboardRefresh().callback()
    await flushPromises()

    const runningItem = listItemByText(wrapper, '运行中的电影 (2026)')
    const completedItem = listItemByText(wrapper, '已完成的电影')
    expect(runningItem.vm.$.vnode.key).toBe('transfer-tmdb-42-2')
    expect(runningItem.text()).toContain('1 / 3 个文件')
    expect(runningItem.text()).toContain('进行中')
    expect(runningItem.findComponent({ name: 'VProgressLinear' }).props('modelValue')).toBe(33)
    expect(completedItem.vm.$.vnode.key).toBe('transfer-douban-movie-7-')
    expect(completedItem.text()).toContain('2 / 2 个文件')
    expect(completedItem.text()).toContain('等待中')
    expect(completedItem.findComponent({ name: 'VProgressLinear' }).exists()).toBe(false)

    queue = [completedTransfer, runningTransfer]
    await dashboardRefresh().callback()
    await flushPromises()

    expect(listItemByText(wrapper, '运行中的电影 (2026)').vm.$.vnode.key).toBe('transfer-tmdb-42-2')
  })

  it('renders the empty state and preserves the last successful state after a refresh failure', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    let refresh = 0
    mocks.apiGet.mockImplementation((url: string) => {
      if (refresh === 0) return []
      if (refresh === 1 && url === 'dashboard/schedule') {
        return [
          {
            id: 'kept',
            name: '保留的后台任务',
            provider: '内置服务',
            status: '等待',
          },
        ] satisfies ScheduleInfo[]
      }
      if (refresh === 1 && url === 'transfer/queue') return []
      throw new Error('remote unavailable')
    })
    const wrapper = mountScheduler()

    await dashboardRefresh().callback()
    await flushPromises()
    expect(wrapper.text()).toContain('没有后台服务')

    refresh = 1
    await dashboardRefresh().callback()
    await flushPromises()
    expect(wrapper.text()).toContain('保留的后台任务')
    expect(wrapper.text()).not.toContain('没有后台服务')

    refresh = 2
    await dashboardRefresh().callback()
    await flushPromises()
    expect(wrapper.text()).toContain('保留的后台任务')
    expect(wrapper.text()).not.toContain('没有后台服务')
    expect(consoleLog).toHaveBeenCalledOnce()
  })
})
