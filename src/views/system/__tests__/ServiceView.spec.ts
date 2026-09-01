import type { ScheduleInfo } from '@/api/types'
import ServiceView from '@/views/system/ServiceView.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface TimerRegistration {
  callback: () => Promise<void> | void
  id: string
  interval: number
  options?: {
    runInBackground?: boolean
    skipInitialRun?: boolean
  }
}

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiRequests: [] as Promise<unknown>[],
  removeBackgroundTimer: vi.fn(),
  loadSystemUpdateStatus: vi.fn(),
  timerRegistrations: [] as TimerRegistration[],
  toastSuccess: vi.fn(),
}))

vi.mock('@/api', () => {
  const client = createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
  })

  return {
    default: {
      get: (...args: unknown[]) => {
        const request = client.get(...args) as Promise<unknown>

        mocks.apiRequests.push(request)
        // 生产客户端返回拒绝 Promise；预先登记观察者，避免被测组件未消费时污染 Vitest 进程。
        void request.catch(() => {})
        return request
      },
    },
  }
})

vi.mock('@/utils/backgroundManager', () => ({
  addBackgroundTimer: (
    id: string,
    callback: () => Promise<void> | void,
    interval: number,
    options?: TimerRegistration['options'],
  ) => {
    mocks.timerRegistrations.push({ callback, id, interval, options })
  },
  removeBackgroundTimer: (...args: unknown[]) => mocks.removeBackgroundTimer(...args),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useSystemUpdateStatus', () => ({
  useSystemUpdateStatus: () => ({ loadStatus: mocks.loadSystemUpdateStatus }),
}))

function deferred<T>() {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

function schedule(overrides: Partial<ScheduleInfo> = {}): ScheduleInfo {
  return {
    id: 'cookiecloud',
    name: 'CookieCloud',
    provider: '内置服务',
    status: '等待',
    ...overrides,
  }
}

async function renderServiceView() {
  return renderWithProviders(ServiceView)
}

function timerRegistration(id: string) {
  const registration = mocks.timerRegistrations.find(item => item.id === id)
  if (!registration) throw new Error(`未注册后台刷新任务：${id}`)

  return registration
}

function executionButtons() {
  return screen.getAllByRole('button', { name: '执行' })
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

describe('ServiceView', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiRequests.length = 0
    mocks.loadSystemUpdateStatus.mockReset()
    mocks.removeBackgroundTimer.mockReset()
    mocks.timerRegistrations.length = 0
    mocks.toastSuccess.mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows loading until the unwrapped schedule list resolves and registers both refresh policies', async () => {
    const pendingList = deferred<ScheduleInfo[]>()
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'dashboard/schedule') return pendingList.promise
      throw new Error(`Unexpected GET ${endpoint}`)
    })

    await renderServiceView()

    expect(screen.getAllByText('加载中...')).toHaveLength(2)
    expect(screen.queryByText('没有后台服务')).not.toBeInTheDocument()

    pendingList.resolve([schedule({ name: '直返调度任务' })])

    expect(await screen.findAllByText('直返调度任务')).toHaveLength(2)
    expect(screen.queryByText('加载中...')).not.toBeInTheDocument()
    expect(timerRegistration('scheduler-service-progress')).toMatchObject({
      id: 'scheduler-service-progress',
      interval: 1000,
      options: { runInBackground: false, skipInitialRun: true },
    })
    expect(timerRegistration('scheduler-list')).toMatchObject({
      id: 'scheduler-list',
      interval: 3000,
      options: { runInBackground: false, skipInitialRun: true },
    })
    expect(mocks.apiGet).toHaveBeenCalledOnce()
    expect(mocks.apiGet).toHaveBeenCalledWith('dashboard/schedule')
  })

  it('prefers localized fields, preserves raw fallbacks, and derives running and waiting states consistently', async () => {
    mocks.apiGet.mockResolvedValue([
      schedule({
        id: 'localized-waiting',
        name: 'Raw waiting name',
        name_i18n: '本地化等待任务',
        next_run: 'raw next run',
        next_run_i18n: '5 分钟',
        provider: 'Raw provider',
        provider_i18n: '本地化提供者',
        status_i18n: 'Localized waiting status',
      }),
      schedule({
        id: 'raw-fallback',
        name: '原始回退任务',
        next_run: '稍后',
        provider: '原始提供者',
        status: '自定义状态',
      }),
      schedule({
        id: 'running',
        name: '运行任务',
        progress: 42,
        progress_enable: true,
        progress_text_i18n: '本地化进度',
        status: '等待',
        status_i18n: '错误的等待翻译',
      }),
    ] satisfies ScheduleInfo[])

    await renderServiceView()

    expect(await screen.findAllByText('本地化等待任务')).toHaveLength(2)
    expect(screen.getAllByText('本地化提供者')).toHaveLength(2)
    expect(screen.getByText('5 分钟')).toBeInTheDocument()
    expect(screen.getByText('5 分钟之后')).toBeInTheDocument()
    expect(screen.getAllByText('原始回退任务')).toHaveLength(2)
    expect(screen.getAllByText('原始提供者')).toHaveLength(2)
    expect(screen.getAllByText('自定义状态')).toHaveLength(2)
    expect(screen.queryByText('Localized waiting status')).not.toBeInTheDocument()
    expect(screen.queryByText('错误的等待翻译')).not.toBeInTheDocument()
    expect(screen.getAllByText('正在运行')).toHaveLength(2)
    expect(screen.getAllByText('本地化进度')).toHaveLength(2)
    expect(screen.getAllByText('42%')).toHaveLength(2)
    expect(document.querySelectorAll('.mobile-scheduler-status--waiting')).toHaveLength(1)
    expect(document.querySelectorAll('.mobile-scheduler-status--default')).toHaveLength(1)
    expect(document.querySelectorAll('.mobile-scheduler-status--running')).toHaveLength(1)
    expect(executionButtons().filter(button => button.hasAttribute('disabled'))).toHaveLength(2)
  })

  it('coalesces overlapping list refreshes and releases the gate after a failed refresh', async () => {
    const firstRefresh = deferred<ScheduleInfo[]>()
    const failedRefresh = Promise.reject<ScheduleInfo[]>(new Error('列表暂时不可用'))
    void failedRefresh.catch(() => {})
    const responses: Array<Promise<ScheduleInfo[]> | ScheduleInfo[]> = [
      [schedule({ name: '初始任务' })],
      firstRefresh.promise,
      failedRefresh,
      [schedule({ name: '恢复任务' })],
    ]
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint !== 'dashboard/schedule') throw new Error(`Unexpected GET ${endpoint}`)
      return responses.shift()
    })

    await renderServiceView()
    expect(await screen.findAllByText('初始任务')).toHaveLength(2)
    const refresh = timerRegistration('scheduler-list').callback

    const pendingRefresh = refresh()
    const coalescedRefresh = refresh()
    await nextTick()

    expect(mocks.apiGet).toHaveBeenCalledTimes(2)
    expect(screen.getAllByText('初始任务')).toHaveLength(2)

    firstRefresh.resolve([schedule({ name: '刷新任务' })])
    await Promise.all([pendingRefresh, coalescedRefresh])
    await waitFor(() => expect(screen.getAllByText('刷新任务')).toHaveLength(2))

    await refresh()
    expect(screen.getAllByText('刷新任务')).toHaveLength(2)

    await refresh()
    await waitFor(() => expect(screen.getAllByText('恢复任务')).toHaveLength(2))
    expect(mocks.apiGet).toHaveBeenCalledTimes(4)
  })

  it('submits the selected job and refreshes the list one second after a successful response', async () => {
    let listReads = 0
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'dashboard/schedule') {
        listReads += 1
        return [schedule({ id: 'manual-job', name: '手动任务' })]
      }
      if (endpoint === 'system/runscheduler') return null
      throw new Error(`Unexpected GET ${endpoint}`)
    })
    await renderServiceView()
    expect(await screen.findAllByText('手动任务')).toHaveLength(2)
    vi.useFakeTimers()

    await fireEvent.click(executionButtons()[0])
    await flushMicrotasks()

    expect(mocks.apiGet).toHaveBeenCalledWith('system/runscheduler', {
      params: { jobid: 'manual-job' },
    })
    expect(mocks.toastSuccess).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('定时作业执行请求提交成功！')
    expect(mocks.loadSystemUpdateStatus).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(999)
    expect(listReads).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(listReads).toBe(2)
  })

  it('refreshes the shared update status immediately after the system update check completes', async () => {
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'dashboard/schedule') {
        return [schedule({ id: 'system_update_check', name: '检查系统更新' })]
      }
      if (endpoint === 'system/runscheduler') return null
      throw new Error(`Unexpected GET ${endpoint}`)
    })
    await renderServiceView()
    expect(await screen.findAllByText('检查系统更新')).toHaveLength(2)

    await fireEvent.click(executionButtons()[0])
    await flushMicrotasks()

    expect(mocks.loadSystemUpdateStatus).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).toHaveBeenCalledOnce()
  })

  it.each([
    [
      '业务失败',
      () => ({ success: false, message: '任务拒绝执行' }),
      { businessFailure: true, message: '任务拒绝执行' },
    ],
    ['HTTP 失败', () => Promise.reject(new Error('服务不可用')), { businessFailure: false, message: '服务不可用' }],
  ])(
    'does not report success or schedule a refresh after %s and remains retryable',
    async (_label, createFailure, expectedFailure) => {
      let executionAttempt = 0
      let listReads = 0
      mocks.apiGet.mockImplementation((endpoint: string) => {
        if (endpoint === 'dashboard/schedule') {
          listReads += 1
          return [schedule({ id: 'retryable-job', name: '可重试任务' })]
        }
        if (endpoint === 'system/runscheduler') {
          executionAttempt += 1
          return executionAttempt === 1 ? createFailure() : null
        }
        throw new Error(`Unexpected GET ${endpoint}`)
      })
      await renderServiceView()
      expect(await screen.findAllByText('可重试任务')).toHaveLength(2)
      vi.useFakeTimers()

      await fireEvent.click(executionButtons()[0])
      await flushMicrotasks()

      const executionRequest = mocks.apiRequests.at(-1)
      expect(executionRequest).toBeDefined()
      await expect(executionRequest).rejects.toMatchObject(expectedFailure)
      expect.soft(mocks.toastSuccess).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1000)
      expect.soft(listReads).toBe(1)

      const readsBeforeRetry = listReads
      mocks.toastSuccess.mockReset()
      await fireEvent.click(executionButtons()[0])
      await flushMicrotasks()
      expect(mocks.toastSuccess).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(1000)
      expect(listReads).toBe(readsBeforeRetry + 1)
    },
  )
})
